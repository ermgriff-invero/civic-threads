import type { Express, RequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import { db } from "./db";
import { users, registerSchema, loginSchema, type User } from "@shared/models/auth";
import { eq } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

const SALT_ROUNDS = 12;

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET || "civic-threads-secret-key-change-in-production",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.session?.userId) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

export function registerAuthRoutes(app: Express) {
  // Get current user
  app.get("/api/auth/user", async (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          title: users.title,
          position: users.position,
          municipality: users.municipality,
          profileImageUrl: users.profileImageUrl,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, req.session.userId));

      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Register new user
  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: parsed.error.errors 
        });
      }

      const { email, password, firstName, lastName, title, position, municipality } = parsed.data;

      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()));

      if (existingUser) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // Create user
      const [newUser] = await db
        .insert(users)
        .values({
          email: email.toLowerCase(),
          passwordHash,
          firstName,
          lastName,
          title,
          position,
          municipality,
        })
        .returning({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          title: users.title,
          position: users.position,
          municipality: users.municipality,
          profileImageUrl: users.profileImageUrl,
          createdAt: users.createdAt,
        });

      // Set session and save before responding
      req.session.userId = newUser.id;
      req.session.save((err) => {
        if (err) {
          console.error("Error saving session:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        res.status(201).json(newUser);
      });
    } catch (error) {
      console.error("Error registering user:", error);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: parsed.error.errors 
        });
      }

      const { email, password } = parsed.data;

      // Find user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()));

      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Set session and save before responding
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Error saving session:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        res.json({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          title: user.title,
          position: user.position,
          municipality: user.municipality,
          profileImageUrl: user.profileImageUrl,
          createdAt: user.createdAt,
        });
      });
    } catch (error) {
      console.error("Error logging in:", error);
      res.status(500).json({ message: "Failed to log in" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return res.status(500).json({ message: "Failed to log out" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });
}

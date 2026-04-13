import bcrypt from "bcrypt";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";

if (process.env.NODE_ENV === "production") {
  console.error("Seed script cannot run in production.");
  process.exit(1);
}

const SALT_ROUNDS = 12;

const seedUsers = [
  {
    email: "admin@civicthreads.gov",
    password: "AdminPass123!",
    firstName: "Dana",
    lastName: "Rodriguez",
    role: "ADMIN" as const,
    title: "City Administrator",
    position: "Director of IT",
    municipality: "Denver",
  },
  {
    email: "pm@civicthreads.gov",
    password: "PMPass123!",
    firstName: "Jordan",
    lastName: "Mitchell",
    role: "PM" as const,
    title: "Project Manager",
    position: "Senior PM",
    municipality: "Denver",
  },
];

async function seed() {
  console.log("Seeding RBAC users...\n");

  for (const user of seedUsers) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, user.email));

    if (existing) {
      await db
        .update(users)
        .set({ role: user.role })
        .where(eq(users.email, user.email));
      console.log(`  Updated: ${user.email} → role=${user.role}`);
    } else {
      const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);
      await db.insert(users).values({
        email: user.email,
        passwordHash,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        title: user.title,
        position: user.position,
        municipality: user.municipality,
      });
      console.log(`  Created: ${user.email} → role=${user.role}`);
    }
  }

  console.log("\nSeed complete. Test credentials:");
  console.log("  ADMIN: admin@civicthreads.gov / AdminPass123!");
  console.log("  PM:    pm@civicthreads.gov    / PMPass123!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });

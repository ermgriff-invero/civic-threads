import { 
  users, threads, threadNodes, threadEdges, documents, knowledgeLinks, meetings, meetingAttendees, agendaItems,
  stewardSuggestions, researchSessions, researchMessages,
  type User, type UpsertUser,
  type Thread, type InsertThread,
  type ThreadNode, type InsertThreadNode,
  type ThreadEdge, type InsertThreadEdge,
  type Document, type InsertDocument,
  type KnowledgeLink, type InsertKnowledgeLink,
  type Meeting, type InsertMeeting,
  type AgendaItem, type InsertAgendaItem,
  type StewardSuggestion, type InsertStewardSuggestion,
  type ResearchSession, type InsertResearchSession,
  type ResearchMessage, type InsertResearchMessage
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, ilike, or, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;

  getThreads(): Promise<Thread[]>;
  getThread(id: number): Promise<Thread | undefined>;
  createThread(thread: InsertThread): Promise<Thread>;
  updateThread(id: number, updates: Partial<InsertThread>): Promise<Thread | undefined>;
  deleteThread(id: number): Promise<void>;

  getThreadNodes(threadId: number): Promise<ThreadNode[]>;
  createThreadNode(node: InsertThreadNode): Promise<ThreadNode>;
  updateThreadNode(id: string, updates: Partial<InsertThreadNode>): Promise<ThreadNode | undefined>;
  deleteThreadNode(id: string): Promise<void>;

  getThreadEdges(threadId: number): Promise<ThreadEdge[]>;
  createThreadEdge(edge: InsertThreadEdge): Promise<ThreadEdge>;
  deleteThreadEdge(id: string): Promise<void>;

  getDocuments(): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;
  createDocument(doc: InsertDocument): Promise<Document>;
  updateDocument(id: number, updates: Partial<InsertDocument>): Promise<Document | undefined>;
  deleteDocument(id: number): Promise<void>;

  getKnowledgeLinks(): Promise<KnowledgeLink[]>;
  createKnowledgeLink(link: InsertKnowledgeLink): Promise<KnowledgeLink>;
  deleteKnowledgeLink(id: number): Promise<void>;

  getMeetings(): Promise<Meeting[]>;
  getMeeting(id: number): Promise<Meeting | undefined>;
  createMeeting(meeting: InsertMeeting): Promise<Meeting>;
  updateMeeting(id: number, updates: Partial<InsertMeeting>): Promise<Meeting | undefined>;

  getSuggestions(threadId: number): Promise<StewardSuggestion[]>;
  createSuggestion(suggestion: InsertStewardSuggestion): Promise<StewardSuggestion>;
  updateSuggestion(id: number, updates: Partial<InsertStewardSuggestion>): Promise<StewardSuggestion | undefined>;
  deleteSuggestion(id: number): Promise<void>;

  getResearchSessions(threadId: number): Promise<ResearchSession[]>;
  getResearchSession(id: number): Promise<ResearchSession | undefined>;
  createResearchSession(session: InsertResearchSession): Promise<ResearchSession>;

  getResearchMessages(sessionId: number): Promise<ResearchMessage[]>;
  createResearchMessage(message: InsertResearchMessage): Promise<ResearchMessage>;

  searchThreads(query: string): Promise<Thread[]>;
  searchDocuments(query: string): Promise<Document[]>;
  getRecentThreads(limit: number): Promise<Thread[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: UpsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getThreads(): Promise<Thread[]> {
    return db.select().from(threads).orderBy(desc(threads.updatedAt));
  }

  async getThread(id: number): Promise<Thread | undefined> {
    const [thread] = await db.select().from(threads).where(eq(threads.id, id));
    return thread || undefined;
  }

  async createThread(thread: InsertThread): Promise<Thread> {
    const [created] = await db.insert(threads).values(thread).returning();
    return created;
  }

  async updateThread(id: number, updates: Partial<InsertThread>): Promise<Thread | undefined> {
    const [updated] = await db
      .update(threads)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(threads.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteThread(id: number): Promise<void> {
    await db.delete(threads).where(eq(threads.id, id));
  }

  async getThreadNodes(threadId: number): Promise<ThreadNode[]> {
    return db.select().from(threadNodes).where(eq(threadNodes.threadId, threadId));
  }

  async createThreadNode(node: InsertThreadNode): Promise<ThreadNode> {
    const [created] = await db.insert(threadNodes).values(node).returning();
    return created;
  }

  async updateThreadNode(id: string, updates: Partial<InsertThreadNode>): Promise<ThreadNode | undefined> {
    const [updated] = await db
      .update(threadNodes)
      .set(updates)
      .where(eq(threadNodes.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteThreadNode(id: string): Promise<void> {
    await db.delete(threadNodes).where(eq(threadNodes.id, id));
  }

  async getThreadEdges(threadId: number): Promise<ThreadEdge[]> {
    return db.select().from(threadEdges).where(eq(threadEdges.threadId, threadId));
  }

  async createThreadEdge(edge: InsertThreadEdge): Promise<ThreadEdge> {
    const [created] = await db.insert(threadEdges).values(edge).returning();
    return created;
  }

  async deleteThreadEdge(id: string): Promise<void> {
    await db.delete(threadEdges).where(eq(threadEdges.id, id));
  }

  async getDocuments(): Promise<Document[]> {
    return db.select().from(documents).orderBy(desc(documents.dateAdded));
  }

  async getDocument(id: number): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    return doc || undefined;
  }

  async createDocument(doc: InsertDocument): Promise<Document> {
    const [created] = await db.insert(documents).values(doc).returning();
    return created;
  }

  async updateDocument(id: number, updates: Partial<InsertDocument>): Promise<Document | undefined> {
    const [updated] = await db
      .update(documents)
      .set(updates)
      .where(eq(documents.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  async getKnowledgeLinks(): Promise<KnowledgeLink[]> {
    return db.select().from(knowledgeLinks).orderBy(desc(knowledgeLinks.dateAdded));
  }

  async createKnowledgeLink(link: InsertKnowledgeLink): Promise<KnowledgeLink> {
    const [created] = await db.insert(knowledgeLinks).values(link).returning();
    return created;
  }

  async deleteKnowledgeLink(id: number): Promise<void> {
    await db.delete(knowledgeLinks).where(eq(knowledgeLinks.id, id));
  }

  async getMeetings(): Promise<Meeting[]> {
    return db.select().from(meetings).orderBy(desc(meetings.dateTime));
  }

  async getMeeting(id: number): Promise<Meeting | undefined> {
    const [meeting] = await db.select().from(meetings).where(eq(meetings.id, id));
    return meeting || undefined;
  }

  async createMeeting(meeting: InsertMeeting): Promise<Meeting> {
    const dateTime = typeof meeting.dateTime === 'string' ? new Date(meeting.dateTime) : meeting.dateTime;
    const [created] = await db.insert(meetings).values({ ...meeting, dateTime }).returning();
    return created;
  }

  async updateMeeting(id: number, updates: Partial<InsertMeeting>): Promise<Meeting | undefined> {
    const processedUpdates: any = { ...updates };
    if (updates.dateTime && typeof updates.dateTime === 'string') {
      processedUpdates.dateTime = new Date(updates.dateTime);
    }
    const [updated] = await db
      .update(meetings)
      .set(processedUpdates)
      .where(eq(meetings.id, id))
      .returning();
    return updated || undefined;
  }

  async getSuggestions(threadId: number): Promise<StewardSuggestion[]> {
    return db.select().from(stewardSuggestions).where(eq(stewardSuggestions.threadId, threadId)).orderBy(desc(stewardSuggestions.createdAt));
  }

  async createSuggestion(suggestion: InsertStewardSuggestion): Promise<StewardSuggestion> {
    const [created] = await db.insert(stewardSuggestions).values(suggestion).returning();
    return created;
  }

  async updateSuggestion(id: number, updates: Partial<InsertStewardSuggestion>): Promise<StewardSuggestion | undefined> {
    const [updated] = await db
      .update(stewardSuggestions)
      .set(updates)
      .where(eq(stewardSuggestions.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteSuggestion(id: number): Promise<void> {
    await db.delete(stewardSuggestions).where(eq(stewardSuggestions.id, id));
  }

  async getResearchSessions(threadId: number): Promise<ResearchSession[]> {
    return db.select().from(researchSessions).where(eq(researchSessions.threadId, threadId)).orderBy(desc(researchSessions.createdAt));
  }

  async getResearchSession(id: number): Promise<ResearchSession | undefined> {
    const [session] = await db.select().from(researchSessions).where(eq(researchSessions.id, id));
    return session || undefined;
  }

  async createResearchSession(session: InsertResearchSession): Promise<ResearchSession> {
    const [created] = await db.insert(researchSessions).values(session).returning();
    return created;
  }

  async getResearchMessages(sessionId: number): Promise<ResearchMessage[]> {
    return db.select().from(researchMessages).where(eq(researchMessages.sessionId, sessionId)).orderBy(researchMessages.createdAt);
  }

  async createResearchMessage(message: InsertResearchMessage): Promise<ResearchMessage> {
    const [created] = await db.insert(researchMessages).values(message).returning();
    return created;
  }

  async searchThreads(query: string): Promise<Thread[]> {
    const searchPattern = `%${query}%`;
    return db.select().from(threads).where(
      or(
        ilike(threads.title, searchPattern),
        ilike(threads.topic, searchPattern),
        ilike(threads.description, searchPattern),
        ilike(threads.type, searchPattern)
      )
    ).orderBy(desc(threads.updatedAt)).limit(5);
  }

  async searchDocuments(query: string): Promise<Document[]> {
    const searchPattern = `%${query}%`;
    return db.select().from(documents).where(
      or(
        ilike(documents.title, searchPattern),
        ilike(documents.content, searchPattern),
        ilike(documents.category, searchPattern)
      )
    ).orderBy(desc(documents.dateAdded)).limit(5);
  }

  async getRecentThreads(limit: number): Promise<Thread[]> {
    return db.select().from(threads).orderBy(desc(threads.updatedAt)).limit(limit);
  }
}

export const storage = new DatabaseStorage();

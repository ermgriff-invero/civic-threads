import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean, serial, index } from "drizzle-orm/pg-core";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

export const threads = pgTable("threads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  status: text("status").notNull().default("Drafting"),
  type: text("type").notNull(),
  author: text("author").notNull(),
  topic: text("topic"),
  description: text("description"),
  outcome: text("outcome"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const threadsRelations = relations(threads, ({ many }) => ({
  nodes: many(threadNodes),
  edges: many(threadEdges),
}));

export const insertThreadSchema = z.object({
  title: z.string().min(1),
  status: z.string().default("Drafting"),
  type: z.string().min(1),
  author: z.string().min(1),
  topic: z.string().optional(),
  description: z.string().optional(),
  outcome: z.string().optional(),
});

export type InsertThread = z.infer<typeof insertThreadSchema>;
export type Thread = typeof threads.$inferSelect;

export const threadNodes = pgTable("thread_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threadId: integer("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  label: text("label").notNull(),
  positionX: integer("position_x").notNull().default(100),
  positionY: integer("position_y").notNull().default(100),
  deleted: boolean("deleted").default(false),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const threadNodesRelations = relations(threadNodes, ({ one }) => ({
  thread: one(threads, {
    fields: [threadNodes.threadId],
    references: [threads.id],
  }),
}));

export const insertThreadNodeSchema = z.object({
  threadId: z.number(),
  type: z.string().min(1),
  label: z.string().min(1),
  positionX: z.number().default(100),
  positionY: z.number().default(100),
  deleted: z.boolean().default(false),
  data: z.any().optional(),
});

export type InsertThreadNode = z.infer<typeof insertThreadNodeSchema>;
export type ThreadNode = typeof threadNodes.$inferSelect;

export const threadEdges = pgTable("thread_edges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threadId: integer("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
  source: varchar("source").notNull(),
  target: varchar("target").notNull(),
  animated: boolean("animated").default(true),
});

export const threadEdgesRelations = relations(threadEdges, ({ one }) => ({
  thread: one(threads, {
    fields: [threadEdges.threadId],
    references: [threads.id],
  }),
}));

export const insertThreadEdgeSchema = z.object({
  threadId: z.number(),
  source: z.string().min(1),
  target: z.string().min(1),
  animated: z.boolean().default(true),
});

export type InsertThreadEdge = z.infer<typeof insertThreadEdgeSchema>;
export type ThreadEdge = typeof threadEdges.$inferSelect;

export const documents = pgTable("documents", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  category: text("category").notNull(),
  content: text("content"),
  description: text("description"),
  dateAdded: timestamp("date_added").defaultNow().notNull(),
  indexed: boolean("indexed").default(false),
  processingStatus: text("processing_status").default("pending"),
  extractedContent: text("extracted_content"),
  filePath: text("file_path"),
  mediaType: text("media_type"),
  fileSize: integer("file_size"),
  duration: integer("duration"),
});

export const insertDocumentSchema = z.object({
  title: z.string().min(1),
  type: z.string().min(1),
  category: z.string().min(1),
  content: z.string().optional(),
  description: z.string().optional(),
  indexed: z.boolean().default(false),
  processingStatus: z.string().default("pending"),
  extractedContent: z.string().optional(),
  filePath: z.string().optional(),
  mediaType: z.string().optional(),
  fileSize: z.number().optional(),
  duration: z.number().optional(),
});

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export const knowledgeLinks = pgTable("knowledge_links", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  domain: text("domain").notNull(),
  description: text("description"),
  tags: text("tags").array().default([]),
  dateAdded: timestamp("date_added").defaultNow().notNull(),
});

export const insertKnowledgeLinkSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  domain: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export type InsertKnowledgeLink = z.infer<typeof insertKnowledgeLinkSchema>;
export type KnowledgeLink = typeof knowledgeLinks.$inferSelect;

export const meetings = pgTable("meetings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  threadId: integer("thread_id").references(() => threads.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  dateTime: timestamp("date_time").notNull(),
  location: text("location"),
  minutes: text("minutes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  thread: one(threads, {
    fields: [meetings.threadId],
    references: [threads.id],
  }),
  attendees: many(meetingAttendees),
  agendaItems: many(agendaItems),
}));

export const insertMeetingSchema = z.object({
  threadId: z.number().optional(),
  title: z.string().min(1),
  dateTime: z.string().or(z.date()),
  location: z.string().optional(),
  minutes: z.string().optional(),
});

export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetings.$inferSelect;

export const meetingAttendees = pgTable("meeting_attendees", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  meetingId: integer("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  color: text("color").default("#7FAE9D"),
});

export const meetingAttendeesRelations = relations(meetingAttendees, ({ one }) => ({
  meeting: one(meetings, {
    fields: [meetingAttendees.meetingId],
    references: [meetings.id],
  }),
}));

export const agendaItems = pgTable("agenda_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  meetingId: integer("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  completed: boolean("completed").default(false),
  order: integer("order").notNull().default(0),
});

export const agendaItemsRelations = relations(agendaItems, ({ one }) => ({
  meeting: one(meetings, {
    fields: [agendaItems.meetingId],
    references: [meetings.id],
  }),
}));

export const insertAgendaItemSchema = z.object({
  meetingId: z.number(),
  title: z.string().min(1),
  description: z.string().optional(),
  completed: z.boolean().default(false),
  order: z.number().default(0),
});

export type InsertAgendaItem = z.infer<typeof insertAgendaItemSchema>;
export type AgendaItem = typeof agendaItems.$inferSelect;

// AI Chat conversations and messages
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  threadId: integer("thread_id").references(() => threads.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  thread: one(threads, {
    fields: [conversations.threadId],
    references: [threads.id],
  }),
  messages: many(messages),
}));

export const insertConversationSchema = z.object({
  title: z.string().min(1),
  threadId: z.number().optional(),
});

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const insertMessageSchema = z.object({
  conversationId: z.number(),
  role: z.string().min(1),
  content: z.string().min(1),
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Steward Suggestions for AI Thread Steward feature
export const stewardSuggestions = pgTable("steward_suggestions", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  rationale: text("rationale"),
  actionPayload: jsonb("action_payload"),
  priority: integer("priority"),
  status: text("status").notNull().default("NEW"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const stewardSuggestionsRelations = relations(stewardSuggestions, ({ one }) => ({
  thread: one(threads, {
    fields: [stewardSuggestions.threadId],
    references: [threads.id],
  }),
}));

export const insertStewardSuggestionSchema = z.object({
  threadId: z.number(),
  type: z.enum(["CREATE_NODE", "REVISE_NODE", "ADD_COLLABORATOR_SUGGESTION", "REQUEST_REVIEW", "FLAG_RISK", "NEXT_STEP"]),
  title: z.string().min(1),
  rationale: z.string().optional(),
  actionPayload: z.any().optional(),
  priority: z.number().min(1).max(5).optional(),
  status: z.enum(["NEW", "ACCEPTED", "DISMISSED"]).default("NEW"),
});

export type InsertStewardSuggestion = z.infer<typeof insertStewardSuggestionSchema>;
export type StewardSuggestion = typeof stewardSuggestions.$inferSelect;

// Research Sessions for AI research feature
export const researchSessions = pgTable("research_sessions", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const researchSessionsRelations = relations(researchSessions, ({ one, many }) => ({
  thread: one(threads, {
    fields: [researchSessions.threadId],
    references: [threads.id],
  }),
  messages: many(researchMessages),
}));

export const insertResearchSessionSchema = z.object({
  threadId: z.number(),
});

export type InsertResearchSession = z.infer<typeof insertResearchSessionSchema>;
export type ResearchSession = typeof researchSessions.$inferSelect;

// Research Messages for AI research conversations
export const researchMessages = pgTable("research_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => researchSessions.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  citations: jsonb("citations"),
  suggestedNextSteps: jsonb("suggested_next_steps"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const researchMessagesRelations = relations(researchMessages, ({ one }) => ({
  session: one(researchSessions, {
    fields: [researchMessages.sessionId],
    references: [researchSessions.id],
  }),
}));

export const insertResearchMessageSchema = z.object({
  sessionId: z.number(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  citations: z.array(z.object({
    url: z.string(),
    title: z.string(),
    snippet: z.string(),
  })).optional(),
  suggestedNextSteps: z.array(z.string()).optional(),
});

export type InsertResearchMessage = z.infer<typeof insertResearchMessageSchema>;
export type ResearchMessage = typeof researchMessages.$inferSelect;

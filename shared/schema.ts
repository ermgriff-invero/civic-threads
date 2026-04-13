import { sql, relations } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean, serial, index, unique } from "drizzle-orm/pg-core";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";
import { users } from "./models/auth";

export const threads = pgTable("threads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  status: text("status").notNull().default("Drafting"),
  type: text("type").notNull(),
  author: text("author").notNull(),
  topic: text("topic"),
  description: text("description"),
  outcome: text("outcome"),
  linearIssueId: text("linear_issue_id"),
  linearIssueUrl: text("linear_issue_url"),
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
  linearIssueId: z.string().nullable().optional(),
  linearIssueUrl: z.string().nullable().optional(),
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

/** Strict tree projection of thread canvas nodes/edges (not municipal “shadow tree” metadata). */
export const threadStructureNodeSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  order: z.number().int().nonnegative(),
});

export const threadStructureSnapshotSchema = z.object({
  threadId: z.number(),
  version: z.string().min(1),
  nodes: z.array(threadStructureNodeSchema),
});

export const threadStructurePatchOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create"),
    nodeId: z.string().min(1),
    parentId: z.string().nullable(),
    order: z.number().int().nonnegative(),
    label: z.string().min(1),
    nodeType: z.string().min(1),
    positionX: z.number().int().optional(),
    positionY: z.number().int().optional(),
    data: z.any().optional(),
  }),
  z.object({
    type: z.literal("move"),
    nodeId: z.string().min(1),
    parentId: z.string().nullable(),
    order: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("delete"),
    nodeId: z.string().min(1),
  }),
  z.object({
    type: z.literal("update"),
    nodeId: z.string().min(1),
    label: z.string().min(1).optional(),
    data: z.any().optional(),
  }),
]);

export const applyThreadStructurePatchSchema = z.object({
  baseVersion: z.string().min(1),
  operations: z.array(threadStructurePatchOperationSchema).min(1),
});

export type ThreadStructureNode = z.infer<typeof threadStructureNodeSchema>;
export type ThreadStructureSnapshot = z.infer<typeof threadStructureSnapshotSchema>;
export type ThreadStructurePatchOperation = z.infer<typeof threadStructurePatchOperationSchema>;
export type ApplyThreadStructurePatch = z.infer<typeof applyThreadStructurePatchSchema>;

/**
 * Google Drive OAuth per tenant (one shared Drive for pilot `ct-shared`; production = per city).
 * `userId` = admin who last completed OAuth (audit). Refresh token: encrypt at rest before prod.
 */
export const googleDriveConnections = pgTable(
  "google_drive_connections",
  {
    id: serial("id").primaryKey(),
    tenantKey: text("tenant_key").notNull().default("ct-shared"),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshToken: text("refresh_token").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("google_drive_connections_tenant_uid").on(t.tenantKey)],
);

/**
 * Shadow tree folder nodes per tenant. `connectionId` set → mirrored under that Drive; null → manual-upload branch.
 */
export const knowledgeFolders = pgTable(
  "knowledge_folders",
  {
    id: serial("id").primaryKey(),
    tenantKey: text("tenant_key").notNull().default("ct-shared"),
    connectionId: integer("connection_id").references(() => googleDriveConnections.id, {
      onDelete: "cascade",
    }),
    parentId: integer("parent_id").references((): AnyPgColumn => knowledgeFolders.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    externalId: text("external_id").notNull(),
    aiSummary: text("ai_summary"),
    isDirty: boolean("is_dirty").notNull().default(true),
    syncedAt: timestamp("synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("knowledge_folders_tenant_external_uid").on(t.tenantKey, t.externalId)],
);

export const insertGoogleDriveConnectionSchema = z.object({
  tenantKey: z.string().min(1),
  userId: z.string().min(1),
  refreshToken: z.string().min(1),
});

export type InsertGoogleDriveConnection = z.infer<typeof insertGoogleDriveConnectionSchema>;
export type GoogleDriveConnection = typeof googleDriveConnections.$inferSelect;

export const insertKnowledgeFolderSchema = z.object({
  tenantKey: z.string().optional(),
  connectionId: z.number().optional().nullable(),
  parentId: z.number().optional().nullable(),
  title: z.string().min(1),
  externalId: z.string().min(1),
  aiSummary: z.string().optional().nullable(),
  isDirty: z.boolean().optional(),
  syncedAt: z.date().optional().nullable(),
});

export type InsertKnowledgeFolder = z.infer<typeof insertKnowledgeFolderSchema>;
export type KnowledgeFolder = typeof knowledgeFolders.$inferSelect;

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
  year: integer("year"),
  tags: text("tags").array().default([]),
  isActive: boolean("is_active").default(true),
  /** Municipal shadow tree: optional link into mirrored Drive folder hierarchy. */
  folderId: integer("folder_id").references(() => knowledgeFolders.id, { onDelete: "set null" }),
  /** Source file id in Google Drive (or other provider) when `sourceSystem` is not `upload`. */
  externalId: text("external_id"),
  /** `upload` = legacy manual upload; `gdrive` = mirrored from Google Drive. */
  sourceSystem: text("source_system").default("upload"),
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
  year: z.number().optional(),
  tags: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  folderId: z.number().optional().nullable(),
  externalId: z.string().optional().nullable(),
  sourceSystem: z.string().optional().nullable(),
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
  year: integer("year"),
  category: text("category").default("Other"),
  isActive: boolean("is_active").default(true),
});

export const insertKnowledgeLinkSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  domain: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  year: z.number().optional(),
  category: z.string().default("Other"),
  isActive: z.boolean().default(true),
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

export const sourceCitationSchema = z.object({
  sourceId: z.string(),
  sourceType: z.enum(["document", "url"]),
  sourceTitle: z.string(),
  sourcePage: z.number().optional(),
  sourceUrl: z.string().optional(),
});

export type SourceCitation = z.infer<typeof sourceCitationSchema>;

export const insertResearchMessageSchema = z.object({
  sessionId: z.number(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  citations: z.array(z.union([
    z.object({
      url: z.string(),
      title: z.string(),
      snippet: z.string(),
    }),
    sourceCitationSchema,
  ])).optional(),
  suggestedNextSteps: z.array(z.string()).optional(),
});

export type InsertResearchMessage = z.infer<typeof insertResearchMessageSchema>;
export type ResearchMessage = typeof researchMessages.$inferSelect;

export const synthesizedDocuments = pgTable("synthesized_documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  format: text("format").notNull(),
  content: text("content").notNull(),
  sourceThreadIds: integer("source_thread_ids").array().notNull(),
  author: text("author").notNull(),
  citations: jsonb("citations"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSynthesizedDocumentSchema = z.object({
  title: z.string().min(1),
  format: z.string().min(1),
  content: z.string().min(1),
  sourceThreadIds: z.array(z.number()),
  author: z.string().min(1),
  citations: z.array(sourceCitationSchema).optional(),
});

export type InsertSynthesizedDocument = z.infer<typeof insertSynthesizedDocumentSchema>;
export type SynthesizedDocument = typeof synthesizedDocuments.$inferSelect;

export const municipalitySettings = pgTable("municipality_settings", {
  id: serial("id").primaryKey(),
  agendaDestinationType: text("agenda_destination_type").notNull().default("download_pdf"),
  granicusApiKey: text("granicus_api_key"),
  granicusEndpointUrl: text("granicus_endpoint_url"),
  legistarApiKey: text("legistar_api_key"),
  legistarEndpointUrl: text("legistar_endpoint_url"),
  clerkEmail: text("clerk_email"),
  agendaCategories: text("agenda_categories").array().default(["New Business", "Old Business", "Public Hearing", "Consent Agenda"]),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMunicipalitySettingsSchema = z.object({
  agendaDestinationType: z.enum(["granicus", "legistar", "email", "download_pdf"]),
  granicusApiKey: z.string().optional().nullable(),
  granicusEndpointUrl: z.string().optional().nullable(),
  legistarApiKey: z.string().optional().nullable(),
  legistarEndpointUrl: z.string().optional().nullable(),
  clerkEmail: z.string().email().optional().nullable(),
  agendaCategories: z.array(z.string()).optional(),
});

export type InsertMunicipalitySettings = z.infer<typeof insertMunicipalitySettingsSchema>;
export type MunicipalitySettings = typeof municipalitySettings.$inferSelect;

export const agendaSubmissions = pgTable("agenda_submissions", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").references(() => threads.id),
  documentTitle: text("document_title").notNull(),
  meetingDate: timestamp("meeting_date").notNull(),
  category: text("category").notNull(),
  notes: text("notes"),
  destinationType: text("destination_type").notNull(),
  status: text("status").notNull().default("submitted"),
  submittedBy: text("submitted_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAgendaSubmissionSchema = z.object({
  threadId: z.number().optional(),
  documentTitle: z.string().min(1),
  meetingDate: z.string().or(z.date()),
  category: z.string().min(1),
  notes: z.string().optional().nullable(),
  destinationType: z.string(),
  submittedBy: z.string(),
});

export type InsertAgendaSubmission = z.infer<typeof insertAgendaSubmissionSchema>;
export type AgendaSubmission = typeof agendaSubmissions.$inferSelect;

export const agendaMeetings = pgTable("agenda_meetings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  meetingDate: timestamp("meeting_date").notNull(),
  location: text("location"),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAgendaMeetingSchema = z.object({
  title: z.string().min(1),
  meetingDate: z.string().or(z.date()),
  location: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  status: z.string().default("draft"),
  createdBy: z.string(),
});

export type InsertAgendaMeeting = z.infer<typeof insertAgendaMeetingSchema>;
export type AgendaMeeting = typeof agendaMeetings.$inferSelect;

export const agendaItemsV2 = pgTable("agenda_items_v2", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => agendaMeetings.id, { onDelete: "cascade" }),
  threadId: integer("thread_id").references(() => threads.id),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("New Business"),
  content: text("content"),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status").notNull().default("pending"),
  submittedBy: text("submitted_by").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAgendaItemV2Schema = z.object({
  meetingId: z.number(),
  threadId: z.number().optional().nullable(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  category: z.string().default("New Business"),
  content: z.string().optional().nullable(),
  sortOrder: z.number().default(0),
  status: z.string().default("pending"),
  submittedBy: z.string(),
  notes: z.string().optional().nullable(),
});

export type InsertAgendaItemV2 = z.infer<typeof insertAgendaItemV2Schema>;
export type AgendaItemV2 = typeof agendaItemsV2.$inferSelect;

export const KNOWLEDGE_CATEGORIES = [
  "Budget",
  "Statute",
  "Ordinance",
  "Policy",
  "Meeting Minutes",
  "Other",
] as const;

export const projectKnowledgeConfig = pgTable("project_knowledge_config", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => threads.id, { onDelete: "cascade" }),
  enabledCategories: text("enabled_categories").array().default(["Budget", "Statute", "Ordinance", "Policy", "Meeting Minutes", "Other"]),
  yearFrom: integer("year_from"),
  yearTo: integer("year_to"),
  enabledTags: text("enabled_tags").array().default([]),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectKnowledgeConfigSchema = z.object({
  projectId: z.number(),
  enabledCategories: z.array(z.string()).default(["Budget", "Statute", "Ordinance", "Policy", "Meeting Minutes", "Other"]),
  yearFrom: z.number().optional().nullable(),
  yearTo: z.number().optional().nullable(),
  enabledTags: z.array(z.string()).default([]),
});

export type InsertProjectKnowledgeConfig = z.infer<typeof insertProjectKnowledgeConfigSchema>;
export type ProjectKnowledgeConfig = typeof projectKnowledgeConfig.$inferSelect;

export const STYLE_TEMPLATE_TYPES = [
  "Memo",
  "Research Document",
  "Email",
  "Ordinance",
  "Resolution",
  "Staff Report",
  "Meeting Minutes",
  "Permit Review",
  "Policy Brief",
  "Decision Document",
  "Other",
] as const;

export const styleTemplates = pgTable("style_templates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  documentType: text("document_type").notNull(),
  content: text("content"),
  extractedContent: text("extracted_content"),
  filePath: text("file_path"),
  fileSize: integer("file_size"),
  mediaType: text("media_type"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStyleTemplateSchema = z.object({
  name: z.string().min(1),
  documentType: z.string().min(1),
  content: z.string().optional(),
  extractedContent: z.string().optional(),
  filePath: z.string().optional(),
  fileSize: z.number().optional(),
  mediaType: z.string().optional(),
  description: z.string().optional(),
});

export type InsertStyleTemplate = z.infer<typeof insertStyleTemplateSchema>;
export type StyleTemplate = typeof styleTemplates.$inferSelect;

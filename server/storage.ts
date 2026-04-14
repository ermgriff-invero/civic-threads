import { 
  users, threads, threadNodes, threadEdges, documents, knowledgeLinks, meetings, meetingAttendees,
  stewardSuggestions, researchSessions, researchMessages, synthesizedDocuments,
  municipalitySettings, agendaSubmissions, projectKnowledgeConfig, styleTemplates,
  agendaMeetings, agendaItemsV2, googleDriveConnections, knowledgeFolders,
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
  type ResearchMessage, type InsertResearchMessage,
  type SynthesizedDocument, type InsertSynthesizedDocument,
  type MunicipalitySettings, type InsertMunicipalitySettings,
  type AgendaSubmission, type InsertAgendaSubmission,
  type ProjectKnowledgeConfig, type InsertProjectKnowledgeConfig,
  type StyleTemplate, type InsertStyleTemplate,
  type AgendaMeeting, type InsertAgendaMeeting,
  type AgendaItemV2, type InsertAgendaItemV2,
  type ApplyThreadStructurePatch,
  type ThreadStructureSnapshot,
  type GoogleDriveConnection,
  type InsertGoogleDriveConnection,
  type KnowledgeFolder,
  type InsertKnowledgeFolder
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, ilike, or, sql, and, inArray } from "drizzle-orm";
import { createHash } from "crypto";

function buildThreadStructureVersion(nodes: Array<{ id: string; parentId: string | null; order: number }>): string {
  const canonical = [...nodes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((node) => `${node.id}:${node.parentId ?? "root"}:${node.order}`)
    .join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

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
  getThreadNodeById(id: string): Promise<ThreadNode | undefined>;
  createThreadNode(node: InsertThreadNode): Promise<ThreadNode>;
  updateThreadNode(id: string, updates: Partial<InsertThreadNode>): Promise<ThreadNode | undefined>;
  deleteThreadNode(id: string): Promise<void>;

  getThreadEdges(threadId: number): Promise<ThreadEdge[]>;
  createThreadEdge(edge: InsertThreadEdge): Promise<ThreadEdge>;
  deleteThreadEdge(id: string): Promise<void>;
  getThreadStructureSnapshot(threadId: number): Promise<ThreadStructureSnapshot>;
  applyThreadStructurePatch(threadId: number, patch: ApplyThreadStructurePatch): Promise<ThreadStructureSnapshot>;

  getDocuments(): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;
  createDocument(doc: InsertDocument): Promise<Document>;
  updateDocument(id: number, updates: Partial<InsertDocument>): Promise<Document | undefined>;
  deleteDocument(id: number): Promise<void>;

  getGoogleDriveConnectionForTenant(tenantKey: string): Promise<GoogleDriveConnection | undefined>;
  upsertGoogleDriveConnection(row: InsertGoogleDriveConnection): Promise<GoogleDriveConnection>;
  updateGoogleDriveConnectionChangesToken(tenantKey: string, token: string | null): Promise<void>;
  deleteGoogleDriveConnectionForTenant(tenantKey: string): Promise<void>;
  /** Mark parent folders only (not `folderId`). Used after a folder row was already upserted dirty. */
  markAncestorFoldersDirty(tenantKey: string, folderId: number): Promise<void>;
  /** Mark `folderId` and all ancestor folders dirty (e.g. a document under `folderId` changed). */
  markFolderAndAncestorsDirty(tenantKey: string, folderId: number): Promise<void>;
  getKnowledgeFolderByExternalId(tenantKey: string, externalId: string): Promise<KnowledgeFolder | undefined>;
  getKnowledgeFolderByIdForTenant(tenantKey: string, id: number): Promise<KnowledgeFolder | undefined>;
  getKnowledgeFoldersForTenant(tenantKey: string): Promise<KnowledgeFolder[]>;
  upsertKnowledgeFolderByExternalId(
    row: InsertKnowledgeFolder & { tenantKey: string; externalId: string },
  ): Promise<KnowledgeFolder>;
  getDriveDocumentsByFolderIds(folderIds: number[]): Promise<Document[]>;
  getDriveDocumentByExternalIdAndSource(
    externalId: string,
    sourceSystem?: "gdrive",
  ): Promise<Document | undefined>;
  upsertDriveDocumentByExternalId(
    row: Pick<Document, "title" | "type" | "category"> &
      Partial<
        Pick<
          Document,
          | "description"
          | "folderId"
          | "mediaType"
          | "fileSize"
          | "content"
          | "processingStatus"
          | "indexed"
          | "driveModifiedAt"
          | "docSummaryStale"
        >
      > & {
        externalId: string;
        sourceSystem?: "gdrive";
      },
  ): Promise<Document>;

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

  createSynthesizedDocument(doc: InsertSynthesizedDocument): Promise<SynthesizedDocument>;
  getSynthesizedDocument(id: number): Promise<SynthesizedDocument | undefined>;
  getSynthesizedDocuments(): Promise<SynthesizedDocument[]>;

  getMunicipalitySettings(): Promise<MunicipalitySettings | undefined>;
  upsertMunicipalitySettings(settings: InsertMunicipalitySettings): Promise<MunicipalitySettings>;
  createAgendaSubmission(submission: InsertAgendaSubmission): Promise<AgendaSubmission>;
  getAgendaSubmissions(): Promise<AgendaSubmission[]>;

  getProjectKnowledgeConfig(projectId: number): Promise<ProjectKnowledgeConfig | undefined>;
  upsertProjectKnowledgeConfig(config: InsertProjectKnowledgeConfig): Promise<ProjectKnowledgeConfig>;
  getKnowledgeSourceStats(config?: ProjectKnowledgeConfig | null): Promise<{ documentCount: number; urlCount: number }>;
  getAllKnowledgeTags(): Promise<string[]>;

  getStyleTemplates(): Promise<StyleTemplate[]>;
  getStyleTemplate(id: number): Promise<StyleTemplate | undefined>;
  getStyleTemplatesByType(documentType: string): Promise<StyleTemplate[]>;
  createStyleTemplate(template: InsertStyleTemplate): Promise<StyleTemplate>;
  deleteStyleTemplate(id: number): Promise<void>;

  getAgendaMeetings(): Promise<AgendaMeeting[]>;
  getAgendaMeeting(id: number): Promise<AgendaMeeting | undefined>;
  createAgendaMeeting(meeting: InsertAgendaMeeting): Promise<AgendaMeeting>;
  updateAgendaMeeting(id: number, updates: Partial<InsertAgendaMeeting>): Promise<AgendaMeeting | undefined>;
  deleteAgendaMeeting(id: number): Promise<void>;

  getAgendaItemsForMeeting(meetingId: number): Promise<AgendaItemV2[]>;
  createAgendaItem(item: InsertAgendaItemV2): Promise<AgendaItemV2>;
  updateAgendaItem(id: number, updates: Partial<InsertAgendaItemV2>): Promise<AgendaItemV2 | undefined>;
  deleteAgendaItem(id: number): Promise<void>;
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

  async getThreadNodeById(id: string): Promise<ThreadNode | undefined> {
    const [node] = await db.select().from(threadNodes).where(eq(threadNodes.id, id));
    return node || undefined;
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

  async getThreadStructureSnapshot(threadId: number): Promise<ThreadStructureSnapshot> {
    const [nodes, edges] = await Promise.all([
      this.getThreadNodes(threadId),
      this.getThreadEdges(threadId),
    ]);

    const activeNodes = nodes.filter((node) => !node.deleted);
    const parentByNodeId = new Map<string, string | null>();
    const siblingOrder = new Map<string | null, string[]>();

    for (const node of activeNodes) {
      parentByNodeId.set(node.id, null);
      siblingOrder.set(node.id, []);
    }

    for (const edge of edges) {
      if (!parentByNodeId.has(edge.target) || !parentByNodeId.has(edge.source)) {
        continue;
      }
      // Favor the first incoming edge as parent for compatibility mode.
      if (parentByNodeId.get(edge.target) === null) {
        parentByNodeId.set(edge.target, edge.source);
      }
    }

    for (const node of activeNodes) {
      const parentId = parentByNodeId.get(node.id) ?? null;
      const bucket = siblingOrder.get(parentId) ?? [];
      bucket.push(node.id);
      siblingOrder.set(parentId, bucket);
    }

    const snapshotNodes = activeNodes.map((node) => {
      const parentId = parentByNodeId.get(node.id) ?? null;
      const siblings = siblingOrder.get(parentId) ?? [];
      return {
        id: node.id,
        parentId,
        order: Math.max(0, siblings.indexOf(node.id)),
      };
    });

    return {
      threadId,
      nodes: snapshotNodes,
      version: buildThreadStructureVersion(snapshotNodes),
    };
  }

  async applyThreadStructurePatch(threadId: number, patch: ApplyThreadStructurePatch): Promise<ThreadStructureSnapshot> {
    const currentSnapshot = await this.getThreadStructureSnapshot(threadId);
    if (currentSnapshot.version !== patch.baseVersion) {
      throw new Error("THREAD_STRUCTURE_VERSION_CONFLICT");
    }

    await db.transaction(async (tx) => {
      for (const op of patch.operations) {
        if (op.type === "create") {
          await tx.insert(threadNodes).values({
            id: op.nodeId,
            threadId,
            type: op.nodeType,
            label: op.label,
            positionX: op.positionX ?? 100,
            positionY: op.positionY ?? 100,
            data: op.data,
            deleted: false,
          });
          if (op.parentId) {
            await tx.insert(threadEdges).values({
              threadId,
              source: op.parentId,
              target: op.nodeId,
              animated: true,
            });
          }
          continue;
        }

        if (op.type === "update") {
          const updates: Partial<InsertThreadNode> = {};
          if (op.label !== undefined) updates.label = op.label;
          if (op.data !== undefined) updates.data = op.data;
          if (Object.keys(updates).length > 0) {
            await tx.update(threadNodes).set(updates).where(eq(threadNodes.id, op.nodeId));
          }
          continue;
        }

        if (op.type === "delete") {
          await tx.update(threadNodes).set({ deleted: true }).where(eq(threadNodes.id, op.nodeId));
          await tx
            .delete(threadEdges)
            .where(or(eq(threadEdges.source, op.nodeId), eq(threadEdges.target, op.nodeId)));
          continue;
        }

        if (op.type === "move") {
          await tx.delete(threadEdges).where(eq(threadEdges.target, op.nodeId));
          if (op.parentId) {
            await tx.insert(threadEdges).values({
              threadId,
              source: op.parentId,
              target: op.nodeId,
              animated: true,
            });
          }
        }
      }
    });

    return this.getThreadStructureSnapshot(threadId);
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

  async getGoogleDriveConnectionForTenant(tenantKey: string): Promise<GoogleDriveConnection | undefined> {
    const [row] = await db
      .select()
      .from(googleDriveConnections)
      .where(eq(googleDriveConnections.tenantKey, tenantKey));
    return row ?? undefined;
  }

  async upsertGoogleDriveConnection(row: InsertGoogleDriveConnection): Promise<GoogleDriveConnection> {
    const now = new Date();
    const [out] = await db
      .insert(googleDriveConnections)
      .values({ ...row, updatedAt: now })
      .onConflictDoUpdate({
        target: googleDriveConnections.tenantKey,
        set: { refreshToken: row.refreshToken, userId: row.userId, updatedAt: now },
      })
      .returning();
    return out;
  }

  async updateGoogleDriveConnectionChangesToken(tenantKey: string, token: string | null): Promise<void> {
    const now = new Date();
    await db
      .update(googleDriveConnections)
      .set({ driveChangesStartPageToken: token, updatedAt: now })
      .where(eq(googleDriveConnections.tenantKey, tenantKey));
  }

  async markAncestorFoldersDirty(tenantKey: string, folderId: number): Promise<void> {
    const folders = await this.getKnowledgeFoldersForTenant(tenantKey);
    const byId = new Map(folders.map((f) => [f.id, f]));
    let cur = byId.get(folderId);
    let parentId = cur?.parentId ?? null;
    const now = new Date();
    while (parentId !== null) {
      await db
        .update(knowledgeFolders)
        .set({ isDirty: true, updatedAt: now })
        .where(and(eq(knowledgeFolders.tenantKey, tenantKey), eq(knowledgeFolders.id, parentId)));
      cur = byId.get(parentId);
      parentId = cur?.parentId ?? null;
    }
  }

  async markFolderAndAncestorsDirty(tenantKey: string, folderId: number): Promise<void> {
    const now = new Date();
    await db
      .update(knowledgeFolders)
      .set({ isDirty: true, updatedAt: now })
      .where(and(eq(knowledgeFolders.tenantKey, tenantKey), eq(knowledgeFolders.id, folderId)));
    await this.markAncestorFoldersDirty(tenantKey, folderId);
  }

  async deleteGoogleDriveConnectionForTenant(tenantKey: string): Promise<void> {
    await db.delete(googleDriveConnections).where(eq(googleDriveConnections.tenantKey, tenantKey));
  }

  async getKnowledgeFolderByExternalId(
    tenantKey: string,
    externalId: string,
  ): Promise<KnowledgeFolder | undefined> {
    const [row] = await db
      .select()
      .from(knowledgeFolders)
      .where(
        sql`${knowledgeFolders.tenantKey} = ${tenantKey} and ${knowledgeFolders.externalId} = ${externalId}`,
      );
    return row ?? undefined;
  }

  async getKnowledgeFolderByIdForTenant(
    tenantKey: string,
    id: number,
  ): Promise<KnowledgeFolder | undefined> {
    const [row] = await db
      .select()
      .from(knowledgeFolders)
      .where(and(eq(knowledgeFolders.tenantKey, tenantKey), eq(knowledgeFolders.id, id)));
    return row ?? undefined;
  }

  async upsertKnowledgeFolderByExternalId(
    row: InsertKnowledgeFolder & { tenantKey: string; externalId: string },
  ): Promise<KnowledgeFolder> {
    const now = new Date();
    const [out] = await db
      .insert(knowledgeFolders)
      .values({
        ...row,
        updatedAt: now,
        syncedAt: row.syncedAt ?? now,
      })
      .onConflictDoUpdate({
        target: [knowledgeFolders.tenantKey, knowledgeFolders.externalId],
        set: {
          title: row.title,
          parentId: row.parentId ?? null,
          connectionId: row.connectionId ?? null,
          // Sync omits aiSummary — do not wipe map text (same idea as documents.description on doc upsert).
          aiSummary:
            row.aiSummary !== undefined ? row.aiSummary : sql`${knowledgeFolders.aiSummary}`,
          isDirty: row.isDirty ?? true,
          driveModifiedAt: row.driveModifiedAt ?? null,
          syncedAt: row.syncedAt ?? now,
          updatedAt: now,
        },
      })
      .returning();
    return out;
  }

  async getKnowledgeFoldersForTenant(tenantKey: string): Promise<KnowledgeFolder[]> {
    return db
      .select()
      .from(knowledgeFolders)
      .where(eq(knowledgeFolders.tenantKey, tenantKey))
      .orderBy(desc(knowledgeFolders.updatedAt));
  }

  async getDriveDocumentsByFolderIds(folderIds: number[]): Promise<Document[]> {
    if (folderIds.length === 0) {
      return [];
    }
    return db
      .select()
      .from(documents)
      .where(and(eq(documents.sourceSystem, "gdrive"), inArray(documents.folderId, folderIds)))
      .orderBy(desc(documents.dateAdded));
  }

  async getDriveDocumentByExternalIdAndSource(
    externalId: string,
    sourceSystem: "gdrive" = "gdrive",
  ): Promise<Document | undefined> {
    const [row] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.externalId, externalId), eq(documents.sourceSystem, sourceSystem)))
      .limit(1);
    return row ?? undefined;
  }

  async upsertDriveDocumentByExternalId(
    row: Pick<Document, "title" | "type" | "category"> &
      Partial<
        Pick<
          Document,
          | "description"
          | "folderId"
          | "mediaType"
          | "fileSize"
          | "content"
          | "processingStatus"
          | "indexed"
          | "driveModifiedAt"
          | "docSummaryStale"
        >
      > & {
        externalId: string;
        sourceSystem?: "gdrive";
      },
  ): Promise<Document> {
    const sourceSystem = row.sourceSystem ?? "gdrive";
    const [existing] = await db
      .select()
      .from(documents)
      .where(sql`${documents.externalId} = ${row.externalId} and ${documents.sourceSystem} = ${sourceSystem}`)
      .limit(1);

    if (!existing) {
      const [created] = await db
        .insert(documents)
        .values({
          title: row.title,
          type: row.type,
          category: row.category,
          description: row.description ?? null,
          content: row.content ?? null,
          indexed: row.indexed ?? false,
          processingStatus: row.processingStatus ?? "pending",
          folderId: row.folderId ?? null,
          externalId: row.externalId,
          sourceSystem,
          mediaType: row.mediaType ?? null,
          fileSize: row.fileSize ?? null,
          driveModifiedAt: row.driveModifiedAt ?? null,
          docSummaryStale: row.docSummaryStale ?? true,
          tags: [],
          isActive: true,
        })
        .returning();
      return created;
    }

    const [updated] = await db
      .update(documents)
      .set({
        title: row.title,
        type: row.type,
        category: row.category,
        description: row.description ?? existing.description,
        folderId: row.folderId ?? existing.folderId,
        mediaType: row.mediaType ?? existing.mediaType,
        fileSize: row.fileSize ?? existing.fileSize,
        content: row.content ?? existing.content,
        indexed: row.indexed ?? existing.indexed,
        processingStatus: row.processingStatus ?? existing.processingStatus,
        driveModifiedAt: row.driveModifiedAt ?? existing.driveModifiedAt,
        docSummaryStale: row.docSummaryStale ?? existing.docSummaryStale,
      })
      .where(eq(documents.id, existing.id))
      .returning();

    return updated;
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

  async createSynthesizedDocument(doc: InsertSynthesizedDocument): Promise<SynthesizedDocument> {
    const [created] = await db.insert(synthesizedDocuments).values(doc).returning();
    return created;
  }

  async getSynthesizedDocument(id: number): Promise<SynthesizedDocument | undefined> {
    const [doc] = await db.select().from(synthesizedDocuments).where(eq(synthesizedDocuments.id, id));
    return doc || undefined;
  }

  async getSynthesizedDocuments(): Promise<SynthesizedDocument[]> {
    return db.select().from(synthesizedDocuments).orderBy(desc(synthesizedDocuments.createdAt));
  }

  async getMunicipalitySettings(): Promise<MunicipalitySettings | undefined> {
    const [settings] = await db.select().from(municipalitySettings).limit(1);
    return settings || undefined;
  }

  async upsertMunicipalitySettings(settings: InsertMunicipalitySettings): Promise<MunicipalitySettings> {
    const existing = await this.getMunicipalitySettings();
    if (existing) {
      const [updated] = await db.update(municipalitySettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(municipalitySettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(municipalitySettings).values(settings).returning();
    return created;
  }

  async createAgendaSubmission(submission: InsertAgendaSubmission): Promise<AgendaSubmission> {
    const [created] = await db.insert(agendaSubmissions).values({
      ...submission,
      meetingDate: new Date(submission.meetingDate),
    }).returning();
    return created;
  }

  async getAgendaSubmissions(): Promise<AgendaSubmission[]> {
    return db.select().from(agendaSubmissions).orderBy(desc(agendaSubmissions.createdAt));
  }

  async getProjectKnowledgeConfig(projectId: number): Promise<ProjectKnowledgeConfig | undefined> {
    const [config] = await db.select().from(projectKnowledgeConfig)
      .where(eq(projectKnowledgeConfig.projectId, projectId));
    return config || undefined;
  }

  async upsertProjectKnowledgeConfig(config: InsertProjectKnowledgeConfig): Promise<ProjectKnowledgeConfig> {
    const existing = await this.getProjectKnowledgeConfig(config.projectId);
    if (existing) {
      const [updated] = await db.update(projectKnowledgeConfig)
        .set({ ...config, updatedAt: new Date() })
        .where(eq(projectKnowledgeConfig.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(projectKnowledgeConfig).values(config).returning();
    return created;
  }

  async getKnowledgeSourceStats(config?: ProjectKnowledgeConfig | null): Promise<{ documentCount: number; urlCount: number }> {
    if (config) {
      if (config.enabledCategories && config.enabledCategories.length === 0) {
        return { documentCount: 0, urlCount: 0 };
      }

      const conditions: string[] = ["is_active IS NOT FALSE"];
      if (config.enabledCategories && config.enabledCategories.length > 0) {
        const cats = config.enabledCategories.map(c => `'${c.replace(/'/g, "''")}'`).join(",");
        conditions.push(`category IN (${cats})`);
      }
      if (config.yearFrom) conditions.push(`year >= ${config.yearFrom}`);
      if (config.yearTo) conditions.push(`year <= ${config.yearTo}`);
      if (config.enabledTags && config.enabledTags.length > 0) {
        const tagValues = config.enabledTags.map(t => `'${t.replace(/'/g, "''")}'`).join(",");
        conditions.push(`tags && ARRAY[${tagValues}]::text[]`);
      }

      const whereClause = conditions.join(" AND ");
      const docResult = await db.execute(sql.raw(`SELECT count(*)::int as count FROM documents WHERE ${whereClause}`));
      const urlResult = await db.execute(sql.raw(`SELECT count(*)::int as count FROM knowledge_links WHERE ${whereClause}`));
      return {
        documentCount: (docResult.rows?.[0] as any)?.count || 0,
        urlCount: (urlResult.rows?.[0] as any)?.count || 0,
      };
    }

    const docResult = await db.execute(sql`SELECT count(*)::int as count FROM documents`);
    const urlResult = await db.execute(sql`SELECT count(*)::int as count FROM knowledge_links`);
    return {
      documentCount: (docResult.rows?.[0] as any)?.count || 0,
      urlCount: (urlResult.rows?.[0] as any)?.count || 0,
    };
  }

  async getAllKnowledgeTags(): Promise<string[]> {
    const docTags = await db.execute(sql`SELECT DISTINCT unnest(tags) as tag FROM documents WHERE tags IS NOT NULL AND array_length(tags, 1) > 0`);
    const linkTags = await db.execute(sql`SELECT DISTINCT unnest(tags) as tag FROM knowledge_links WHERE tags IS NOT NULL AND array_length(tags, 1) > 0`);
    const allTags = new Set<string>();
    for (const row of docTags.rows) allTags.add((row as any).tag);
    for (const row of linkTags.rows) allTags.add((row as any).tag);
    return Array.from(allTags).sort();
  }

  async getStyleTemplates(): Promise<StyleTemplate[]> {
    return db.select().from(styleTemplates).orderBy(desc(styleTemplates.createdAt));
  }

  async getStyleTemplate(id: number): Promise<StyleTemplate | undefined> {
    const [template] = await db.select().from(styleTemplates).where(eq(styleTemplates.id, id));
    return template || undefined;
  }

  async getStyleTemplatesByType(documentType: string): Promise<StyleTemplate[]> {
    return db.select().from(styleTemplates).where(eq(styleTemplates.documentType, documentType));
  }

  async createStyleTemplate(template: InsertStyleTemplate): Promise<StyleTemplate> {
    const [created] = await db.insert(styleTemplates).values(template).returning();
    return created;
  }

  async deleteStyleTemplate(id: number): Promise<void> {
    await db.delete(styleTemplates).where(eq(styleTemplates.id, id));
  }

  async getAgendaMeetings(): Promise<AgendaMeeting[]> {
    return db.select().from(agendaMeetings).orderBy(desc(agendaMeetings.meetingDate));
  }

  async getAgendaMeeting(id: number): Promise<AgendaMeeting | undefined> {
    const [meeting] = await db.select().from(agendaMeetings).where(eq(agendaMeetings.id, id));
    return meeting || undefined;
  }

  async createAgendaMeeting(meeting: InsertAgendaMeeting): Promise<AgendaMeeting> {
    const values = {
      ...meeting,
      meetingDate: new Date(meeting.meetingDate),
    };
    const [created] = await db.insert(agendaMeetings).values(values).returning();
    return created;
  }

  async updateAgendaMeeting(id: number, updates: Partial<InsertAgendaMeeting>): Promise<AgendaMeeting | undefined> {
    const next: Record<string, unknown> = { ...updates, updatedAt: new Date() };
    if (updates.meetingDate !== undefined) {
      next.meetingDate =
        typeof updates.meetingDate === "string" ? new Date(updates.meetingDate) : updates.meetingDate;
    }
    const [updated] = await db.update(agendaMeetings).set(next).where(eq(agendaMeetings.id, id)).returning();
    return updated || undefined;
  }

  async deleteAgendaMeeting(id: number): Promise<void> {
    await db.delete(agendaMeetings).where(eq(agendaMeetings.id, id));
  }

  async getAgendaItemsForMeeting(meetingId: number): Promise<AgendaItemV2[]> {
    return db.select().from(agendaItemsV2).where(eq(agendaItemsV2.meetingId, meetingId)).orderBy(agendaItemsV2.sortOrder);
  }

  async createAgendaItem(item: InsertAgendaItemV2): Promise<AgendaItemV2> {
    const [created] = await db.insert(agendaItemsV2).values(item).returning();
    return created;
  }

  async updateAgendaItem(id: number, updates: Partial<InsertAgendaItemV2>): Promise<AgendaItemV2 | undefined> {
    const [updated] = await db.update(agendaItemsV2).set(updates).where(eq(agendaItemsV2.id, id)).returning();
    return updated || undefined;
  }

  async deleteAgendaItem(id: number): Promise<void> {
    await db.delete(agendaItemsV2).where(eq(agendaItemsV2.id, id));
  }
}

export const storage = new DatabaseStorage();

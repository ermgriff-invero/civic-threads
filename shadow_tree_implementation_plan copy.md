# Strategic Implementation Plan: The "Shadow Tree" Project (CityThreads V2)

This document outlines the 7-day transition strategy for CityThreads, moving from a manual-upload "Data Silo" to an automated, hierarchical "Shadow Tree" architecture.

---

## 1. Vision: The "Smart GPS" Model
The current "Flat RAG" architecture treats CityThreads as a **Data Warehouse**—a place where municipal staff manually dump files. This creates friction, outdated data, and security audits.

The **Shadow Tree** transforms CityThreads into a **Smart GPS**. We no longer store the city's destination (the files); we store the **Map** (metadata and summaries). When the user asks a question:
1. The AI uses the Map to navigate the folder hierarchy.
2. It identifies the specific folder and file required.
3. It fetches the text **live** via API (Google Drive, Laserfiche, or SharePoint).
4. It answers the question and **discards the sensitive text**.

---

## 2. Core Architectural Pillars

### Phase 1: The Hierarchical Schema (Foundation)
We will refactor `shared/schema.ts` to support infinite nesting.
*   **New `folders` Table**: Tracks `parentId`, `title`, `aiSummary`, and an `externalId` (the link to the source system).
*   **Updated `documents` Table**: Adds `folderId` and `sourceUrl`. The `content` field becomes a temporary, local cache rather than the permanent source of truth.

### Phase 2: The Bottom-Up Sync Engine
A background service that builds the "Map" recursively.
1.  **File Summarization**: Crawl files and generate 1-paragraph summaries (GPT-4o-mini).
2.  **Folder Aggregation**: Generate summaries for folders based on their children.
3.  **The "Dirty Branch" Strategy (Cost Control)**:
    *   When a file is updated, mark it as `isDirty`.
    *   Propagate the `isDirty` flag up to all parent folders.
    *   A **Midnight Batch Job** re-summarizes only the "dirty" branches of the tree, slashing API costs by 90%+.

### Phase 3: Agent V2 (The Tree Walker)
The AI agent is refactored from a simple search tool into a "navigator."
*   **Tool: `list_folder(folderId)`**: Returns summaries of children (subfolders/files).
*   **Tool: `read_document(documentId)`**: Fetches the full text live from the source API.
*   **The Iterative Loop**: The agent "explores" the map, jumping levels based on high-quality summaries, until it finds the ground truth.

---

## 3. 7-Day Implementation Schedule

| Day | Focus | Complexity | Daily Deliverable |
| :--- | :--- | :--- | :--- |
| **Day 1** | **Infrastructure** | **Medium** | Schema refactor in `shared/schema.ts`. Setup Google Drive OAuth2 & API client. |
| **Day 2** | **Sync Engine (I)** | **Medium** | Recursive directory crawler. Mirrored GDrive folder structure in DB. |
| **Day 3** | **Sync Engine (II)** | **High** | AI Summarization Worker (Bottom-Up logic). Initial "Map" generation. |
| **Day 4** | **Agent V2 (I)** | **High** | Implementation of `list_folder` and `read_document` tool-calling logic. |
| **Day 5** | **Agent V2 (II)** | **Medium** | "Dirty Branch" midnight sync task. Live-fetch caching layer implementation. |
| **Day 6** | **UI & Citations** | **Medium** | Frontend breadcrumb UI for citations. Streaming "Agent Thought" statuses. |
| **Day 7** | **Refinement** | **Medium** | Latency tuning (parallel fetching). End-to-end testing with GDrive. |

---

## 4. Key Performance Indicators (KPIs)
*   **Data Freshness**: Zero-latency (files updated in Drive are instantly "findable" by the GPS).
*   **Storage Efficiency**: 99% reduction in permanent local storage of binary data.
*   **Procurement Speed**: Reduced IT security friction by promising "No permanent storage of operational documents."

---

## 5. Technical Risks & Mitigations

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **API Rate Limits** | **High** | Implement exponential backoff in the sync engine. Process batch updates at midnight. |
| **Summary Drift** | **High** | Use strict prompt schemas. Force the AI to list specific key projects, dates, and keywords per summary. |
| **Large File Overhead** | **Medium** | Use byte-range requests for PDF text extraction. Perform "shallow" fetches for large documents. |
| **"Lost in Tree" Loop** | **Medium** | Strict token limits on reasoning turns. Provide a "Root Context" in the system prompt to anchor the agent. |
| **Multi-Tenant Security** | **Critical** | AES-256 encryption for OAuth tokens. Strict DB Row-Level Security (RLS) across municipalities. |
| **Latency Variance** | **Medium** | Parallelize file fetching. Use "Streaming States" in the UI to keep user engagement high during remote read. |

---

## 6. Comparison: V1 vs V2

| Feature | V1: Flat Data Silo (Old) | V2: The Shadow Tree (New) |
| :--- | :--- | :--- |
| **Staff Effort** | High (Manual Upload) | Zero (Automated Sync) |
| **Context** | Low (Keyword Snippets) | High (Hierarchical Folder Logic) |
| **Accuracy** | Degrades over time | Always Current (Live API Fetch) |
| **IT Approval** | Long (audit local storage) | Fast (zero permanent data footprint) |
| **Cost** | High (Massive Vector DB) | Low (Lightweight Metadata & Summaries) |

> [!TIP]
> **Summary Recommendation**: By focusing on the **Map (The Shadow Tree)**, we solve the two biggest problems in GovTech: data privacy and manual friction. We will pilot this with a small-scale Google Drive starting Day 1.

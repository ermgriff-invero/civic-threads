# Shadow Tree — Master Plan (CityThreads / Knowledge Base 2.0)

**Purpose:** Single reference for **what’s built**, **what’s next**, and **milestones**. Copy this file anywhere you track work (Notion, Linear, internal wiki).

**Vision (one line):** Store the **map** (metadata + AI summaries in Postgres), fetch **full text live** from Google Drive when needed, then **discard** sensitive content after use — not a permanent document warehouse.

---

## 1. What’s done (as of this document)

### Infrastructure & data model (Day 1)
- **`knowledge_folders`** — hierarchical folders: `tenantKey`, `parentId`, `externalId` (Drive file id), `aiSummary`, `isDirty`, `syncedAt`, optional `connectionId`.
- **`google_drive_connections`** — OAuth refresh token per tenant key.
- **`documents`** — extended with `folderId`, `externalId`, `sourceSystem` (`gdrive` vs `upload`).
- **Tenant scoping** — `resolveShadowTreeTenantKey()` (`SHADOW_TREE_TENANT_KEY` or profile `municipality` → `city:<slug>`).
- **Google Drive** — read-only OAuth, connector under `server/connectors/google-drive/`, KB 2.0 route `/knowledge-base-2`.

### Sync engine — metadata mirror (Day 2)
- **Scoped root** — Only the folder named **`Civic Threads pilot`** under My Drive (explicit resolver + errors if missing/duplicate).
- **Recursive crawl** — `runScopedDriveSync`: queues folders, lists children via Drive API, upserts folders + Drive-backed documents (idempotent upserts).
- **Endpoints** — `POST /sync` (dry-run + live), `GET /verify`, `GET /scope`, diagnostics, peek, file preview.

### AI “map” generation (Day 3)
- **Sample + batch summarization** — OpenAI summaries stored on `documents.description` (`AI summary: …`) and folder rollups in `knowledge_folders.ai_summary`.
- **`POST /summaries/run`** — Bottom-up worker module (`summarization-worker.ts`): docs first, then folder aggregation.
- **Env** — e.g. `SHADOW_TREE_SUMMARY_MODEL`, `SHADOW_TREE_SUMMARY_MAX_TOKENS`, `SHADOW_TREE_SUMMARY_MAX_DOCS`.

### Agent V2 — tools (Day 4)
- **Tools** — `list_folder` (DB map for one folder), `read_document` (live extractable text for `documents.id` in scope).
- **`POST /shadow-tree/query`** — OpenAI tool loop with optional **shadow map snapshot** in system prompt (`includeTreeContext`, default on).
- **Direct tool GETs** — `/shadow-tree/tools/list-folder`, `/shadow-tree/tools/read-document` (debugging).
- **`GET /shadow-tree/tree`** — Nested JSON for UI (full pilot subtree).

### Knowledge Base 2.0 UI (pilot)
- Drive browser (live Drive peek) + **Shadow Tree browser** (DB tree, summaries, dirty flags).
- **Refresh shadow tree** — Triggers **full** scoped sync, then reloads tree (not dirty-only; see §4).
- **Run Full Map Summaries**, Sample Summary, Verify, agent panel with “include shadow map snapshot” toggle.

---

## 2. What’s not done yet (roadmap-aligned)

| Area | Gap |
|------|-----|
| **Incremental / dirty sync** | Sync always walks the **entire** pilot tree. `isDirty` is set on folder upsert but **does not** skip unchanged subtrees. Planned: Day 5 “dirty branch” + optional Drive **changes** API. |
| **Midnight / scheduled jobs** | No cron/Inngest job yet for batch re-summary or dirty-only passes. |
| **Live-fetch caching** | No shared TTL cache for repeated `read_document` previews (Day 5). |
| **Manual-upload connector** | Synthetic `externalId` / manual-upload root (placeholder constants only). |
| **Multi-connector** | Laserfiche / SharePoint — not started. |
| **Production hardening** | Encrypt OAuth tokens at rest, tighten RBAC (pilot allows any signed-in user), RLS per tenant if needed. |
| **Thread / steward integration** | Shadow Tree agent is KB 2.0 only; not wired into the main thread steward UX. |
| **Day 6–7 UI** | Citations from agent, streaming “thought” states, latency polish — not fully implemented. |

---

## 3. Milestones (suggested)

| Milestone | Goal | Key deliverables |
|-----------|------|-------------------|
| **M1 — Pilot map** | Staff can sync Drive → DB mirror + AI summaries | ✅ Done: sync, verify, summaries, tree browser |
| **M2 — Agent** | Ask questions using map + live read | ✅ Done: tool loop + optional tree snapshot |
| **M3 — Cost & freshness** | Don’t re-walk / re-summarize everything every time | Dirty propagation, incremental sync or changes API, scheduled batch |
| **M4 — Product fit** | Feels like part of Civic Threads | Citations, steward integration, streaming, RBAC |
| **M5 — Multi-tenant & scale** | Per-city Drive + security | Token encryption, RLS, rate limits, monitoring |

---

## 4. Next steps (prioritized)

1. **Day 5 — Dirty branch + automation**  
   - Define semantics: what marks a folder/file dirty (Drive `modifiedTime` vs hash vs manual).  
   - Implement **either** incremental crawl using **Drive changes** (recommended) **or** recurse only dirty subtrees.  
   - **Scheduled job** (e.g. nightly) for “re-summarize dirty only.”  
   - Optional **short-lived cache** for preview / `read_document` responses.

2. **Day 6 — UI & citations**  
   - Breadcrumbs / source chips in agent answers.  
   - Streaming status for tool steps (optional).  
   - Thread canvas or Knowledge Center: link to “open in KB 2.0” or doc id.

3. **Day 7 — Refinement**  
   - Parallel fetch where safe, timeouts, backoff on Drive/OpenAI.  
   - E2E checklist: connect → sync → summarize → agent → verify citations.

4. **Manual uploads in tree**  
   - Seed `knowledge_folders` row for manual connector; upload flow places docs under it (same `tenantKey`).

---

## 5. Reference (env & routes)

**Env (see `.env.example`):** `GOOGLE_*`, `SHADOW_TREE_TENANT_KEY`, `SHADOW_TREE_SUMMARY_*`, `SHADOW_TREE_AGENT_*`, `OPENAI_API_KEY`.

**Useful API (authenticated):**
- `GET /api/integrations/google-drive/shadow-tree/tree` — tree JSON  
- `POST /api/integrations/google-drive/shadow-tree/query` — body `{ question, includeTreeContext? }`  
- `POST /api/integrations/google-drive/sync` — full scoped metadata sync  

**Original strategy doc:** `shadow_tree_implementation_plan copy.md` (7-day table + vision).

---

## 6. Assumptions (explicit)

- **Pilot scope** is one shared Drive folder name **`Civic Threads pilot`**; production per-city roots will need configuration, not just folder name.
- **“Full text”** in the app means Drive export / PDF extract / text files — **not** guaranteed for every binary type.
- **Agent** answers are only as good as summaries + model + tools; **no** legal guarantee of completeness for municipal decisions without human review.

---

*Last updated: generated for handoff — adjust dates and owners when you paste into your project tracker.*

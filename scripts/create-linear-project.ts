import { getLinearClient } from '../server/linear-client';

async function main() {
  const client = await getLinearClient();
  
  const teams = await client.teams();
  const team = teams.nodes[0];
  if (!team) {
    console.error("No Linear team found");
    process.exit(1);
  }
  console.log(`Using team: ${team.name} (${team.key})`);

  const project = await client.createProject({
    name: "Civic Threads MVP",
    description: "Track all remaining work for the Civic Threads municipal decision-making platform. Covers core feature gaps, AI improvements, UX polish, and integrations.",
    teamIds: [team.id],
  });
  
  const projectData = await project.project;
  if (!projectData) {
    console.error("Failed to create project");
    process.exit(1);
  }
  console.log(`Created project: ${projectData.name} (${projectData.id})`);

  const workflowStates = await team.states();
  const states: Record<string, string> = {};
  for (const state of workflowStates.nodes) {
    states[state.name.toLowerCase()] = state.id;
    console.log(`  State: ${state.name} (${state.type})`);
  }

  const todoStateId = states['todo'] || states['backlog'] || workflowStates.nodes[0]?.id;

  const issues = [
    {
      title: "Thread Canvas — Add React Flow visual graph/canvas",
      description: `## Summary\nThe Thread Canvas currently uses a list-based actions view. Implement the visual node-edge canvas using @xyflow/react (already in dependencies).\n\n## Details\n- Add React Flow canvas view alongside the current list view\n- Render thread nodes (Research, Draft, Meeting, Decision) as visual nodes\n- Allow creating edges between nodes via drag-and-drop\n- Use existing thread_edges table for persistence\n- Node colors: Research=Navy, Draft=Bronze, Meeting/Decision=Orange\n\n## Files\n- client/src/pages/ThreadCanvas.tsx\n- server/routes.ts (edges endpoints already exist)`,
      priority: 1,
      labelNames: ["Feature", "High Priority"],
    },
    {
      title: "Recall page — Replace mock data with real DB queries",
      description: `## Summary\nThe Recall/Archive page uses hardcoded mock data instead of querying the database for closed/decided threads.\n\n## Details\n- Fetch threads with status "Closed" or "Decided" from the API\n- Display real thread data with proper formatting\n- Add search/filter functionality\n- Remove all hardcoded mock data\n\n## Files\n- client/src/pages/Recall.tsx\n- server/routes.ts (GET /api/threads already supports listing)`,
      priority: 2,
      labelNames: ["Bug Fix", "High Priority"],
    },
    {
      title: "Collaborator/Invite system — Backend implementation",
      description: `## Summary\nThe invite dialog exists in ThreadCanvas but has no backend. Implement thread sharing and permissions.\n\n## Details\n- Add collaborators table to schema (threadId, userId, role)\n- Create API routes: POST /api/threads/:id/collaborators, GET, DELETE\n- Add permission checks to thread CRUD operations\n- Update frontend invite dialog to use real API\n\n## Files\n- shared/schema.ts\n- server/storage.ts\n- server/routes.ts\n- client/src/pages/ThreadCanvas.tsx`,
      priority: 2,
      labelNames: ["Feature", "High Priority"],
    },
    {
      title: "Permit Review node type — Implement 'Coming Soon' action",
      description: `## Summary\nPermit Review is listed as "Coming soon" in the ThreadCanvas. Implement it as a functional node type.\n\n## Details\n- Add permitReview node type handling in ThreadCanvas\n- Create appropriate UI for permit review workflow (checklist, approval stages)\n- Add permit-specific AI prompts in the writing assistant\n- Include in thread health calculations\n\n## Files\n- client/src/pages/ThreadCanvas.tsx\n- server/steward/brain.ts\n- server/routes.ts`,
      priority: 3,
      labelNames: ["Feature", "Medium Priority"],
    },
    {
      title: "Knowledge Base — Deep search across document content",
      description: `## Summary\nKB search currently only filters by title. Implement full-text search across extracted document content.\n\n## Details\n- Add PostgreSQL full-text search on documents.extractedContent\n- Create search API endpoint: GET /api/documents/search?q=...\n- Update frontend to use the new search endpoint\n- Show relevant snippets in search results\n\n## Files\n- server/routes.ts\n- server/storage.ts\n- client/src/pages/KnowledgeBase.tsx`,
      priority: 2,
      labelNames: ["Feature", "Medium Priority"],
    },
    {
      title: "Export — Template-based PDF/DocX generation",
      description: `## Summary\nCurrent export is basic text blob. Implement proper document generation for municipal filings.\n\n## Details\n- Add server-side PDF generation (e.g., puppeteer or pdfkit)\n- Create DocX export using docx library\n- Add municipal document templates (ordinance, resolution, meeting minutes)\n- Include proper headers, formatting, and signatures sections\n\n## Files\n- server/routes.ts (new export endpoints)\n- client/src/pages/ThreadCanvas.tsx (export buttons)`,
      priority: 3,
      labelNames: ["Feature", "Medium Priority"],
    },
    {
      title: "AI error handling — User-friendly messages on OpenAI failures",
      description: `## Summary\nImprove error handling when OpenAI API calls fail (rate limits, network errors, invalid responses).\n\n## Details\n- Add retry logic with exponential backoff for transient failures\n- Show user-friendly error messages in the chat UI\n- Add fallback behavior when AI is unavailable\n- Log errors with context for debugging\n\n## Files\n- server/routes.ts\n- server/steward/brain.ts\n- client/src/pages/ThreadCanvas.tsx`,
      priority: 3,
      labelNames: ["Improvement", "Medium Priority"],
    },
    {
      title: "Profile page — Add editable fields and preferences",
      description: `## Summary\nThe Profile page is a basic placeholder. Add real functionality.\n\n## Details\n- Allow editing name, title, position, municipality\n- Add profile image upload\n- Add notification preferences\n- Add theme/display preferences\n- Implement PATCH /api/auth/user endpoint\n\n## Files\n- client/src/pages/Profile.tsx\n- server/auth.ts\n- server/routes.ts`,
      priority: 4,
      labelNames: ["Feature", "Low Priority"],
    },
    {
      title: "Mobile responsiveness — Audit all pages",
      description: `## Summary\nVerify and fix mobile responsiveness across all pages.\n\n## Details\n- Test all pages at 375px, 414px, and 768px widths\n- Fix overflow issues, truncation, touch targets\n- Ensure bottom navigation works properly on all pages\n- Test thread canvas on mobile (may need simplified view)\n\n## Files\n- All page components in client/src/pages/\n- client/src/components/layout/Shell.tsx`,
      priority: 4,
      labelNames: ["Improvement", "Low Priority"],
    },
    {
      title: "Loading/error states — Ensure proper feedback across all async operations",
      description: `## Summary\nAudit all async operations and ensure proper loading spinners and error messages.\n\n## Details\n- Add loading skeletons for data fetching\n- Add error boundaries for component failures\n- Ensure toast notifications for success/failure of mutations\n- Add retry buttons on failed operations\n\n## Files\n- All page components in client/src/pages/\n- client/src/lib/queryClient.ts`,
      priority: 4,
      labelNames: ["Improvement", "Low Priority"],
    },
    {
      title: "Linear integration — In-app issue management",
      description: `## Summary\nBuild Linear integration into Civic Threads so users can view and manage Linear issues from within the app.\n\n## Details\n- Add Linear API routes to backend\n- Create Linear board page in frontend\n- Allow creating/updating issues from within the app\n- Link threads to Linear issues\n\n## Files\n- server/linear-client.ts (already created)\n- server/routes.ts\n- client/src/pages/LinearBoard.tsx (new)\n- client/src/components/layout/Shell.tsx`,
      priority: 1,
      labelNames: ["Feature", "High Priority"],
    },
    {
      title: "Municipal data integrations — Legistar, GIS connectors",
      description: `## Summary\nFuture integration with municipal legislative systems and geographic data.\n\n## Details\n- Research Legistar API for legislative data import\n- Explore GIS data integration for location-based decisions\n- Design integration architecture for pluggable data sources\n\n## Files\n- TBD — architecture design needed first`,
      priority: 4,
      labelNames: ["Feature", "Future"],
    },
  ];

  console.log("\nCreating issues...");
  for (const issue of issues) {
    try {
      const created = await client.createIssue({
        teamId: team.id,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        projectId: projectData.id,
        stateId: todoStateId,
      });
      const issueData = await created.issue;
      console.log(`  ✓ ${issueData?.identifier}: ${issue.title}`);
    } catch (e: any) {
      console.error(`  ✗ Failed: ${issue.title} — ${e.message}`);
    }
  }

  console.log("\nDone! Project and issues created in Linear.");
}

main().catch(console.error);

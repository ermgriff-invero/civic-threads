# Civic Threads

## Overview

Civic Threads is a government operational intelligence platform designed as a mobile-first Progressive Web App (PWA). It serves as "The System of Record for Municipal Decisions," providing institutional memory and outcome learning for civic workflows. The application enables municipal staff to create, manage, and track decision threads through an interactive canvas-based workflow system.

The platform features:
- A "Brain" dashboard visualizing institutional memory as a network graph
- Thread canvas workspace with drag-and-drop node-based process flows
- Knowledge base for documents and references
- AI-assisted content drafting based on historical decisions
- Real-time collaboration indicators
- **AI Thread Steward**: Intelligent assistant panel for research, suggestions, and ideal thread planning
- **Linear Integration**: Backend-only agent tooling for project management (no user-facing UI)
- **RBAC**: Profile-level Admin/PM roles; all authenticated users can create/edit threads and content
- **Close Thread**: Thread owner or admin can close a thread, which archives all content to the Knowledge Center and locks the thread to read-only mode
- **Thread Synthesis**: AI-powered merging of multiple threads into unified documents (Memo, Strategy Brief, Action Plan) via Anthropic Claude (claude-sonnet-4-6)
- **Agenda Drop Box**: Full agenda builder with meeting management, item submission, admin approval workflow, drag-and-drop reordering, and publish/archive lifecycle. Any user can submit items to draft meetings; admins manage meetings and approve/reject/reorder items. Also supports "Send to Agenda" from thread canvas to drop work products into specific meetings.
- **Dynamic Knowledge Gating**: Per-project configuration of which data sources the AI searches, with category toggles, year range filtering, and tag-based filtering
- **Style Templates**: Upload example memos, ordinances, emails, etc. to teach the AI your municipality's writing tone and structure
- **Word-Doc Document Preview**: Professional document rendering with serif fonts, letterhead headers, section formatting, and edit/preview toggle

## AI Thread Steward

The AI Thread Steward is a right-side panel accessible from the Thread Canvas that provides AI-powered assistance:

### Features
1. **Research Tab**: Chat-based research interface with citations. Ask questions about the thread topic and receive AI-generated answers with source references.
   - **Research Persistence**: All research conversations are saved to the database and automatically reload when returning to a thread
   - **Create Draft from Research**: One-click conversion of research into document nodes:
     - Memo
     - Decision
     - Meeting Minutes
     - Permit Review
   - Draft nodes are automatically connected to research nodes via edges to show the workflow link

2. **Suggestions Tab**: AI-generated improvement suggestions for the thread. Each suggestion can be:
   - Previewed to see what would be created
   - Accepted to create the suggested node
   - Dismissed if not needed

3. **Ideal Thread Tab**: One-click generation of an ideal thread structure based on the document type (Ordinance, Resolution, Report, Amendment). Users can toggle which suggested nodes to include.

4. **Thread Health Indicator**: Shows completeness percentage based on required node types for the thread type, with missing items and risk flags.

### Key Principles
- No auto-execution: All AI actions require explicit user approval
- Fully reversible: All created artifacts can be edited or deleted
- Citations: Research responses include sources and references
- Research persistence: Conversations are saved and restored automatically

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state and caching
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **UI Components**: shadcn/ui component library (New York style) with Radix UI primitives
- **Animations**: Framer Motion for fluid UI transitions
- **Interactive Canvas**: @xyflow/react (React Flow) for the node-based thread canvas
- **Build Tool**: Vite with custom plugins for Replit integration

### AI Integration
- **Model**: OpenAI `gpt-4o` for most AI features (research, writing assist, suggestions, summaries)
- **Thread Synthesis Model**: Anthropic `claude-sonnet-4-6` via Replit AI Integrations (no separate API key needed)
- **Whisper**: OpenAI `whisper-1` for audio/video transcription
- **RAG Pipeline**: Source-First RAG with citations — documents and knowledge links are chunked with source metadata (sourceId, sourceType, sourceTitle, sourcePage, sourceUrl), formatted as `[SOURCE: title, p.N] [ID: DOC-X]` blocks for the AI, and parsed via `parseClaudeCitations()` to produce `<cite />` tags and a `citations[]` array
- **Knowledge Base Pipeline**: Documents → extracted content stored in DB → injected into AI system prompts as context
- **Streaming**: SSE (Server-Sent Events) for real-time AI responses in research and writing assistants

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ES modules
- **API Pattern**: RESTful JSON API with `/api` prefix
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Validation**: Zod with drizzle-zod integration for type-safe schemas
- **Auth**: Email/password with bcrypt hashing, express-session with PostgreSQL session store
- **RBAC**: Simplified two-tier role model
  - Profile-level roles: ADMIN (system settings, user management) and PM (default for all users)
  - Admin-only routes: `/api/users`, `/api/linear`, `/api/admin/settings`
  - All authenticated users: full CRUD on threads, nodes, edges, documents, knowledge links, research, steward, agenda submissions, knowledge config
  - No more COLLABORATOR profile role — all content creation is open to any authenticated user
  - Thread-level access control: thread creator is owner; close/delete restricted to owner (enforced server-side)
  - Roles stored in `users.role` column, new signups default to PM

### Data Storage
- **Database**: PostgreSQL (connection via DATABASE_URL environment variable)
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit for database schema management (`db:push` command)

### Project Structure
```
├── client/src/          # React frontend application
│   ├── components/
│   │   ├── ui/          # shadcn/ui component library
│   │   └── steward/     # AI Thread Steward components
│   ├── pages/           # Route page components
│   ├── hooks/           # Custom React hooks
│   └── lib/             # Utilities and query client
├── server/              # Express backend
│   ├── routes.ts        # API route definitions
│   ├── storage.ts       # Database access layer
│   ├── db.ts            # Database connection
│   ├── linear-client.ts # Linear API client (Replit connector auth)
│   ├── rag/             # Source-First RAG pipeline
│   │   ├── retrieval.ts # Chunk retrieval with source metadata
│   │   └── citations.ts # parseClaudeCitations + citation system prompt
│   └── steward/         # AI Steward service
│       └── brain.ts     # AI logic for research, suggestions, ideal threads
├── shared/              # Shared code between client/server
│   └── schema.ts        # Drizzle schema definitions
└── migrations/          # Database migration files
```

### Key Design Patterns
- **Shared Schema**: Database schemas defined in `shared/schema.ts` are used by both frontend (for type inference) and backend (for database operations)
- **Storage Interface**: `IStorage` interface abstracts database operations, implemented by `DatabaseStorage` class
- **API Request Wrapper**: Centralized `apiRequest` function handles fetch calls with error handling
- **Mobile-First Layout**: Shell component provides responsive navigation with bottom bar (mobile) and sidebar (desktop)

### Theming
- Denver Broncos vintage color palette with CSS custom properties
- **Primary**: Broncos Orange `#FB4F14` - Buttons, highlights, primary actions
- **Secondary**: Broncos Navy `#002244` - Sidebar, headers, text
- **Accents**: Vintage tan/brown tones for warm, retro feel
- Design tokens defined in `client/src/index.css`
- Node type accents: Navy (Research), Bronze (Draft), Orange (Decision/Meeting)

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection configured via `DATABASE_URL` environment variable
- **Drizzle ORM**: Database toolkit for type-safe queries and schema management

### UI Libraries
- **Radix UI**: Headless UI primitives (dialogs, dropdowns, tooltips, etc.)
- **Lucide React**: Icon library
- **Embla Carousel**: Carousel component
- **Vaul**: Drawer component
- **cmdk**: Command palette component

### Development Tools
- **Vite**: Build tool and dev server
- **esbuild**: Production bundling for server code
- **PostCSS/Autoprefixer**: CSS processing

### Replit-Specific
- **@replit/vite-plugin-runtime-error-modal**: Error overlay in development
- **@replit/vite-plugin-cartographer**: Development tooling
- **@replit/vite-plugin-dev-banner**: Development environment indicator
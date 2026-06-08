# GuGuDu 英语学习平台 (GEMINI.md)

## Project Overview
GuGuDu is a comprehensive English learning platform that enables users to improve their English skills through curated articles. The system features a Go-based backend and a Next.js-based frontend, offering a rich reading experience with integrated tools for translation, vocabulary management, and AI-powered sentence analysis.

### Main Technologies
- **Backend:** Go (Golang) 1.22+, Gin Web Framework, GORM (PostgreSQL), Redis (Caching), JWT (Authentication).
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Zustand (State Management), Axios (API client).
- **External APIs:** Baidu Translation/Dictionary, Youdao Translation/Dictionary, OpenAI-compatible AI analysis.

### Architecture
- **Backend:** Modular design with separation of concerns:
  - `handlers/`: API endpoint logic.
  - `services/`: Core business logic (RSS import, translation, AI analysis).
  - `models/`: GORM data models.
  - `middleware/`: Auth and premium feature gating.
  - `database/`: DB initialization and seeding.
- **Frontend:** Modern Next.js App Router structure:
  - `src/app/`: Pages and routing.
  - `src/components/`: Reusable React components.
  - `src/lib/`: API clients and utilities.
  - `src/store/`: Zustand stores for auth and global state.
  - `src/types/`: TypeScript definitions.

---

## Building and Running

### Prerequisites
- Go 1.22+
- Node.js 18+
- PostgreSQL 15+
- Redis 7+

### Backend Setup
1. Navigate to the `backend` directory: `cd backend`
2. Install dependencies: `go mod download`
3. Configure environment: 
   - Copy `.env.example` to `.env`.
   - Copy `config.toml.example` to `config.toml` and fill in database/API credentials.
4. Run the server: `go run main.go`
   - The server defaults to `http://localhost:8080`.
5. Health Check: `curl http://localhost:8080/health`

### Frontend Setup
1. Navigate to the `frontend` directory: `cd frontend`
2. Install dependencies: `npm install`
3. Configure environment:
   - Create a `.env.local` if needed (defaults to `http://localhost:8080/api` via `src/lib/api.ts`).
4. Run development server: `npm run dev`
   - The app defaults to `http://localhost:3000`.

---

## Development Conventions

### Backend (Go)
- **Routing:** Use Gin for all API endpoints. Group related routes in `main.go`.
- **Database:** Use GORM for all DB interactions. Define models in `models/models.go`.
- **Error Handling:** Return consistent JSON error responses using `gin.Context.JSON`.
- **Config:** Store all configuration in `config.toml`. Use `config/config.go` for loading.
- **Services:** Decouple external API calls into `services/`.

### Frontend (Next.js)
- **Typing:** Use TypeScript strictly. Define shared types in `src/types/index.ts`.
- **Styling:** Use Tailwind CSS for all styling. Follow the existing mobile-first design pattern.
- **API Interaction:** Always use the `api` client from `src/lib/api.ts` to ensure JWT tokens are automatically handled via interceptors.
- **Components:** Prefer functional components and hooks. Use `@radix-ui` primitives for complex UI elements (dialogs, dropdowns, etc.).

### Features Workflow
- **RSS Import:** New articles are ingested via `handlers/admin/rss/import`. This can be triggered via a POST request with a valid `X-Import-Token`.
- **Translation:** The system caches translation results in both Redis and PostgreSQL to minimize API costs.
- **Vocabulary:** Uses a simplified Spaced Repetition (SRS) logic (`ReviewEase`, `ReviewInterval`) found in `handlers/translation.go`.

---

## Key Files
- `backend/main.go`: Entry point and route definitions.
- `backend/models/models.go`: Core data structures.
- `backend/services/rss_importer.go`: Article ingestion logic.
- `frontend/src/lib/api.ts`: Centralized API client.
- `frontend/src/app/articles/[slug]/page.tsx`: Core reading experience page.
- `README.md`: High-level project documentation.

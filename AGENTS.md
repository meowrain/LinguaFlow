# Repository Guidelines

## Project Structure & Module Organization

This repository contains a two-part English learning platform. The backend lives in `backend/` and is a Go 1.22 Gin service. Key folders are `handlers/` for HTTP endpoints, `middleware/` for request middleware, `models/` for GORM models, `database/` for database setup, `config/` for environment loading, and `services/` for shared business logic. The frontend lives in `frontend/` and is a Next.js 14 App Router application. Use `frontend/src/app/` for routes, `frontend/src/components/` for reusable UI, `frontend/src/lib/` for API helpers, `frontend/src/store/` for Zustand state, and `frontend/src/types/` for shared TypeScript types.

## Build, Test, and Development Commands

Backend:

```bash
cd backend
go mod download        # install Go dependencies
go run main.go         # run API on localhost:8080
go build ./...         # compile all backend packages
go test ./...          # run Go tests when present
```

Frontend:

```bash
cd frontend
npm install            # install Node dependencies
npm run dev            # run Next.js on localhost:3000
npm run build          # create production build
npm run lint           # run Next.js ESLint checks
```

Local development expects PostgreSQL and Redis; see `README.md` and `backend/README.md` for Docker examples and environment variables.

## Coding Style & Naming Conventions

Format Go code with `gofmt`; keep package names short and lowercase. Put route handlers in `backend/handlers` and name exported request/response types with clear domain prefixes. For frontend code, use TypeScript, React function components, Tailwind CSS utilities, and PascalCase component filenames such as `ArticleCard.tsx`. Keep hooks and stores camelCase, for example `authStore.ts`. Prefer typed API helpers in `frontend/src/lib/api.ts` over inline Axios calls.

## Testing Guidelines

There are currently no committed test files. Add Go tests beside implementation files using the `_test.go` suffix and run `go test ./...`. For frontend changes, add tests only after introducing a test runner, and document the command in `frontend/package.json`. Until then, validate UI changes with `npm run lint` and `npm run build`.

## Commit & Pull Request Guidelines

Git history is not available in this checkout, so use concise imperative commits such as `Add vocabulary progress endpoint` or `Fix article card metadata`. Pull requests should include a short summary, affected frontend/backend areas, linked issues when applicable, screenshots for UI changes, and the commands run for validation.

## Security & Configuration Tips

Do not commit `.env` files, JWT secrets, database credentials, or third-party translation API keys. Keep allowed CORS origins narrow in production, and update `backend/config` defaults carefully because they affect local startup and deployment.

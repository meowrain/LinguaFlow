# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GuGuDu is an English learning platform that combines curated article reading with vocabulary management, translation services, and AI-powered analysis. The system is built as a full-stack application with a Go backend and Next.js frontend.

**Key Architecture Pattern**: The backend uses a service-oriented design where external API calls (translation, dictionary, RSS import, AI analysis) are decoupled into `services/`, handlers manage HTTP logic, and all data persistence happens through GORM models with Redis caching for translations.

## Development Commands

### Backend (Go)

```bash
cd backend

# Install dependencies
go mod download

# Run development server (default: http://localhost:8080)
go run main.go

# Build binary
go build -o gugudu-backend

# Build for production (Linux)
CGO_ENABLED=0 GOOS=linux go build -o gugudu-backend

# Health check
curl http://localhost:8080/health
```

### Frontend (Next.js)

```bash
cd frontend

# Install dependencies
npm install

# Run development server (default: http://localhost:3000)
npm run dev

# Build for production
npm run build

# Run production server
npm run start

# Lint code
npm run lint
```

### Database (Docker)

```bash
# PostgreSQL
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=gugudu \
  -p 5432:5432 \
  postgres:15

# Redis
docker run -d --name redis \
  -p 6379:6379 \
  redis:7
```

## Configuration

### Backend Configuration

The backend uses **TOML configuration**, not `.env`. Configuration is loaded from `backend/config.toml`:

1. Copy `config.toml.example` to `config.toml`
2. Fill in the required credentials:
   - Database: PostgreSQL connection details
   - Redis: Cache connection
   - JWT: Secret key for authentication
   - Translation: Baidu/Youdao API credentials (optional for development)
   - AI: OpenAI-compatible API settings (optional, gated feature)
   - RSS: Import token and feed configuration

**Important**: The translation and dictionary services will use mock data if API credentials are not provided. Real API integration requires:
- Baidu Translation API: `baidu_appid`, `baidu_secret`
- Baidu Dictionary API: `baidu_dict_api_key`, `baidu_dict_secret_key`
- Youdao Translation API: `youdao_appkey`, `youdao_appsecret`

### Frontend Configuration

The frontend defaults to `http://localhost:8080/api` for the backend URL. To override, create `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8080/api
```

## Architecture Patterns

### Backend Service Layer

External API integrations are isolated in `backend/services/`:

- `translation.go`: Baidu Translation API client
- `baidu_dictionary.go`: Baidu Dictionary API client
- `dictionary.go`: Youdao Dictionary API client
- `ai_analysis.go`: OpenAI-compatible chat completions for sentence analysis
- `rss_importer.go`: RSS feed parsing and article ingestion

These services are initialized in `main.go` with credentials from `config.toml` and injected into handlers.

### Translation Caching Strategy

Translations are cached at two levels to minimize API costs:

1. **Redis cache**: Fast in-memory lookup (TTL managed by Redis)
2. **PostgreSQL cache**: Persistent storage via `TranslationCache` and `DictionaryCache` models

When translating, the system checks Redis → PostgreSQL → External API in that order.

### Authentication Flow

- JWT tokens are issued on login (`/api/auth/login`)
- Frontend stores tokens and uses Axios interceptors (`frontend/src/lib/api.ts`) to automatically attach `Authorization: Bearer <token>` headers
- Backend middleware (`middleware/auth.go`) validates JWT for protected routes
- Premium features use additional `PremiumRequired()` middleware that checks `user.IsPremium` or validates active membership

### Vocabulary Spaced Repetition

The vocabulary system implements simplified spaced repetition (SRS):

- `ReviewEase`: Difficulty factor (default 2.5)
- `ReviewInterval`: Days until next review
- `NextReviewAt`: Scheduled review timestamp
- `ForgottenCount`: Tracks how many times a user marked a word as "forgotten"

Review logic is in `handlers/translation.go:ReviewVocabulary()`. The algorithm adjusts intervals based on user performance.

### RSS Import Workflow

Article ingestion happens via `POST /api/admin/rss/import` (protected by `X-Import-Token` header):

1. Reads RSS feeds configured in `config.toml` under `[[rss.feeds]]`
2. Parses XML using `rss_importer.go`
3. Creates or updates articles in PostgreSQL
4. Automatically creates categories if they don't exist
5. Calculates word count and estimated reading time

This endpoint is designed for scheduled tasks or local scripts, not end-user access.

### Membership System

The membership system supports multiple tiers (`free`, `monthly`, `yearly`, `lifetime`):

- Orders are created via `/api/membership/orders` with status `pending`
- Payment happens externally (not implemented in codebase)
- After payment, call `/api/membership/orders/:order_no/activate` to upgrade the user
- Premium status gates features like AI sentence analysis

Check `handlers/membership.go` for the full order lifecycle.

## Data Models

Key relationships:

- `User` has many `Vocabulary`, `ReadHistory`, `Subscriptions`, `Orders`
- `Article` belongs to `Category`, has many `ReadHistory`
- `Vocabulary` tracks spaced repetition state and belongs to `User`
- `TranslationCache` and `DictionaryCache` deduplicate API calls

All models use GORM with soft deletes (`DeletedAt` field).

## Frontend API Client

**Always use `src/lib/api.ts`** for API calls. This client:

- Automatically attaches JWT tokens from Zustand auth store
- Handles token refresh (if implemented)
- Uses consistent error handling
- Configures base URL from environment

Example:
```typescript
import api from '@/lib/api';
const response = await api.get('/articles');
```

## Frontend Component Patterns

- Use Radix UI primitives for complex interactions (dialogs, dropdowns, tooltips)
- Tailwind CSS for all styling (mobile-first responsive design)
- Zustand stores in `src/store/` for global state (auth, etc.)
- TypeScript types in `src/types/index.ts` should mirror backend models

## Known Limitations

- Translation services use mock data if API credentials are not configured
- No automated tests currently exist
- Payment integration is stubbed (orders must be manually activated)
- AI sentence analysis requires external OpenAI-compatible API

## Import and Seeding

Database tables are auto-migrated on startup via `database.InitDB()`. To populate articles:

1. Configure RSS feeds in `config.toml`
2. POST to `/api/admin/rss/import` with `X-Import-Token` header
3. Or manually insert articles via PostgreSQL

## Key Files Reference

- `backend/main.go`: Route definitions and service initialization
- `backend/models/models.go`: All GORM models and relationships
- `backend/handlers/translation.go`: Translation, dictionary, vocabulary, and SRS logic
- `backend/services/rss_importer.go`: Article ingestion from RSS feeds
- `frontend/src/lib/api.ts`: API client with JWT interceptors
- `frontend/src/app/articles/[slug]/page.tsx`: Main article reading experience
- `backend/config.toml.example`: Configuration template with all required keys

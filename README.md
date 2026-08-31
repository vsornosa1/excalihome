# Excalihome

A self-hosted, single-user clone of Excalidraw+ that replicates the core drawing UX, file management, and version history.

## Features

- Full Excalidraw drawing canvas (shapes, arrows, text, sticky notes, freehand, styles, colors, fonts).
- Light mode only.
- Layers panel with ordering, locking, and z-index helpers.
- Built-in shape library.
- Save/load diagrams to PostgreSQL.
- Version history with restore points.
- Export diagrams as PNG, SVG, JSON, or PDF.
- Import `.excalidraw.json` files.
- Slug-based URLs (`/diagram/<slug>`) with browser back/forward navigation.
- Excalidraw+-style library page with canvas thumbnails, inline rename, and search.
- Docker Compose deployment (frontend + backend + PostgreSQL).
- No sign-in required (local/single-user).

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TypeScript, `@excalidraw/excalidraw` |
| Backend | Node.js, Express, TypeScript, `pg` |
| Database | PostgreSQL 15 (JSONB for diagram storage) |
| Export | Excalidraw export APIs + `jspdf` |

## Quick start with Docker

1. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

2. Start the stack:

   ```bash
   docker compose up --build -d
   ```

3. Open http://localhost.

To stop:

```bash
docker compose down
```

To view logs:

```bash
docker compose logs -f
```

If port `5432` is already in use, change `DB_PORT` in `.env` (for example to `5433`) before starting.

## Enabling HTTPS (optional)

For local HTTPS access:

1. Generate a self-signed certificate:

   ```powershell
   .\scripts\init-certs.ps1
   ```

   Or with OpenSSL:

   ```bash
   openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
     -keyout certs/excalihome.key -out certs/excalihome.crt \
     -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
   ```

2. In `docker-compose.yml`, expose port `443` for the `frontend` service and mount the `certs/` directory to `/etc/nginx/certs`.
3. Replace `packages/frontend/nginx.conf` with `nginx.https.conf`.
4. Restart the stack and open `https://localhost` (accept the browser warning for the self-signed certificate).

## Local development (without Docker)

1. Start PostgreSQL locally and create a database named `excalihome`.
2. Run the schema scripts in `postgres/init/`.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Create a `.env` file in the project root:

   ```env
   DATABASE_URL=postgres://excalihome:excalihome@localhost:5432/excalihome
   VITE_API_BASE_URL=http://localhost:3001/api
   ```

5. Start the backend:

   ```bash
   npm run dev -w packages/backend
   ```

6. Start the frontend:

   ```bash
   npm run dev -w packages/frontend
   ```

7. Open http://localhost:5173.

## Running tests

```bash
npm test -w packages/backend
```

Tests exercise diagram create/save/load and version create/restore.

## Database schema

```sql
users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
)

diagrams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  slug text unique,
  thumbnail text,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)

versions (
  id uuid primary key default gen_random_uuid(),
  diagram_id uuid references diagrams(id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz default now()
)
```

Migrations are in `postgres/init/`. On first container start, PostgreSQL executes them automatically.

## Architecture overview

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Browser   │──────▶  Nginx/Frontend │──────▶ Node/Express  │
│  (React)    │◀─────│   (port 80)   │◀─────│  (port 3001) │
└─────────────┘      └──────────────┘      └──────┬──────┘
                                                   │
                                                   ▼
                                            ┌─────────────┐
                                            │  PostgreSQL  │
                                            │  (port 5432) │
                                            └─────────────┘
```

- The frontend is a static React SPA served by Nginx.
- Nginx proxies `/api` requests to the backend.
- The backend persists diagrams and version snapshots in PostgreSQL JSONB columns.
- No authentication layer; intended for local single-user use.

## Project structure

```
excalihome/
├── docker-compose.yml
├── .env.example
├── README.md
├── package.json
├── postgres/
│   └── init/
│       ├── 001_schema.sql
│       ├── 002_seed.sql
│       └── 003_slug_thumbnail.sql
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── db.ts
│   │   │   └── routes/
│   │   │       ├── diagrams.ts
│   │   │       └── versions.ts
│   │   ├── tests/
│   │   │   └── diagrams.test.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   └── frontend/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   ├── lib/
│       │   │   ├── api.ts
│       │   │   ├── export.ts
│       │   │   └── library.json
│       │   ├── hooks/
│       │   │   └── useApi.ts
│       │   └── components/
│       │       ├── Dashboard.tsx
│       │       ├── Editor.tsx
│       │       ├── ExportMenu.tsx
│       │       ├── Header.tsx
│       │       ├── LibraryPanel.tsx
│       │       └── VersionHistory.tsx
│       ├── Dockerfile
│       ├── nginx.conf
│       └── package.json
└── scripts/
    └── (helper scripts)
```

## Customizing tools and styles

The drawing tools and styling options come directly from `@excalidraw/excalidraw`. To customize:

- **Default app state**: edit `appState` defaults in `Editor.tsx`.
- **Library shapes**: edit `packages/frontend/src/lib/library.json` (Excalidraw library format) or add new items through the UI.
- **Export formats**: modify `packages/frontend/src/lib/export.ts`.

## Connecting to a real Supabase project (optional)

This project uses plain PostgreSQL to keep the local stack lightweight. Because the schema is standard SQL, you can point the backend at any PostgreSQL-compatible database, including Supabase:

1. Create the tables from `postgres/init/001_schema.sql` in your Supabase project.
2. Set `DATABASE_URL` to your Supabase connection string (use the session or pooled connection string).
3. Update the frontend `VITE_API_BASE_URL` to your backend URL.

For full Supabase Storage/Realtime integration, replace the `pg` queries with `@supabase/supabase-js` service-role calls.

## Known limitations vs. hosted Excalidraw+

- **No real-time collaboration** — this is a single-user clone.
- **No account system** — all diagrams are shared anonymously (matches the requested no-auth setup).
- **No cloud sync** — data stays in the local PostgreSQL container.
- **No comments or threaded discussions**.
- **No AI/assist features** (wireframe-to-code, diagram-to-code, etc.).
- **No enterprise SSO or advanced sharing**.
- **PDF export** rasterizes the canvas to an image; text is not selectable.
- **Light mode only** — dark mode is disabled to match the requested scope.

## License

MIT

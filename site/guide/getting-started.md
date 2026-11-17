# Getting Started

## Prerequisites

- **Node.js** ≥ 22 (tested on Node 26)
- **pnpm** 9.x (`npm install -g pnpm@9`)

## Install & Run

```bash
git clone https://github.com/anusornc/ontology-studio.git
cd ontology-studio
pnpm install
pnpm dev
```

This starts both servers concurrently:

| Service | URL | Purpose |
|---------|-----|---------|
| Web studio | <http://localhost:5173> | React canvas UI |
| API server | <http://127.0.0.1:5174> | REST API + persistence |
| Health check | <http://127.0.0.1:5174/api/health> | `{"status":"ok"}` |

## Quick Tour

1. **Create your first ontology** — type a name in the empty-state card and click "Create ontology", or pick a ready-made template from the grid.
2. **Add classes** — click "New class" in the sidebar or double-click the canvas. Edit label, machine name, parent and colour in the inspector.
3. **Connect classes** — drag from a node's right handle to another node's left handle to create a relation.
4. **Validate** — click "Validate" in the top bar to see errors and warnings grouped in the sidebar.
5. **Export** — click "Export" → choose Turtle, JSON-LD or native JSON to download.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start web + API concurrently |
| `pnpm dev:api` | Start API only |
| `pnpm dev:web` | Start web only |
| `pnpm build` | Build all packages for production |
| `pnpm start` | Run production API server |
| `pnpm test` | Run all unit/integration tests |
| `pnpm e2e` | Run Playwright E2E suite |
| `pnpm check` | Typecheck + test across all packages |

## Production Deployment

Build the web app and serve it same-origin with the API:

```bash
pnpm build
ONTO_WEB_DIST=apps/web/dist ONTO_DATA_DIR=./data pnpm start
```

The API serves the built SPA at `/` with client-route fallback, so everything runs on one port.

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `5174` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address |
| `ONTO_DATA_DIR` | `./data` | Persistence directory |
| `ONTO_DB_TYPE` | `json` | Backend: `json` or `sqlite` |
| `ONTO_WEB_DIST` | unset | Serve built SPA from this directory |

See [Persistence](./persistence) for details on the dual storage backends.

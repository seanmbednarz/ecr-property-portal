# ECR Property Portal

Admin-enabled property dashboard. Live at **dashboard.ecrtx.io** (Cloudflare Worker `ecr-property-summary`).

## Stack
- Vite + React + TypeScript, Tailwind
- Supabase (auth, database, edge functions) — project `bzduqolubbtpavpvqzep`

## Deploys
Pushing to `main` auto-builds and deploys via **Cloudflare Workers Builds** (Git integration):
`npm run build` → `npx wrangler deploy`.

Manual deploy if ever needed:

```bash
npm run build && npx wrangler deploy
```

## Database migrations
Supabase is **not** CLI-linked — migration files in `supabase/migrations/` are for the record.
Apply schema changes by running their SQL in the Supabase SQL editor.

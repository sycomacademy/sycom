# sycom

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Router, Hono, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Hono** - Lightweight, performant server framework
- **tRPC** - End-to-end type-safe APIs
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Oxlint** - Oxlint + Oxfmt (linting & formatting)
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/server/.env` file with your PostgreSQL connection details.

3. Apply the schema to your database:

```bash
bun run db:push
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the dashboard.
The API is running at [http://localhost:3000](http://localhost:3000).

## UI Customization

The dashboard shares shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/dashboard/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@sycom/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/dashboard`.

## Git Hooks and Formatting

- Format and lint fix on demand: `bun run check`
- A [Lefthook](lefthook.yml) pre-commit hook also runs `oxlint --fix` and `oxfmt --write` automatically on staged files

## Project Structure

```
sycom/
├── apps/
│   ├── dashboard/     # Frontend SPA (React + TanStack Router + Vite)
│   └── server/        # Backend API (Hono, tRPC)
├── packages/
│   ├── ui/            # Shared shadcn/ui components and styles
│   ├── auth/          # Authentication configuration & logic (Better Auth)
│   ├── db/            # Database schema, queries & migrations (Drizzle)
│   ├── certificates/  # Certificate PDF rendering & templates
│   ├── emails/        # Transactional email templates (dev preview via `bun run dev:emails`)
│   ├── storage/       # Cloudinary uploads
│   ├── env/           # Shared, validated env schemas (server + client)
│   ├── logger/        # Shared logger
│   └── config/        # Shared tsconfig/tooling config
```

## Available Scripts

- `bun run dev`: Start dashboard + server in development mode
- `bun run dev:dashboard`: Start only the dashboard
- `bun run dev:server`: Start only the server
- `bun run build`: Build all apps and packages
- `bun run check-types`: Check TypeScript types across all apps
- `bun run test`: Run tests across all apps and packages
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate a migration from schema changes
- `bun run db:migrate`: Apply pending migrations
- `bun run db:ensure-app-role`: Provision/re-sync the least-privilege runtime DB role (prod migration step, not needed for local dev)
- `bun run db:studio`: Open database studio UI
- `bun run check`: Run Oxlint and Oxfmt
- `bun run update-deps`: Run the dependency-update script (bumps deps, audits with `bun audit`) then reinstalls
- `bun run dev:emails`: Start the email template dev preview server
- `bun run storybook:ui` / `build-storybook:ui`: Run or build Storybook for the shared UI package
- `bun run docker:build` / `docker:up` / `docker:down` / `docker:logs`: Build or run the whole stack (dashboard + server) in Docker via `docker-compose.yml`

## Deployment

Production runs dashboard and server as two separate, dockerized Azure
Container Apps sharing one Container Apps Environment, with Postgres on
Azure Database for PostgreSQL. See [DEPLOYMENT.md](DEPLOYMENT.md) for the
full architecture, the CI/CD pipeline, and required configuration.

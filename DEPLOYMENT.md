# Deployment

## Architecture

Two Container Apps in one Container Apps Environment, both dockerized:

| App         | Image                                           | Ingress                                     |
| ----------- | ----------------------------------------------- | ------------------------------------------- |
| `dashboard` | `apps/dashboard/Dockerfile` (Vite SPA on nginx) | Public, custom domain `learn.sycom.academy` |
| `server`    | `apps/server/Dockerfile` (Hono/tRPC API)        | Public, Azure-issued FQDN by default        |

The dashboard is a pure client-rendered SPA — the browser calls the server's
URL directly (cross-origin). Auth cookies are handled by
[`packages/auth/src/index.ts`](packages/auth/src/index.ts): if dashboard and
server ever share a parent domain it upgrades to `sameSite=lax` +
`crossSubDomainCookies`; otherwise it falls back to `sameSite=none`, which is
what's active today since the server has no custom domain yet.

Database: Azure Database for PostgreSQL Flexible Server (`sycomlearn-prod-postgres`).
A manually-triggered Container App Job (`sycomlearn-prod-migrate`) runs
`bun run db:migrate` (drizzle-kit) using the current server image, then `bun
run db:ensure-app-role` — it has network access to Postgres via the
`AllowAllAzureServices` firewall rule, so no temporary firewall rule or
public DB access is needed from CI.

Two separate Postgres roles, so the running server never holds admin
credentials:

- **admin** (`postgresAdminLogin`/`POSTGRES_ADMIN_PASSWORD`) — used only by
  the migrate job, to run schema migrations and to provision/re-sync the
  role below. Never reaches the server container.
- **`sycom_app`** (provisioned by
  [`packages/db/src/ensure-app-role.ts`](packages/db/src/ensure-app-role.ts),
  password from `POSTGRES_APP_PASSWORD`) — SELECT/INSERT/UPDATE/DELETE only,
  no DDL, no role management. This is what `DATABASE_URL` on the server
  Container App actually points at. `ALTER DEFAULT PRIVILEGES` means new
  tables from future migrations (run as admin) automatically grant this role
  access, so the script doesn't need to run again after every schema change
  — it's just idempotent housekeeping that happens to run on every deploy.

## Pipeline

- **[`.github/workflows/infra.yml`](.github/workflows/infra.yml)** — runs
  the full Bicep template ([`infra/main.bicep`](infra/main.bicep)) whenever
  `infra/**` changes. It looks up whatever image is currently running before
  deploying, so it never rolls an app back to the placeholder image. The
  dashboard's custom domain binding (`dashboardCustomDomainName` /
  `dashboardCertificateName` in
  [`infra/params/prod.bicepparam`](infra/params/prod.bicepparam)) is declared
  in the template and re-applied on every run — it previously lived only in
  out-of-band `az containerapp hostname bind` state, so a bicep-only redeploy
  would silently drop it (2026-08-27 outage). The certificate itself is
  pre-provisioned out-of-band and only referenced by name; the template
  doesn't create or rotate it.
- **[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)** — runs
  on every other push to `main`. It diffs against the previous commit to
  decide which app(s) changed (anything under `packages/**` or a root
  manifest counts as touching both, to stay on the safe side), then for each
  changed app: builds the image in ACR and swaps the running Container App to
  it with `az containerapp update` (no Bicep deployment — seconds, not
  minutes). If the server changed, it updates the migrate job to the new
  image, runs it, and waits for it to succeed _before_ updating the server
  app, so the server never starts against a schema it doesn't expect.
- **[`.github/workflows/ci.yml`](.github/workflows/ci.yml)** — runs on every
  pull request against `main`. Two jobs: `check` (lint, type-check, build,
  test — the required status check for branch protection) and `audit` (`bun
audit`, informational only, reports current vulnerability counts in the
  run summary; deliberately not required, since there's a pre-existing
  backlog of transitive-dependency advisories that hasn't been triaged and
  gating merges on debt a PR didn't introduce just trains people to route
  around the check).
- **[`.github/workflows/update-deps.yml`](.github/workflows/update-deps.yml)**
  — weekly (Mondays), opens a PR with semver-safe dependency bumps and a
  `bun audit` summary in both the PR body and the run summary.

## Required GitHub `production` environment configuration

### Variables (not secret)

| Variable                | Value                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| `AZURE_RESOURCE_GROUP`  | `sycomlearn-prod-rg`                                                  |
| `AZURE_LOCATION`        | `uksouth`                                                             |
| `DASHBOARD_URL`         | `https://learn.sycom.academy`                                         |
| `WEBSITE_URL`           | `https://sycomsolutions.com`                                          |
| `CLOUDINARY_CLOUD_NAME` | (existing value)                                                      |
| `DASHBOARD_APP_NAME`    | `sycomlearn-prod-dashboard`                                           |
| `SERVER_APP_NAME`       | `sycomlearn-prod-server`                                              |
| `MIGRATE_JOB_NAME`      | `sycomlearn-prod-migrate`                                             |
| `SERVER_URL`            | _(unset — server has no custom domain, falls back to its Azure FQDN)_ |

### Secrets

`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
`POSTGRES_ADMIN_PASSWORD`, `POSTGRES_APP_PASSWORD` (least-privilege
`sycom_app` role — see above), `BETTER_AUTH_SECRET`, `BETTER_AUTH_API_KEY`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`,
`LINKEDIN_CLIENT_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`, `RESEND_API_KEY`, `RESEND_EMAIL_FROM`,
`RESEND_EMAIL_REPLY_TO`, `AI_GATEWAY_API_KEY`.

## Branch protection

Enabled on `main`: no direct pushes, PRs required, the `check` CI job must
pass (strict — the PR branch must be up to date with `main`), force-pushes
and branch deletion blocked. No required approving-review count, so a
solo/admin merge is fine once CI is green.

```bash
gh api repos/sycomacademy/sycom/branches/main/protection -X PUT --input - <<'EOF'
{
  "required_status_checks": { "strict": true, "contexts": ["check"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

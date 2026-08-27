# Deployment

## Architecture

Two Container Apps in one Container Apps Environment, both dockerized:

| App         | Image                     | Ingress            |
| ----------- | ------------------------- | ------------------- |
| `dashboard` | `apps/dashboard/Dockerfile` (Vite SPA on nginx) | Public, custom domain `learn.sycom.academy` |
| `server`    | `apps/server/Dockerfile` (Hono/tRPC API)        | Public, Azure-issued FQDN by default |

The dashboard is a pure client-rendered SPA — the browser calls the server's
URL directly (cross-origin). Auth cookies are handled by
[`packages/auth/src/index.ts`](packages/auth/src/index.ts): if dashboard and
server ever share a parent domain it upgrades to `sameSite=lax` +
`crossSubDomainCookies`; otherwise it falls back to `sameSite=none`, which is
what's active today since the server has no custom domain yet.

Database: Azure Database for PostgreSQL Flexible Server (`sycomlearn-prod-postgres`).
A manually-triggered Container App Job (`sycomlearn-prod-migrate`) runs
`bun run db:migrate` (drizzle-kit) using the current server image — it has
network access to Postgres via the `AllowAllAzureServices` firewall rule, so
no temporary firewall rule or public DB access is needed from CI.

## Pipeline

Two workflows:

- **[`.github/workflows/infra.yml`](.github/workflows/infra.yml)** — runs
  the full Bicep template ([`infra/main.bicep`](infra/main.bicep)) whenever
  `infra/**` changes. It looks up whatever image is currently running before
  deploying, so it never rolls an app back to the placeholder image.
- **[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)** — runs
  on every other push to `main`. It diffs against the previous commit to
  decide which app(s) changed (anything under `packages/**` or a root
  manifest counts as touching both, to stay on the safe side), then for each
  changed app: builds the image in ACR and swaps the running Container App to
  it with `az containerapp update` (no Bicep deployment — seconds, not
  minutes). If the server changed, it updates the migrate job to the new
  image, runs it, and waits for it to succeed *before* updating the server
  app, so the server never starts against a schema it doesn't expect.
- **[`.github/workflows/ci.yml`](.github/workflows/ci.yml)** — runs on every
  pull request against `main`: lint, type-check, build, test. Intended as the
  required status check for branch protection.

## Required GitHub `production` environment configuration

### Variables (not secret)

| Variable               | Value                          | Notes |
| ----------------------- | ------------------------------ | ----- |
| `AZURE_RESOURCE_GROUP`  | `sycomlearn-prod-rg`           | unchanged |
| `AZURE_LOCATION`        | `uksouth`                      | unchanged |
| `DASHBOARD_URL`         | `https://learn.sycom.academy`  | unchanged |
| `WEBSITE_URL`           | `https://sycomsolutions.com`   | unchanged |
| `CLOUDINARY_CLOUD_NAME` | (existing value)               | unchanged |
| `DASHBOARD_APP_NAME`    | `sycomlearn-prod-dashboard`    | **new** — required by deploy.yml/infra.yml |
| `SERVER_APP_NAME`       | `sycomlearn-prod-server`       | **new** — required |
| `MIGRATE_JOB_NAME`      | `sycomlearn-prod-migrate`      | **new** — required |
| `SERVER_URL`            | *(leave unset)*                | **new** — set only once a custom domain is bound to the server app |

No longer used, safe to delete after cutover: `CONTAINER_APP_NAME`,
`KEY_VAULT_ADMIN_OBJECT_ID`.

### Secrets

Unchanged — same set as before (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
`AZURE_SUBSCRIPTION_ID`, `POSTGRES_ADMIN_PASSWORD`, `DATABASE_URL` *(now
unused — Bicep builds the connection string; safe to delete)*,
`BETTER_AUTH_SECRET`, `BETTER_AUTH_API_KEY`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`,
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
`RESEND_API_KEY`, `RESEND_EMAIL_FROM`, `RESEND_EMAIL_REPLY_TO`,
`AI_GATEWAY_API_KEY`).

## Cutover from the combined `sycomlearn-prod-app`

Today's live app runs dashboard+server as two containers in one Container
App. This PR introduces two separate apps but does **not** delete the old
one or move DNS — that's a manual, one-time cutover so it can be verified
before the old app is removed:

1. Add the four new GitHub variables above.
2. Merge this PR. `infra.yml` runs and provisions `sycomlearn-prod-dashboard`
   and `sycomlearn-prod-server` (starting on the placeholder image) alongside
   the existing `sycomlearn-prod-app`. `deploy.yml` then builds and deploys
   real images to both on the same push.
3. Verify both new apps work against their Azure-issued FQDNs (`az
   containerapp show -g sycomlearn-prod-rg -n sycomlearn-prod-dashboard
   --query properties.configuration.ingress.fqdn`, likewise for `-server`).
4. Run the migrate job once by hand to confirm it applies cleanly:
   `az containerapp job start -g sycomlearn-prod-rg -n sycomlearn-prod-migrate`.
5. Move the `learn.sycom.academy` custom domain + managed certificate from
   `sycomlearn-prod-app` to `sycomlearn-prod-dashboard` (Portal → Container
   Apps → `sycomlearn-prod-dashboard` → Custom domains → Add, reusing the
   existing DNS records).
6. Once traffic on the new domain binding looks healthy, delete the old
   combined app: `az containerapp delete -g sycomlearn-prod-rg -n
   sycomlearn-prod-app --yes`.

## Branch protection

Not enabled yet. To require this CI workflow and block direct pushes to
`main`:

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

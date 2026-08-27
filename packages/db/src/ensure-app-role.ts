import { Pool } from "pg";
import { poolOptions } from "./pool-config";

// Provisions (or re-syncs the password of) a least-privilege Postgres role
// for the server's own runtime connection, separate from the admin login
// used for migrations. Run after `drizzle-kit migrate` — as the same admin
// user that just ran the migrations — so `ALTER DEFAULT PRIVILEGES` covers
// tables created by future migrations too, without needing to re-grant
// after every schema change.
const APP_ROLE = "sycom_app";

// Standard SQL identifier quoting: wrap in double quotes, double any
// embedded double-quote. Needed because dbName can contain characters
// (e.g. a hyphen in a dev database name) that aren't valid unquoted.
function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function main() {
  const adminUrl = process.env.DATABASE_URL;
  const appPassword = process.env.APP_DB_PASSWORD;
  const dbName = quoteIdent(process.env.APP_DB_NAME ?? "sycom");
  const role = quoteIdent(APP_ROLE);

  if (!adminUrl) throw new Error("DATABASE_URL is required (admin connection)");
  if (!appPassword) throw new Error("APP_DB_PASSWORD is required");

  const pool = new Pool(poolOptions(adminUrl));

  try {
    // CREATE/ALTER ROLE's PASSWORD clause doesn't support query-parameter
    // placeholders (it's parsed as a utility statement, not a plan with
    // bindable expressions) — ask Postgres to produce a safely-escaped
    // literal instead of interpolating the raw password ourselves.
    const {
      rows: [quoted],
    } = await pool.query<{ literal: string }>("SELECT quote_literal($1) AS literal", [appPassword]);
    if (!quoted) throw new Error("Failed to escape password");
    const passwordLiteral = quoted.literal;

    const { rows } = await pool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE]);
    if (rows.length === 0) {
      console.log(`Creating role "${APP_ROLE}"...`);
      await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD ${passwordLiteral}`);
    } else {
      console.log(`Role "${APP_ROLE}" already exists — syncing password...`);
      await pool.query(`ALTER ROLE ${role} WITH PASSWORD ${passwordLiteral}`);
    }

    console.log(`Granting least-privilege access on ${dbName} to "${APP_ROLE}"...`);
    await pool.query(`GRANT CONNECT ON DATABASE ${dbName} TO ${role}`);
    await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await pool.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
    );
    await pool.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    );
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
    );

    console.log("Done.");
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

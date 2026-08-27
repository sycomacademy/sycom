import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PKG_PATH = join(ROOT, "package.json");

// --- Semver ---

interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: boolean;
  raw: string;
}

function parseSemVer(version: string): SemVer | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(.+)?$/);
  if (!match) return null;
  const majorStr = match[1];
  const minorStr = match[2];
  const patchStr = match[3];
  if (majorStr === undefined || minorStr === undefined || patchStr === undefined) return null;
  return {
    major: Number.parseInt(majorStr, 10),
    minor: Number.parseInt(minorStr, 10),
    patch: Number.parseInt(patchStr, 10),
    prerelease: !!match[4],
    raw: `${majorStr}.${minorStr}.${patchStr}`,
  };
}

function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function parseRange(range: string): { prefix: string; version: string } {
  const match = range.match(/^([~^]?)(.*)/);
  return { prefix: match?.[1] ?? "", version: match?.[2] ?? range };
}

function isUpdatable(version: string): boolean {
  return (
    !version.startsWith("catalog:") && !version.startsWith("workspace:") && /^[~^]?\d/.test(version)
  );
}

function isWithinRange(v: SemVer, current: SemVer, prefix: string): boolean {
  if (prefix === "~") {
    return v.major === current.major && v.minor === current.minor;
  }
  if (prefix === "^") {
    if (current.major !== 0) return v.major === current.major;
    if (current.minor !== 0) return v.major === 0 && v.minor === current.minor;
    return v.major === 0 && v.minor === 0 && v.patch === current.patch;
  }
  // Pinned: treat like ^ (same major, or same minor if 0.x)
  if (current.major !== 0) return v.major === current.major;
  return v.major === 0 && v.minor === current.minor;
}

// --- Registry ---

interface PkgInfo {
  latest: string;
  versions: string[];
}

const pkgInfoCache = new Map<string, PkgInfo | null>();

async function getPkgInfo(name: string): Promise<PkgInfo | null> {
  const cached = pkgInfoCache.get(name);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(`https://registry.npmjs.org/${name}`, {
      headers: { Accept: "application/vnd.npm.install-v1+json" },
    });
    if (!res.ok) {
      pkgInfoCache.set(name, null);
      return null;
    }
    const data = (await res.json()) as {
      "dist-tags"?: { latest?: string };
      versions?: Record<string, unknown>;
    };
    const info: PkgInfo = {
      latest: data["dist-tags"]?.latest ?? "",
      versions: Object.keys(data.versions ?? {}),
    };
    pkgInfoCache.set(name, info);
    return info;
  } catch {
    pkgInfoCache.set(name, null);
    return null;
  }
}

function getBestVersion(info: PkgInfo, currentRange: string, allowMajor: boolean): string | null {
  const { prefix, version: current } = parseRange(currentRange);
  const currentSV = parseSemVer(current);
  if (!currentSV) return info.latest;
  if (allowMajor) return info.latest;

  // Fast path: latest is within range
  const latestSV = parseSemVer(info.latest);
  if (latestSV && !latestSV.prerelease && isWithinRange(latestSV, currentSV, prefix)) {
    return info.latest;
  }

  // Find best version within range
  const best = info.versions
    .map((v) => parseSemVer(v))
    .filter((v): v is SemVer => v !== null && !v.prerelease && isWithinRange(v, currentSV, prefix))
    .sort((a, b) => compareSemVer(b, a))[0];

  return best?.raw ?? null;
}

// --- Update logic ---

async function resolveDep(
  name: string,
  currentRange: string,
  allowMajor: boolean,
): Promise<{ updated: boolean; newRange?: string; skippedMajor?: string }> {
  const { prefix, version: current } = parseRange(currentRange);
  const info = await getPkgInfo(name);
  if (!info) return { updated: false };

  const best = getBestVersion(info, currentRange, allowMajor);
  if (!best || best === current) return { updated: false };

  const newRange = `${prefix}${best}`;
  const skippedMajor = !allowMajor && info.latest !== best ? info.latest : undefined;

  return { updated: true, newRange, skippedMajor };
}

function formatResult(
  name: string,
  currentRange: string,
  newRange?: string,
  skippedMajor?: string,
): string {
  if (!newRange) return `  = ${name} ${currentRange}`;
  let msg = `  ^ ${name} ${currentRange} -> ${newRange}`;
  if (skippedMajor) msg += ` (latest: ${skippedMajor}, use --major)`;
  return msg;
}

async function updateSingleDep(
  deps: Record<string, string>,
  name: string,
  allowMajor: boolean,
): Promise<boolean> {
  const currentRange = deps[name];
  if (!currentRange || currentRange.startsWith("workspace:") || currentRange.startsWith("catalog:"))
    return false;

  const { updated, newRange, skippedMajor } = await resolveDep(name, currentRange, allowMajor);
  console.log(formatResult(name, currentRange, updated ? newRange : undefined, skippedMajor));
  if (updated && newRange) deps[name] = newRange;
  return updated;
}

async function updateAllDeps(deps: Record<string, string>, allowMajor: boolean): Promise<number> {
  const entries = Object.entries(deps).filter(([, v]) => isUpdatable(v));

  const results = await Promise.all(
    entries.map(async ([name, currentRange]) => ({
      name,
      currentRange,
      ...(await resolveDep(name, currentRange, allowMajor)),
    })),
  );

  let updated = 0;
  for (const r of results) {
    console.log(
      formatResult(r.name, r.currentRange, r.updated ? r.newRange : undefined, r.skippedMajor),
    );
    if (r.updated && r.newRange) {
      deps[r.name] = r.newRange;
      updated++;
    }
  }
  return updated;
}

// --- Audit ---

interface RootPackageJson {
  workspaces?: { catalog?: Record<string, string> };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface BunAuditAdvisory {
  id: number;
  url: string;
  title: string;
  severity: "low" | "moderate" | "high" | "critical";
  vulnerable_versions: string;
}

const SEVERITY_ORDER = ["critical", "high", "moderate", "low"] as const;

// Shells out to `bun audit` instead of querying OSV directly with just the
// declared (package.json) versions: that missed almost everything, since
// most real advisories land on transitive deps that only exist in the
// resolved lockfile, not any dependencies/devDependencies field.
async function runAudit(): Promise<void> {
  console.log("\nSecurity audit (bun audit)...");

  const proc = Bun.spawn(["bun", "audit", "--json"], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

  let byPackage: Record<string, BunAuditAdvisory[]>;
  try {
    byPackage = JSON.parse(stdout);
  } catch {
    console.log("  Failed to parse `bun audit` output.");
    return;
  }

  const counts: Record<(typeof SEVERITY_ORDER)[number], number> = {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
  };
  const rows: Array<{ pkg: string } & BunAuditAdvisory> = [];
  for (const [pkg, advisories] of Object.entries(byPackage)) {
    for (const advisory of advisories) {
      counts[advisory.severity]++;
      rows.push({ pkg, ...advisory });
    }
  }

  if (rows.length === 0) {
    console.log("  No known vulnerabilities found.");
    return;
  }

  rows.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  const summary = SEVERITY_ORDER.filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s}`)
    .join(", ");
  console.log(`\n  ${rows.length} advisories (${summary}):\n`);
  for (const r of rows) {
    console.log(`  ! [${r.severity}] ${r.pkg} ${r.vulnerable_versions} — ${r.title}`);
    console.log(`    ${r.url}`);
  }
}

// --- Filesystem ---

function findWorkspacePackages(): string[] {
  const paths: string[] = [];
  for (const dir of ["apps", "packages"]) {
    const base = join(ROOT, dir);
    try {
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const pkgPath = join(base, entry.name, "package.json");
          try {
            readFileSync(pkgPath);
            paths.push(pkgPath);
          } catch {}
        }
      }
    } catch {}
  }
  return paths;
}

interface WorkspacePackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface PkgFile {
  path: string;
  data: WorkspacePackageJson;
  dirty: boolean;
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const allowMajor = args.includes("--major");
  const audit = args.includes("--audit");
  const filterPkg = args.find((a) => !a.startsWith("-"));

  const rootPkg = JSON.parse(readFileSync(PKG_PATH, "utf-8")) as RootPackageJson;
  const catalog: Record<string, string> | undefined = rootPkg.workspaces?.catalog;

  const workspaceFiles: PkgFile[] = findWorkspacePackages().map((p) => ({
    path: p,
    data: JSON.parse(readFileSync(p, "utf-8")),
    dirty: false,
  }));

  if (dryRun) console.log("Dry run — no changes will be written\n");
  if (!allowMajor) console.log("Respecting semver ranges (use --major for breaking changes)\n");

  // --- Single package mode ---
  if (filterPkg) {
    console.log(`Updating: ${filterPkg}\n`);

    let found = false;
    let totalUpdated = 0;

    if (catalog && filterPkg in catalog) {
      found = true;
      console.log("Catalog:");
      const catalogRange = catalog[filterPkg];
      if (catalogRange !== undefined) {
        const { updated, newRange, skippedMajor } = await resolveDep(
          filterPkg,
          catalogRange,
          allowMajor,
        );
        console.log(
          formatResult(filterPkg, catalogRange, updated ? newRange : undefined, skippedMajor),
        );
        if (updated && newRange) {
          catalog[filterPkg] = newRange;
          totalUpdated++;
        }
      }
    }

    for (const field of ["dependencies", "devDependencies"] as const) {
      if (rootPkg[field]?.[filterPkg] && isUpdatable(rootPkg[field][filterPkg])) {
        found = true;
        console.log(`\nRoot ${field}:`);
        if (await updateSingleDep(rootPkg[field], filterPkg, allowMajor)) totalUpdated++;
      }
    }

    for (const pkgFile of workspaceFiles) {
      for (const field of ["dependencies", "devDependencies"] as const) {
        const deps = pkgFile.data[field];
        if (!deps?.[filterPkg]) continue;

        if (deps[filterPkg].startsWith("catalog:")) {
          if (!catalog || !(filterPkg in catalog)) {
            console.log(
              `\n${pkgFile.data.name} ${field}: references catalog but ${filterPkg} not in catalog`,
            );
          }
          found = true;
          continue;
        }

        if (isUpdatable(deps[filterPkg])) {
          found = true;
          console.log(`\n${pkgFile.data.name} ${field}:`);
          if (await updateSingleDep(deps, filterPkg, allowMajor)) {
            pkgFile.dirty = true;
            totalUpdated++;
          }
        }
      }
    }

    if (!found) {
      console.log(`"${filterPkg}" not found in any package.json`);
      process.exit(1);
    }

    if (totalUpdated === 0) {
      console.log("\nAlready up to date.");
    } else if (dryRun) {
      console.log(`\n${totalUpdated} update(s) available. Run without --dry-run to apply.`);
    } else {
      writeFileSync(PKG_PATH, JSON.stringify(rootPkg, null, 2) + "\n");
      for (const f of workspaceFiles) {
        if (f.dirty) writeFileSync(f.path, JSON.stringify(f.data, null, 2) + "\n");
      }
      console.log(`\nUpdated ${totalUpdated} location(s). Run \`bun install\` to apply.`);
    }

    if (audit) await runAudit();
    return;
  }

  // --- Update all mode ---
  let totalUpdated = 0;

  if (catalog) {
    console.log("Catalog:");
    totalUpdated += await updateAllDeps(catalog, allowMajor);
  }

  for (const field of ["dependencies", "devDependencies"] as const) {
    if (rootPkg[field]) {
      const has = Object.entries(rootPkg[field]).some(([, v]) => isUpdatable(v as string));
      if (has) {
        console.log(`\nRoot ${field}:`);
        totalUpdated += await updateAllDeps(rootPkg[field], allowMajor);
      }
    }
  }

  for (const pkgFile of workspaceFiles) {
    for (const field of ["dependencies", "devDependencies"] as const) {
      if (pkgFile.data[field]) {
        const has = Object.entries(pkgFile.data[field]).some(([, v]) => isUpdatable(v as string));
        if (has) {
          console.log(`\n${pkgFile.data.name} ${field}:`);
          const count = await updateAllDeps(pkgFile.data[field], allowMajor);
          if (count > 0) pkgFile.dirty = true;
          totalUpdated += count;
        }
      }
    }
  }

  if (totalUpdated === 0) {
    console.log("\nEverything is up to date.");
  } else if (dryRun) {
    console.log(`\n${totalUpdated} update(s) available. Run without --dry-run to apply.`);
  } else {
    writeFileSync(PKG_PATH, JSON.stringify(rootPkg, null, 2) + "\n");
    for (const f of workspaceFiles) {
      if (f.dirty) writeFileSync(f.path, JSON.stringify(f.data, null, 2) + "\n");
    }
    console.log(`\nUpdated ${totalUpdated} deps. Run \`bun install\` to apply.`);
  }

  if (audit) await runAudit();
}

main();

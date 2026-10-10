// Assemble a self-hosted Pyodide directory in public/pyodide so the site loads
// nothing from a third-party CDN at runtime.
//
// 1. Copies the core runtime from the `pyodide` npm package.
// 2. Downloads the wheels needed for `pydantic` (and its dependencies) from the
//    official Pyodide release matching the installed version. Hashes come from
//    the package's own lock file and are verified.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const pkgDir = join(webRoot, "node_modules", "pyodide");
const outDir = join(webRoot, "public", "pyodide");
const REQUIRED = ["pydantic"];

const CORE_FILES = [
  "pyodide.asm.wasm",
  "pyodide.asm.mjs",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

const norm = (name) => name.toLowerCase().replace(/[-_.]+/g, "-");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const { version } = JSON.parse(await readFile(join(pkgDir, "package.json"), "utf8"));
const lock = JSON.parse(await readFile(join(pkgDir, "pyodide-lock.json"), "utf8"));
const byName = new Map(Object.entries(lock.packages).map(([k, v]) => [norm(k), v]));
const cdn = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;

await mkdir(outDir, { recursive: true });
for (const f of CORE_FILES) await copyFile(join(pkgDir, f), join(outDir, f));

// Transitive dependency closure from the lock file.
const needed = new Map();
const visit = (name) => {
  const key = norm(name);
  if (needed.has(key)) return;
  const pkg = byName.get(key);
  if (!pkg) throw new Error(`Package ${name} is not in Pyodide ${version}`);
  needed.set(key, pkg);
  (pkg.depends ?? []).forEach(visit);
};
REQUIRED.forEach(visit);

for (const [name, pkg] of needed) {
  const target = join(outDir, pkg.file_name);
  if (await exists(target)) {
    if (sha256(await readFile(target)) === pkg.sha256) continue;
  }
  process.stdout.write(`downloading ${pkg.file_name} ... `);
  const res = await fetch(cdn + pkg.file_name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha256(buf) !== pkg.sha256) throw new Error(`${name}: checksum mismatch`);
  await writeFile(target, buf);
  console.log("ok");
}
console.log(`pyodide ${version}: ${needed.size} packages ready in public/pyodide`);

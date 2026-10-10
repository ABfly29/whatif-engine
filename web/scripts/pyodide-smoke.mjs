// Runs the real engine in Pyodide (Node) and prints the response JSON.
// Usage: node scripts/pyodide-smoke.mjs '<request json>' [compare|sensitivity]
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPyodide } from "pyodide";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const indexURL = join(root, "pyodide") + "/";

const py = await loadPyodide({ indexURL });
await py.loadPackage("pydantic");
const zip = await readFile(join(root, "engine", "whatif_engine.zip"));
py.unpackArchive(new Uint8Array(zip), "zip", { extractDir: "/engine" });
py.runPython("import sys; sys.path.insert(0, '/engine')");
const handle = py.runPython("from whatif_engine.api.service import handle; handle");
const kind = process.argv[3] ?? "compare";
console.log(handle(kind, process.argv[2]));

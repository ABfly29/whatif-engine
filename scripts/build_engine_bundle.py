"""Zip the Python engine for the in-browser (Pyodide) runtime.

Includes the engine, domain models, schemas and service layer. Excludes the
FastAPI app and routes, which need packages that Pyodide does not load.
"""

import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT = ROOT / "web" / "public" / "engine" / "whatif_engine.zip"
EXCLUDE_PARTS = {"__pycache__"}
EXCLUDE_FILES = {
    Path("whatif_engine/api/main.py"),
}
EXCLUDE_DIRS = {Path("whatif_engine/api/routes")}


def included(rel: Path) -> bool:
    if rel.suffix != ".py" or EXCLUDE_PARTS & set(rel.parts):
        return False
    if rel in EXCLUDE_FILES:
        return False
    return not any(d in rel.parents for d in EXCLUDE_DIRS)


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    files = sorted(
        p.relative_to(SRC)
        for p in (SRC / "whatif_engine").rglob("*.py")
        if included(p.relative_to(SRC))
    )
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zf:
        for rel in files:
            # Fixed timestamp keeps the archive reproducible.
            info = zipfile.ZipInfo(rel.as_posix(), date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, (SRC / rel).read_bytes())
    print(f"engine bundle: {len(files)} files -> {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

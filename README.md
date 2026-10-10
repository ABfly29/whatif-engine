# WhatIf

An India-focused tool for comparing major financial decisions. The first
workflow compares **staying in your job** with **taking a new offer**, including
employment gaps, relocation costs, bonuses, pay growth and expense inflation.

**Live site: https://abfly29.github.io/whatif-engine/**

Results are deterministic projections from the numbers you enter. They are not
forecasts, guarantees or financial advice.

## Quick start

```
pip install -e ".[dev]"
pytest

cd web
npm install
npm run dev        # http://localhost:5173
```

You need Python 3.12+ and Node 22+. `npm run dev` needs `python` on your PATH.

## How it is built

| Part | Where | What it does |
|---|---|---|
| Engine | `src/whatif_engine/` | All financial calculations (pure Python, `Decimal`) |
| Website | `web/` | React + TypeScript; runs the engine in the browser via [Pyodide](https://pyodide.org) |
| API (optional) | `src/whatif_engine/api/` | FastAPI wrapper around the same engine |
| Prototype | `frontend/app.py` | Original Streamlit app |

The website is fully static, so it is hosted on GitHub Pages with no server.
No calculation happens in TypeScript.

More detail on running the API, the tests, the build and deployment is in
[docs/development.md](docs/development.md).

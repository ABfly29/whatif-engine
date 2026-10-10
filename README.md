.

## Streamlit prototype

```
pip install -e ".[dev,ui]"
streamlit run frontend/app.py
```

All calculations live in `src/whatif_engine`; `frontend/app.py` only renders
inputs and results. Outputs are deterministic projections based on user-entered
assumptions, not forecasts or financial advice.

## Tests

```
pytest
```

## React website (landing page + decision workspace)

The website lives in `web/` (React + TypeScript + Vite). **It is a static site:
the Python engine runs in the visitor's browser** (via
[Pyodide](https://pyodide.org)), so it can be hosted on GitHub Pages with no
server. No financial calculation is done in TypeScript; the browser runs the
same `whatif_engine` package the tests cover.

```
cd web
npm install
npm run dev          # http://localhost:5173  (engine runs in the browser)
```

`npm run dev` and `npm run build` first run `npm run prepare:engine`, which zips
the Python engine and downloads the checksum-verified Pyodide files into
`web/public/` (generated, git-ignored). It needs `python` on your PATH.

- `/` is the landing page and `/#/app` is the stay-vs-switch workspace (hash
  routing, required for GitHub Pages).
- The first calculation downloads about 14 MB (Pyodide plus pydantic) and takes
  a few seconds; the browser caches it afterwards.
- Tests: `pytest` (engine, API, service layer) and `cd web && npm test`
  (includes a parity test that runs the real engine in Pyodide). Also
  `npm run lint`, `npm run typecheck` and `npm run build`.

### Optional: FastAPI mode

The FastAPI server (`src/whatif_engine/api/`) is still available, e.g. for
other clients. Both it and the browser runtime call the same function,
`whatif_engine.api.service.handle`, so they return identical results.

```
pip install -e ".[dev,api]"
uvicorn whatif_engine.api.main:app --port 8000          # terminal 1
cd web && VITE_ENGINE=http npm run dev                  # terminal 2
```

API docs: http://127.0.0.1:8000/docs

### Deploying to GitHub Pages

`.github/workflows/pages.yml` runs the Python and web tests, builds the site with
the right base path (`/<repo>/`), and deploys it. One-time setup in the
repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
After that, every push to `main` deploys to
https://abfly29.github.io/whatif-engine/.

The Streamlit prototype (`frontend/app.py`) is kept until the React version is
signed off.

# Development guide

## Architecture

```
React site (web/)  ──►  web worker  ──►  Pyodide  ──►  whatif_engine (Python)
                                                         ▲
FastAPI (optional)  ───────────────────────────────────┘
```

Both the browser runtime and the FastAPI server call
`whatif_engine.api.service.handle`, so they return identical results. All
request validation lives in the Pydantic schemas in `api/schemas.py`.

## Running the website

```
cd web
npm install
npm run dev
```

`npm run dev` and `npm run build` first run `npm run prepare:engine`, which zips
the Python engine and downloads the checksum-verified Pyodide files into
`web/public/` (generated and git-ignored).

- `/` is the landing page and `/#/app` is the calculator. Hash routing is
  required for GitHub Pages.
- The first calculation downloads about 13 MB (Pyodide plus pydantic). The
  browser caches it afterwards. The app starts the download as soon as someone
  hovers, focuses or touches a link to the calculator, and shows a real
  progress bar. The worker downloads the large files itself (sizes come from
  `public/pyodide/manifest.json`, written by `prepare:engine`) and hands the
  same bytes to Pyodide, so nothing is fetched twice.

## Tests and checks

```
pytest                       # engine, API and service layer
cd web
npm test                     # includes a parity test running the real engine in Pyodide
npm run lint
npm run typecheck
npm run build
```

The Pyodide parity test is skipped if the engine assets have not been built; run
`npm run prepare:engine` first. CI always runs it.

## FastAPI mode (optional)

```
pip install -e ".[dev,api]"
uvicorn whatif_engine.api.main:app --port 8000          # terminal 1
cd web && VITE_ENGINE=http npm run dev                  # terminal 2
```

Interactive API docs: http://127.0.0.1:8000/docs

## Streamlit prototype

```
pip install -e ".[dev,ui]"
streamlit run frontend/app.py
```

## Deploying to GitHub Pages

`.github/workflows/pages.yml` runs the Python and web tests, builds the site with
the right base path (`/<repo>/`), and deploys it on every push to `main`.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub
Actions**. GitHub Pages on a free plan requires a public repository.

## Known limitations of the model

- Pay is take-home. Tax, PF and other deductions are not modelled.
- Pay growth and expense inflation change once a year, not monthly.
- Savings earn no interest and are not invested.
- Gap, relocation and bonus inputs apply only to the switch scenario.

# SODA Battery Frontend

This folder is a static website. It contains only HTML, browser JavaScript, CSS, and browser assets.

## Boundary

- The frontend does not read files from `backend/`.
- The frontend does not require a Python process to render the pages.
- The frontend communicates with data services only through HTTP API requests whose paths start with `/api/`.
- The shared API origin is configured in `site.js` by `window.SODA_API_ORIGIN || 'http://sulingzhi.com:10031'`.

## Files

- `index.html`: homepage, research, dataset, team, and laboratory content.
- `explorer.html`: cell filtering and chart exploration interface.
- `site.js`: shared theme, navigation, API fetch, and chart helper code.
- `image/`: page and footer image assets.
- `people/`: profile images.

## Local Preview

Any static file server can serve this folder. For example:

```bash
cd frontend
python3 -m http.server 8000 --bind localhost
```

Then open:

```text
http://localhost:8000/index.html
http://localhost:8000/explorer.html
```

Do not add backend routes, local CSV readers, or proxy code to this folder. The frontend boundary is the HTTP API.

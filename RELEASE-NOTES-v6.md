# Ativos Tech 6.0 — Release Notes

## Summary
Version 6.0 adds equipment ownership (H&CO vs. H&CO B2Finance), corporate-email collaborators, and spreadsheet import with preview and confirmation. It also moves the interface to a silent, minimal default and cuts real network and server cost. All existing features and flows are preserved.

## Features
| Area | What changed |
|---|---|
| Equipment owner | Required field on assets and quantity items. Stock, reservations, queue demand, alerts, movements and physical counts are calculated per owner. The API refuses to mix owners in requests and reservations. Bulk owner change is available (blocked for reserved items). |
| Collaborators | New `/colaboradores` registry keyed by corporate email. Collaborators can be allocated from the asset form or the asset page, with inline creation. A request can carry the collaborator email; on delivery the collaborator is created or reused and linked to the delivered assets. |
| Import | CSV (any delimiter, UTF-8 or Windows-1252) and XLSX (dependency-free parser with zip-bomb limits). The import auto-maps columns, normalizes values, detects duplicates in the file and in the registry, and supports per-row correction and per-row decisions (ignore, complete, update). It offers a correction report, version-checked confirmation, a final report, an audit log entry and undo. Empty cells never overwrite data. |
| Silent UI | No interface sounds. The only sound is the new-request alert, which can be turned off; repeat is off by default. There is no confetti, count-up, staggered entrance or chart drawing. Toasts are short, de-duplicated and capped at three. Persistent warnings appear only when action is required. Repetitive alerts are grouped into one alert. |
| Less on screen | The dashboard shows only what needs action; charts and the agenda live under "Mais indicadores". The asset form has collapsible optional sections. Indicators are shown as a compact strip. |

## Performance (3,024 assets, 308 requests; same data, same machine)
| Measurement | v5 | v6 |
|---|---:|---:|
| Dashboard open: requests / payload | 10 / 1.5 MB | 5 / 15 KB |
| Inventory open: requests / payload / table visible | 7 / 3.3 MB / 546 ms | 5 / 17 KB / 227 ms |
| Stock open: payload | 1.5 MB | 16 KB |
| Requests queue open: payload | 2.1 MB | 18 KB |
| Three external changes with dashboard open | 72 requests / 13.5 MB | 6 / 28 KB |
| Dashboard → Inventory navigation | 556 ms / 2.7 MB | 323 ms / 15 KB |
| API write (create asset) | 66.6 ms | 31.1 ms |
| API `/alertas` payload | 536 KB | 2.4 KB |
| Data file size | 4.2 MB | 3.3 MB |
| Dashboard JavaScript (decoded, cold) | 827 KB | 788 KB |

The gains come from:
- **Server pagination:** the inventory is paginated and filtered on the server.
- **Lightweight counters:** a small `/api/contadores` endpoint replaces the full dashboard plus all alerts on every change.
- **Browser read cache:** a revision-keyed cache with request de-duplication.
- **Smarter reloads:** reloads are debounced and paused while the tab is hidden.
- **Lazy loading:** secondary tabs and history load only when opened.
- **Server-side efficiencies:** an id index, per-revision memoization, compact JSON writes, single-transaction writes and coalesced change events.

## Database migration
Migration v5 → v6 runs automatically on first start and preserves all records:
- Existing assets, items, requests, request lines and movements receive owner `H&CO`. The change is logged in the activity history.
- The `colaboradores` and `importacoes` collections are added.
- Per-import line details are stored in `api/data/importacoes/<id>.json`.

## Files
- **New (API):**
  - `api/src/colaboradores.js`
  - `api/src/importacao/{planilha,mapear,motor}.js`
  - `api/src/routes/{colaboradores,importacao}.js`
  - `api/tests/v6.test.js`
  - `api/tests/fixtures/*`
- **New (web):**
  - `web/app/ativos/importar/page.js`
  - `web/app/colaboradores/page.js`
  - `web/components/ColaboradorPicker.js`
- **New (docs):**
  - `docs/modelo-importacao.csv`
  - this file
- **Changed (API):**
  - `api/src/{db,domain,estoque,migracao,seed-data,config,auth,app,notificacoes}.js`
  - `api/src/routes/{ativos,estoque,solicitacoes,painel}.js`
  - existing tests updated with the required owner field
- **Changed (web):**
  - `web/lib/{api,hooks,sound,nav}.js`
  - `web/components/{providers,ui}.js`
  - `web/components/shell/{AppShell,Topbar,CommandPalette}.js`
  - `web/components/forms/{AtivoForm,EventoModal}.js`
  - `web/components/portal/{Estoque,SolicitacaoDetalhe}.js`
  - pages: painel, ativos, ativos/[id], ativos/novo, estoque, solicitacoes, quadro, agenda, configuracoes, portal, portal/nova, portal/estoque
  - `web/app/globals.css` (v6 section)
- **Removed:** `web/components/shell/Confetti.js`

## Verification
- **API tests:** 73 automated tests pass (`npm test`). Eleven are new; they cover ownership, collaborators, pagination, counters, CSV/XLSX import, security and the v5 → v6 migration.
- **Browser flows (Playwright):**
  - XLSX import with correction, update decision, confirmation and undo
  - Asset creation with a new collaborator
  - An H&CO B2Finance request from the requester through reservation, preparation and delivery, with collaborator linking
  - Collaborator lookup
  - Zero interface sounds on clicks
- **Visual sweep:** 21 screens in light and dark themes on desktop and mobile, with no console errors and no horizontal overflow.

## External configuration (optional)
`EMAIL_DOMINIOS_COLABORADORES` restricts accepted collaborator email domains, for example `hco.com,b2finance.com`. Empty accepts any valid email.

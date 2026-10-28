# Ativos Tech 6.1 — Release Notes

**Date:** 28 Oct 2026
**Scope:** multi-device access (root-cause fix), collapsible sidebar fix
**Data migration:** none required. Existing databases, users and sessions work unchanged.

## 1. Incident: sign-in fails on a second computer

### Symptom
An account that worked on the PC where the system was set up returned **"E-mail ou senha incorretos"** on a notebook. The notebook was opening `http://localhost:3000`.

### Root cause
Two structural problems combined:

1. **Each computer was running its own copy of the system, with its own database.** `localhost` always means "this computer", so on the notebook it reached a separate installation with a separate `api/data/db.json`. The account existed only in the PC's database. The rejection was correct behaviour for that database, not an authentication defect.
2. **The front end could not be used from another device even when pointed at the right server.** The browser called a hard-coded address, `http://localhost:3001/api`. A notebook opening the PC's address would therefore have tried to reach an API on the notebook itself.

The investigation ruled out password hashing as a cause. Hashes use scrypt with a per-password random salt and no machine-specific secret, so the same database validates the same credentials on any host. Sessions, cookies and local storage were not involved: sessions are per-browser bearer tokens, and lockout is per account.

### Fix (structural)

| Area | Change |
|---|---|
| Front end → API | The browser calls the site's own address (`/api`), and the Next.js server forwards to the API (`rewrites`). No `localhost` remains in client code, so the system works with any IP, host name, domain, HTTPS or tunnel. |
| API exposure | The API listens on `127.0.0.1` only (`API_HOST`). Only the web port (3000) needs to be reachable. |
| CORS | Off by default (same-origin). Other origins are allowed only if they are listed in `CORS_ORIGIN`. |
| Real-time channel | The SSE stream sends `Cache-Control: no-transform`. Without it, the proxy compressed and held back live updates. Proxy timeout raised to 120 s; the heartbeat runs every 20 s. |
| Production mode | New commands: `npm run servidor` (build and start), `npm start` and `npm run build`. The site binds to `0.0.0.0`. If either process exits, the launcher stops both, so a service manager can restart them. |
| Microsoft sign-in | The redirect URI now defaults to `<APP_URL>/api/auth/microsoft/callback`. |
| Admin visibility | **Configurações → Dados** shows the address to share and warns when the system is opened via `localhost`. New endpoint `GET /api/sistema/acesso` (administrators only). On startup the server prints its network addresses. |
| Windows | `scripts/windows/liberar-acesso-rede.ps1` opens port 3000 on private networks only and lists the server's addresses. |
| Server hosting | `Dockerfile` and `docker-compose.yml` (single container, persistent data volume, health check) plus `docs/DEPLOYMENT.md`. |
| Messages | Connection errors now say "servidor do Ativos Tech" instead of exposing internal URLs. |

## 2. Sidebar collapse

- **Bug:** after a reload with the menu collapsed, the menu stayed stuck in icon-only mode. The boot marker (`data-side`) was never cleared.
- **Fix:** the marker now follows the current setting.
- **Added controls:**
  - an edge handle on the sidebar;
  - the footer button now reads "Recolher menu" or "Expandir menu";
  - `Ctrl/⌘ + B` toggles the menu.
- **Removed:** the Next.js development indicator, which covered the footer button.

## 3. Files changed

- **API:**
  - `src/config.js`, `src/app.js`, `src/server.js`, `src/routes/stream.js`
  - new: `src/rede.js`
  - new test: `tests/acesso-rede.test.js`
  - `package.json`
- **Web:**
  - `next.config.mjs`, `lib/api.js`, `app/configuracoes/page.js`, `app/globals.css`
  - `components/providers.js`, `components/shell/Sidebar.js`, `components/shell/AppShell.js`
  - `.env.local.example`, `package.json`
- **Root:**
  - `package.json`, `README.md`, `api/.env.example`
  - new: `scripts/producao.js`, `scripts/windows/liberar-acesso-rede.ps1`
  - new: `Dockerfile`, `docker-compose.yml`, `.dockerignore`
  - new: `docs/DEPLOYMENT.md`, this file

## 4. Verification

- **API tests:** 76/76 pass. Three are new:
  - same account signed in on two devices, both seeing the same data;
  - signing out on one device keeps the other session;
  - CORS closed by default;
  - access endpoint restricted to administrators.
- **Browser, server mode, opened by network IP (not `localhost`):**
  - **Clean devices:** the same account signed in from three isolated browser profiles (Windows/Chrome, Windows/Edge user agent, Android).
  - **Shared data:** a record created on one device appeared live on the others.
  - **Real-time channel:** still live after 70 s.
  - **Security:** wrong password rejected.
  - **No local calls:** no request to `localhost` or port 3001.
  - **No errors:** no console errors.
- **Network checks:**
  - port 3001 is unreachable from the network address;
  - another origin receives no CORS headers.
- **Regression:** existing end-to-end flows pass over the network address:
  - spreadsheet import and undo;
  - B2Finance request through delivery;
  - collaborators;
  - silent UI;
  - no mobile overflow.
- **Screen sweep:** every screen for both profiles, light and dark, desktop and mobile — no issues.
- **Development mode:** `npm run dev` still works through the same proxy.

### Limitations
- **Docker:** the files were written but not executed, because this environment has no Docker daemon.
- **Browsers:** only the Chromium engine was available for automated tests. Edge is Chromium-based; Firefox and Safari were not exercised.
- **Availability and security:** if the server is a personal PC, the system is available only while that PC is on. Plain HTTP on the LAN is acceptable only inside the company network. For wider use, deploy on a server or VM with HTTPS (`docs/DEPLOYMENT.md`).

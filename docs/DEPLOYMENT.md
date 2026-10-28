# Ativos Tech — Deployment Guide (multi-device access)

Version 6.1 · Audience: H&CO IT

## 1. Architecture

Ativos Tech is a web application with **one server and one database**. Every user, on any computer or browser, opens the **same address** and works on the same data.

```
 Browser (any device)  ──HTTP(S)──►  Web server :3000  (Next.js, listens on the network)
                                         │  /api/*  (internal proxy)
                                         ▼
                                     API :3001  (Express, listens on 127.0.0.1 only)
                                         │
                                         ▼
                                     api/data/db.json  (single database)
```

- The browser only talks to the site's own address. The site forwards `/api/*` to the API.
- The front end has **no hard-coded `localhost`**. It works with any IP, host name or domain, including HTTPS behind a tunnel or reverse proxy.
- The API port (3001) is never exposed to the network. Only the web port (3000) must be reachable.
- Sessions are bearer tokens stored per browser. The same account can be signed in on several devices at the same time. Signing out on one device does not affect the others.
- Passwords are stored as scrypt hashes with a random salt. No machine-specific secret is involved, so the database can be moved to another server without breaking existing accounts.

> **Do not install a copy on each computer.** Each copy creates its own database. An account created on one copy does not exist on another, which shows up as "E-mail ou senha incorretos". Data never synchronises between copies. Client devices only need a browser.

## 2. Option A — An always-on Windows computer on the company network

1. Copy the project to the server computer. Keep the existing `api/data` folder: it holds all users and records.
2. Install and start the server:
   ```
   npm run setup
   npm run servidor
   ```
   `npm run servidor` builds the site and starts the API and the site in production mode. Afterwards, `npm start` is enough as long as the code has not changed.
3. Open the firewall for port 3000 on private networks. Run this once in PowerShell as Administrator:
   ```
   powershell -ExecutionPolicy Bypass -File .\scripts\windows\liberar-acesso-rede.ps1
   ```
   The script prints the addresses other people can use, for example `http://192.168.0.10:3000`. The network profile must be **Private**, not Public.
4. Create `api/.env` from `api/.env.example`, set `APP_URL` to that address, and restart. `APP_URL` is used in e-mail links and in the Microsoft sign-in redirect.
5. Reserve the server's IP address in the router (DHCP reservation), or use the computer name (`http://NAME:3000`), so the address does not change.

Limits of this option:
- The system is available only while that computer is on and the process is running.
- Traffic on the local network is plain HTTP. For access outside the office network, use Option B or C, which provide HTTPS.

## 3. Option B — Server or VM with Docker (recommended for shared use)

This works on a company VM or an Oracle Cloud Always Free instance.

```
cp api/.env.example api/.env        # set APP_URL, e.g. https://ativos.hco.com
mkdir dados && cp -r <old>/api/data/* dados/   # migrate existing data (optional)
docker compose up -d --build
```

- Data lives in `./dados` on the host. Back it up regularly; **Configurações → Dados → Baixar backup** also works.
- The container restarts automatically (`restart: unless-stopped`). A health check runs against `/api/health`.
- Put HTTPS in front of port 3000 with a reverse proxy (Caddy, Nginx or IIS ARR) or with Option C.

## 4. Option C — HTTPS without opening inbound ports (Cloudflare Tunnel)

1. Run Ativos Tech with Option A or B.
2. Install `cloudflared`, then create a tunnel that points a hostname (for example `ativos.hco.com`) to `http://localhost:3000`.
3. Set `APP_URL=https://ativos.hco.com` and restart.
4. Optionally restrict access with Cloudflare Access (Microsoft Entra ID as identity provider).

## 5. Configuration reference (`api/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | `http://localhost:3000` | Address users type. Used in e-mail links and the Microsoft redirect. |
| `WEB_PORT` | `3000` | Port of the site (the only port to open). |
| `PORT` | `3001` | Internal API port. |
| `API_HOST` | `127.0.0.1` | API bind address. Keep the default unless the API must be reached directly. |
| `API_PUBLIC_URL` | = `APP_URL` | Only if the API is published on a different domain. |
| `CORS_ORIGIN` | empty | Only if another web origin must call the API from a browser. |
| `API_INTERNAL_URL` (web, build time) | `http://127.0.0.1:3001` | Where the site forwards `/api`. Rebuild after changing it. |

Microsoft sign-in: register the redirect URI as `<APP_URL>/api/auth/microsoft/callback`.

## 6. Verification checklist

- [ ] **Settings:** in **Configurações → Dados** (administrators), "Endereço para outras pessoas" shows the expected address.
- [ ] **Second device:** from another computer on the network, the address opens the sign-in page and an existing account signs in.
- [ ] **Shared data:** a record created on one device appears on the other within seconds (real-time channel).
- [ ] **API not exposed:** `http://<server-ip>:3001` is **not** reachable from other computers.
- [ ] **Backups:** a backup is configured for `api/data` (or `./dados` with Docker).

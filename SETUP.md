# Complete Setup & Deployment Guide (`aftabx.tech`)

This guide provides step-by-step instructions to deploy the **EWU Course Schedule Tool** from your GitHub repository (`cyberwarden5/ewu-course`) using **Cloudflare Pages**, configure your custom domain (`https://aftabx.tech/`), create the `api.aftabx.tech` subdomain, and deploy both **Cloudflare Workers** (**API Proxy V1** and **API Proxy V2**) with **Cloudflare KV** and the **SUI7 Admin Panel**.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Add `aftabx.tech` to Cloudflare](#2-add-aftabxtech-to-cloudflare)
3. [Deploy Website on Cloudflare Pages (from GitHub)](#3-deploy-website-on-cloudflare-pages-from-github)
4. [Set Custom Domain in Cloudflare Pages (`aftabx.tech`)](#4-set-custom-domain-in-cloudflare-pages-aftabxtech)
5. [Create Cloudflare KV & Admin Credentials (`ADMIN_KV`)](#5-create-cloudflare-kv--admin-credentials-admin_kv)
6. [Create `api.aftabx.tech` Subdomain & Worker Routing Strategy](#6-create-apiaftabxtech-subdomain--worker-routing-strategy)
7. [Deploy API Proxy V1 (`worker.js`)](#7-deploy-api-proxy-v1-workerjs)
8. [Deploy API Proxy V2 (`V2/workerV2.js`)](#8-deploy-api-proxy-v2-v2workerv2js)
9. [Frontend Files to Update for the New Domain](#9-frontend-files-to-update-for-the-new-domain)
10. [Managing SUI7 Admin Panel](#10-managing-sui7-admin-panel)
11. [Verification & Troubleshooting](#11-verification--troubleshooting)

---

## 1. Architecture Overview

| Component | Host / Path | Source | Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend (Main + SUI7 + V2 UI)** | `https://aftabx.tech/` | GitHub `cyberwarden5/ewu-course` -> **Cloudflare Pages** | Static HTML/CSS/JS + `_redirects` clean URLs + `_headers` |
| **API Proxy V1 Worker** | `https://api.aftabx.tech/api/*` | `worker.js` | Main portal proxy, auth, SUI7 admin APIs, KV integration |
| **API Proxy V2 Worker** | `https://api.aftabx.tech/V2/api/*` | `V2/workerV2.js` | Legacy V2 course filter API proxy |
| **Database / State** | Bound as `ADMIN_KV` | Cloudflare KV | Stores feature flags, logs, blocked IPs/IDs, site closure mode |

> **Why `api.aftabx.tech` uses one subdomain for both Workers:**
> V1 handles `/api/*` and V2 handles `/V2/api/*`. Both sit behind `https://api.aftabx.tech` so `SameSite=None; Secure` session cookies (`ASP.NET_SessionId`) and CORS work cleanly from `https://aftabx.tech`.

---

## 2. Add `aftabx.tech` to Cloudflare

1. Sign in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Click **Add a domain** (or **+ Add** -> **Domain**).
3. Enter `aftabx.tech` and select the **Free** plan.
4. Copy the **two Cloudflare Nameservers** shown (e.g., `alice.ns.cloudflare.com` and `bob.ns.cloudflare.com`).
5. Open your domain registrar (where you registered `aftabx.tech` — e.g., Namecheap, Porkbun, GoDaddy, etc.) and replace the existing nameservers with the two Cloudflare nameservers.
6. Wait until `aftabx.tech` shows **Active** in Cloudflare (usually 5–30 minutes).

---

## 3. Deploy Website on Cloudflare Pages (from GitHub)

Cloudflare Pages connects directly to your GitHub repo (`cyberwarden5/ewu-course`), auto-deploys whenever you push to `main`, and natively applies your [`_redirects`](_redirects) (clean URLs without `.html`) and [`_headers`](_headers) files.

1. In the **Cloudflare Dashboard**, go to **Workers & Pages** -> **Create** -> select the **Pages** tab.
2. Click **Import an existing Git repository** (or **Connect to Git**).
3. Connect your **`cyberwarden5`** GitHub account and authorize access to the `ewu-course` repository.
4. Select `cyberwarden5/ewu-course` and click **Begin setup**.
5. Configure the build settings:
   - **Project name**: `ewu-course` *(or your preferred name — gives `<project>.pages.dev`)*
   - **Production branch**: `main`
   - **Framework preset**: `None`
   - **Build command**: *(leave completely empty)*
   - **Build output directory**: `/` *(or leave empty/default root)*
6. Click **Save and Deploy**.
7. Wait for the first deployment to finish (takes ~30 seconds) and verify it loads on `https://<project>.pages.dev`.

---

## 4. Set Custom Domain in Cloudflare Pages (`aftabx.tech`)

### Step 4A: Clean Up Conflicting DNS Records (If Any)
Go to **Cloudflare Dashboard** -> `aftabx.tech` -> **DNS** -> **Records**.
If there are any old/default parking `A`, `AAAA`, or `CNAME` records for `@` (`aftabx.tech`) or `www`, delete them so Cloudflare Pages can automatically manage them.

### Step 4B: Attach `aftabx.tech` and `www.aftabx.tech` in Pages
1. Open **Workers & Pages** -> your Pages project (`ewu-course`) -> **Custom domains**.
2. Click **Set up a custom domain**.
3. Enter `aftabx.tech` and click **Continue**.
4. Cloudflare automatically detects `aftabx.tech` is in your account and shows the DNS `CNAME` record it will create (`aftabx.tech` -> `<project>.pages.dev`, **Proxied**). Click **Activate domain**.
5. *(Recommended)* Repeat **Set up a custom domain** for `www.aftabx.tech`:
   - Enter `www.aftabx.tech` -> **Continue** -> **Activate domain**.
   - Cloudflare creates `CNAME` `www` -> `<project>.pages.dev` (**Proxied**).
6. Wait 1–5 minutes for the status to change from **Initializing** / **Verifying** to **Active** (Cloudflare automatically provisions the edge SSL certificate).

### Step 4C: Configure SSL/TLS & Optional `www` -> Apex Redirect
1. In **Cloudflare Dashboard** -> `aftabx.tech` -> **SSL/TLS** -> **Overview**, set encryption mode to **Full (strict)**.
2. In **SSL/TLS** -> **Edge Certificates**, enable:
   - **Always Use HTTPS**
   - **Automatic HTTPS Rewrites**
3. *(Optional)* Redirect `www.aftabx.tech` -> `https://aftabx.tech` so users always stay on one canonical origin:
   - Go to **Rules** -> **Redirect Rules** -> **Create rule**.
   - Rule name: `Redirect www to apex`
   - When incoming requests match: **Custom filter expression** -> `Hostname` `equals` `www.aftabx.tech`
   - Then: **Dynamic** URL redirect -> Expression: `concat("https://aftabx.tech", http.request.uri.path)` (Status code: `301`, Preserve query string: **Checked**).
   - Click **Deploy**.

> **Note on Cloudflare Pages DNS:**
> Once activated, your **DNS -> Records** page should have:
> - `CNAME` | `@` | `<project>.pages.dev` | **Proxied**
> - `CNAME` | `www` | `<project>.pages.dev` | **Proxied**
>
> *(Do **not** deploy `worker.js` to `aftabx.tech/*` — the frontend lives on `aftabx.tech` via Cloudflare Pages, and the Workers live on `api.aftabx.tech`.)*

---

## 5. Create Cloudflare KV & Admin Credentials (`ADMIN_KV`)

Both Workers use Cloudflare KV (`ADMIN_KV`) for maintenance mode, IP/Student ID blocklists, telemetry logs, analytics, and feature toggles.

### Step 5A: Create the KV Namespace

**Via Cloudflare Dashboard:**
1. Go to **Cloudflare Dashboard** -> **Storage & Databases** -> **KV**.
2. Click **Create a namespace**.
3. Name it `ADMIN_KV` and click **Add**.
4. Copy its **Namespace ID** (needed if deploying via Wrangler).

**Or via Wrangler CLI:**
```bash
npm install -g wrangler
npx wrangler login
npx wrangler kv namespace create "ADMIN_KV"
```
Copy the printed `id` for `wrangler.toml`.

### Step 5B: Generate Admin Password Hash (`SHA-256`)

Pick a strong admin password (for example `MySuperSecretPass`) and generate its lowercase SHA-256 hex digest:

- **Using Node.js:**
  ```bash
  node -e "console.log(require('crypto').createHash('sha256').update('MySuperSecretPass').digest('hex'))"
  ```
- **Or using Windows PowerShell:**
  ```powershell
  [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes("MySuperSecretPass"))).Replace("-", "").ToLower()
  ```

Keep these two values ready for API Proxy V1:
- `ADMIN_USERNAME` (e.g. `admin`)
- `ADMIN_PASSWORD_HASH` (64-character lowercase SHA-256 hex string)

---

## 6. Create `api.aftabx.tech` Subdomain & Worker Routing Strategy

Because you have **two separate Workers** sharing the same subdomain (`api.aftabx.tech`), choose **one** of these two methods:

### Method 1 (Recommended): Custom Domain on V1 + Route on V2

In Cloudflare Workers, **Routes always take precedence over Custom Domains** on the same hostname.

- **API Proxy V1 (`worker.js`)** gets **Custom Domain**: `api.aftabx.tech`
  - Cloudflare automatically creates the `api.aftabx.tech` DNS record (managed Worker record) and SSL certificate.
  - **Do NOT** manually create an `A`, `AAAA`, or `CNAME` record for `api` in Cloudflare DNS when using Method 1 (otherwise Cloudflare rejects the Custom Domain because a DNS record already exists).
- **API Proxy V2 (`V2/workerV2.js`)** gets **Route**: `api.aftabx.tech/V2/api/*` (Zone: `aftabx.tech`)
  - Requests to `https://api.aftabx.tech/V2/api/*` match V2's Route first.
  - All other requests (`https://api.aftabx.tech/api/*`) fall through to V1's Custom Domain.

### Method 2 (Manual `api` DNS Subdomain + Routes on Both)

If you prefer creating the `api` DNS record manually and using **Routes** for both Workers:

1. Go to **Cloudflare Dashboard** -> `aftabx.tech` -> **DNS** -> **Records** -> **Add record**:
   - **Type**: `AAAA` *(or `A`)*
   - **Name**: `api` *(creates `api.aftabx.tech`)*
   - **IPv6 Address**: `100::` *(standard Cloudflare placeholder IP for Worker-only subdomains; or `A` -> `192.0.2.1`)*
   - **Proxy status**: **Proxied (orange cloud — REQUIRED for Worker Routes!)**
   - Click **Save**.
2. Assign **Routes** to each Worker:
   - **API Proxy V1**: `api.aftabx.tech/api/*` (Zone: `aftabx.tech`)
   - **API Proxy V2**: `api.aftabx.tech/V2/api/*` (Zone: `aftabx.tech`)

---

## 7. Deploy API Proxy V1 (`worker.js`)

`worker.js` uses **ES Module syntax** (`export default { async fetch(request, env, ctx) ... }`) and already has `ALLOWED_ORIGINS` set to `https://aftabx.tech` and `https://www.aftabx.tech`.

### Option A: Deploy via Cloudflare Dashboard (No CLI)

1. Go to **Cloudflare Dashboard** -> **Workers & Pages** -> **Create** -> **Workers** tab.
2. Click **Start with Hello World!** (or **Create Worker**).
3. Name it `ewu-api-proxy` and click **Deploy**.
4. Click **Edit code**, replace all code with the full contents of [`worker.js`](worker.js), and click **Deploy**.
5. Open the Worker's **Settings** -> **Bindings** (or **Variables and Secrets**):
   - **KV Namespace Binding**:
     - Variable name: `ADMIN_KV`
     - KV Namespace: select `ADMIN_KV`
   - **Variables / Secrets**:
     - `ADMIN_USERNAME` = your chosen admin username
     - `ADMIN_PASSWORD_HASH` = your 64-character SHA-256 hex hash (select **Secret** / Encrypt)
6. Open **Settings** -> **Domains & Routes**:
   - **If using Method 1 (Recommended):** Click **+ Add** -> **Custom Domain** -> enter `api.aftabx.tech` -> **Add domain**.
   - **If using Method 2:** Click **+ Add** -> **Route** -> Route: `api.aftabx.tech/api/*`, Zone: `aftabx.tech` -> **Add route**.

### Option B: Deploy via Wrangler CLI

Create `wrangler.toml` (keep it out of git or without secrets):

```toml
name = "ewu-api-proxy"
main = "worker.js"
compatibility_date = "2025-01-01"

[[kv_namespaces]]
binding = "ADMIN_KV"
id = "YOUR_ADMIN_KV_NAMESPACE_ID"

# Method 1 (Custom Domain - recommended):
routes = [
  { pattern = "api.aftabx.tech", custom_domain = true }
]

# OR Method 2 (Route only - requires manual proxied DNS record for `api`):
# [[routes]]
# pattern = "api.aftabx.tech/api/*"
# zone_name = "aftabx.tech"
```

Deploy and set secrets:
```bash
npx wrangler deploy -c wrangler.toml
npx wrangler secret put ADMIN_USERNAME -c wrangler.toml
npx wrangler secret put ADMIN_PASSWORD_HASH -c wrangler.toml
```

---

## 8. Deploy API Proxy V2 (`V2/workerV2.js`)

`V2/workerV2.js` uses **Service Worker syntax** (`addEventListener('fetch', ...)`), handles `/V2/api/*` endpoints, and already has `ALLOWED_ORIGINS` set to `https://aftabx.tech` and `https://www.aftabx.tech` (with analytics forwarding to `https://api.aftabx.tech/api/analytics`).

### Option A: Deploy via Cloudflare Dashboard (No CLI)

1. Go to **Cloudflare Dashboard** -> **Workers & Pages** -> **Create** -> **Workers** tab.
2. Click **Start with Hello World!** -> name it `ewu-api-proxy-v2` -> click **Deploy**.
3. Click **Edit code**, replace all code with the full contents of [`V2/workerV2.js`](V2/workerV2.js), and click **Deploy**.
4. **(Recommended)** Bind the shared KV namespace so V2 enforces site closure & IP/UserID blocklists and writes logs to the same store:
   - Go to **Settings** -> **Bindings** -> **Add** -> **KV Namespace**.
   - Variable name: `ADMIN_KV`
   - KV Namespace: select the same `ADMIN_KV` namespace created in Step 5.
5. Configure the **Worker Route** under **Settings** -> **Domains & Routes**:
   - Click **+ Add** -> **Route**.
   - **Route**: `api.aftabx.tech/V2/api/*`
   - **Zone**: `aftabx.tech`
   - Click **Add route**.
   *(Do **not** add `api.aftabx.tech` as a Custom Domain on V2 — V2 must use the `/V2/api/*` Route so V1 continues handling `/api/*`.)*

### Option B: Deploy via Wrangler CLI

Create `wrangler.v2.toml`:

```toml
name = "ewu-api-proxy-v2"
main = "V2/workerV2.js"
compatibility_date = "2025-01-01"

[[kv_namespaces]]
binding = "ADMIN_KV"
id = "YOUR_ADMIN_KV_NAMESPACE_ID"

[[routes]]
pattern = "api.aftabx.tech/V2/api/*"
zone_name = "aftabx.tech"
```

Deploy V2:
```bash
npx wrangler deploy -c wrangler.v2.toml
```

---

## 9. Frontend Files to Update for the New Domain

Updating `ALLOWED_ORIGINS` in `worker.js` and `V2/workerV2.js` allows `https://aftabx.tech` to call the Workers, **but the frontend JavaScript and HTML files must also point to `https://api.aftabx.tech` and `https://aftabx.tech`** (otherwise browsers will still call the expired `api.aftabkabir.me`).

Update all occurrences of `api.aftabkabir.me` -> `api.aftabx.tech` and `aftabkabir.me` -> `aftabx.tech` in:

- **JavaScript API configs:**
  - `assets/js/features.js`
  - `assets/js/auth.js`
  - `assets/js/advise.js`
  - `assets/js/department-courses.js`
  - `assets/js/system-metrics.js`
  - `sui7/js/app.js`
  - `V2/assets/js/main.js`
- **HTML inline API calls & SEO (`canonical`, `og:url`, JSON-LD):**
  - `index.html`, `login.html`, `advise.html`, `dashboard.html`, `department-courses.html`, `documentation.html`, `learn-more.html`
  - `V2/index.html`, `V2/login.html`, `V2/courses.html`

Once updated, commit and push to `cyberwarden5/ewu-course` (`main`) — Cloudflare Pages will automatically redeploy the updated frontend.

*(Leave `mailto:contact.aftabkabir@proton.me` unchanged if that is still your contact email.)*

---

## 10. Managing SUI7 Admin Panel

### Accessing the Admin Panel
1. Open `https://aftabx.tech/sui7/` (or `/sui7`).
2. Log in with `ADMIN_USERNAME` and the **raw password** whose SHA-256 hash you stored in `ADMIN_PASSWORD_HASH`.

### Features Backed by `ADMIN_KV`
- **IP & Activity Logs**: Cloudflare automatically supplies `CF-Connecting-IP` to the Workers, logging visitor IPs chronologically across V1 and V2.
- **Blocking an IP or Student ID**: Copy an IP or Student ID from the SUI7 dashboard and add it to the blocklist; both Workers immediately return `403` for blocked entries.
- **Site Closure Mode**: Toggle **Site Closure Mode** to `ON` in SUI7. `ADMIN_KV` updates immediately, `system-metrics.js` displays the maintenance overlay on the frontend, and both Workers block non-admin API traffic with `503`.
- **Feature Gates**: Change individual feature statuses (`active`, `beta`, `maintenance`, `under_work`, `coming_soon`, `off`) in real time via `/api/admin/features`.

---

## 11. Verification & Troubleshooting

### 1. Check DNS Resolution
Run in PowerShell or terminal:
```powershell
Resolve-DnsName aftabx.tech -Type A
Resolve-DnsName www.aftabx.tech -Type A
Resolve-DnsName api.aftabx.tech -Type A
```
All three should resolve to Cloudflare proxy IP addresses once Cloudflare Pages custom domains and the Worker Custom Domain/Route are active.

### 2. Test V1 and V2 Workers & CORS
```bash
# Test V1 status endpoint + CORS header
curl -i -H "Origin: https://aftabx.tech" https://api.aftabx.tech/api/status

# Test V1 CORS preflight
curl -i -X OPTIONS -H "Origin: https://aftabx.tech" \
  -H "Access-Control-Request-Method: POST" \
  https://api.aftabx.tech/api/auth/login

# Test V2 status endpoint + CORS header
curl -i -H "Origin: https://aftabx.tech" https://api.aftabx.tech/V2/api/status
```
Confirm responses include:
- `Access-Control-Allow-Origin: https://aftabx.tech`
- `Access-Control-Allow-Credentials: true`

### 3. Common Issues

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| **Cloudflare Pages custom domain stuck on "Verifying"** | Conflicting `A`/`AAAA`/`CNAME` record exists in DNS for `@` or `www` | Delete old records for `@`/`www` in **DNS -> Records**, then remove and re-add the custom domain in Pages |
| **`ERR_TOO_MANY_REDIRECTS` on `aftabx.tech`** | Cloudflare SSL/TLS mode is set to **Flexible** | Set Cloudflare **SSL/TLS -> Overview** to **Full (strict)** |
| **Cannot add Custom Domain `api.aftabx.tech` to V1** | Manual `api` DNS record already exists | Delete the manual `api` DNS record first, then add the Custom Domain (or use Method 2 Routes instead) |
| **V2 requests (`/V2/api/*`) return `404` from V1** | V2 Route is missing or misspelled | Ensure V2 has Route `api.aftabx.tech/V2/api/*` on zone `aftabx.tech` (Routes override V1's Custom Domain) |
| **CORS error in browser console** | Origin mismatch or trailing slash in `ALLOWED_ORIGINS` | Origins must be `https://aftabx.tech` and `https://www.aftabx.tech` (no trailing `/`), and requests must use `credentials: 'include'` |
| **Login works but next API call returns `401`** | Cross-site cookie blocked or HTTP used | Ensure both frontend and `api.aftabx.tech` use `https://` (`Secure; SameSite=None` requires HTTPS) |

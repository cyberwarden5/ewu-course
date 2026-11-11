# Complete Setup & Deployment Guide (`aftabx.tech`)

This guide provides step-by-step instructions to host the **EWU Course Schedule Tool** on **GitHub Pages** behind **Cloudflare**, configure your custom domain (`https://aftabx.tech/`), create the `api.aftabx.tech` subdomain, and deploy both **Cloudflare Workers** (**API Proxy V1** and **API Proxy V2**) along with **Cloudflare KV** and the **SUI7 Admin Panel**.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Add `aftabx.tech` to Cloudflare](#2-add-aftabxtech-to-cloudflare)
3. [Configure GitHub Pages & Custom Domain (`aftabx.tech`)](#3-configure-github-pages--custom-domain-aftabxtech)
4. [Configure Cloudflare DNS & SSL for GitHub Pages](#4-configure-cloudflare-dns--ssl-for-github-pages)
5. [(Optional) Using Cloudflare Pages Custom Domain Instead](#5-optional-using-cloudflare-pages-custom-domain-instead)
6. [Create Cloudflare KV & Admin Credentials (`ADMIN_KV`)](#6-create-cloudflare-kv--admin-credentials-admin_kv)
7. [Create `api.aftabx.tech` Subdomain & Routing Strategy](#7-create-apiaftabxtech-subdomain--routing-strategy)
8. [Deploy API Proxy V1 (`worker.js`)](#8-deploy-api-proxy-v1-workerjs)
9. [Deploy API Proxy V2 (`V2/workerV2.js`)](#9-deploy-api-proxy-v2-v2workerv2js)
10. [Frontend Files to Update for the New Domain](#10-frontend-files-to-update-for-the-new-domain)
11. [Managing SUI7 Admin Panel](#11-managing-sui7-admin-panel)
12. [Verification & Troubleshooting](#12-verification--troubleshooting)

---

## 1. Architecture Overview

| Component | Host / Path | Source File | Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend (Main + SUI7 + V2 UI)** | `https://aftabx.tech/` | Root HTML/CSS/JS, `sui7/`, `V2/` | Static site hosted on GitHub Pages (or Cloudflare Pages) |
| **API Proxy V1 Worker** | `https://api.aftabx.tech/api/*` | `worker.js` | Main portal proxy, auth, SUI7 admin APIs, KV integration |
| **API Proxy V2 Worker** | `https://api.aftabx.tech/V2/api/*` | `V2/workerV2.js` | Legacy V2 course filter API proxy |
| **Database / State** | Bound as `ADMIN_KV` | Cloudflare KV | Stores feature flags, logs, blocked IPs/IDs, site closure mode |

> **Why `api.aftabx.tech` uses one subdomain for both Workers:**
> V1 handles `/api/*` and V2 handles `/V2/api/*`. Both sit behind `https://api.aftabx.tech` so `SameSite=None; Secure` session cookies (`ASP.NET_SessionId`) and CORS work cleanly from `https://aftabx.tech`.

---

## 2. Add `aftabx.tech` to Cloudflare

1. Sign in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Click **Add a site** (or **+ Add** -> **Domain**).
3. Enter `aftabx.tech` and select the **Free** plan.
4. Cloudflare will give you **two Cloudflare Nameservers** (e.g., `alice.ns.cloudflare.com` and `bob.ns.cloudflare.com`).
5. Open your domain registrar (where you bought `aftabx.tech` — e.g., Namecheap, Porkbun, GoDaddy, etc.) and replace the existing nameservers with the two Cloudflare nameservers.
6. Wait until Cloudflare shows **Active** for `aftabx.tech` (usually 5–30 minutes).

---

## 3. Configure GitHub Pages & Custom Domain (`aftabx.tech`)

> **Important:** Set the custom domain in GitHub *before* or *right as* you add DNS records so GitHub claims your domain and prevents subdomain takeover.

1. Push your repository to GitHub (e.g. `https://github.com/<your-username>/<your-repo>`).
2. **(Recommended) Add a `CNAME` file** in the root of your repository (and in your publishing branch) containing a single line with no `https://` or trailing slash:
   ```text
   aftabx.tech
   ```
3. In your GitHub repository, go to **Settings** -> **Pages**.
4. Under **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` (or your publish branch) and folder `/ (root)`, then click **Save**.
5. Under **Custom domain**:
   - Enter `aftabx.tech` and click **Save**.
   - *(Do not check **Enforce HTTPS** yet if the DNS check fails — come back and enable it in Step 4 after DNS propagates.)*

> **Note on Clean URLs with GitHub Pages:**
> GitHub Pages resolves extensionless URLs like `/advise` to `/advise.html` automatically, and `dashboard.js` falls back to `/slug.html` if needed. Keep in mind that `_redirects` and `_headers` only apply if you host on Cloudflare Pages / Netlify, and `.htaccess` only applies to Apache.

---

## 4. Configure Cloudflare DNS & SSL for GitHub Pages

### Step 4A: Add GitHub Pages DNS Records in Cloudflare

Go to **Cloudflare Dashboard** -> select `aftabx.tech` -> **DNS** -> **Records** -> **Add record**.

Remove any old/parking `A`, `AAAA`, or `CNAME` records for `@` and `www`, then add the following:

1. **Apex / Root Domain (`@` = `aftabx.tech`) — 4 `A` Records (Required):**

   | Type | Name | IPv4 Address | Proxy Status (Initial) |
   | :--- | :--- | :--- | :--- |
   | `A` | `@` | `185.199.108.153` | **DNS only** (grey cloud) |
   | `A` | `@` | `185.199.109.153` | **DNS only** (grey cloud) |
   | `A` | `@` | `185.199.110.153` | **DNS only** (grey cloud) |
   | `A` | `@` | `185.199.111.153` | **DNS only** (grey cloud) |

2. **IPv6 Support (`@`) — 4 `AAAA` Records (Recommended):**

   | Type | Name | IPv6 Address | Proxy Status (Initial) |
   | :--- | :--- | :--- | :--- |
   | `AAAA` | `@` | `2606:50c0:8000::153` | **DNS only** (grey cloud) |
   | `AAAA` | `@` | `2606:50c0:8001::153` | **DNS only** (grey cloud) |
   | `AAAA` | `@` | `2606:50c0:8002::153` | **DNS only** (grey cloud) |
   | `AAAA` | `@` | `2606:50c0:8003::153` | **DNS only** (grey cloud) |

3. **`www` Subdomain (`www.aftabx.tech`) — 1 `CNAME` Record:**

   | Type | Name | Target | Proxy Status (Initial) |
   | :--- | :--- | :--- | :--- |
   | `CNAME` | `www` | `<your-github-username>.github.io` | **DNS only** (grey cloud) |

   *(Replace `<your-github-username>` with your actual GitHub username or organization name — do NOT include the repo name.)*

### Step 4B: Issue GitHub SSL Certificate & Enable Cloudflare Proxy

1. Wait 2–10 minutes with **DNS only (grey cloud)** enabled.
2. Go back to GitHub **Settings** -> **Pages**:
   - Wait until the DNS check shows **DNS check successful**.
   - Check **Enforce HTTPS** once the checkbox becomes available (GitHub issues a Let's Encrypt certificate for `aftabx.tech` and `www.aftabx.tech`).
3. **(Recommended) Enable Cloudflare Proxy & Strict SSL:**
   - In **Cloudflare Dashboard** -> `aftabx.tech` -> **SSL/TLS** -> **Overview**, set encryption mode to **Full (strict)**.
     > **Warning:** Never use **Flexible** SSL mode when GitHub **Enforce HTTPS** is enabled — it causes an infinite `ERR_TOO_MANY_REDIRECTS` loop.
   - In **SSL/TLS** -> **Edge Certificates**, enable **Always Use HTTPS** and **Automatic HTTPS Rewrites**.
   - Return to **DNS** -> **Records** and switch the `A`, `AAAA`, and `www` `CNAME` records from **DNS only** to **Proxied (orange cloud)** so traffic benefits from Cloudflare CDN, DDoS protection, and caching.

---

## 5. (Optional) Using Cloudflare Pages Custom Domain Instead

If you ever choose to host the static frontend directly on **Cloudflare Pages** instead of GitHub Pages (which also activates `_redirects` and `_headers`):

1. **Cloudflare Dashboard** -> **Workers & Pages** -> **Create** -> **Pages** -> **Connect to Git**.
2. Select your repository with:
   - **Build command**: *(leave empty)*
   - **Build output directory**: `/`
3. After deployment, open your Pages project -> **Custom domains** -> **Set up a custom domain**.
4. Add `aftabx.tech` (and optionally `www.aftabx.tech`). Cloudflare automatically adds the required DNS `CNAME` records and provisions the SSL certificate.

*(Do not use both GitHub Pages and Cloudflare Pages on `aftabx.tech` at the same time — pick one for the frontend.)*

---

## 6. Create Cloudflare KV & Admin Credentials (`ADMIN_KV`)

Both Workers use Cloudflare KV (`ADMIN_KV`) for maintenance mode, IP/UserID blocklists, logs, analytics, and feature toggles.

### Step 6A: Create the KV Namespace

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

### Step 6B: Generate Admin Password Hash (`SHA-256`)

Pick a strong admin password (for example `MySuperSecretPass`) and generate its lowercase SHA-256 hex digest:

- **Using Node.js (Windows PowerShell / Terminal):**
  ```bash
  node -e "console.log(require('crypto').createHash('sha256').update('MySuperSecretPass').digest('hex'))"
  ```
- **Or using PowerShell directly:**
  ```powershell
  [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes("MySuperSecretPass"))).Replace("-", "").ToLower()
  ```

Keep these two values ready for API Proxy V1:
- `ADMIN_USERNAME` (Plaintext variable or secret, e.g. `admin`)
- `ADMIN_PASSWORD_HASH` (The 64-char SHA-256 hex string)

---

## 7. Create `api.aftabx.tech` Subdomain & Routing Strategy

Because you have **two separate Workers** sharing the same subdomain (`api.aftabx.tech`), you have **two supported ways** to wire DNS + Workers in Cloudflare:

### Method 1 (Recommended): Custom Domain on V1 + Route on V2

In Cloudflare Workers, **Routes always take precedence over Custom Domains** on the same hostname.

- **API Proxy V1 (`worker.js`)** gets **Custom Domain**: `api.aftabx.tech`
  - Cloudflare automatically creates and manages the SSL certificate and DNS record for `api.aftabx.tech`.
  - **Do NOT** manually create an `A`, `AAAA`, or `CNAME` record for `api` in Cloudflare DNS when using this method (otherwise Cloudflare will say a DNS record already exists).
- **API Proxy V2 (`V2/workerV2.js`)** gets **Route**: `api.aftabx.tech/V2/api/*` (Zone: `aftabx.tech`)
  - Requests to `https://api.aftabx.tech/V2/api/*` match V2's Route first.
  - All other requests (`https://api.aftabx.tech/api/*`) go directly to V1's Custom Domain.

### Method 2 (Manual DNS Subdomain + Routes on Both)

If you prefer managing the `api` DNS record yourself and using **Routes** for both Workers:

1. Go to **Cloudflare Dashboard** -> `aftabx.tech` -> **DNS** -> **Records** -> **Add record**:
   - **Type**: `AAAA` *(or `A`)*
   - **Name**: `api` *(creates `api.aftabx.tech`)*
   - **IPv6 Address**: `100::` *(standard Cloudflare placeholder IP for Worker-only subdomains; or use `A` -> `192.0.2.1`)*
   - **Proxy status**: **Proxied (orange cloud — REQUIRED for Worker Routes!)**
   - Click **Save**.
2. Assign **Routes** to each Worker:
   - **API Proxy V1**: `api.aftabx.tech/api/*` (Zone: `aftabx.tech`)
   - **API Proxy V2**: `api.aftabx.tech/V2/api/*` (Zone: `aftabx.tech`)

> **Important:** Pick **either** Method 1 **or** Method 2. Do not leave a manual `api` DNS record if you want to attach `api.aftabx.tech` as a Worker Custom Domain.

---

## 8. Deploy API Proxy V1 (`worker.js`)

`worker.js` uses **ES Module syntax** (`export default { async fetch(request, env, ctx) ... }`) and already has `ALLOWED_ORIGINS` updated to `https://aftabx.tech` and `https://www.aftabx.tech`.

### Option A: Deploy via Cloudflare Dashboard (No CLI)

1. Go to **Cloudflare Dashboard** -> **Workers & Pages** -> **Create**.
2. Choose **Start with Hello World!** (or **Create Worker**).
3. Name it `ewu-api-proxy` (or `ewu-portal-worker`) and click **Deploy**.
4. Click **Edit code**, replace all code with the full contents of `worker.js`, and click **Deploy**.
5. Go to the Worker's **Settings** -> **Bindings** (or **Variables and Secrets**):
   - **KV Namespace Binding**:
     - Variable name: `ADMIN_KV`
     - KV Namespace: select `ADMIN_KV`
   - **Variables / Secrets**:
     - `ADMIN_USERNAME` = your chosen admin username
     - `ADMIN_PASSWORD_HASH` = your 64-character SHA-256 hex hash (mark as **Secret**)
6. Go to **Settings** -> **Domains & Routes**:
   - **If using Method 1 (Recommended):** Click **+ Add** -> **Custom Domain** -> enter `api.aftabx.tech` -> **Add domain**.
   - **If using Method 2:** Click **+ Add** -> **Route** -> Route: `api.aftabx.tech/api/*`, Zone: `aftabx.tech` -> **Add route**.

### Option B: Deploy via Wrangler CLI

Create a folder (or temporary `wrangler.v1.toml` / `wrangler.toml`) for V1:

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

# OR Method 2 (Route only - requires proxied DNS record for `api`):
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

## 9. Deploy API Proxy V2 (`V2/workerV2.js`)

`V2/workerV2.js` uses **Service Worker syntax** (`addEventListener('fetch', ...)`), serves `/V2/api/*` endpoints, and already has `ALLOWED_ORIGINS` updated to `https://aftabx.tech` and `https://www.aftabx.tech` (and telemetry pointing to `https://api.aftabx.tech/api/analytics`).

### Option A: Deploy via Cloudflare Dashboard (No CLI)

1. Go to **Cloudflare Dashboard** -> **Workers & Pages** -> **Create**.
2. Choose **Start with Hello World!** -> name it `ewu-api-proxy-v2` -> click **Deploy**.
3. Click **Edit code**, replace all code with the full contents of `V2/workerV2.js`, and click **Deploy**.
4. **(Recommended)** Bind the shared KV namespace so V2 respects site closure & IP/UserID blocklists and writes logs to the same store:
   - Go to **Settings** -> **Bindings** -> **Add** -> **KV Namespace**.
   - Variable name: `ADMIN_KV`
   - KV Namespace: select the same `ADMIN_KV` namespace created in Step 6.
5. Configure the **Worker Route** under **Settings** -> **Domains & Routes**:
   - Click **+ Add** -> **Route**.
   - **Route**: `api.aftabx.tech/V2/api/*`
   - **Zone**: `aftabx.tech`
   - Click **Add route**.
   *(Do NOT add `api.aftabx.tech` as a Custom Domain on V2 — V2 must use the `/V2/api/*` Route so V1 continues handling `/api/*`.)*

### Option B: Deploy via Wrangler CLI

Create a `wrangler.v2.toml` inside `V2/` (or reference `V2/workerV2.js`):

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

## 10. Frontend Files to Update for the New Domain

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

*(Leave `mailto:contact.aftabkabir@proton.me` unchanged if that is still your contact email.)*

---

## 11. Managing SUI7 Admin Panel

### Accessing the Admin Panel
1. Open `https://aftabx.tech/sui7/` (or `/sui7/index.html`).
2. Log in with the `ADMIN_USERNAME` and the **raw password** whose SHA-256 hash you stored in `ADMIN_PASSWORD_HASH`.

### Features Backed by `ADMIN_KV`
- **IP & Activity Logs**: Cloudflare automatically supplies `CF-Connecting-IP` to the Workers, logging visitor IPs chronologically across V1 and V2.
- **Blocking an IP or Student ID**: Copy an IP or Student ID from the SUI7 dashboard and add it to the blocklist; both Workers immediately return `403` for blocked entries.
- **Site Closure Mode**: Toggle **Site Closure Mode** to `ON` in SUI7. `ADMIN_KV` updates immediately, `system-metrics.js` displays the maintenance overlay on the frontend, and both Workers block non-admin API traffic with `503`.
- **Feature Gates**: Change individual feature statuses (`active`, `beta`, `maintenance`, `under_work`, `coming_soon`, `off`) in real time via `/api/admin/features`.

---

## 12. Verification & Troubleshooting

### 1. Check DNS Resolution
Run in PowerShell or terminal:
```powershell
Resolve-DnsName aftabx.tech -Type A
Resolve-DnsName www.aftabx.tech -Type CNAME
Resolve-DnsName api.aftabx.tech -Type A
```
- When **Proxied**, `aftabx.tech` and `api.aftabx.tech` resolve to Cloudflare edge IPs.
- During initial GitHub verification (**DNS only**), `aftabx.tech` must return the four `185.199.108–111.153` GitHub IPs.

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
| **`ERR_TOO_MANY_REDIRECTS` on `aftabx.tech`** | Cloudflare SSL/TLS mode is **Flexible** while GitHub **Enforce HTTPS** is on | Set Cloudflare **SSL/TLS** -> **Overview** to **Full (strict)** |
| **GitHub "Enforce HTTPS" checkbox disabled** | Cloudflare Proxy (orange cloud) blocked initial domain check | Temporarily set `@` and `www` DNS records to **DNS only**, wait for GitHub SSL issuance, check **Enforce HTTPS**, then re-enable Proxy |
| **Cannot add Custom Domain `api.aftabx.tech` to V1** | Manual `api` DNS record already exists | Delete the manual `api` DNS record first, then add the Custom Domain (or use Method 2 Routes instead) |
| **V2 requests (`/V2/api/*`) return `404` from V1** | V2 Route is missing or misspelled | Ensure V2 has Route `api.aftabx.tech/V2/api/*` on zone `aftabx.tech` (Routes override V1's Custom Domain) |
| **CORS error in browser console** | Origin mismatch or trailing slash in `ALLOWED_ORIGINS` | Origins must be `https://aftabx.tech` and `https://www.aftabx.tech` (no trailing `/`), and requests must use `credentials: 'include'` |
| **Login works but next API call returns `401`** | Third-party/cross-site cookie blocked or HTTP used | Ensure both frontend and `api.aftabx.tech` use `https://` (`Secure; SameSite=None` requires HTTPS) |

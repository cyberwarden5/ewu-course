# EWU Course Portal — Full Site Audit & Improvement Plan

**Scope:** `C:/xampp/htdocs/aftabkabir.me` — static frontend (16 pages, ~9,200 lines HTML, ~16,700 lines JS), `worker.js` Cloudflare Worker (~2,230 lines), admin panel (`sui7/`), legacy `V2/`, docs (`README.md`, `SETUP.md`).

**Reviewed:** code, architecture, security, UX/UI (desktop + mobile dashboard screenshots in `scratch/`), SEO, deployment config.

> This document is review-only. No code was changed.

---

## 1. Current state summary

**What works well**

- Clean separation: one Worker API proxy + static frontend, no build step needed.
- Consistent page initializer contract (`initXxxPage` + `__EWU_AJAX_NAV__`) with the AJAX router in `dashboard.js` — a solid pattern for a no-framework site.
- Feature gating driven by `GET /api/status` with KV overrides from the admin panel — flexible and already wired end-to-end (worker → features.js → page gates → dashboard cards).
- Good defensive habits: `fetchJsonWithRetry`, `fetchWithRetry` with timeout + backoff on the Worker, ETag on `/api/status`, reflected-origin CORS with `Vary: Origin` (never `*`), `Secure; HttpOnly; SameSite=None` cookie.
- Feature-page breadth is genuinely useful for students (advise, department, pre-advising, degree review, curriculum, schedule, planner, ledger, grades, CGPA).
- Docs (`README.md`, `SETUP.md`) are unusually complete for a hobby project.

**Biggest risks (ranked)**

| # | Risk | Where |
|---|------|-------|
| 1 | No rate limiting on `/api/auth/login` | `worker.js` |
| 2 | No CSP / frame-ancestors / HSTS / Permissions-Policy | `_headers`, `.htaccess` |
| 3 | Assets cached 86,400s with **no cache-busting** → users run stale JS for up to a day after every deploy | `_headers`, `.htaccess` |
| 4 | Tailwind CDN in production (not designed for prod; big render-blocking JS, config inlined per page) | all pages |
| 5 | Login brute-forces hit the *real portal* through the proxy — abuse reflects on EWU | `worker.js` |
| 6 | Zero automated tests / CI (only ad-hoc scripts in `scratch/`) | repo-wide |

---

## 2. Fix list (bugs & issues found)

### 2.1 Frontend bugs / inconsistencies

1. **`advise.html` has no favicon.** Every other page has `rel="icon"`; `advise.html` does not.
2. **README vs. reality on concluded events.** README promises "Strict Concluded Event Filtering — strictly excludes concluded past events", but the dashboard screenshots show past events (Jan 23, Feb 21, Apr 26) listed under *Upcoming Academic Events* with a "Concluded" badge. Either the filter was changed to label-instead-of-hide (then update the README) or the parser misclassifies upcoming dates (then fix `dashboard.js` ~line 970–1030). Verify against live data first.
3. **Mobile truncation contradicts README.** Degree line truncates to "B.Sc. in Computer Science and Engi…" on mobile; README claims "zero overflow". The responsive identity-line variant described in the README (`2025-2-60-331 • B.Sc. in CSE • Fall-2026`) is not what the current mobile screenshot shows.
4. **"Upcoming Academic Events" header on mobile** wraps awkwardly (title on two lines, "View All" broken onto two lines, semester pill squeezed). Needs a mobile-specific header layout.
5. **Advisor chip formatting:** `Ms. Fouzia Risdin(FZRN)` — missing space before the parenthesised code. Minor, but appears on the hero.
6. **`onclick=` inline handlers everywhere** (2–11 per page). Breaks under a future CSP, duplicates logic, and is invisible to the AJAX router cleanup. Migrate to `addEventListener` with `data-action` attributes.
7. **Duplicated `API_BASE_URL`.** `features.js` publishes `window.API_BASE_URL`, but `auth.js`, `system-metrics.js`, and others hardcode their own copy. One rename = silent breakage. Consolidate to a single source.
8. **localStorage/sessionStorage key sprawl.** `studentId`, `ewu_student_id`, `userId`, `_visited_*`, `_ewu_feature_status`, `ewu_just_logged_out`, `ewu_auto_refresh_delay` — several pages check different fallback chains (`dashboard.js:20-22`, `curriculum.js:44,213,450`). Centralise in one storage helper.
9. **`profile.html` mentor email** renders as `href="#"` placeholder until data loads — dead link flash for slow connections.
10. **`advise.html` / `index.html` / `learn-more.html` have no `<main>` element.** The AJAX router falls back to body extraction, but consistent `<main>` would make routing and screen-reader landmarks uniform.
11. **`system-metrics.js` polling:** `setInterval` + several `setTimeout(checkStatus)` chains; no `prefers-reduced-motion` or visibility-change pause. Pausing polling when `document.hidden` saves API calls and battery.

### 2.2 Worker (`worker.js`) issues

1. **No rate limiting** on `/api/auth/login` (or any endpoint). Add a KV/DO-based limiter (e.g. 5 attempts / 15 min per IP + per user ID) or Cloudflare Turnstile. This is the highest-priority fix.
2. **`/api/analytics` is unauthenticated POST** with no cap — can be spammed to bloat KV. Add rate limit + payload size cap + schema validation.
3. **KV read amplification:** every non-admin request does up to 4 KV reads (`site_closure_mode`, `blocked_ips`, `custom_notice`, `feature_status`). Cache these in isolate memory with a short TTL (10–30s) — cuts latency and KV billing.
4. **Session cookie `Max-Age=3600` is fixed**, but the portal session may live longer/shorter. Consider refreshing the cookie TTL on validated requests, and short-circuiting to 401 when the portal rejects the session.
5. **Logout doesn't invalidate the portal session** — only clears the cookie. The upstream ASP.NET session stays live. Best effort: POST the portal's logout endpoint too.
6. **No server-side session store** — you can't revoke a student session. The admin panel has IP/user-ID blocking, but a "force logout all" (stored session IDs in KV, checked per request) would complete the story.
7. **Weak ETag hash** (`(hash<<5)-hash` 32-bit) on `/api/status` — fine in practice, but a real SHA-1/256 of the payload via `crypto.subtle` is nearly free and collision-safe.
8. **Admin sessions:** token stored as KV value `'true'`, no bound user/IP, no rotation on use, 24h fixed TTL. Acceptable for a personal admin panel, but consider binding `{user, ip, createdAt}` and revoking on password change.
9. **CORS allows localhost with credentials** (`SameSite=None` cookie). Convenient for dev, but any dev server on the student's machine qualifies as an allowed origin. Gate localhost origins behind an env flag / wrangler dev only.
10. **Missing security headers** on the API responses (CSP not critical for a JSON API, but `X-Content-Type-Options: nosniff` on all responses is cheap).

### 2.3 Headers / caching

1. **No cache-busting for `assets/*`:** HTML is `must-revalidate` (good) but JS/CSS are `max-age=86400` with no version query or content-hashed filenames. Every deploy risks a broken hybrid of new HTML + old JS. Fix: append `?v=<deploy-hash>` to script/link tags, or adopt content-hashed filenames via a tiny build step (see §3.1).
2. **Add missing headers** to `_headers` (and Apache):
   - `Content-Security-Policy` (start report-only, tighten later; needs `unsafe-inline` strategy decision because of inline onclick + inline Tailwind config)
   - `X-Frame-Options: DENY` / `frame-ancestors 'none'`
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (Cloudflare can also enforce)
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
3. **`_headers` per-page blocks are redundant** — the `/*.html` wildcard already covers all of them; only `/` and `/dashboard` need their own. Simplify.

---

## 3. Updates worth making (quality & performance)

### 3.1 Build step (small, optional but high leverage)

The site works without one, but three recurring pains (Tailwind CDN, cache-busting, 16-file header duplication) all point to a *tiny* build step. Suggested minimum toolchain:

- **Tailwind CLI** (local compile) instead of `cdn.tailwindcss.com` → removes ~100KB+ of runtime JS per page, removes the console warning, allows a real CSP.
- **Simple bundler or esbuild** → minified, content-hashed `assets/js/*.js`, automatic `?v=` in HTML via a 30-line script.
- Optional: a partial-includes step that injects the shared header/footer into all 16 pages at build time so nav edits touch one file (alternative: keep it runtime-injected like `system-metrics.js` does for banners).

### 3.2 Code structure

1. **Single source of truth for the feature registry** — it currently exists in three places: `worker.js` `FEATURE_DEFAULTS`, `features.js` `FEATURES`, and docs pages. Keep `FEATURES` in `features.js` and have the Worker treat unknown keys as defaults; or generate both from one JSON.
2. **Icon duplication** — inline SVGs are repeated across pages (lock, eye, chevron, etc.). Use an SVG sprite (`<use href="#icon-x">`) to cut HTML weight and guarantee consistency.
3. **`advise.js` is 1,149 lines and `course-planner.js` 1,101 lines** — both candidates for splitting into modules (data-fetch / render / export). Not urgent while the no-build approach holds; revisit if you add the build step.
4. **Remove dead code paths:** legacy aliases (`/api/class-schedule`, `/api/planner/routine`, `/api/student-profile` …) are harmless, but `V2/` and its `workerV2.js` are promoted on the landing page — decide if V2 stays a public experiment (then document it) or gets sunset (then remove links and the worker).

### 3.3 Accessibility (currently near-zero ARIA)

Concrete, low-effort wins in priority order:

1. Add `aria-label` to all icon-only buttons (hamburger, shuffle, refresh, close, eye/toggle).
2. Add a **skip-to-content** link on every page.
3. Convert inline `onclick` to listeners (also fixes keyboard support where handlers are on non-button elements).
4. Add `:focus-visible` styles to the shared CSS and verify tab order on the dashboard.
5. Check contrast for the gray-500-on-black secondary text (likely below 4.5:1) and the status pill colors.
6. `aria-live="polite"` regions for async loading/error messages on tool pages.
7. Tables (routine, ledger, grades) need `<caption>` or `aria-describedby`, plus `scope="col"` headers.

### 3.4 SEO / social

1. **`og:image` is missing everywhere** — link shares get no preview. Add a 1200×630 banner and reference it on all pages (plus `twitter:card: summary_large_image`).
2. `index.html` JSON-LD is decent; add `WebSite` + `BreadcrumbList` on inner pages, and `speakable` on `documentation.html`.
3. Add a **`sitemap.xml`** and `robots.txt` (currently neither exists in the repo root as far as tracked files show).
4. Add `<meta name="theme-color">` for mobile browser chrome (currently missing on all pages).
5. Consistent `<title>` pattern across tool pages (some read "EWU Portal", others vary).

### 3.5 PWA — biggest UX upgrade available

No manifest, no service worker today. For a student tool used on phones in class, this is the top *new capability*:

1. `manifest.webmanifest` + maskable icon set → installable app.
2. Service worker with:
   - offline shell caching (dashboard + login),
   - **stale-while-revalidate for tool pages/API data** → last-known routine/grades shown instantly even with weak campus Wi-Fi, with a "last updated" badge,
   - offline fallback page.
3. `theme-color` + standalone display mode to complete the app feel.

---

## 4. What more can be added (feature ideas)

### 4.1 Student-facing, ranked by value

| Feature | Why | Notes |
|---|---|---|
| **Class reminders** | "5 min until class" notifications from the live routine | Web Notifications API + the upcoming-class logic already in `dashboard.js`; pairs perfectly with the SW |
| **Seat-availability watcher during advising** | The #1 stress point each semester | Poll `/api/courses` on advise page, highlight seat deltas, optional notification |
| **Fee-due / scholarship expiry alerts** | Ledger data already parsed for the scholarship card | Reuse ledger parsing; surface "due within X days" |
| **Stale-while-revalidate offline data** | Campus Wi-Fi is flaky; instant open | Needs the service worker (§3.5) |
| **Global command palette (Ctrl/⌘+K)** | Jump to any tool/course without navigating | Small JS overlay; big "pro app" feel |
| **Graduation-date predictor** | Combines credits-remaining + semester pace | Data already on the degree-review page |
| **Routine sharing** (PNG/short link) | Students share schedules constantly | PNG export exists per README; add a compact share URL with section data encoded |
| **Per-semester GPA breakdown chart** | Grades page shows CGPA; add per-term bars | Chart.js or a tiny inline SVG chart |
| **Bangla language toggle** | Large part of the audience | Start with dashboard + tool names; `lang="bn"` alternate pages |
| **Light theme** | Dark-only today; readability outdoors | CSS variables would make this cheap — currently colors are hard-coded Tailwind classes |
| **Bookmarks/favourites for courses** | Personalisation in curriculum & department views | `localStorage`-backed, no backend needed |
| **"What's new" changelog toast** | You ship often; users don't notice | Version key in `localStorage`, read from `/api/status` |

### 4.2 Admin panel (`sui7`) additions

1. **Scheduled maintenance windows** (auto close/reopen at a set time) instead of the manual toggle.
2. **Session revocation** ("force logout all students") — needs the server-side session store from §2.2.
3. **Analytics visualisation**: retention (returning vs new user IDs), per-feature daily usage, peak hours — data is already collected in KV; only needs a read endpoint + chart.
4. **Feature status scheduling** (e.g. pre-advising → `coming_soon` until a date).
5. Exportable audit log (CSV download of `admin_audit_logs`).

### 4.3 Platform / engineering

1. **Playwright E2E suite** — you already have ad-hoc scripts in `scratch/` (`test_dashboard_playwright.js`); formalise 5 core flows: login → dashboard → open each tool → logout, plus the AJAX router back-navigation.
2. **GitHub Actions CI**: lint (`eslint`), link check, deploy Pages on push, deploy Worker with `wrangler` using repo secrets.
3. **`wrangler.toml` in repo** (there's only a stale `scratch/wrangler.v1.toml`) so deploys are reproducible.
4. **Uptime check**: `/api/admin/portal-ping` exists — add a scheduled cron (Workers Cron Trigger) that pings the portal and flips `custom_notice` if the portal is down.
5. Error tracking: a tiny `POST /api/client-error` endpoint + `window.onerror` beacon would reveal real-user JS errors you can't see today.

---

## 5. Housekeeping

1. **`Info/` and `scratch/` are local-only (gitignored) but contain source-of-truth notes** (`documentation.md`, portal samples). If they're valuable, move key files into a tracked `docs/` folder; otherwise fine as-is.
2. `.wrangler/tmp/*` deploy leftovers sit in the working tree (ignored by git) — safe to delete periodically.
3. **README drift:** sections claim behaviours the screenshots contradict (concluded-event filtering, mobile identity line). Re-verify and update after fixes.
4. `recommended-course.md` sits in the working tree but is gitignored — decide keep-local or track it.
5. Duplicate avatar SVG (`assets/images/avatar-default-svgrepo-com.svg` and `svg/avatar-default-svgrepo-com.svg`) — keep one.
6. `SETUP.md` should note the `sui7` admin-panel deployment path (it's currently documented for the Worker only, as far as the setup flow goes).

---

## 6. Suggested order of work

**Phase 1 — safety net & security (no UI change)**
1. Rate-limit `/api/auth/login` (+ `/api/analytics` cap).
2. Cache-busting for JS/CSS (`?v=` at minimum).
3. Add security headers (report-only CSP first).
4. KV read caching in the Worker.
5. Formalise Playwright smoke tests + CI so later changes are safe.

**Phase 2 — polish the existing experience**
6. Fix `advise.html` favicon; verify/fix concluded-event logic; fix mobile truncation & events-header layout.
7. Accessibility pass (labels, skip link, focus styles, contrast).
8. Replace Tailwind CDN with a local build; shared header injection.
9. SEO: `og:image`, `sitemap.xml`, `robots.txt`, `theme-color`.

**Phase 3 — new capabilities**
10. PWA (manifest + service worker + offline data).
11. Class reminders / notifications.
12. Seat watcher for advising season.
13. Command palette, GPA charts, light theme, Bangla toggle.

**Phase 4 — admin & ops**
14. Scheduled maintenance, session revocation, analytics charts, client error tracking, Workers Cron portal health check.

---

*End of audit — generated from code review of all 16 pages, `worker.js`, shared JS, headers config, and dashboard screenshots. No source files were modified.*

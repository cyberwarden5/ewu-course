# EWU Course Schedule Tool — by Aftab Kabir

A lightweight, mobile-first academic dashboard for **East West University (EWU)**
students. It provides course advising routines, department-wise offerings,
pre-advising, degree audit, curriculum, class schedules, a course planner,
account ledger, grade report, and a CGPA planner.

> **Disclaimer:** This is an independent educational project. It has **no
> official connection** with East West University. All logos and course data
> belong to their respective owners. If any authority requests removal, please
> contact `contact.aftabkabir@proton.me`.

---

## Architecture

The site is a **static frontend** (HTML/CSS/vanilla JS) that talks to a
**Cloudflare Worker** acting as an authenticated proxy to the EWU student
portal. No frontend build step is required.

```
aftabkabir.me/
├─ index.html                 Landing page
├─ login.html                 Portal login
├─ dashboard.html             Authenticated hub (AJAX navigation shell)
├─ advise.html                Recommended courses (advise.js — legacy IIFE)
├─ department-courses.html    Department-wise offerings
├─ pre-advising.html          Pre-advising record
├─ degree-review.html         Degree audit
├─ curriculum.html            Curriculum explorer
├─ class-schedule.html        Weekly timetable + routine export
├─ course-planner.html        Multi-combination planner
├─ account-ledger.html        Tuition ledger
├─ grade-report.html          Transcript + GPA/CGPA
├─ cgpa-planner.html          CGPA projection
├─ profile.html               Student profile
├─ documentation.html         Docs
├─ learn-more.html            Marketing page
├─ assets/
│  ├─ css/styles.css          Global base styles + shared header/responsive rules
│  ├─ css/features.css        Feature-page component styles
│  └─ js/
│     ├─ features.js          Shared registry/helpers (feature status, auth,
│     │                       formatting, grade parsing). IIFE → window.*
│     ├─ dashboard.js         Auth + dynamic cards + AJAX router
│     ├─ main.js              Mobile menu helper (static pages)
│     ├─ system-metrics.js    Site status closure/notice + analytics
│     ├─ retry-handler.js     Retry widget used by login/advise/department
│     └─ <page>.js            One initializer per feature page
├─ worker.js                  Cloudflare Worker (API proxy + admin endpoints)
├─ .htaccess                  Apache clean-URL rewrites + cache headers
├─ _redirects                 Cloudflare Pages/Netlify .html -> clean redirects
├─ _headers                   Cloudflare Pages cache/security headers
├─ sui7/                      Admin panel (static SPA)
└─ V2/                        Legacy alternate UI
```

### Clean URLs

Every page is served **without the `.html` extension** (e.g.
`https://aftabkabir.me/advise`, not `/advise.html`). This works for direct
access, internal links, refresh, and the AJAX router:

- On Apache, `.htaccess` 301-redirects `*.html` to the clean URL and internally
  serves the matching `.html` file for clean requests.
- On Cloudflare Pages / Netlify, `_redirects` 308-redirects `*.html` to the
  clean URL; the platforms resolve `/advise` from `/advise.html` automatically.
- The homepage is `/` (from `index.html`).
- All internal links, redirects, canonical/OG tags, and the feature registry use
  clean slugs. The dashboard router reads/writes clean paths and falls back to
  fetching `/slug.html` only if the clean URL is unavailable (e.g. a bare local
  static server without rewrites).


### Shared helpers (`assets/js/features.js`)
Wrapped in an IIFE and exposed on `window` so it can coexist with legacy page
scripts:

- `window.API_BASE_URL` — single source of truth for the Worker origin.
- `window.FEATURES`, `window.FEATURE_STATUS_META`, `window.fetchFeatureStatuses()`
  — feature gating driven by `GET /api/status`.
- `window.gateFeaturePage(key)`, `window.requireAuth()`, `window.performLogout()`
- Formatting/parsing helpers (`escapeHtml`, `parsePortalSlot`, `timeToMinutes`,
  `parseGradeReportHtml`, …).

---

## Navigation & AJAX routing (dashboard)

`dashboard.html` is a persistent shell: it keeps its own header/footer and swaps
the page body into `#dashboardPageView` without a full reload.

`dashboard.js` implements the router (`navigateToPage` / `restoreDashboardHome`):

1. Fetches the target HTML (cached in memory per URL) and parses it with
   `DOMParser`.
2. Extracts the `<main>` content (or the body for pages without `<main>`) into a
   detached fragment.
3. **Removes all `<script>` tags from the fragment** — scripts injected via
   `innerHTML` are inert and would otherwise make the loader think the real
   scripts were already present.
4. Copies page-scoped `<style>` blocks (e.g. print styles), tagged for cleanup.
5. Loads the page's external scripts in order, skipping the shell scripts
   (`tailwind`, `system-metrics.js`, `dashboard.js`, `main.js`).
6. Calls the page initializer explicitly (`window.initXxxPage()`).

### Initialization contract for every page script

Each feature script exposes a `window.initXxxPage` function and guards its own
auto-init with `window.__EWU_AJAX_NAV__`:

```js
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.__EWU_AJAX_NAV__) initPage();
    });
} else if (!window.__EWU_AJAX_NAV__) {
    initPage();
}
window.initXxxPage = initPage;
```

- **Direct load / refresh:** the script initializes itself once.
- **AJAX navigation:** the router sets `__EWU_AJAX_NAV__ = true` while loading
  scripts (so they don't self-init) and then calls the initializer once. This
  guarantees exactly one initialization and one API request per navigation.
- **Revisiting a page:** the script is already loaded, so the router still calls
  the initializer, which refetches fresh data.

Legacy scripts (`advise.js`, `department-courses.js`, `auth.js`) are wrapped in
IIFEs and publish their inline-handler functions (`handleLogout`, `loadCourses`,
`togglePassword`, …) on `window`. This prevents top-level `const` collisions with
`dashboard.js` that previously threw `SyntaxError: Identifier 'API_BASE_URL' has
already been declared` and silently blocked all API calls.

`cleanupPreviousPage()` stops page timers (`stopAutoRefresh`,
`stopDepartmentClock`) and removes injected page styles when leaving a view.

---

## API integration

- Base URL: `https://api.aftabkabir.me` (`window.API_BASE_URL`).
- All requests use `credentials: 'include'` so the Worker session cookie is sent.
- Feature pages retry transient failures via `fetchJsonWithRetry()` and treat
  `401` as a redirect to `login.html`.

Endpoints consumed by the frontend:

| Endpoint | Purpose |
|---|---|
| `GET /api/status` | Site/feature status, ETag-cached (drives cards & gates) |
| `GET /api/auth/status`, `POST /api/auth/login`, `POST /api/auth/logout` | Session |
| `GET /api/profile`, `GET /api/profile/photo` | Student profile & photo |
| `GET /api/semesters` | Semester list |
| `GET /api/preadvising` | Pre-advising courses |
| `GET /api/degree-review` | Degree audit |
| `GET /api/curriculum` | Curriculum catalog |
| `GET /api/schedule/semesters`, `GET /api/schedule` | Class schedule |
| `GET /api/routine` | Advising routine |
| `GET /api/ledger` | Account ledger |
| `GET /api/grades` | Grade report |
| `GET /api/courses`, `GET /api/options`, `GET/POST /api/department-courses` | Course offerings |
| `GET /api/academic-calendar` | Holidays (ICS export) |
| `POST /api/analytics` | Anonymous usage analytics |

---

## Cloudflare Worker (`worker.js`)

A single-module Worker (`export default { fetch }`) that proxies the portal.

### Routes
Student routes: `/api/auth/*`, `/api/profile`, `/api/profile/photo`,
`/api/semesters`, `/api/preadvising`, `/api/degree-review`, `/api/curriculum`,
`/api/schedule(/semesters)`, `/api/routine`, `/api/ledger`, `/api/grades`,
`/api/courses`, `/api/department-courses`, `/api/options`, `/api/academic-calendar`,
`/api/status`, `/api/analytics`.

Admin routes (Bearer token): `/api/admin/login`, `/dashboard`, `/config`,
`/features`, `/ip`, `/block-userid`, `/clear-logs`, `/portal-ping`.

### CORS & cookies
- Allowed origins: `https://aftabkabir.me`, `https://www.aftabkabir.me`, plus
  localhost/127.0.0.1 for development. The request `Origin` is reflected (never
  `*`) so `Access-Control-Allow-Credentials: true` works with `credentials:
  include`. Responses send `Vary: Origin`.
- The portal `ASP.NET_SessionId` is stored as a host-only
  `Secure; HttpOnly; SameSite=None` cookie on the API host and forwarded to the
  portal on each request.

### Required bindings / secrets (configure in Cloudflare, not in git)
- KV namespace binding: `ADMIN_KV`
- Vars/secrets: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (SHA-256 hex)

### Local development
The frontend is plain static files, so serve the project root with any static
server (e.g. `python -m http.server`) and open `index.html`. The Worker can be
run separately with Wrangler; **this repository does not deploy automatically**.

---

## Responsive behaviour

- The top navigation is **pinned to the viewport on every page except the index
  hero** (`position: sticky`, with `body > header` made sticky when pages wrap
  the nav in a `<header>`). Positioning lives in the shared `styles.css` so it
  does not depend on the Tailwind CDN.
- `overflow-x` on `body` uses `clip` (with a `hidden` fallback) so genuine
  horizontal overflow is contained without breaking sticky headers.
- On phones the header row wraps instead of clipping controls; wide tables live
  inside horizontal-scroll wrappers; fixed widgets shrink to the viewport.
- Layouts are optimised for low-end devices (hardware-accelerated transforms,
  `prefers-reduced-motion` fallbacks, light blur usage).

---

## Basic usage
1. Open the site and log in with your EWU student credentials
   (`YYYY-S-XX-XXX`).
2. The dashboard lists available tools based on the administrator-controlled
   feature status.
3. Open any tool — data loads automatically without a manual refresh.
4. Use each page's export (PDF/TXT/PNG/ICS) and refresh controls as needed.

## License / contact
Educational project by **Aftab Kabir** — `contact.aftabkabir@proton.me`.
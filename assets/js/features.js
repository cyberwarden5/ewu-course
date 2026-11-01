// ========================================
// Shared Feature Registry, Gate & Common Utilities
// EWU Course Portal - Main Website
// Wrapped in an IIFE and exposed on window so it can co-exist with the
// legacy page scripts (advise.js / department-courses.js) without clashing
// on top-level const declarations.
// ========================================

(function () {
    // Shared API base; legacy pages keep their own identical declaration.
    const API_BASE_URL = 'https://api.aftabkabir.me';

    /**
     * Feature metadata registry. The `key` must match the Worker's FEATURE_DEFAULTS keys.
     * `page` is the HTML file for the feature. `color` selects the card accent theme.
     */
    const FEATURES = {
        recommended: {
            key: 'recommended',
            name: 'Recommended Courses',
            page: 'advise.html',
            icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path><line x1="12" y1="6" x2="16" y2="6"></line><line x1="12" y1="10" x2="16" y2="10"></line></svg>',
            color: 'coral',
            active: true,
            description: 'Personalized course offerings from your advising routine with live seat availability.'
        },
        department: {
            key: 'department',
            name: 'Department-Wise Courses',
            page: 'department-courses.html',
            icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
            color: 'blue',
            active: true,
            description: 'Search and filter course offerings across all academic departments and semesters.'
        },
        schedule: {
            key: 'schedule',
            name: 'Class Schedule',
            page: 'class-schedule.html',
            icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
            color: 'cyan',
            active: true,
            description: 'Personalized weekly timetable grid with total registered credits.'
        },
        planner: {
            key: 'planner',
            name: 'Course Planner',
            page: 'course-planner.html',
            icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>',
            color: 'violet',
            active: true,
            description: 'Build, compare and validate multiple course combinations before advising.'
        },
        ledger: {
            key: 'ledger',
            name: 'Account Ledger',
            page: 'account-ledger.html',
            icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>',
            color: 'emerald',
            active: true,
            description: 'Track semester tuition balances, payments and scholarship adjustments.'
        },
        grades: {
            key: 'grades',
            name: 'Grade Report',
            page: 'grade-report.html',
            icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
            color: 'amber',
            active: true,
            description: 'Comprehensive academic transcript with term-by-term GPA history.'
        },
        cgpa: {
            key: 'cgpa',
            name: 'CGPA Planner',
            page: 'cgpa-planner.html',
            icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V10"></path><path d="M12 20V4"></path><path d="M6 20v-6"></path></svg>',
            color: 'rose',
            active: true,
            description: 'Project target GPA and forecast required grades for graduation goals.'
        },
        preadvising: {
            key: 'preadvising',
            name: 'Pre-Advising',
            page: 'pre-advising.html',
            icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="15" x2="15" y2="15"></line><line x1="9" y1="11" x2="15" y2="11"></line><line x1="9" y1="7" x2="11" y2="7"></line></svg>',
            color: 'teal',
            active: true,
            description: 'Review your pre-advised courses, total credit load, and upcoming semester offerings.'
        },
        degreereview: {
            key: 'degreereview',
            name: 'Degree Review',
            page: 'degree-review.html',
            icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>',
            color: 'indigo',
            active: true,
            description: 'Comprehensive degree audit, earned credits, remaining graduation requirements and course areas.'
        },
        curriculum: {
            key: 'curriculum',
            name: 'Curriculum',
            page: 'curriculum.html',
            icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>',
            color: 'amber',
            active: true,
            description: 'Explore full academic curriculum structure, major tracks, prerequisites, and course descriptions.'
        },
        profile: {
            key: 'profile',
            name: 'Student Profile',
            page: 'profile.html',
            icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
            color: 'coral',
            active: true,
            description: 'Personal, academic, advisor contact information and institutional records.'
        }
    };

    // Human-readable labels / styling for each feature status value
    const FEATURE_STATUS_META = {
        active:       { label: 'Active',       tone: 'emerald', usable: true  },
        beta:         { label: 'Beta',         tone: 'sky',     usable: true  },
        maintenance:  { label: 'Maintenance',  tone: 'amber',   usable: false },
        under_work:   { label: 'Under Work',   tone: 'amber',   usable: false },
        coming_soon:  { label: 'Coming Soon',  tone: 'violet',  usable: false },
        off:          { label: 'Disabled',     tone: 'gray',    usable: false }
    };

    const FEATURE_STATUS_CACHE_KEY = '_ewu_feature_status';
    const FEATURE_STATUS_TTL_MS = 45000;

    /**
     * Fetch feature statuses from the Worker with local caching + graceful fallback.
     * Always resolves to a status map keyed by feature key.
     */
    async function fetchFeatureStatuses(force = false) {
        const fallback = {};
        Object.keys(FEATURES).forEach(k => { fallback[k] = 'active'; });

        try {
            const cachedRaw = sessionStorage.getItem(FEATURE_STATUS_CACHE_KEY);
            const cachedTime = parseInt(sessionStorage.getItem(FEATURE_STATUS_CACHE_KEY + '_ts') || '0', 10);
            if (!force && cachedRaw && (Date.now() - cachedTime < FEATURE_STATUS_TTL_MS)) {
                return JSON.parse(cachedRaw);
            }
        } catch (e) {}

        let statuses = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const res = await fetch(`${API_BASE_URL}/api/status`, { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.features && typeof data.features === 'object') {
                        statuses = { ...fallback, ...data.features };
                    }
                    break;
                }
            } catch (e) {
                if (attempt === 0) await new Promise(r => setTimeout(r, 500));
            }
        }

        if (!statuses) statuses = fallback;

        try {
            sessionStorage.setItem(FEATURE_STATUS_CACHE_KEY, JSON.stringify(statuses));
            sessionStorage.setItem(FEATURE_STATUS_CACHE_KEY + '_ts', Date.now().toString());
        } catch (e) {}

        return statuses;
    }

    /**
     * Gate the current page. Call on DOMContentLoaded of any gated feature page.
     * Renders a notice overlay if the feature is not usable.
     */
    async function gateFeaturePage(featureKey) {
        const statuses = await fetchFeatureStatuses(true);
        const status = statuses[featureKey] || 'active';
        const meta = FEATURE_STATUS_META[status] || FEATURE_STATUS_META.active;

        if (meta.usable) return { allowed: true, status };

        injectFeatureUnavailable(featureKey, status, meta);
        return { allowed: false, status };
    }

    function injectFeatureUnavailable(featureKey, status, meta) {
        const feature = FEATURES[featureKey] || { name: 'This feature' };
        const messages = {
            maintenance: 'This feature is temporarily under maintenance. Please check back shortly.',
            under_work: 'This feature is currently being developed and will be available soon.',
            coming_soon: 'This feature is coming soon. Stay tuned for updates.',
            off: 'This feature has been temporarily disabled by the administrator.'
        };

        const overlay = document.createElement('div');
        overlay.id = 'featureGateOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;background:#060609;padding:24px;';
        overlay.innerHTML = `
            <div class="glass-card" style="max-width:460px;width:100%;padding:36px 30px;text-align:center;">
                <div style="width:64px;height:64px;margin:0 auto 18px;border-radius:18px;display:flex;align-items:center;justify-content:center;background:rgba(216,108,90,0.12);border:1px solid rgba(216,108,90,0.3);color:#D86C5A;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                </div>
                <div style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:3px 12px;border-radius:20px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#9ca3af;margin-bottom:14px;">${meta.label}</div>
                <h2 style="font-size:20px;font-weight:800;color:#fff;margin:0 0 10px;">${feature.name}</h2>
                <p style="font-size:14px;line-height:1.7;color:#9ca3af;margin:0 0 22px;">${messages[status] || messages.under_work}</p>
                <a href="dashboard.html" class="btn-card-action" style="display:inline-flex;width:auto;padding:12px 26px;text-decoration:none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    <span>Back to Dashboard</span>
                </a>
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    }

    // ========================================
    // Common shared helpers
    // ========================================

    const DAY_ABBR_MAP = { 'A': 'Sat', 'S': 'Sun', 'M': 'Mon', 'T': 'Tue', 'W': 'Wed', 'R': 'Thu', 'F': 'Fri' };

    // Parse a raw portal time slot string into days + time range.
    function parsePortalSlot(timeSlotName) {
        if (!timeSlotName) return { day: '', time: '', days: [] };
        const raw = String(timeSlotName).trim();

        const timeMatch = raw.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*(?:-|to)\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
        let days = [];
        let time = '';

        if (timeMatch) {
            time = `${timeMatch[1].trim()} - ${timeMatch[2].trim()}`;
            const dayPart = raw.replace(timeMatch[0], '').replace(/[()]/g, '').trim();
            days = extractDays(dayPart);
        } else {
            const dayPart = raw.replace(/\d.*$/, '').trim();
            days = extractDays(dayPart);
            time = '';
        }

        const dayNames = days.map(d => DAY_ABBR_MAP[d] || d);
        return { day: dayNames.join(', '), time, days: dayNames };
    }

    function extractDays(dayPart) {
        const days = [];
        const tokens = String(dayPart || '').split(/[\s,+/&]+/).filter(Boolean);
        const wordMap = { SUN: 'S', SUNDAY: 'S', MON: 'M', MONDAY: 'M', TUE: 'T', TUESDAY: 'T', WED: 'W', WEDNESDAY: 'W', THU: 'R', THURSDAY: 'R', FRI: 'F', FRIDAY: 'F', SAT: 'A', SATURDAY: 'A' };
        for (const tok of tokens) {
            const up = tok.toUpperCase();
            if (wordMap[up]) {
                if (!days.includes(wordMap[up])) days.push(wordMap[up]);
            } else {
                for (const ch of up) {
                    if (DAY_ABBR_MAP[ch] && !days.includes(ch)) days.push(ch);
                }
            }
        }
        return days;
    }

    // Convert a 12h time string like "8:30AM" or "11:50 AM" to minutes from midnight.
    function timeToMinutes(t) {
        if (!t) return null;
        const clean = String(t).replace(/\s+/g, '').toUpperCase();
        const m = clean.match(/(\d{1,2}):(\d{2})(AM|PM)?/);
        if (!m) return null;
        let h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const mer = m[3];
        if (mer === 'PM' && h !== 12) h += 12;
        if (mer === 'AM' && h === 12) h = 0;
        return h * 60 + min;
    }

    // Pretty time from "8:30AM" -> "8:30 AM"
    function prettyTime(t) {
        if (!t) return '';
        const clean = String(t).replace(/\s+/g, '');
        const m = clean.match(/(\d{1,2}:\d{2})(AM|PM)?/i);
        if (!m) return String(t).toUpperCase();
        return m[2] ? `${m[1]} ${m[2].toUpperCase()}` : m[1];
    }

    // Trim redundant bracketed descriptions from a room name.
    function trimRoomName(room) {
        if (!room) return '';
        return String(room).replace(/\s*\([^)]*\)/g, '').trim() || 'TBA';
    }

    // Escape HTML to prevent injection when rendering portal data.
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Format numbers as BDT currency.
    function formatBDT(value) {
        const num = typeof value === 'number' ? value : parseFloat(value);
        if (isNaN(num)) return '0.00';
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Small self-contained toast used across feature pages.
    function showFeatureToast(message, type = 'info') {
        let container = document.getElementById('ewuFeatureToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'ewuFeatureToastContainer';
            container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:100000;display:flex;flex-direction:column;gap:10px;max-width:340px;';
            document.body.appendChild(container);
        }
        const colors = {
            success: { b: 'rgba(16,185,129,0.4)', i: '#34d399' },
            error: { b: 'rgba(239,68,68,0.4)', i: '#f87171' },
            warning: { b: 'rgba(245,158,11,0.4)', i: '#fbbf24' },
            info: { b: 'rgba(90,143,216,0.4)', i: '#5a8fd8' }
        };
        const c = colors[type] || colors.info;
        const toast = document.createElement('div');
        toast.style.cssText = `background:rgba(15,15,22,0.95);backdrop-filter:blur(18px);border:1px solid ${c.b};border-left:3px solid ${c.i};border-radius:12px;padding:13px 16px;color:#f3f4f6;font-size:13px;box-shadow:0 12px 36px rgba(0,0,0,0.5);opacity:0;transform:translateX(40px);transition:all .3s cubic-bezier(0.4,0,0.2,1);`;
        toast.textContent = message;
        container.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; });
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(40px)';
            setTimeout(() => toast.remove(), 320);
        }, 3200);
    }

    // Standard auth guard used on every feature page.
    async function requireAuth() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/auth/status`, { credentials: 'include' });
            const data = await res.json();
            if (!data || !data.loggedIn) {
                window.location.href = 'login.html';
                return null;
            }
            const id = (data.userId && data.userId !== 'User') ? data.userId : (localStorage.getItem('studentId') || localStorage.getItem('ewu_student_id') || null);
            return { userId: id };
        } catch (e) {
            window.location.href = 'login.html';
            return null;
        }
    }

    async function performLogout(event) {
        if (event) event.preventDefault();
        try {
            await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
        } catch (e) {}
        try {
            localStorage.removeItem('studentId');
            localStorage.removeItem('ewu_student_id');
            localStorage.removeItem('userId');
        } catch (e) {}
        window.location.href = 'login.html';
    }

    // Simple retrying JSON fetch for feature pages (auto retry on transient failures).
    async function fetchJsonWithRetry(url, options = {}, retries = 2) {
        let lastErr;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const res = await fetch(url, { credentials: 'include', ...options });
                if (res.status === 401) {
                    return { __unauthorized: true, response: res };
                }
                if (res.status >= 500 && attempt < retries) {
                    await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
                    continue;
                }
                if (!res.ok) throw new Error(`Request failed (${res.status})`);
                return { data: await res.json(), response: res };
            } catch (e) {
                lastErr = e;
                if (attempt < retries) await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
            }
        }
        throw lastErr;
    }

    // Emit an analytics event (fire-and-forget).
    function trackEvent(type, extra = {}) {
        try {
            fetch(`${API_BASE_URL}/api/analytics`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, path: window.location.pathname, ...extra })
            }).catch(() => {});
        } catch (e) {}
    }

    // ========================================
    // Grade Report parsing (shared between Grade Report & CGPA Planner)
    // ========================================
    // Official EWU grade -> grade point mapping
    const GRADE_POINTS = {
        'A+': 4.00, 'A': 3.75, 'A-': 3.50,
        'B+': 3.25, 'B': 3.00, 'B-': 2.75,
        'C+': 2.50, 'C': 2.25, 'D': 2.00, 'F': 0.00
    };
    const COURSE_CODE_RE = /^[A-Z]{2,6}\d{3,4}[A-Z]?$/i;

    function isNumber(v) { return /^-?\d+(\.\d+)?$/.test(String(v).trim()); }
    function isYear(v) { return /^(19|20)\d{2}$/.test(String(v).trim()); }
    function capitalize(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }
    function termIndex(t) { t = String(t).toLowerCase(); return t === 'spring' ? 1 : t === 'summer' ? 2 : (t === 'fall' || t === 'autumn') ? 3 : t === 'winter' ? 4 : 5; }

    function isGradeToken(s) {
        const t = String(s || '').trim().toUpperCase();
        return GRADE_POINTS[t] !== undefined || /^(F\*?|W|I|P|S|R|U)$/.test(t);
    }

    // The Worker returns the ReportViewer's ASP.NET AJAX delta stream. This
    // extracts the actual report HTML block (length-prefixed "updatePanel").
    function extractReportHtml(raw) {
        if (!raw) return '';
        if (raw.indexOf('|updatePanel|') === -1) return raw;
        let best = '';
        const re = /(\d+)\|updatePanel\|([^|]+)\|/g;
        let m;
        while ((m = re.exec(raw)) !== null) {
            const len = parseInt(m[1], 10);
            const start = m.index + m[0].length;
            const content = raw.substr(start, len);
            if (content && /oReportDiv|ReportArea|<TABLE/i.test(content) && content.length > best.length) {
                best = content;
            }
        }
        return best || raw;
    }

    function matchSemester(text) {
        let m = String(text).match(/\b(20\d{2})\s*[-\s]\s*(Spring|Summer|Fall|Winter|Autumn)\b/i);
        if (m) return { name: capitalize(m[2]) + '-' + m[1], order: parseInt(m[1], 10) * 10 + termIndex(m[2]) };
        m = String(text).match(/\b(Spring|Summer|Fall|Winter|Autumn)\s*[-\s]\s*(20\d{2})\b/i);
        if (m) return { name: capitalize(m[1]) + '-' + m[2], order: parseInt(m[2], 10) * 10 + termIndex(m[1]) };
        return null;
    }

    /**
     * Parse the portal grade-sheet HTML (delta stream or plain HTML) into a
     * structured transcript: { semesters, cgpa, totalCredits, totalCourses, summary }
     */
    function parseGradeReportHtml(rawHtml) {
        const empty = { semesters: [], cgpa: null, totalCredits: 0, totalCourses: 0, summary: null };
        if (!rawHtml) return empty;

        const cleanHtml = extractReportHtml(rawHtml);
        let doc;
        try {
            doc = new DOMParser().parseFromString(cleanHtml, 'text/html');
        } catch (e) {
            return empty;
        }

        const semesters = [];
        let current = null;
        let summary = null;

        doc.querySelectorAll('tr').forEach(tr => {
            const cells = [];
            tr.querySelectorAll('td').forEach(td => cells.push((td.textContent || '').replace(/\s+/g, ' ').trim()));
            const nonEmpty = cells.filter(Boolean);
            if (!nonEmpty.length) return;
            const joined = nonEmpty.join(' ');

            // Skip document/header/legend rows outright
            if (/EAST\s*WEST\s*UNIVERSITY|Grade\s*Report\s*:|Degree\s*Objective|Unique\s*ID|Not valid for|Title of the Course/i.test(joined)) return;

            // Semester header: a short single-cell row like "2025 Summer"
            if (nonEmpty.length === 1 && nonEmpty[0].length <= 24 &&
                /^(20\d{2}\s*[-\s]\s*)?(Spring|Summer|Fall|Winter|Autumn)(\s*[-\s]\s*20\d{2})?$/i.test(nonEmpty[0])) {
                const sem = matchSemester(nonEmpty[0]);
                if (sem) {
                    current = { name: sem.name, order: sem.order, courses: [], termGpa: null, cgpa: null, credits: 0 };
                    semesters.push(current);
                    return;
                }
            }

            // Term GPA / CGPA row (may also be the final Summary row)
            if (joined.length < 200 && (/Term\s*GPA\s*:/i.test(joined) || /CGPA\s*:/i.test(joined))) {
                if (current) {
                    const tg = joined.match(/Term\s*GPA\s*:\s*([\d.]+)/i);
                    const cg = joined.match(/CGPA\s*:\s*([\d.]+)/i);
                    if (tg) current.termGpa = parseFloat(tg[1]);
                    if (cg) current.cgpa = parseFloat(cg[1]);
                }
                if (/Credit\s*Earned/i.test(joined) || /Minimum\s*Credits/i.test(joined)) {
                    const cg = joined.match(/CGPA\s*:\s*([\d.]+)/i);
                    const earned = joined.match(/Credit\s*Earned\s*:\s*([\d.]+)/i);
                    const min = joined.match(/Minimum\s*Credits\s*Required\s*:\s*([\d.]+)/i);
                    summary = {
                        cgpa: cg ? parseFloat(cg[1]) : null,
                        creditEarned: earned ? parseFloat(earned[1]) : null,
                        minCredits: min ? parseFloat(min[1]) : null
                    };
                }
                return;
            }

            // Course row (a genuine row has a handful of cells)
            if (cells.length > 10) return;
            const codeIdx = cells.findIndex(c => COURSE_CODE_RE.test(String(c).replace(/\s+/g, '')));
            if (codeIdx === -1) return;

            const code = String(cells[codeIdx]).replace(/\s+/g, '').toUpperCase();
            let grade = '', gradeIdx = -1;
            for (let i = codeIdx + 1; i < cells.length; i++) {
                if (isGradeToken(cells[i])) { grade = String(cells[i]).toUpperCase(); gradeIdx = i; break; }
            }
            if (!grade) return;

            const title = (cells[codeIdx + 1] && !isGradeToken(cells[codeIdx + 1]) && !isNumber(cells[codeIdx + 1])) ? cells[codeIdx + 1] : '';

            let credit = null;
            for (let i = codeIdx + 1; i < gradeIdx; i++) {
                if (cells[i] === title) continue;
                const n = parseFloat(cells[i]);
                if (!isNaN(n) && n > 0 && n <= 12 && !isYear(cells[i])) { credit = n; break; }
            }

            if (!current) {
                current = { name: 'Grade History', order: 0, courses: [], termGpa: null, cgpa: null, credits: 0 };
                semesters.push(current);
            }
            current.courses.push({
                code, title, credit,
                grade,
                point: GRADE_POINTS[grade] !== undefined ? GRADE_POINTS[grade] : null
            });
        });

        // Dedupe semesters by name (the report viewer can emit blocks more than once)
        const seen = new Set();
        const unique = [];
        semesters.forEach(s => {
            if (!s.courses.length || seen.has(s.name)) return;
            seen.add(s.name);
            let credits = 0, pts = 0;
            s.courses.forEach(c => {
                if (c.credit != null) {
                    credits += c.credit;
                    if (GRADE_POINTS[c.grade] !== undefined) pts += GRADE_POINTS[c.grade] * c.credit;
                }
            });
            s.credits = credits;
            s.computedGpa = credits > 0 ? pts / credits : null;
            s.gpa = (s.termGpa != null && !isNaN(s.termGpa)) ? s.termGpa : s.computedGpa;
            unique.push(s);
        });
        unique.sort((a, b) => a.order - b.order);

        let totalCourses = 0, computedCredits = 0, totalPoints = 0;
        unique.forEach(s => {
            totalCourses += s.courses.length;
            computedCredits += s.credits;
            s.courses.forEach(c => {
                if (c.credit != null && GRADE_POINTS[c.grade] !== undefined) totalPoints += GRADE_POINTS[c.grade] * c.credit;
            });
        });

        let cgpa = null;
        if (summary && summary.cgpa != null) {
            cgpa = summary.cgpa;
        } else {
            for (let i = unique.length - 1; i >= 0; i--) {
                if (unique[i].cgpa != null) { cgpa = unique[i].cgpa; break; }
            }
        }
        if (cgpa == null && computedCredits > 0) cgpa = totalPoints / computedCredits;

        const totalCredits = (summary && summary.creditEarned != null) ? summary.creditEarned : computedCredits;

        return { semesters: unique, cgpa, totalCredits, totalCourses, summary };
    }

    // Expose everything on window for cross-script access
    window.API_BASE_URL = API_BASE_URL;
    window.FEATURES = FEATURES;
    window.FEATURE_STATUS_META = FEATURE_STATUS_META;
    window.fetchFeatureStatuses = fetchFeatureStatuses;
    window.gateFeaturePage = gateFeaturePage;
    window.parsePortalSlot = parsePortalSlot;
    window.timeToMinutes = timeToMinutes;
    window.prettyTime = prettyTime;
    window.trimRoomName = trimRoomName;
    window.escapeHtml = escapeHtml;
    window.formatBDT = formatBDT;
    window.showFeatureToast = showFeatureToast;
    window.requireAuth = requireAuth;
    window.performLogout = performLogout;
    window.fetchJsonWithRetry = fetchJsonWithRetry;
    window.trackEvent = trackEvent;
    window.GRADE_POINTS = GRADE_POINTS;
    window.parseGradeReportHtml = parseGradeReportHtml;
    window.extractReportHtml = extractReportHtml;
    window.handleLogout = performLogout;
})();
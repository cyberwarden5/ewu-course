// ========================================
// Student Dashboard Logic
// Handles session verification, dynamic feature rendering (driven by
// admin-controlled feature statuses), student name/ID display, and
// smooth AJAX-based client navigation (zero-reload return to dashboard).
// Depends on assets/js/features.js (FEATURES registry + API_BASE_URL).
// ========================================

// Resolve API base defensively (features.js exposes window.API_BASE_URL).
const API_BASE_URL = window.API_BASE_URL || 'https://api.aftabkabir.me';

// Safe HTML escape fallback if features.js did not load.
const esc = (typeof window.escapeHtml === 'function')
    ? window.escapeHtml
    : (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Retrieve student ID from local/session storage
function getStoredStudentId() {
    try {
        const id = localStorage.getItem('studentId')
            || localStorage.getItem('ewu_student_id')
            || sessionStorage.getItem('studentId')
            || localStorage.getItem('userId');
        if (id && id !== 'User' && id !== 'Student') {
            return id;
        }
    } catch (e) {
        console.warn('Storage read error:', e);
    }
    return null;
}

// Retrieve student Name from local storage
function getStoredStudentName() {
    try {
        const name = localStorage.getItem('studentName');
        if (name && name !== 'User' && name !== 'Student') {
            return name;
        }
    } catch (e) {}
    return null;
}

// Update student Name/ID in UI badges
function updateStudentIdDisplay(id, name) {
    const studentName = name || getStoredStudentName();
    const studentId = id || getStoredStudentId();
    const displayLabel = studentName || studentId || 'Student Profile';

    const userBadge = document.getElementById('userId');
    const userBadgeMobile = document.getElementById('userIdMobile');

    if (userBadge) {
        userBadge.textContent = displayLabel;
        if (studentId) userBadge.title = `Student ID: ${studentId}`;
    }
    if (userBadgeMobile) {
        userBadgeMobile.textContent = displayLabel;
    }
}

// Fetch student profile asynchronously to display full name in header
async function loadStudentProfileName() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/profile`, { credentials: 'include' });
        if (res.ok) {
            const json = await res.json();
            const prof = json && json.data ? json.data : null;
            if (prof) {
                const cleanName = [prof.FirstName, prof.MiddleName, prof.LastName]
                    .filter(Boolean)
                    .join(' ')
                    .replace(/[\r\n\t]+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                if (cleanName) {
                    try { localStorage.setItem('studentName', cleanName); } catch (e) {}
                    if (prof.StudentId) {
                        try { localStorage.setItem('studentId', prof.StudentId); } catch (e) {}
                    }
                    updateStudentIdDisplay(prof.StudentId, cleanName);
                }
            }
        }
    } catch (e) {
        // Non-blocking profile name fetch
    }
}

// Check authentication state on page load
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/status`, { credentials: 'include' });
        const data = await response.json();
        if (!data || !data.loggedIn) {
            window.location.href = 'login.html';
            return false;
        }
        if (data.userId && data.userId !== 'User' && data.userId !== 'Student') {
            try { localStorage.setItem('studentId', data.userId); } catch (e) {}
            updateStudentIdDisplay(data.userId);
        } else {
            updateStudentIdDisplay(getStoredStudentId());
        }

        // Asynchronously fetch profile to populate student's full name in header
        loadStudentProfileName();

        return true;
    } catch (error) {
        console.warn('Auth status check failed, redirecting to login:', error);
        window.location.href = 'login.html';
        return false;
    }
}

// Handle user logout
async function handleLogout(event) {
    if (event) event.preventDefault();
    try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (error) {
        console.error('Logout error:', error);
    }
    try {
        localStorage.removeItem('studentId');
        localStorage.removeItem('studentName');
        localStorage.removeItem('ewu_student_id');
        localStorage.removeItem('userId');
        sessionStorage.clear();
        sessionStorage.setItem('ewu_just_logged_out', 'true');
    } catch (e) {}
    window.location.href = 'login.html';
}
window.handleLogout = handleLogout;

// ========================================
// Dynamic feature rendering
// ========================================
const CARD_THEME = {
    coral:   { accent: '#D86C5A', bg: 'linear-gradient(135deg, rgba(216,108,90,0.2) 0%, rgba(216,108,90,0.05) 100%)', border: 'rgba(216,108,90,0.35)', btn: 'linear-gradient(135deg,#D86C5A,#c5584a)', glow: 'rgba(216,108,90,0.35)' },
    blue:    { accent: '#5a8fd8', bg: 'linear-gradient(135deg, rgba(90,143,216,0.2) 0%, rgba(90,143,216,0.05) 100%)', border: 'rgba(90,143,216,0.35)', btn: 'linear-gradient(135deg,#5a8fd8,#4075c0)', glow: 'rgba(90,143,216,0.35)' },
    cyan:    { accent: '#06b6d4', bg: 'linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(6,182,212,0.05) 100%)', border: 'rgba(6,182,212,0.35)', btn: 'linear-gradient(135deg,#06b6d4,#0891b2)', glow: 'rgba(6,182,212,0.35)' },
    violet:  { accent: '#8b5cf6', bg: 'linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(139,92,246,0.05) 100%)', border: 'rgba(139,92,246,0.35)', btn: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', glow: 'rgba(139,92,246,0.35)' },
    emerald: { accent: '#10b981', bg: 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.05) 100%)', border: 'rgba(16,185,129,0.35)', btn: 'linear-gradient(135deg,#10b981,#059669)', glow: 'rgba(16,185,129,0.35)' },
    amber:   { accent: '#f59e0b', bg: 'linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(245,158,11,0.05) 100%)', border: 'rgba(245,158,11,0.35)', btn: 'linear-gradient(135deg,#f59e0b,#d97706)', glow: 'rgba(245,158,11,0.35)' },
    rose:    { accent: '#f43f5e', bg: 'linear-gradient(135deg, rgba(244,63,94,0.2) 0%, rgba(244,63,94,0.05) 100%)', border: 'rgba(244,63,94,0.35)', btn: 'linear-gradient(135deg,#f43f5e,#e11d48)', glow: 'rgba(244,63,94,0.35)' },
    teal:    { accent: '#0d9488', bg: 'linear-gradient(135deg, rgba(13,148,136,0.2) 0%, rgba(13,148,136,0.05) 100%)', border: 'rgba(13,148,136,0.35)', btn: 'linear-gradient(135deg,#0d9488,#0f766e)', glow: 'rgba(13,148,136,0.35)' },
    indigo:  { accent: '#6366f1', bg: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(99,102,241,0.05) 100%)', border: 'rgba(99,102,241,0.35)', btn: 'linear-gradient(135deg,#6366f1,#4f46e5)', glow: 'rgba(99,102,241,0.35)' }
};

const STATUS_PILL = {
    active:      { label: 'Active',      cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300', dot: 'bg-emerald-400' },
    beta:        { label: 'Beta',        cls: 'bg-sky-500/15 border-sky-500/30 text-sky-300', dot: 'bg-sky-400' },
    maintenance: { label: 'Maintenance', cls: 'bg-amber-500/15 border-amber-500/30 text-amber-300', dot: 'bg-amber-400' },
    under_work:  { label: 'Under Work',  cls: 'bg-amber-500/15 border-amber-500/30 text-amber-300', dot: 'bg-amber-400' },
    coming_soon: { label: 'Coming Soon', cls: 'bg-violet-500/15 border-violet-500/30 text-violet-300', dot: 'bg-violet-400' },
    off:         { label: 'Disabled',    cls: 'bg-gray-500/15 border-gray-500/30 text-gray-300', dot: 'bg-gray-400' }
};

// Feature display order + lightweight dashboard copy
const DASHBOARD_FEATURES = [
    'recommended', 'department', 'preadvising', 'degreereview', 'curriculum', 'schedule', 'planner', 'ledger', 'grades', 'cgpa'
];

// Local fallback registry so the dashboard still renders even if the shared
// features.js fails to load (e.g. stale cache or blocked asset).
const FALLBACK_FEATURES = {
    recommended: { name: 'Recommended Courses', page: 'advise.html', color: 'coral', icon: '', description: 'Personalized course offerings from your advising routine.' },
    department: { name: 'Department-Wise Courses', page: 'department-courses.html', color: 'blue', icon: '', description: 'Search and filter course offerings across all departments.' },
    preadvising: { name: 'Pre-Advising', page: 'pre-advising.html', color: 'teal', icon: '', description: 'Review your pre-advised courses, total credit load, and upcoming semester offerings.' },
    degreereview: { name: 'Degree Review', page: 'degree-review.html', color: 'indigo', icon: '', description: 'Degree audit, earned credits, remaining graduation requirements and course areas.' },
    curriculum: { name: 'Curriculum', page: 'curriculum.html', color: 'amber', icon: '', description: 'Explore full academic curriculum structure, major tracks, prerequisites, and courses.' },
    schedule: { name: 'Class Schedule', page: 'class-schedule.html', color: 'cyan', icon: '', description: 'Personalized weekly timetable grid and registered credits.' },
    planner: { name: 'Course Planner', page: 'course-planner.html', color: 'violet', icon: '', description: 'Build and validate multiple course combinations.' },
    ledger: { name: 'Account Ledger', page: 'account-ledger.html', color: 'emerald', icon: '', description: 'Track tuition balances, payments and scholarships.' },
    grades: { name: 'Grade Report', page: 'grade-report.html', color: 'amber', icon: '', description: 'Academic transcript with term-by-term GPA history.' },
    cgpa: { name: 'CGPA Planner', page: 'cgpa-planner.html', color: 'rose', icon: '', description: 'Project target GPA and required grades.' },
    profile: { name: 'Student Profile', page: 'profile.html', color: 'coral', icon: '', description: 'Personal, academic, advisor contact information and institutional records.' }
};

function getFeatureMeta(key) {
    return (typeof window.FEATURES === 'object' && window.FEATURES[key]) || FALLBACK_FEATURES[key] || { name: key, page: '#', color: 'coral', icon: '', description: '' };
}

function getStatusMeta(status) {
    const map = (typeof window.FEATURE_STATUS_META === 'object' && window.FEATURE_STATUS_META) || {
        active: { label: 'Active', usable: true }, beta: { label: 'Beta', usable: true },
        maintenance: { label: 'Maintenance', usable: false }, under_work: { label: 'Under Work', usable: false },
        coming_soon: { label: 'Coming Soon', usable: false }, off: { label: 'Disabled', usable: false }
    };
    return map[status] || map.active;
}

function renderFeatureCards(statuses) {
    const activeGrid = document.getElementById('activeGrid');
    const comingGrid = document.getElementById('comingGrid');
    const activeSection = document.getElementById('activeSection');
    const comingSection = document.getElementById('comingSection');
    if (!activeGrid || !comingGrid) return;

    statuses = statuses || {};
    const activeKeys = [];
    const unavailableKeys = [];

    DASHBOARD_FEATURES.forEach(key => {
        const status = statuses[key] || 'active';
        const meta = getStatusMeta(status);
        if (meta.usable) activeKeys.push({ key, status });
        else unavailableKeys.push({ key, status });
    });

    // Active / usable features
    activeGrid.innerHTML = activeKeys.map(({ key, status }) => activeCardHtml(key, status)).join('') ||
        '<div class="glass-card p-8 text-center text-gray-400 text-sm" style="grid-column:1/-1;">No features are currently available. Please check back later.</div>';

    const activeCount = document.getElementById('activeCount');
    if (activeCount) activeCount.textContent = `${activeKeys.length} Available`;

    // Unavailable features
    if (unavailableKeys.length) {
        comingSection.classList.remove('hidden');
        comingGrid.innerHTML = unavailableKeys.map(({ key, status }) => lockedCardHtml(key, status)).join('');
        const comingCount = document.getElementById('comingCount');
        if (comingCount) comingCount.textContent = `${unavailableKeys.length} Unavailable`;
    } else {
        comingSection.classList.add('hidden');
    }
}

function activeCardHtml(key, status) {
    const f = getFeatureMeta(key);
    const theme = CARD_THEME[f.color] || CARD_THEME.coral;
    const pill = STATUS_PILL[status] || STATUS_PILL.active;
    const isBeta = status === 'beta';

    return `
        <div class="fade-in" style="position:relative;background:linear-gradient(145deg, rgba(22,22,32,0.75) 0%, rgba(14,14,20,0.85) 100%);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border:1px solid ${theme.border};border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,0.4);display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;">
            <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${theme.btn};"></div>
            <div class="p-6 sm:p-7">
                <div class="flex items-start justify-between gap-3 mb-4">
                    <div style="width:52px;height:52px;border-radius:14px;background:${theme.bg};border:1px solid ${theme.border};display:flex;align-items:center;justify-content:center;color:${theme.accent};">
                        ${f.icon}
                    </div>
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${pill.cls}">
                        <span class="w-1.5 h-1.5 rounded-full ${pill.dot}"></span>
                        ${pill.label}
                    </span>
                </div>
                <h3 class="text-lg sm:text-xl font-bold text-white mb-2">${esc(f.name)}</h3>
                <p class="text-gray-300 text-xs sm:text-sm leading-relaxed mb-6">${esc(f.description)}</p>
            </div>
            <div class="px-6 sm:px-7 pb-6 sm:pb-7 pt-0">
                <a href="${f.page}" class="no-underline ajax-nav-link" style="display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px 20px;font-size:0.925rem;font-weight:600;border-radius:12px;background:${theme.btn};color:#fff;box-shadow:0 4px 18px ${theme.glow};">
                    <span>${isBeta ? 'Open (Beta)' : 'Open'}</span>
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </a>
            </div>
        </div>`;
}

function lockedCardHtml(key, status) {
    const f = getFeatureMeta(key);
    const pill = STATUS_PILL[status] || STATUS_PILL.coming_soon;
    return `
        <div style="position:relative;background:linear-gradient(145deg, rgba(16,16,24,0.5) 0%, rgba(10,10,16,0.65) 100%);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.08);border-radius:18px;display:flex;flex-direction:column;justify-content:space-between;min-height:190px;overflow:hidden;">
            <div class="p-5 sm:p-6">
                <div class="flex items-start justify-between gap-3 mb-4">
                    <div style="width:46px;height:46px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.45);">
                        ${f.icon}
                    </div>
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${pill.cls}">
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        ${pill.label}
                    </span>
                </div>
                <h3 class="text-base font-bold text-gray-200 mb-1.5">${esc(f.name)}</h3>
                <p class="text-gray-400 text-xs leading-relaxed">${esc(f.description)}</p>
            </div>
            <div class="mt-2 px-5 sm:px-6 pb-5 sm:pb-6 pt-3.5 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-gray-500 font-mono">
                <span class="flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full ${pill.dot}"></span>
                    ${pill.label}
                </span>
            </div>
        </div>`;
}

// ========================================
// AJAX Navigation Router (Zero-Reload Return)
// Preserves dashboard state in memory when switching views
// ========================================
const pageCache = new Map();
const loadedScripts = new Set();
const loadedStyles = new Set();

function loadScriptAsync(src) {
    if (!src) return Promise.resolve();
    const cleanSrc = src.split('?')[0];
    if (loadedScripts.has(cleanSrc)) return Promise.resolve();

    // Check if script already exists in document
    const existing = document.querySelector(`script[src*="${cleanSrc}"]`);
    if (existing) {
        loadedScripts.add(cleanSrc);
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            loadedScripts.add(cleanSrc);
            resolve();
        };
        script.onerror = () => {
            console.warn('Script failed to load:', src);
            resolve(); // Don't crash router
        };
        document.body.appendChild(script);
    });
}

function loadStyleAsync(href) {
    if (!href) return;
    const cleanHref = href.split('?')[0];
    if (loadedStyles.has(cleanHref)) return;

    const existing = document.querySelector(`link[rel="stylesheet"][href*="${cleanHref}"]`);
    if (existing) {
        loadedStyles.add(cleanHref);
        return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    loadedStyles.add(cleanHref);
    document.head.appendChild(link);
}

function cleanupPreviousPage() {
    // Stop auto-refresh intervals from advise.js if active
    if (typeof window.stopAutoRefresh === 'function') {
        try { window.stopAutoRefresh(); } catch (e) {}
    }
    // Stop recurring timers registered by other feature pages
    if (typeof window.stopDepartmentClock === 'function') {
        try { window.stopDepartmentClock(); } catch (e) {}
    }
    // Remove page-scoped styles injected during the previous navigation
    document.querySelectorAll('style[data-subpage-style]').forEach(el => el.remove());
}

function invokePageLifecycle(url) {
    const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
    try {
        if (cleanUrl.includes('profile')) {
            if (typeof window.initProfilePage === 'function') window.initProfilePage();
            else if (typeof window.fetchProfile === 'function') window.fetchProfile();
        } else if (cleanUrl.includes('pre-advising')) {
            if (typeof window.initPreAdvisingPage === 'function') window.initPreAdvisingPage();
        } else if (cleanUrl.includes('degree-review')) {
            if (typeof window.initDegreeReviewPage === 'function') window.initDegreeReviewPage();
        } else if (cleanUrl.includes('curriculum')) {
            if (typeof window.initCurriculumPage === 'function') window.initCurriculumPage();
        } else if (cleanUrl.includes('class-schedule')) {
            if (typeof window.initClassSchedulePage === 'function') window.initClassSchedulePage();
        } else if (cleanUrl.includes('course-planner')) {
            if (typeof window.initCoursePlannerPage === 'function') window.initCoursePlannerPage();
        } else if (cleanUrl.includes('department-courses')) {
            if (typeof window.initDepartmentCoursesPage === 'function') window.initDepartmentCoursesPage();
        } else if (cleanUrl.includes('account-ledger')) {
            if (typeof window.initAccountLedgerPage === 'function') window.initAccountLedgerPage();
        } else if (cleanUrl.includes('grade-report')) {
            if (typeof window.initGradeReportPage === 'function') window.initGradeReportPage();
        } else if (cleanUrl.includes('cgpa-planner')) {
            if (typeof window.initCgpaPlannerPage === 'function') window.initCgpaPlannerPage();
        } else if (cleanUrl.includes('advise')) {
            if (typeof window.initAdvisePage === 'function') window.initAdvisePage();
        }
    } catch (err) {
        console.warn('Page lifecycle invocation notice:', err);
    }
}

async function navigateToPage(url, pushState = true) {
    const homeView = document.getElementById('dashboardHomeView');
    const pageView = document.getElementById('dashboardPageView');
    const loadingView = document.getElementById('dashboardPageLoading');

    if (!homeView || !pageView) {
        window.location.href = url;
        return;
    }

    cleanupPreviousPage();

    if (pushState) {
        history.pushState({ page: url }, '', url);
    }

    homeView.classList.add('hidden');
    pageView.classList.add('hidden');
    if (loadingView) loadingView.classList.remove('hidden');

    try {
        let htmlText = pageCache.get(url);
        if (!htmlText) {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            htmlText = await res.text();
            pageCache.set(url, htmlText);
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        if (doc.title) document.title = doc.title;

        // Load stylesheets from subpage head
        const stylesheets = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
        for (const link of stylesheets) {
            const href = link.getAttribute('href');
            if (href && !href.includes('styles.css')) {
                loadStyleAsync(href);
            }
        }

        const sourceEl = doc.querySelector('main') || doc.body;
        const fragment = document.createElement('div');
        fragment.innerHTML = sourceEl.innerHTML;
        // Never inject <script> tags via innerHTML: they are inert (do not run)
        // and would falsely satisfy the "already loaded" check in
        // loadScriptAsync, preventing the real scripts from ever loading.
        // Feature scripts are loaded explicitly in the loop below instead.
        fragment.querySelectorAll('script').forEach(s => s.remove());
        // If a page has no <main>, strip its own page chrome so the dashboard
        // header/footer are not duplicated inside the view.
        if (sourceEl === doc.body) {
            fragment.querySelectorAll('nav, header, footer').forEach(el => el.remove());
        }

        pageView.innerHTML = fragment.innerHTML;

        // Copy page-scoped <style> blocks (e.g. print styles) so behaviour on
        // AJAX-opened pages matches a full page load. Tagged for cleanup.
        Array.from(doc.querySelectorAll('style')).forEach(st => {
            const clone = document.createElement('style');
            clone.setAttribute('data-subpage-style', 'true');
            clone.textContent = st.textContent;
            document.head.appendChild(clone);
        });

        // Dynamically load vendor & feature scripts needed. While these execute,
        // set a flag so page scripts skip their own auto-init (the router calls
        // the page initializer explicitly to avoid duplicate requests).
        const scripts = Array.from(doc.querySelectorAll('script'));
        window.__EWU_AJAX_NAV__ = true;
        try {
            for (const s of scripts) {
                const src = s.getAttribute('src');
                if (src) {
                    if (src.includes('tailwind') || src.includes('styles.css') || src.includes('dashboard.js') || src.includes('system-metrics.js') || src.includes('main.js')) {
                        continue;
                    }
                    await loadScriptAsync(src);
                }
            }
        } finally {
            window.__EWU_AJAX_NAV__ = false;
        }

        if (loadingView) loadingView.classList.add('hidden');
        pageView.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Invoke page lifecycle initializer
        invokePageLifecycle(url);

        // Bind all Back to Dashboard links in the newly rendered view
        bindSubpageBackButtons();
    } catch (err) {
        console.error('AJAX navigation fallback to full load:', err);
        window.location.href = url;
    }
}

function restoreDashboardHome(pushState = true) {
    const homeView = document.getElementById('dashboardHomeView');
    const pageView = document.getElementById('dashboardPageView');
    const loadingView = document.getElementById('dashboardPageLoading');

    if (!homeView) return;

    cleanupPreviousPage();

    if (pushState) {
        history.pushState({ page: 'dashboard' }, '', 'dashboard.html');
    }

    if (pageView) pageView.classList.add('hidden');
    if (loadingView) loadingView.classList.add('hidden');
    homeView.classList.remove('hidden');

    document.title = 'Academic Dashboard - EWU Course Fetching';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindSubpageBackButtons() {
    const backLinks = document.querySelectorAll('a[href="dashboard.html"], a[href="/dashboard.html"], a[href="./dashboard.html"], #backToDashBtn, [data-back-dashboard]');
    backLinks.forEach(link => {
        link.onclick = (e) => {
            e.preventDefault();
            restoreDashboardHome(true);
        };
    });
}

function initAjaxRouter() {
    // Intercept clicks on links globally
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
            return;
        }

        // Return to dashboard
        if (href === 'dashboard.html' || href === '/dashboard.html' || href === './dashboard.html') {
            const homeView = document.getElementById('dashboardHomeView');
            if (homeView) {
                e.preventDefault();
                restoreDashboardHome(true);
                return;
            }
        }

        // All connected dashboard subpages supported for instant AJAX navigation
        const targetPages = [
            'advise.html',
            'department-courses.html',
            'pre-advising.html',
            'degree-review.html',
            'curriculum.html',
            'class-schedule.html',
            'course-planner.html',
            'account-ledger.html',
            'grade-report.html',
            'cgpa-planner.html',
            'profile.html',
            'documentation.html',
            'learn-more.html'
        ];

        const cleanHref = href.split('?')[0].split('#')[0];
        const matchingPage = targetPages.find(p => cleanHref === p || cleanHref.endsWith('/' + p));
        if (matchingPage) {
            const homeView = document.getElementById('dashboardHomeView');
            if (homeView) {
                e.preventDefault();
                navigateToPage(href, true);
            }
        }
    });

    // Handle browser Back / Forward buttons
    window.addEventListener('popstate', (e) => {
        const state = e.state;
        if (state && state.page && state.page !== 'dashboard' && !state.page.includes('dashboard.html')) {
            navigateToPage(state.page, false);
        } else {
            restoreDashboardHome(false);
        }
    });

    history.replaceState({ page: 'dashboard' }, '', window.location.pathname);
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
    const yearEl = document.getElementById('dynamicYear');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    updateStudentIdDisplay();
    initAjaxRouter();

    // Instant optimistic hydration of cards from sessionStorage to avoid any layout shift
    try {
        const cachedStatusesStr = sessionStorage.getItem('ewu_dashboard_statuses');
        if (cachedStatusesStr) {
            const cachedStatuses = JSON.parse(cachedStatusesStr);
            renderFeatureCards(cachedStatuses);
        }
    } catch (e) {}

    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', () => mobileMenu.classList.toggle('hidden'));
    }

    // Verify authentication first
    const authed = await checkAuth();
    if (!authed) return;

    // Render features based on admin-controlled statuses
    try {
        const statuses = (typeof window.fetchFeatureStatuses === 'function')
            ? await window.fetchFeatureStatuses()
            : {};
        renderFeatureCards(statuses);
        try {
            sessionStorage.setItem('ewu_dashboard_statuses', JSON.stringify(statuses));
        } catch (err) {}
    } catch (e) {
        renderFeatureCards({});
    }
});

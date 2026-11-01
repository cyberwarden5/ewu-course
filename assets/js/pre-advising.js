// ========================================
// Pre-Advising Page Logic
// Handles semester dropdown, dynamic pre-advising data fetching,
// credit load calculation, and dual grid/table rendering.
// ========================================

const API_BASE_URL = window.API_BASE_URL || 'https://api.aftabkabir.me';

// Built-in course title map for common courses
const COURSE_TITLES = {
    'CSE103': 'Structured Programming',
    'CSE106': 'Discrete Mathematics',
    'CSE110': 'Object Oriented Programming',
    'CSE200': 'Computer-Aided Engineering Drawing',
    'CSE207': 'Data Structures',
    'CSE209': 'Electrical Circuits',
    'CSE225': 'Numerical Methods',
    'CSE246': 'Algorithms',
    'CSE251': 'Electronic Circuits',
    'CSE302': 'Database Systems',
    'CSE303': 'Statistics for Data Science',
    'CSE325': 'Operating Systems',
    'CSE326': 'Compiler Design',
    'CSE345': 'Computer Architecture',
    'CSE350': 'Data Communications',
    'CSE412': 'Software Engineering',
    'FIN101': 'Principles of Finance',
    'MKT101': 'Principles of Marketing',
    'ACT101': 'Financial Accounting',
    'BUS231': 'Business Communication',
    'BUS321': 'Business for Engineering & Technology',
    'MAT101': 'Differential & Integral Calculus',
    'MAT102': 'Differential Equations & Special Functions',
    'MAT104': 'Coordinate Geometry & Vector Analysis',
    'STA102': 'Statistics and Probability',
    'CHE109': 'Engineering Chemistry-I',
    'PHY109': 'Engineering Physics-I',
    'ENG101': 'Basic English',
    'ENG102': 'Composition and Communication Skills',
    'GEN226': 'Emergence of Bangladesh'
};

let currentView = 'grid';
let availableSemesters = [];
let currentSemesterId = null;

// Clean text helper
function cleanText(s) {
    if (s == null) return '';
    return String(s).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Lookup course title
function getCourseTitle(code) {
    const cleanCode = cleanText(code).toUpperCase();
    return COURSE_TITLES[cleanCode] || `${cleanCode} Course`;
}

// Handle Logout
async function handleLogout(event) {
    if (event) event.preventDefault();
    try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) {}
    try {
        localStorage.removeItem('studentId');
        localStorage.removeItem('studentName');
        localStorage.removeItem('ewu_student_id');
        localStorage.removeItem('userId');
        sessionStorage.clear();
    } catch (e) {}
    window.location.href = 'login.html';
}
window.handleLogout = handleLogout;

// Switch Grid vs Table view
function switchView(view) {
    currentView = view;
    try { localStorage.setItem('preadvisingView', view); } catch (e) {}

    const gridEl = document.getElementById('coursesGridView');
    const tableEl = document.getElementById('coursesTableView');
    const gridBtn = document.getElementById('viewGridBtn');
    const tableBtn = document.getElementById('viewTableBtn');

    if (view === 'grid') {
        if (gridEl) gridEl.classList.remove('hidden');
        if (tableEl) tableEl.classList.add('hidden');
        if (gridBtn) gridBtn.className = 'p-1.5 rounded-lg bg-white/[0.1] text-white transition-colors';
        if (tableBtn) tableBtn.className = 'p-1.5 rounded-lg text-gray-400 hover:text-white transition-colors';
    } else {
        if (gridEl) gridEl.classList.add('hidden');
        if (tableEl) tableEl.classList.remove('hidden');
        if (tableBtn) tableBtn.className = 'p-1.5 rounded-lg bg-white/[0.1] text-white transition-colors';
        if (gridBtn) gridBtn.className = 'p-1.5 rounded-lg text-gray-400 hover:text-white transition-colors';
    }
}
window.switchView = switchView;

// Populate Semesters Dropdown
async function loadSemesters() {
    const select = document.getElementById('semesterSelect');
    if (!select) return;

    try {
        const res = await fetch(`${API_BASE_URL}/api/semesters`, { credentials: 'include' });
        if (res.status === 401 || res.status === 403) {
            window.location.href = 'login.html';
            return;
        }

        if (res.ok) {
            const list = await res.json();
            if (Array.isArray(list) && list.length > 0) {
                availableSemesters = list;
            }
        }
    } catch (e) {
        console.warn('Could not fetch semesters from worker, using defaults:', e);
    }

    if (!availableSemesters || availableSemesters.length === 0) {
        availableSemesters = [
            { SemesterId: 142, SemesterName: 'Spring-2027', Year: 2027, StartingDate: '2026-12-01T00:00:00' },
            { SemesterId: 141, SemesterName: 'Fall-2026', Year: 2026, StartingDate: '2026-08-09T00:00:00' },
            { SemesterId: 140, SemesterName: 'Summer-2026', Year: 2026, StartingDate: '2026-04-12T00:00:00' },
            { SemesterId: 139, SemesterName: 'Spring-2026', Year: 2026, StartingDate: '2025-12-01T00:00:00' }
        ];
    }

    // Determine upcoming semester
    const now = Date.now();
    let defaultSem = availableSemesters.find(s => s.StartingDate && new Date(s.StartingDate).getTime() > now);
    if (!defaultSem) defaultSem = availableSemesters[0];

    select.innerHTML = '';
    availableSemesters.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.SemesterId;
        opt.textContent = s.SemesterName || `Semester ${s.SemesterId}`;
        if (defaultSem && String(s.SemesterId) === String(defaultSem.SemesterId)) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });

    currentSemesterId = select.value;
    const activeBadge = document.getElementById('activeSemesterBadge');
    if (activeBadge) activeBadge.classList.remove('hidden');

    loadPreAdvising();
}

function onSemesterChange() {
    const select = document.getElementById('semesterSelect');
    if (!select) return;
    currentSemesterId = select.value;
    loadPreAdvising();
}
window.onSemesterChange = onSemesterChange;

// Fetch and render Pre-Advising courses
async function loadPreAdvising() {
    const loadingEl = document.getElementById('preadvisingLoading');
    const errorEl = document.getElementById('preadvisingError');
    const contentEl = document.getElementById('preadvisingContent');

    if (loadingEl) loadingEl.classList.remove('hidden');
    if (errorEl) errorEl.classList.add('hidden');
    if (contentEl) contentEl.classList.add('hidden');

    try {
        const url = currentSemesterId
            ? `${API_BASE_URL}/api/preadvising?semesterId=${encodeURIComponent(currentSemesterId)}`
            : `${API_BASE_URL}/api/preadvising`;

        const res = await fetch(url, { credentials: 'include' });
        if (res.status === 401 || res.status === 403) {
            window.location.href = 'login.html';
            return;
        }

        if (!res.ok) throw new Error('Failed to retrieve pre-advising data');

        const json = await res.json();
        const payload = json && json.data ? json.data : json;
        const courses = (payload && Array.isArray(payload.Result)) ? payload.Result : [];

        renderPreAdvising(courses);

        if (loadingEl) loadingEl.classList.add('hidden');
        if (contentEl) contentEl.classList.remove('hidden');
    } catch (err) {
        console.error('Pre-advising error:', err);
        if (loadingEl) loadingEl.classList.add('hidden');
        if (errorEl) {
            errorEl.classList.remove('hidden');
            const msgEl = document.getElementById('preadvisingErrorMsg');
            if (msgEl) msgEl.textContent = err.message || 'Unable to retrieve pre-advising data';
        }
    }
}
window.loadPreAdvising = loadPreAdvising;

function renderPreAdvising(courses) {
    const count = courses.length;
    let totalCredits = 0;
    courses.forEach(c => {
        totalCredits += parseFloat(c.CreditHour) || 0;
    });

    // Update Summary Stats
    const countEl = document.getElementById('summaryCourseCount');
    const creditsEl = document.getElementById('summaryCreditHours');
    const semNameEl = document.getElementById('summarySemesterName');
    const select = document.getElementById('semesterSelect');

    if (countEl) countEl.textContent = count;
    if (creditsEl) creditsEl.textContent = `${totalCredits % 1 === 0 ? totalCredits.toFixed(0) : totalCredits.toFixed(1)} cr`;
    if (semNameEl && select) {
        semNameEl.textContent = select.options[select.selectedIndex]?.text || 'Spring-2027';
    }

    const tableCreditsEl = document.getElementById('tableTotalCredits');
    if (tableCreditsEl) {
        tableCreditsEl.textContent = `${totalCredits % 1 === 0 ? totalCredits.toFixed(0) : totalCredits.toFixed(1)} Credits`;
    }

    // Render Grid View
    const gridView = document.getElementById('coursesGridView');
    if (gridView) {
        if (count === 0) {
            gridView.innerHTML = `
                <div class="col-span-full py-12 text-center text-gray-400 font-mono text-sm">
                    No pre-advised courses found for this semester.
                </div>
            `;
        } else {
            gridView.innerHTML = courses.map((course, idx) => {
                const code = cleanText(course.CourseCode);
                const title = getCourseTitle(code);
                const credits = parseFloat(course.CreditHour) || 0;
                const regId = course.PreCourseRegistrationId || '--';

                return `
                    <div class="relative overflow-hidden rounded-2xl p-5 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.08] hover:border-teal-500/40 transition-all duration-200 group shadow-lg">
                        <div class="flex items-start justify-between gap-3 mb-3">
                            <span class="inline-flex items-center px-3 py-1 rounded-xl text-xs font-mono font-bold bg-teal-500/15 border border-teal-500/30 text-teal-300">
                                ${code}
                            </span>
                            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                                Pre-Registered
                            </span>
                        </div>

                        <h3 class="text-sm font-semibold text-white group-hover:text-teal-300 transition-colors line-clamp-2">
                            ${title}
                        </h3>

                        <div class="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono">
                            <span class="text-gray-400">Credit Load:</span>
                            <span class="text-teal-400 font-bold">${credits % 1 === 0 ? credits.toFixed(0) : credits.toFixed(1)} Credits</span>
                        </div>

                        <div class="mt-2 flex items-center justify-between text-[11px] font-mono text-gray-400">
                            <span>Reference ID:</span>
                            <span class="text-gray-300">#${regId}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // Render Table View
    const tableBody = document.getElementById('coursesTableBody');
    if (tableBody) {
        if (count === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-8 text-center text-gray-400 font-mono text-xs">
                        No pre-advised courses recorded for this semester.
                    </td>
                </tr>
            `;
        } else {
            tableBody.innerHTML = courses.map((course, idx) => {
                const code = cleanText(course.CourseCode);
                const title = getCourseTitle(code);
                const credits = parseFloat(course.CreditHour) || 0;
                const regId = course.PreCourseRegistrationId || '--';

                return `
                    <tr class="hover:bg-white/[0.02] transition-colors">
                        <td class="py-3 px-4 font-mono text-gray-400">${idx + 1}</td>
                        <td class="py-3 px-4 font-mono font-bold text-teal-300">${code}</td>
                        <td class="py-3 px-4 font-medium text-white">${title}</td>
                        <td class="py-3 px-4 text-center font-mono font-bold text-white">${credits % 1 === 0 ? credits.toFixed(0) : credits.toFixed(1)}</td>
                        <td class="py-3 px-4 font-mono text-gray-400">#${regId}</td>
                        <td class="py-3 px-4 text-right">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Pre-Advised
                            </span>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Back to dashboard
    const backBtn = document.getElementById('backToDashBtn');
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            if (window.history.length > 1 && document.referrer.includes('dashboard')) {
                e.preventDefault();
                window.history.back();
            }
        });
    }

    // Saved view preference
    try {
        const savedView = localStorage.getItem('preadvisingView');
        if (savedView === 'table' || savedView === 'grid') {
            switchView(savedView);
        } else {
            switchView('grid');
        }
    } catch (e) {
        switchView('grid');
    }

    loadSemesters();
});


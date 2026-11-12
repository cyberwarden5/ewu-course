// ========================================
// Pre-Advising Page Logic
// Handles semester dropdown, dynamic pre-advising data fetching,
// credit load calculation, and dual grid/table rendering.
// ========================================

(() => {
    const API_BASE_URL = window.API_BASE_URL || 'https://api.aftabx.tech';

    let currentView = 'grid';
    let availableSemesters = [];
    let currentSemesterId = null;

    function cleanText(s) {
        if (s == null) return '';
        return String(s).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

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
            sessionStorage.setItem('ewu_just_logged_out', 'true');
        } catch (e) {}
        window.location.href = 'login';
    }
    window.handleLogout = handleLogout;

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

    async function loadSemesters() {
        const select = document.getElementById('semesterSelect');
        if (!select) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/semesters`, { credentials: 'include' });
            if (res.status === 401 || res.status === 403) {
                window.location.href = 'login';
                return;
            }

            if (res.ok) {
                const list = await res.json();
                if (Array.isArray(list) && list.length > 0) {
                    availableSemesters = list;
                }
            }
        } catch (e) {
            console.warn('Could not fetch semesters from worker:', e);
        }

        if (!availableSemesters || availableSemesters.length === 0) {
            availableSemesters = [
                { SemesterId: 142, SemesterName: 'Spring-2027', Year: 2027, StartingDate: '2026-12-01T00:00:00' },
                { SemesterId: 141, SemesterName: 'Fall-2026', Year: 2026, StartingDate: '2026-08-09T00:00:00' },
                { SemesterId: 140, SemesterName: 'Summer-2026', Year: 2026, StartingDate: '2026-04-12T00:00:00' },
                { SemesterId: 139, SemesterName: 'Spring-2026', Year: 2026, StartingDate: '2025-12-01T00:00:00' }
            ];
        }

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
                window.location.href = 'login';
                return;
            }

            const json = await res.json().catch(() => null);
            if (!res.ok) {
                const errMsg = json?.message || `Server returned status ${res.status} (${res.statusText || 'Error'})`;
                throw new Error(errMsg);
            }

            const payload = json && json.data ? json.data : json;
            let courses = [];
            if (payload) {
                if (Array.isArray(payload.courses)) {
                    courses = payload.courses;
                } else if (Array.isArray(payload.Result)) {
                    courses = payload.Result;
                } else if (payload.raw && Array.isArray(payload.raw.Result)) {
                    courses = payload.raw.Result;
                } else if (Array.isArray(payload)) {
                    courses = payload;
                }
            }

            currentCoursesList = courses;
            currentPayload = payload;

            renderPreAdvising(courses, payload);

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

    let currentCoursesList = [];
    let currentPayload = null;

    function renderPreAdvising(courses, meta = {}) {
        const count = typeof meta?.totalCourses === 'number' ? meta.totalCourses : courses.length;
        let totalCredits = 0;
        if (typeof meta?.totalCredits === 'number') {
            totalCredits = meta.totalCredits;
        } else {
            courses.forEach(c => {
                const cr = typeof c.CreditHour === 'number' ? c.CreditHour : (parseFloat(c.CreditHour) || 0);
                totalCredits += cr;
            });
        }

        const countEl = document.getElementById('summaryCourseCount');
        const creditsEl = document.getElementById('summaryCreditHours');
        const semNameEl = document.getElementById('summarySemesterName');
        const select = document.getElementById('semesterSelect');

        if (countEl) countEl.textContent = count;
        if (creditsEl) creditsEl.textContent = `${totalCredits % 1 === 0 ? totalCredits.toFixed(0) : totalCredits.toFixed(1)} cr`;
        const semName = (select && select.options && select.selectedIndex >= 0 && select.options[select.selectedIndex]) ? select.options[select.selectedIndex].text : 'Spring-2027';
        if (semNameEl) {
            semNameEl.textContent = semName;
        }

        const tableCreditsEl = document.getElementById('tableTotalCredits');
        if (tableCreditsEl) {
            tableCreditsEl.textContent = `${totalCredits % 1 === 0 ? totalCredits.toFixed(0) : totalCredits.toFixed(1)} Credits`;
        }

        const gridView = document.getElementById('coursesGridView');
        if (gridView) {
            if (count === 0) {
                gridView.innerHTML = `
                    <div class="col-span-full py-12 text-center text-gray-400 font-mono text-sm">
                        No pre-advised courses found for this semester.
                    </div>
                `;
            } else {
                gridView.innerHTML = courses.map((course) => {
                    const code = cleanText(course.CourseCode);
                    const courseName = cleanText(course.CourseName || course.CourseTitle);
                    const credits = parseFloat(course.CreditHour) || 0;
                    const regId = course.PreCourseRegistrationId || course.RegistrationId || '--';

                    return `
                        <div class="relative overflow-hidden rounded-2xl p-5 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.08] hover:border-teal-500/40 transition-all duration-200 group shadow-lg">
                            <div class="flex items-start justify-between gap-3 mb-3">
                                <span class="inline-flex items-center px-3 py-1.5 rounded-xl text-sm font-mono font-bold bg-teal-500/15 border border-teal-500/30 text-teal-300">
                                    ${code}
                                </span>
                                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                                    Pre-Registered
                                </span>
                            </div>

                            ${courseName ? `<div class="text-xs text-gray-300 font-medium mb-3">${courseName}</div>` : ''}

                            <div class="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono">
                                <span class="text-gray-400">Credit Load:</span>
                                <span class="text-teal-400 font-bold">${credits % 1 === 0 ? credits.toFixed(0) : credits.toFixed(1)} Credits</span>
                            </div>

                            <div class="mt-2 flex items-center justify-between text-[11px] font-mono text-gray-400">
                                <span>Registration ID:</span>
                                <span class="text-gray-300">#${regId}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        const tableBody = document.getElementById('coursesTableBody');
        if (tableBody) {
            if (count === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="py-8 text-center text-gray-400 font-mono text-xs">
                            No pre-advised courses recorded for this semester.
                        </td>
                    </tr>
                `;
            } else {
                tableBody.innerHTML = courses.map((course, idx) => {
                    const code = cleanText(course.CourseCode);
                    const credits = parseFloat(course.CreditHour) || 0;
                    const regId = course.PreCourseRegistrationId || course.RegistrationId || '--';

                    return `
                        <tr class="hover:bg-white/[0.02] transition-colors">
                            <td class="py-3 px-4 font-mono text-gray-400">${idx + 1}</td>
                            <td class="py-3 px-4 font-mono font-bold text-teal-300">${code}</td>
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

    // Export: Plain Text
    function exportPreAdvisingTxt() {
        if (!currentCoursesList.length) {
            alert('No courses to export.');
            return;
        }

        const select = document.getElementById('semesterSelect');
        const semName = select?.options[select.selectedIndex]?.text || 'Pre-Advising';
        const studentId = localStorage.getItem('studentId') || localStorage.getItem('userId') || localStorage.getItem('ewu_student_id') || 'Student';

        let totalCredits = 0;
        currentCoursesList.forEach(c => {
            totalCredits += parseFloat(c.CreditHour) || 0;
        });

        let txt = '==================================================\n';
        txt += 'EAST WEST UNIVERSITY - PRE-ADVISING RECORD\n';
        txt += '==================================================\n';
        txt += `Student ID    : ${studentId}\n`;
        txt += `Semester      : ${semName}\n`;
        txt += `Generated On  : ${new Date().toLocaleString()}\n`;
        txt += `Total Courses : ${currentCoursesList.length}\n`;
        txt += `Total Credits : ${totalCredits.toFixed(1)} Credits\n`;
        txt += '--------------------------------------------------\n';
        txt += '#   Course Code   Credits   Registration ID\n';
        txt += '--------------------------------------------------\n';

        currentCoursesList.forEach((c, idx) => {
            const num = String(idx + 1).padEnd(4, ' ');
            const code = cleanText(c.CourseCode).padEnd(14, ' ');
            const credits = (parseFloat(c.CreditHour) || 0).toFixed(1).padEnd(10, ' ');
            const regId = '#' + (c.PreCourseRegistrationId || c.RegistrationId || '--');
            txt += `${num}${code}${credits}${regId}\n`;
        });

        txt += '==================================================\n';
        txt += 'Status: Pre-Advising Confirmed in Portal\n';

        const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `EWU_PreAdvising_${semName.replace(/[^a-z0-9]+/gi, '_')}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }
    window.exportPreAdvisingTxt = exportPreAdvisingTxt;

    // Export: PDF
    function exportPreAdvisingPdf() {
        if (!currentCoursesList.length) {
            alert('No courses to export.');
            return;
        }

        if (!window.jspdf || !window.jspdf.jsPDF) {
            window.print();
            return;
        }

        const select = document.getElementById('semesterSelect');
        const semName = select?.options[select.selectedIndex]?.text || 'Pre-Advising';
        const studentId = localStorage.getItem('studentId') || localStorage.getItem('userId') || localStorage.getItem('ewu_student_id') || 'Student';

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

        doc.setFontSize(16);
        doc.setTextColor(17, 24, 39);
        doc.setFont('helvetica', 'bold');
        doc.text('EAST WEST UNIVERSITY', 40, 48);

        doc.setFontSize(12);
        doc.setTextColor(13, 148, 136);
        doc.text('Pre-Advising Record', 40, 68);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(107, 114, 128);
        doc.text(`Semester: ${semName}   |   Student ID: ${studentId}   |   Date: ${new Date().toLocaleDateString()}`, 40, 86);

        let totalCredits = 0;
        const rows = currentCoursesList.map((c, i) => {
            const cr = parseFloat(c.CreditHour) || 0;
            totalCredits += cr;
            return [
                i + 1,
                cleanText(c.CourseCode),
                cr.toFixed(1),
                `#${c.PreCourseRegistrationId || c.RegistrationId || '--'}`,
                'Pre-Advised'
            ];
        });

        doc.autoTable({
            head: [['#', 'Course Code', 'Credit Hours', 'Registration ID', 'Status']],
            body: rows,
            foot: [['', 'Total Credit Load', `${totalCredits.toFixed(1)} Credits`, '', 'Confirmed']],
            startY: 100,
            styles: { fontSize: 9, cellPadding: 6 },
            headStyles: { fillColor: [13, 148, 136], textColor: [255, 255, 255], fontStyle: 'bold' },
            footStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [249, 250, 251] }
        });

        doc.save(`EWU_PreAdvising_${semName.replace(/[^a-z0-9]+/gi, '_')}.pdf`);
    }
    window.exportPreAdvisingPdf = exportPreAdvisingPdf;

    function initPreAdvisingPage() {
        const uid = localStorage.getItem('studentId') || localStorage.getItem('userId') || localStorage.getItem('ewu_student_id');
        const uidEl = document.getElementById('userId');
        if (uidEl && uid) uidEl.textContent = uid;
        const printUidEl = document.getElementById('printStudentId');
        if (printUidEl && uid) printUidEl.textContent = uid;
        const printDateEl = document.getElementById('printDate');
        if (printDateEl) printDateEl.textContent = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

        try {
            const savedView = localStorage.getItem('preadvisingView');
            if (savedView === 'table' || savedView === 'grid') {
                switchView(savedView);
            } else {
                switchView('table');
            }
        } catch (e) {
            switchView('table');
        }

        loadSemesters();
    }
    window.initPreAdvisingPage = initPreAdvisingPage;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (!window.__EWU_AJAX_NAV__) initPreAdvisingPage(); });
    } else if (!window.__EWU_AJAX_NAV__) {
        initPreAdvisingPage();
    }
})();

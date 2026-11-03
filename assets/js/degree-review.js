// ========================================
// Degree Review & Academic Audit Logic
// Visualizes degree progress, completed course areas,
// credit breakdowns, and graduation audit.
// ========================================

(() => {
    const API_BASE_URL = window.API_BASE_URL || 'https://api.aftabkabir.me';

    function cleanStr(s) {
        if (s == null) return '';
        return String(s).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function getGradeBadgeClass(grade) {
        const g = (grade || '').trim().toUpperCase();
        if (g === 'A+' || g === 'A') return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300';
        if (g === 'A-') return 'bg-teal-500/15 border-teal-500/30 text-teal-300';
        if (g === 'B+' || g === 'B') return 'bg-sky-500/15 border-sky-500/30 text-sky-300';
        if (g === 'B-' || g === 'C+' || g === 'C') return 'bg-amber-500/15 border-amber-500/30 text-amber-300';
        if (g === 'D+' || g === 'D') return 'bg-orange-500/15 border-orange-500/30 text-orange-300';
        if (g === 'F') return 'bg-red-500/15 border-red-500/30 text-red-300';
        return 'bg-white/10 border-white/20 text-gray-300';
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
        window.location.href = 'login.html';
    }
    window.handleLogout = handleLogout;

    async function loadDegreeReview() {
        const loadingEl = document.getElementById('degreeLoading');
        const errorEl = document.getElementById('degreeError');
        const contentEl = document.getElementById('degreeContent');

        if (loadingEl) loadingEl.classList.remove('hidden');
        if (errorEl) errorEl.classList.add('hidden');
        if (contentEl) contentEl.classList.add('hidden');

        try {
            const res = await fetch(`${API_BASE_URL}/api/degree-review`, { credentials: 'include' });
            if (res.status === 401 || res.status === 403) {
                window.location.href = 'login.html';
                return;
            }

            const json = await res.json().catch(() => null);
            if (!res.ok) {
                const errMsg = json?.message || `Server returned status ${res.status} (${res.statusText || 'Error'})`;
                throw new Error(errMsg);
            }

            if (!json || json.status === 'error') {
                throw new Error(json?.message || 'Invalid degree review response received');
            }

            renderDegreeReview(json);

            if (loadingEl) loadingEl.classList.add('hidden');
            if (contentEl) contentEl.classList.remove('hidden');
        } catch (err) {
            console.error('Degree review error:', err);
            if (loadingEl) loadingEl.classList.add('hidden');
            if (errorEl) {
                errorEl.classList.remove('hidden');
                const msgEl = document.getElementById('degreeErrorMsg');
                if (msgEl) msgEl.textContent = err.message || 'Unable to load degree audit';
            }
        }
    }
    window.loadDegreeReview = loadDegreeReview;

    function renderDegreeReview(data) {
        const analysis = data.analysis || {};
        const courseAreas = Array.isArray(data.courseAreas) ? data.courseAreas : [];
        const transferWaiver = data.transferWaiver || {};

        const studentName = cleanStr(analysis.FirstName) || localStorage.getItem('studentName') || 'Student';
        const studentId = cleanStr(analysis.StudentId) || data.studentId || localStorage.getItem('studentId') || '--';
        const programName = cleanStr(analysis.ProgramCurriculumName) || 'B.Sc. in Computer Science and Engineering';

        const earnedCr = parseFloat(analysis.CrEarned || analysis.CreditsAttend || 0);
        const minCr = parseFloat(analysis.MinCr || 140);
        const remainingCr = parseFloat(analysis.RemainingCr || (minCr - earnedCr));
        const cgpa = (analysis.CGPA != null && !isNaN(analysis.CGPA)) ? Number(analysis.CGPA).toFixed(2) : '--';

        const progressPct = minCr > 0 ? Math.min(100, Math.max(0, (earnedCr / minCr) * 100)) : 0;

        const nameEl = document.getElementById('degreeStudentName');
        const idEl = document.getElementById('degreeStudentId');
        const progEl = document.getElementById('degreeProgramName');
        if (nameEl) nameEl.textContent = studentName;
        if (idEl) idEl.textContent = studentId;
        if (progEl) progEl.textContent = programName;

        const pctEl = document.getElementById('degreeProgressPercent');
        const barEl = document.getElementById('degreeProgressBar');
        const earnedCrEl = document.getElementById('degreeEarnedCr');
        const remainingCrEl = document.getElementById('degreeRemainingCr');

        if (pctEl) pctEl.textContent = `${progressPct.toFixed(1)}% Completed`;
        if (barEl) {
            setTimeout(() => {
                if (barEl && barEl.style) barEl.style.width = `${progressPct}%`;
            }, 100);
        }
        if (earnedCrEl) earnedCrEl.textContent = `${earnedCr.toFixed(1)}`;
        if (remainingCrEl) remainingCrEl.textContent = `${remainingCr.toFixed(1)}`;

        const statCrEarned = document.getElementById('statCrEarned');
        const statCrRemaining = document.getElementById('statCrRemaining');
        const statCrMin = document.getElementById('statCrMin');
        const statDegreeCgpa = document.getElementById('statDegreeCgpa');

        if (statCrEarned) statCrEarned.textContent = earnedCr.toFixed(1);
        if (statCrRemaining) statCrRemaining.textContent = remainingCr.toFixed(1);
        if (statCrMin) statCrMin.textContent = minCr.toFixed(1);
        if (statDegreeCgpa) statDegreeCgpa.textContent = cgpa;

        renderCourseAreas(courseAreas);
        renderTransferWaiver(transferWaiver);
    }

    function renderCourseAreas(areas) {
        const container = document.getElementById('courseAreasContainer');
        if (!container) return;

        if (!areas || areas.length === 0) {
            container.innerHTML = `
                <div class="py-12 text-center text-gray-400 font-mono text-sm rounded-2xl bg-white/[0.02] border border-white/[0.08]">
                    No specific course area breakdown returned for this degree program.
                </div>
            `;
            return;
        }

        container.innerHTML = areas.map((area, idx) => {
            const areaName = cleanStr(area.Area) || `Area ${idx + 1}`;
            const totalCredits = parseFloat(area.TotalAreaCredits) || 0;
            const earned = parseFloat(area.TotalCreditsEarned) || 0;
            const remaining = parseFloat(area.TotalRemainingCredits) || Math.max(0, totalCredits - earned);
            const courses = Array.isArray(area.CourseView) ? area.CourseView : [];
            const isCompleted = totalCredits > 0 && remaining <= 0;
            const areaPct = totalCredits > 0 ? Math.min(100, Math.round((earned / totalCredits) * 100)) : (courses.length > 0 ? 100 : 0);

            const statusBadge = isCompleted
                ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">✓ Completed</span>`
                : `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold">${remaining.toFixed(1)} cr remaining</span>`;

            return `
                <div class="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-all duration-200 area-card" id="areaCard-${idx}">
                    <button type="button" onclick="toggleArea(${idx})" class="w-full p-5 text-left flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.03] transition-colors cursor-pointer">
                        <div class="space-y-1.5 flex-grow">
                            <div class="flex items-center gap-3 flex-wrap">
                                <h3 class="text-sm sm:text-base font-bold text-white tracking-tight">${areaName}</h3>
                                ${statusBadge}
                            </div>
                            <div class="flex items-center gap-4 text-xs font-mono text-gray-400">
                                <span>Earned: <strong class="text-white">${earned.toFixed(1)}</strong> / ${totalCredits.toFixed(1)} Credits</span>
                                <span>•</span>
                                <span>Courses: <strong class="text-white">${courses.length}</strong></span>
                            </div>
                        </div>

                        <div class="flex items-center gap-4 w-full md:w-64">
                            <div class="flex-grow space-y-1">
                                <div class="flex justify-between text-[11px] font-mono text-gray-400">
                                    <span>Progress</span>
                                    <span class="text-white font-semibold">${areaPct}%</span>
                                </div>
                                <div class="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                                    <div class="h-full rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}" style="width: ${areaPct}%"></div>
                                </div>
                            </div>
                            <svg class="w-5 h-5 text-gray-400 transform transition-transform duration-200 area-chevron flex-shrink-0" id="areaChevron-${idx}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </div>
                    </button>

                    <div class="area-drawer border-t border-white/[0.06] p-4 bg-white/[0.01]" id="areaDrawer-${idx}">
                        ${courses.length > 0 ? `
                            <div class="overflow-x-auto">
                                <table class="w-full text-left text-xs">
                                    <thead class="bg-white/[0.03] text-gray-400 font-mono uppercase tracking-wider">
                                        <tr>
                                            <th class="py-2.5 px-3">Course Code</th>
                                            <th class="py-2.5 px-3">Course Title</th>
                                            <th class="py-2.5 px-3 text-center">Credit</th>
                                            <th class="py-2.5 px-3 text-center">Grade</th>
                                            <th class="py-2.5 px-3 text-center">Grade Point</th>
                                            <th class="py-2.5 px-3 text-right">Earned Cr</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-white/[0.04] text-gray-200">
                                        ${courses.map(c => `
                                            <tr class="hover:bg-white/[0.02]">
                                                <td class="py-2.5 px-3 font-mono font-bold text-indigo-300">${cleanStr(c.CourseCode)}</td>
                                                <td class="py-2.5 px-3 font-medium text-white">${cleanStr(c.CourseName)}</td>
                                                <td class="py-2.5 px-3 text-center font-mono">${(parseFloat(c.CreditHour) || 0).toFixed(1)}</td>
                                                <td class="py-2.5 px-3 text-center">
                                                    <span class="inline-block px-2 py-0.5 rounded font-mono font-bold text-xs border ${getGradeBadgeClass(c.Grade)}">
                                                        ${cleanStr(c.Grade) || '--'}
                                                    </span>
                                                </td>
                                                <td class="py-2.5 px-3 text-center font-mono text-gray-300">${c.GradePoint != null ? parseFloat(c.GradePoint).toFixed(2) : '--'}</td>
                                                <td class="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">${(parseFloat(c.CreditEarn || c.CreditHour) || 0).toFixed(1)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : `
                            <div class="py-4 text-center text-xs font-mono text-gray-400">
                                No courses completed yet in this area. ${remaining > 0 ? `${remaining.toFixed(1)} credits remaining to fulfill this area.` : ''}
                            </div>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    }

    function toggleArea(idx) {
        const drawer = document.getElementById(`areaDrawer-${idx}`);
        const chevron = document.getElementById(`areaChevron-${idx}`);
        if (!drawer) return;

        const isHidden = drawer.classList.contains('hidden');
        if (isHidden) {
            drawer.classList.remove('hidden');
            if (chevron) chevron.classList.add('rotate-180');
        } else {
            drawer.classList.add('hidden');
            if (chevron) chevron.classList.remove('rotate-180');
        }
    }
    window.toggleArea = toggleArea;

    function toggleAllAreas(expand) {
        const drawers = document.querySelectorAll('.area-drawer');
        const chevrons = document.querySelectorAll('.area-chevron');
        drawers.forEach(d => {
            if (expand) d.classList.remove('hidden');
            else d.classList.add('hidden');
        });
        chevrons.forEach(c => {
            if (expand) c.classList.add('rotate-180');
            else c.classList.remove('rotate-180');
        });
    }
    window.toggleAllAreas = toggleAllAreas;

    function renderTransferWaiver(tw) {
        const section = document.getElementById('transferWaiverSection');
        const content = document.getElementById('transferWaiverContent');
        if (!section || !content) return;

        const transferCourses = tw.TransferData?.courses || [];
        const waiverCourses = tw.WaiverData?.courses || [];
        const hasRecords = transferCourses.length > 0 || waiverCourses.length > 0;

        section.classList.remove('hidden');

        if (!hasRecords) {
            content.innerHTML = `
                <div class="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] text-gray-400 font-mono">
                    No transfer or waived courses recorded on file. All degree credits are completed at East West University.
                </div>
            `;
            return;
        }

        content.innerHTML = `
            <div class="space-y-3">
                ${transferCourses.length > 0 ? `
                    <div>
                        <h4 class="font-semibold text-white mb-2">Transferred Courses (${tw.TransferData.TransferFrom || 'External'}):</h4>
                        <ul class="list-disc list-inside space-y-1 font-mono text-gray-300">
                            ${transferCourses.map(c => `<li>${cleanStr(c.CourseCode || c.CourseName)} - ${c.CreditHour || 0} Credits</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                ${waiverCourses.length > 0 ? `
                    <div>
                        <h4 class="font-semibold text-white mb-2">Waived Courses:</h4>
                        <ul class="list-disc list-inside space-y-1 font-mono text-gray-300">
                            ${waiverCourses.map(c => `<li>${cleanStr(c.CourseCode || c.CourseName)} - ${c.CreditHour || 0} Credits</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }

    function initDegreeReviewPage() {
        const backBtn = document.getElementById('backToDashBtn');
        if (backBtn) {
            backBtn.onclick = (e) => {
                if (window.history.length > 1 && document.referrer.includes('dashboard')) {
                    e.preventDefault();
                    window.history.back();
                }
            };
        }
        loadDegreeReview();
    }
    window.initDegreeReviewPage = initDegreeReviewPage;

    let currentDegreeData = null;

    // Hook renderDegreeReview to retain data
    const _origRender = renderDegreeReview;
    renderDegreeReview = function(data) {
        currentDegreeData = data;
        const studentId = cleanStr(data.analysis?.StudentId) || data.studentId || localStorage.getItem('studentId') || localStorage.getItem('ewu_student_id') || localStorage.getItem('userId');
        if (studentId) {
            const userBadge = document.getElementById('userId');
            if (userBadge) userBadge.textContent = studentId;
        }
        _origRender(data);
    };

    function exportDegreeReviewTxt() {
        if (!currentDegreeData) {
            alert('Degree review data is still loading.');
            return;
        }
        const analysis = currentDegreeData.analysis || {};
        const areas = Array.isArray(currentDegreeData.courseAreas) ? currentDegreeData.courseAreas : [];
        const studentName = cleanStr(analysis.FirstName) || localStorage.getItem('studentName') || 'Student';
        const studentId = cleanStr(analysis.StudentId) || currentDegreeData.studentId || localStorage.getItem('studentId') || '--';
        const programName = cleanStr(analysis.ProgramCurriculumName) || 'B.Sc. in Computer Science and Engineering';
        const earnedCr = parseFloat(analysis.CrEarned || analysis.CreditsAttend || 0).toFixed(1);
        const minCr = parseFloat(analysis.MinCr || 140).toFixed(1);
        const remainingCr = parseFloat(analysis.RemainingCr || (minCr - earnedCr)).toFixed(1);
        const cgpa = (analysis.CGPA != null && !isNaN(analysis.CGPA)) ? Number(analysis.CGPA).toFixed(2) : '--';

        let lines = [];
        lines.push('================================================================');
        lines.push('               EAST WEST UNIVERSITY - DEGREE AUDIT');
        lines.push('================================================================');
        lines.push(`Student Name : ${studentName}`);
        lines.push(`Student ID   : ${studentId}`);
        lines.push(`Program      : ${programName}`);
        lines.push(`CGPA         : ${cgpa}`);
        lines.push(`Credits      : Earned ${earnedCr} / Required ${minCr} (Remaining: ${remainingCr})`);
        lines.push(`Generated On : ${new Date().toLocaleString()}`);
        lines.push('================================================================\n');

        areas.forEach((area, idx) => {
            const areaName = cleanStr(area.Area) || `Area ${idx + 1}`;
            const total = (parseFloat(area.TotalAreaCredits) || 0).toFixed(1);
            const earned = (parseFloat(area.TotalCreditsEarned) || 0).toFixed(1);
            const rem = (parseFloat(area.TotalRemainingCredits) || 0).toFixed(1);
            const courses = Array.isArray(area.CourseView) ? area.CourseView : [];

            lines.push(`----------------------------------------------------------------`);
            lines.push(`AREA: ${areaName}`);
            lines.push(`Credits: Earned ${earned} / Required ${total} (Remaining: ${rem})`);
            lines.push(`----------------------------------------------------------------`);
            if (courses.length === 0) {
                lines.push('  No completed courses in this area.\n');
            } else {
                lines.push(`  CODE        CREDIT   GRADE   GP     TITLE`);
                lines.push(`  --------------------------------------------------------------`);
                courses.forEach(c => {
                    const code = cleanStr(c.CourseCode).padEnd(12);
                    const cr = (parseFloat(c.CreditHour) || 0).toFixed(1).padStart(6);
                    const gr = cleanStr(c.Grade || '--').padStart(6);
                    const gp = (c.GradePoint != null ? parseFloat(c.GradePoint).toFixed(2) : '--').padStart(6);
                    const title = cleanStr(c.CourseName);
                    lines.push(`  ${code} ${cr} ${gr} ${gp}   ${title}`);
                });
                lines.push('');
            }
        });

        const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Degree_Review_${studentId.replace(/[^a-zA-Z0-9_-]/g, '') || 'Report'}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    window.exportDegreeReviewTxt = exportDegreeReviewTxt;

    function exportDegreeReviewPdf() {
        toggleAllAreas(true);
        setTimeout(() => {
            window.print();
        }, 150);
    }
    window.exportDegreeReviewPdf = exportDegreeReviewPdf;

    function initDegreeReviewPage() {
        const studentId = localStorage.getItem('studentId') || localStorage.getItem('ewu_student_id') || localStorage.getItem('userId');
        if (studentId) {
            const userBadge = document.getElementById('userId');
            if (userBadge) userBadge.textContent = studentId;
            const degreeStudentId = document.getElementById('degreeStudentId');
            if (degreeStudentId && degreeStudentId.textContent === '--') degreeStudentId.textContent = studentId;
        }
        const printDateEl = document.getElementById('printDegreeDate');
        if (printDateEl) {
            printDateEl.textContent = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        }
        const backBtn = document.getElementById('backToDashBtn');
        if (backBtn) {
            backBtn.onclick = (e) => {
                if (window.history.length > 1 && document.referrer.includes('dashboard')) {
                    e.preventDefault();
                    window.history.back();
                }
            };
        }
        loadDegreeReview();
    }
    window.initDegreeReviewPage = initDegreeReviewPage;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (!window.__EWU_AJAX_NAV__) initDegreeReviewPage(); });
    } else if (!window.__EWU_AJAX_NAV__) {
        initDegreeReviewPage();
    }
})();

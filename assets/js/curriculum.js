// ========================================
// Curriculum Explorer Logic
// Handles curriculum structure, course catalog search,
// subject filtering, major tracks, and equivalencies.
// ========================================

(() => {
    const API_BASE_URL = window.API_BASE_URL || 'https://api.aftabkabir.me';

    let allCoursesList = [];
    let majorTracksList = [];
    let equivalentsList = [];
    let currentCurriculumData = null;
    let currentActiveTab = 'courses';

    function cleanStr(s) {
        if (s == null) return '';
        return String(s).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function getCourseBadgeColor(code) {
        const c = cleanStr(code).toUpperCase();
        if (c.startsWith('CSE')) return 'bg-amber-500/15 border-amber-500/30 text-amber-300';
        if (c.startsWith('MAT') || c.startsWith('STA')) return 'bg-blue-500/15 border-blue-500/30 text-blue-300';
        if (c.startsWith('ENG')) return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300';
        if (c.startsWith('BUS') || c.startsWith('ACT') || c.startsWith('FIN') || c.startsWith('MKT')) return 'bg-purple-500/15 border-purple-500/30 text-purple-300';
        if (c.startsWith('PHY') || c.startsWith('CHE')) return 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300';
        return 'bg-rose-500/15 border-rose-500/30 text-rose-300';
    }

    // ========================================
    // Export Functions (Exposed immediately to window)
    // ========================================
    function exportCurriculumTxt() {
        if (!allCoursesList.length && !currentCurriculumData) {
            alert('Curriculum catalog is still loading. Please wait a moment and try again.');
            return;
        }

        const prog = currentCurriculumData?.program || {};
        const progName = cleanStr(prog.ProgramCurriculumName) || 'B.Sc. in Computer Science and Engineering';
        const session = cleanStr(prog.SemesterName || prog.EffectiveSessionName) || 'Summer-2018';
        const minCr = (parseFloat(prog.TotalCredits || prog.MinCr) || 140).toFixed(1);
        const studentId = localStorage.getItem('studentId') || localStorage.getItem('ewu_student_id') || localStorage.getItem('userId') || '--';

        let lines = [];
        lines.push('========================================================================================');
        lines.push('                   EAST WEST UNIVERSITY - PROGRAM CURRICULUM');
        lines.push('========================================================================================');
        lines.push(`Program           : ${progName}`);
        lines.push(`Effective Session : ${session}`);
        lines.push(`Required Credits  : ${minCr} Credits`);
        lines.push(`Total Courses     : ${allCoursesList.length}`);
        lines.push(`Student ID        : ${studentId}`);
        lines.push(`Exported On       : ${new Date().toLocaleString()}`);
        lines.push('========================================================================================\n');

        lines.push('----------------------------------------------------------------------------------------');
        lines.push('                                COURSE CATALOG LISTING');
        lines.push('----------------------------------------------------------------------------------------');
        lines.push('COURSE CODE   CREDITS   MIN-REQ   PREREQUISITES             COURSE TITLE');
        lines.push('----------------------------------------------------------------------------------------');

        allCoursesList.forEach(c => {
            const code = cleanStr(c.CourseCode).padEnd(13);
            const cr = (parseFloat(c.CreditHour) || 0).toFixed(1).padStart(7);
            const minPrereq = (parseFloat(c.MinCredit || c.CreditPass) || 0).toFixed(0).padStart(7) + ' cr';
            const prereqs = cleanStr(c.PrerequisiteCourseCodes || c.PreRequisiteCourses || 'None').padEnd(25);
            const title = cleanStr(c.CourseName || c.CourseTitle || 'Untitled Course');
            lines.push(`${code} ${cr}   ${minPrereq}   ${prereqs} ${title}`);
        });

        if (majorTracksList.length > 0) {
            lines.push('\n========================================================================================');
            lines.push('                               MAJOR SPECIALIZATION TRACKS');
            lines.push('========================================================================================');
            majorTracksList.forEach(tr => {
                const trName = cleanStr(tr.MajorMinorName || tr.MajorAreaName || 'Specialization Track');
                const reqCr = (parseFloat(tr.CreditRuleCredits) || 20).toFixed(1);
                const trCourses = Array.isArray(tr.MajorAreaCoursesViews || tr.Courses) ? (tr.MajorAreaCoursesViews || tr.Courses) : [];
                lines.push(`\n[ TRACK: ${trName} (Required: ${reqCr} Credits, Available Courses: ${trCourses.length}) ]`);
                lines.push('----------------------------------------------------------------------------------------');
                trCourses.forEach(tc => {
                    const cCode = cleanStr(tc.CourseCode).padEnd(12);
                    const cCr = (parseFloat(tc.CreditHour) || 0).toFixed(1).padStart(5);
                    const cTitle = cleanStr(tc.CourseName || tc.CourseTitle || '');
                    lines.push(`  - ${cCode} ${cCr} cr  : ${cTitle}`);
                });
            });
        }

        if (equivalentsList.length > 0) {
            lines.push('\n========================================================================================');
            lines.push('                                COURSE EQUIVALENCIES');
            lines.push('========================================================================================');
            lines.push('STANDARD CURRICULUM COURSE         ACCEPTED EQUIVALENT COURSE         CREDIT');
            lines.push('----------------------------------------------------------------------------------------');
            equivalentsList.forEach(eq => {
                const stdCourse = cleanStr(eq.CourseName).padEnd(34);
                const eqCourse = cleanStr(eq.EquivalentCourseName).padEnd(34);
                const eqCr = (parseFloat(eq.CreditHour) || 0).toFixed(1).padStart(5);
                lines.push(`${stdCourse} ${eqCourse} ${eqCr}`);
            });
        }

        const safeProg = progName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
        const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Curriculum_${safeProg}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function exportCurriculumPdf() {
        window.print();
    }

    // Attach to window immediately so inline button onclick attributes never throw ReferenceError
    window.exportCurriculumTxt = exportCurriculumTxt;
    window.exportCurriculumPdf = exportCurriculumPdf;

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

    function selectTab(tabKey) {
        currentActiveTab = tabKey;
        const tabs = ['courses', 'tracks', 'equivalents'];
        tabs.forEach(t => {
            const btn = document.getElementById(`tabBtn-${t}`);
            const content = document.getElementById(`tabContent-${t}`);
            if (t === tabKey) {
                if (btn) btn.className = 'px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-white/[0.08] border border-white/10 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap';
                if (content) content.classList.remove('hidden');
            } else {
                if (btn) btn.className = 'px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-400 hover:text-white transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap';
                if (content) content.classList.add('hidden');
            }
        });
    }
    window.selectTab = selectTab;

    async function loadCurriculum() {
        const loadingEl = document.getElementById('curriculumLoading');
        const errorEl = document.getElementById('curriculumError');
        const contentEl = document.getElementById('curriculumContent');

        if (loadingEl) loadingEl.classList.remove('hidden');
        if (errorEl) errorEl.classList.add('hidden');
        if (contentEl) contentEl.classList.add('hidden');

        try {
            const res = await fetch(`${API_BASE_URL}/api/curriculum`, { credentials: 'include' });
            if (res.status === 401 || res.status === 403) {
                window.location.href = 'login.html';
                return;
            }

            const json = await res.json().catch(() => null);
            if (!res.ok) {
                const errMsg = json?.message || `Server returned status ${res.status} (${res.statusText || 'Error'})`;
                throw new Error(errMsg);
            }

            const data = json && json.data ? json.data : json;
            if (!data || typeof data !== 'object') {
                throw new Error(json?.message || 'Empty or invalid curriculum catalog received');
            }

            currentCurriculumData = data;
            allCoursesList = Array.isArray(data.allCourses) ? data.allCourses : [];
            majorTracksList = data.majorAreas?.MajorAreaCoursesVMs || [];
            equivalentsList = Array.isArray(data.equivalents) ? data.equivalents : [];

            renderCurriculumHeader(data);
            applyFilters();
            renderMajorTracks(majorTracksList);
            renderEquivalencies(equivalentsList);

            if (loadingEl) loadingEl.classList.add('hidden');
            if (contentEl) contentEl.classList.remove('hidden');
        } catch (err) {
            console.error('Curriculum error:', err);
            if (loadingEl) loadingEl.classList.add('hidden');
            if (errorEl) {
                errorEl.classList.remove('hidden');
                const msgEl = document.getElementById('curriculumErrorMsg');
                if (msgEl) msgEl.textContent = err.message || 'Unable to load curriculum catalog';
            }
        }
    }
    window.loadCurriculum = loadCurriculum;

    function renderCurriculumHeader(data) {
        currentCurriculumData = data;
        const studentId = localStorage.getItem('studentId') || localStorage.getItem('ewu_student_id') || localStorage.getItem('userId');
        if (studentId) {
            const userBadge = document.getElementById('userId');
            if (userBadge) userBadge.textContent = studentId;
        }

        const program = data.program || {};
        const titleEl = document.getElementById('currProgramTitle');
        const sessionEl = document.getElementById('currEffectiveSession');
        const creditsEl = document.getElementById('currStatCredits');
        const coursesCountEl = document.getElementById('currStatCourseCount');
        const tracksCountEl = document.getElementById('currStatTracks');

        if (titleEl) titleEl.textContent = cleanStr(program.ProgramCurriculumName) || 'B.Sc. in Computer Science and Engineering';
        if (sessionEl) sessionEl.textContent = cleanStr(program.SemesterName || program.EffectiveSessionName) || 'Summer-2018';
        if (creditsEl) creditsEl.textContent = program.TotalCredits ? parseFloat(program.TotalCredits).toFixed(1) : (program.MinCr ? parseFloat(program.MinCr).toFixed(1) : '140.0');
        if (coursesCountEl) coursesCountEl.textContent = allCoursesList.length;
        if (tracksCountEl) tracksCountEl.textContent = majorTracksList.length;

        const bCourses = document.getElementById('tabBadgeCourses');
        const bTracks = document.getElementById('tabBadgeTracks');
        const bEquiv = document.getElementById('tabBadgeEquiv');

        if (bCourses) bCourses.textContent = allCoursesList.length;
        if (bTracks) bTracks.textContent = majorTracksList.length;
        if (bEquiv) bEquiv.textContent = equivalentsList.length;
    }

    function applyFilters() {
        const searchInput = document.getElementById('courseSearchInput');
        const prefixFilter = document.getElementById('coursePrefixFilter');
        const sortFilter = document.getElementById('courseSortFilter');

        const query = (searchInput?.value || '').trim().toLowerCase();
        const prefix = prefixFilter?.value || 'ALL';
        const sortOrder = sortFilter?.value || 'code_asc';

        let filtered = allCoursesList.filter(course => {
            const code = cleanStr(course.CourseCode).toLowerCase();
            const name = cleanStr(course.CourseName || course.CourseTitle).toLowerCase();
            const prereq = cleanStr(course.PrerequisiteCourseCodes || course.PreRequisiteCourses).toLowerCase();

            if (query) {
                const matchesQuery = code.includes(query) || name.includes(query) || prereq.includes(query);
                if (!matchesQuery) return false;
            }

            if (prefix !== 'ALL') {
                if (!code.startsWith(prefix.toLowerCase())) return false;
            }

            return true;
        });

        filtered.sort((a, b) => {
            const codeA = cleanStr(a.CourseCode);
            const codeB = cleanStr(b.CourseCode);
            const nameA = cleanStr(a.CourseName || a.CourseTitle);
            const nameB = cleanStr(b.CourseName || b.CourseTitle);
            const minA = parseFloat(a.MinCredit || a.CreditPass) || 0;
            const minB = parseFloat(b.MinCredit || b.CreditPass) || 0;

            if (sortOrder === 'code_asc') return codeA.localeCompare(codeB);
            if (sortOrder === 'code_desc') return codeB.localeCompare(codeA);
            if (sortOrder === 'name_asc') return nameA.localeCompare(nameB);
            if (sortOrder === 'min_credit') return minA - minB;
            return 0;
        });

        const countEl = document.getElementById('filterResultCount');
        if (countEl) countEl.textContent = filtered.length;

        renderCoursesGrid(filtered);
    }
    window.applyFilters = applyFilters;

    function resetFilters() {
        const searchInput = document.getElementById('courseSearchInput');
        const prefixFilter = document.getElementById('coursePrefixFilter');
        const sortFilter = document.getElementById('courseSortFilter');

        if (searchInput) searchInput.value = '';
        if (prefixFilter) prefixFilter.value = 'ALL';
        if (sortFilter) sortFilter.value = 'code_asc';

        applyFilters();
    }
    window.resetFilters = resetFilters;

    function renderCoursesGrid(courses) {
        const grid = document.getElementById('curriculumCoursesGrid');
        if (!grid) return;

        if (!courses || courses.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full py-16 text-center text-gray-400 font-mono text-sm rounded-2xl bg-white/[0.02] border border-white/[0.08]">
                    No curriculum courses found matching your criteria.
                </div>
            `;
            return;
        }

        grid.innerHTML = courses.map(course => {
            const code = cleanStr(course.CourseCode);
            const name = cleanStr(course.CourseName || course.CourseTitle);
            const prereq = cleanStr(course.PrerequisiteCourseCodes || course.PreRequisiteCourses);
            const minCr = parseFloat(course.MinCredit || course.CreditPass) || 0;
            const creditHour = parseFloat(course.CreditHour) || 0;
            const badgeColor = getCourseBadgeColor(code);

            const prereqList = prereq ? prereq.split(',').map(p => p.trim()).filter(Boolean) : [];

            return `
                <div class="rounded-2xl p-5 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.08] hover:border-amber-400/40 transition-all duration-200 group flex flex-col justify-between shadow-lg">
                    <div class="space-y-3">
                        <div class="flex items-start justify-between gap-3">
                            <span class="inline-flex items-center px-3 py-1 rounded-xl text-xs font-mono font-bold border ${badgeColor}">
                                ${code}
                            </span>
                            <div class="flex items-center gap-1.5">
                                ${creditHour > 0 ? `
                                    <span class="px-2 py-0.5 rounded-md text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                        ${creditHour.toFixed(1)} cr
                                    </span>
                                ` : ''}
                                ${minCr > 0 ? `
                                    <span class="px-2 py-0.5 rounded-md text-[10px] font-mono bg-white/[0.04] text-gray-400 border border-white/[0.08]" title="Minimum credits required to enroll">
                                        &ge; ${minCr} cr req
                                    </span>
                                ` : `
                                    <span class="px-2 py-0.5 rounded-md text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                        Open Entry
                                    </span>
                                `}
                            </div>
                        </div>

                        <h3 class="text-sm font-semibold text-white group-hover:text-amber-300 transition-colors leading-snug">
                            ${name}
                        </h3>
                    </div>

                    <div class="mt-4 pt-3 border-t border-white/[0.06] space-y-2">
                        <div class="text-[11px] font-mono">
                            <span class="text-gray-500">Prerequisites:</span>
                            <div class="flex flex-wrap gap-1.5 mt-1">
                                ${prereqList.length > 0 ? prereqList.map(p => `
                                    <span class="px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/10 text-gray-300 text-[10px] font-mono">
                                        ${p}
                                    </span>
                                `).join('') : `
                                    <span class="text-gray-400 italic text-[11px]">None</span>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderMajorTracks(tracks) {
        const container = document.getElementById('majorTracksContainer');
        if (!container) return;

        if (!tracks || tracks.length === 0) {
            container.innerHTML = `
                <div class="py-12 text-center text-gray-400 font-mono text-sm rounded-2xl bg-white/[0.02] border border-white/[0.08]">
                    No specific major specialization tracks listed in this curriculum.
                </div>
            `;
            return;
        }

        container.innerHTML = tracks.map((track, idx) => {
            const title = cleanStr(track.MajorMinorName || track.MajorAreaName) || `Specialization Track ${idx + 1}`;
            const credits = parseFloat(track.CreditRuleCredits) || 20;
            const courses = Array.isArray(track.MajorAreaCoursesViews || track.Courses) ? (track.MajorAreaCoursesViews || track.Courses) : [];

            return `
                <div class="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-4 shadow-xl">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
                        <div class="space-y-1">
                            <div class="flex items-center gap-2.5">
                                <span class="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
                                <h3 class="text-base font-bold text-white tracking-tight">${title}</h3>
                            </div>
                            <p class="text-xs text-gray-400">Complete ${credits.toFixed(1)} credit hours from this elective track</p>
                        </div>
                        <span class="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-sky-500/15 border border-sky-500/30 text-sky-300 self-start sm:self-auto">
                            ${credits.toFixed(1)} Credits Track
                        </span>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        ${courses.map(c => `
                            <div class="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-start justify-between gap-3">
                                <div>
                                    <span class="font-mono font-bold text-xs text-sky-300">${cleanStr(c.CourseCode)}</span>
                                    <div class="text-xs font-medium text-white mt-1">${cleanStr(c.CourseName || c.CourseTitle)}</div>
                                </div>
                                <span class="text-[11px] font-mono text-gray-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/10 flex-shrink-0">
                                    ${(parseFloat(c.CreditHour) || 0).toFixed(1)} cr
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderEquivalencies(equivs) {
        const tbody = document.getElementById('equivalentsTableBody');
        if (!tbody) return;

        if (!equivs || equivs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="py-8 text-center text-gray-400 font-mono text-xs">
                        No course equivalencies defined.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = equivs.map(e => `
            <tr class="hover:bg-white/[0.02] transition-colors">
                <td class="py-3 px-4 font-mono font-medium text-white">${cleanStr(e.CourseName)}</td>
                <td class="py-3 px-4 font-mono text-purple-300 font-semibold">${cleanStr(e.EquivalentCourseName)}</td>
                <td class="py-3 px-4 text-center font-mono text-gray-300">${(parseFloat(e.CreditHour) || 0).toFixed(1)}</td>
            </tr>
        `).join('');
    }

    function initCurriculumPage() {
        const studentId = localStorage.getItem('studentId') || localStorage.getItem('ewu_student_id') || localStorage.getItem('userId');
        if (studentId) {
            const userBadge = document.getElementById('userId');
            if (userBadge) userBadge.textContent = studentId;
        }

        // Bind back button
        const backBtn = document.getElementById('backToDashBtn');
        if (backBtn) {
            backBtn.onclick = (e) => {
                if (window.history.length > 1 && document.referrer.includes('dashboard')) {
                    e.preventDefault();
                    window.history.back();
                }
            };
        }

        // Bind export buttons explicitly
        const btnTxt = document.getElementById('btnExportCurriculumTxt');
        if (btnTxt) {
            btnTxt.onclick = (e) => {
                e.preventDefault();
                exportCurriculumTxt();
            };
        }
        const btnPdf = document.getElementById('btnExportCurriculumPdf');
        if (btnPdf) {
            btnPdf.onclick = (e) => {
                e.preventDefault();
                exportCurriculumPdf();
            };
        }

        loadCurriculum();
    }
    window.initCurriculumPage = initCurriculumPage;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCurriculumPage);
    } else {
        initCurriculumPage();
    }
})();

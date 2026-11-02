// ========================================
// CGPA Planner Page Logic
// Uses the official EWU grading scale.
// ========================================

(function () {
    // Official EWU grade -> grade point mapping
    const GRADE_POINTS = {
        'A+': 4.00, 'A': 3.75, 'A-': 3.50,
        'B+': 3.25, 'B': 3.00, 'B-': 2.75,
        'C+': 2.50, 'C': 2.25, 'D': 2.00, 'F': 0.00
    };
    const SCALE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'F'];

    let planned = []; // { name, credit, grade }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    window.initCgpaPlannerPage = init;

    async function init() {
        const gate = await gateFeaturePage('cgpa');
        if (!gate.allowed) return;
        const auth = await requireAuth();
        if (!auth) return;
        const uidEl = document.getElementById('userId');
        if (uidEl) uidEl.textContent = auth.userId || 'Student ID';

        document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
            document.getElementById('mobileMenu')?.classList.toggle('hidden');
        });

        // Populate grade dropdown
        const gradeSel = document.getElementById('pcGrade');
        gradeSel.innerHTML = SCALE_ORDER.map(g => `<option value="${g}">${g} (${GRADE_POINTS[g].toFixed(2)})</option>`).join('');
        gradeSel.value = 'A';

        // Render grading scale legend
        document.getElementById('gradeScale').innerHTML = SCALE_ORDER.map(g =>
            `<div class="flex items-center justify-between px-2.5 py-1.5 rounded-lg" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);">
                <span class="font-mono font-semibold text-gray-200">${g}</span>
                <span class="font-mono text-[#7fb0ea]">${GRADE_POINTS[g].toFixed(2)}</span>
            </div>`).join('');

        // Recompute on any input
        ['curCgpa', 'curCredits', 'targetCgpa', 'targetCredits'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', recompute);
        });

        recompute();
    }

    function addPlanned() {
        const name = (document.getElementById('pcName').value || '').trim();
        const credit = parseFloat(document.getElementById('pcCredits').value);
        const grade = document.getElementById('pcGrade').value;
        if (!credit || GRADE_POINTS[grade] === undefined) { showFeatureToast('Enter valid credit and grade', 'warning'); return; }
        planned.push({ name: name || `Course ${planned.length + 1}`, credit, grade });
        document.getElementById('pcName').value = '';
        renderPlanned();
        recompute();
    }

    function removePlanned(i) {
        planned.splice(i, 1);
        renderPlanned();
        recompute();
    }

    function clearPlanned() {
        planned = [];
        renderPlanned();
        recompute();
    }

    function renderPlanned() {
        const list = document.getElementById('plannedList');
        if (!planned.length) {
            list.innerHTML = '<div class="text-xs text-gray-500 text-center py-3">No planned courses added yet.</div>';
            return;
        }
        list.innerHTML = planned.map((p, i) => `
            <div class="flex items-center justify-between px-3 py-2 rounded-xl" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);">
                <div class="flex items-center gap-2.5">
                    <span class="fp-badge fp-badge-code">${escapeHtml(p.name)}</span>
                    <span class="text-xs text-gray-400">${p.credit.toFixed(1)} cr</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="fp-badge fp-badge-sec">${p.grade} · ${GRADE_POINTS[p.grade].toFixed(2)}</span>
                    <button onclick="removePlanned(${i})" class="text-red-400 hover:text-red-300 transition-colors">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>`).join('');
    }

    function recompute() {
        const curCgpa = parseFloat(document.getElementById('curCgpa').value);
        const curCredits = parseFloat(document.getElementById('curCredits').value);
        const haveBase = !isNaN(curCgpa) && !isNaN(curCredits) && curCredits > 0;

        // Projection with planned courses
        let planCredits = 0, planPoints = 0;
        planned.forEach(p => { planCredits += p.credit; planPoints += GRADE_POINTS[p.grade] * p.credit; });
        const planGpa = planCredits > 0 ? planPoints / planCredits : null;

        document.getElementById('projCredits').textContent = planCredits.toFixed(1);
        document.getElementById('projTermGpa').textContent = planGpa != null ? planGpa.toFixed(2) : '—';

        if (haveBase && planCredits > 0) {
            const basePoints = curCgpa * curCredits;
            const totalPoints = basePoints + planPoints;
            const totalCredits = curCredits + planCredits;
            const projected = totalPoints / totalCredits;
            document.getElementById('projCgpa').textContent = projected.toFixed(2);
            const delta = projected - curCgpa;
            document.getElementById('projDelta').innerHTML = delta >= 0
                ? `▲ <span class="text-emerald-400 font-semibold">+${delta.toFixed(3)}</span> from current CGPA (${curCgpa.toFixed(2)})`
                : `▼ <span class="text-rose-400 font-semibold">${delta.toFixed(3)}</span> from current CGPA (${curCgpa.toFixed(2)})`;
        } else if (planCredits > 0) {
            document.getElementById('projCgpa').textContent = planGpa != null ? planGpa.toFixed(2) : '—';
            document.getElementById('projDelta').textContent = 'Enter your current CGPA and credits to project the combined result.';
        } else {
            document.getElementById('projCgpa').textContent = haveBase ? curCgpa.toFixed(2) : '—';
            document.getElementById('projDelta').textContent = haveBase ? 'Add planned courses to forecast an updated CGPA.' : 'Enter current standing to begin.';
        }

        // Target solver
        const targetCgpa = parseFloat(document.getElementById('targetCgpa').value);
        const targetCredits = parseFloat(document.getElementById('targetCredits').value);
        const resultEl = document.getElementById('targetResult');
        if (haveBase && !isNaN(targetCgpa) && !isNaN(targetCredits) && targetCredits > 0) {
            const basePoints = curCgpa * curCredits;
            const neededTotal = targetCgpa * (curCredits + targetCredits);
            const needed = (neededTotal - basePoints) / targetCredits;
            let tone, message;
            if (needed > 4.0) {
                tone = 'color:#f87171;';
                message = `<span class="font-bold" style="${tone}">Not achievable</span> — requires GPA above the 4.00 maximum. Increase credits or lower the target.`;
            } else if (needed <= 0) {
                message = `<span class="font-bold text-emerald-300">Already secured</span> — your current CGPA already meets the target.`;
            } else {
                message = `Required average GPA: <span class="text-amber-300 font-bold">${needed.toFixed(3)}</span> across ${targetCredits.toFixed(1)} credits.`;
            }
            resultEl.innerHTML = `<div class="text-xs text-gray-400">${message}</div>`;
        } else {
            resultEl.innerHTML = `<div class="text-xs text-gray-400">Required average GPA: <span class="text-amber-300 font-bold">—</span></div>`;
        }
    }

    // Auto-fill current standing from the Grade Report page data
    async function loadFromGradeReport() {
        const importBtn = document.getElementById('importLiveBtn');
        const originalBtnText = importBtn ? importBtn.innerHTML : '';
        try {
            if (importBtn) {
                importBtn.disabled = true;
                importBtn.innerHTML = `
                    <svg class="w-3.5 h-3.5 animate-spin text-[#D86C5A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span>Importing Live Standing…</span>`;
            }
            showFeatureToast('Fetching live grade report from EWU portal…', 'info');
            const result = await fetchJsonWithRetry(`${API_BASE_URL}/api/grades`);
            if (result.__unauthorized) { window.location.href = 'login.html'; return; }
            const data = result.data || {};
            if (data.status === 'error') throw new Error(data.message || 'Failed to fetch live grades');
            const parsed = (typeof window.parseGradeReportHtml === 'function')
                ? window.parseGradeReportHtml(data.html || '')
                : computeFromHtml(data.html || '');
            if (parsed && parsed.cgpa != null && parsed.totalCredits > 0) {
                document.getElementById('curCgpa').value = parsed.cgpa.toFixed(2);
                document.getElementById('curCredits').value = parsed.totalCredits.toFixed(1);
                renderImportStatus(parsed);
                recompute();
                showFeatureToast(`Imported live CGPA: ${parsed.cgpa.toFixed(2)} (${parsed.totalCredits.toFixed(1)} completed credits)`, 'success');
            } else {
                showFeatureToast('Could not extract CGPA from portal grade report. Please enter manually.', 'warning');
            }
        } catch (e) {
            showFeatureToast(e.message || 'Failed to load grade report', 'error');
        } finally {
            if (importBtn) {
                importBtn.disabled = false;
                importBtn.innerHTML = originalBtnText;
            }
        }
    }

    function renderImportStatus(parsed) {
        const el = document.getElementById('importStatus');
        if (!el) return;
        const semCount = (parsed.semesters || []).length;
        const semList = (parsed.semesters || []).map(s =>
            `<span class="fp-badge fp-badge-sec">${escapeHtml(s.name)} · ${s.credits.toFixed(1)}cr · ${s.gpa != null ? s.gpa.toFixed(2) : '—'}</span>`
        ).join('');
        el.classList.remove('hidden');
        el.innerHTML = `
            <div class="p-3 rounded-xl" style="background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.22);">
                <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span class="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        Imported from portal · ${semCount} semester${semCount !== 1 ? 's' : ''} · CGPA ${parsed.cgpa.toFixed(2)} · ${parsed.totalCredits.toFixed(1)} credits
                    </span>
                    <button onclick="clearImportedStanding()" class="text-[11px] text-gray-400 hover:text-white transition-colors">Clear</button>
                </div>
                <div class="flex flex-wrap gap-1.5">${semList}</div>
            </div>`;
    }

    function clearImportedStanding() {
        document.getElementById('curCgpa').value = '';
        document.getElementById('curCredits').value = '';
        const el = document.getElementById('importStatus');
        if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
        recompute();
        showFeatureToast('Cleared imported standing — start fresh', 'info');
    }

    // Single-pass robust parsing of portal grade report (GPA-graded courses only)
    function computeFromHtml(html) {
        if (!html) return null;
        let cleanHtml = html;
        if (cleanHtml.includes('|updatePanel|')) {
            const parts = cleanHtml.split('|');
            let combined = '';
            for (let i = 0; i < parts.length; i++) {
                if (parts[i] === 'updatePanel') {
                    const content = parts[i + 2];
                    if (content) combined += '\n' + content;
                    i += 2;
                }
            }
            if (combined) cleanHtml = combined;
        }

        const GRADE_RE = /^(A\+|A-|A|B\+|B-|B|C\+|C|D|F\*?|W|I|P|S|R|U)$/i;
        const COURSE_CODE_RE = /^[A-Z]{2,6}[\s-]?\d{3,4}[A-Z]?$/i;

        const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
        const tdRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;

        let trMatch;
        let totalPoints = 0, totalCredits = 0;
        let latestPortalCgpa = null;
        const seenCourses = new Set();

        while ((trMatch = trRegex.exec(cleanHtml)) !== null) {
            const trClean = trMatch[1].replace(/<table[\s\S]*?<\/table>/gi, '');
            let cellMatch;
            const cells = [];
            while ((cellMatch = tdRegex.exec(trClean)) !== null) {
                const text = cellMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
                cells.push(text);
            }
            if (!cells.length) continue;

            const joined = cells.join(' ');
            if (joined.includes('Up to') || joined.includes('From Fall') || joined.includes('Numerical Scores')) {
                continue;
            }

            const cgpaMatch = joined.match(/CGPA\s*:\s*([\d.]+)/i);
            if (cgpaMatch) {
                const val = parseFloat(cgpaMatch[1]);
                if (!isNaN(val)) latestPortalCgpa = val;
            }

            const codeIdx = cells.findIndex(c => COURSE_CODE_RE.test(c.replace(/\s+/g, '')));
            if (codeIdx === -1) continue;

            const code = cells[codeIdx].replace(/\s+/g, '').toUpperCase();
            let grade = '', gradeIdx = -1;
            for (let i = codeIdx + 1; i < cells.length; i++) {
                if (GRADE_RE.test(cells[i])) { grade = cells[i].toUpperCase(); gradeIdx = i; break; }
            }
            if (!grade || GRADE_POINTS[grade] === undefined) continue;

            let credit = null;
            for (let i = codeIdx + 1; i < cells.length; i++) {
                if (i === gradeIdx) continue;
                const n = parseFloat(cells[i]);
                if (!isNaN(n) && n > 0 && n <= 12 && !/^(19|20)\d{2}$/.test(cells[i])) { credit = n; break; }
            }
            if (credit == null) credit = 3.0;

            // Only count unique course entries once
            if (!seenCourses.has(code)) {
                seenCourses.add(code);
                totalPoints += GRADE_POINTS[grade] * credit;
                totalCredits += credit;
            }
        }

        const computedCgpa = totalCredits > 0 ? (totalPoints / totalCredits) : null;
        const finalCgpa = latestPortalCgpa != null ? latestPortalCgpa : computedCgpa;

        return totalCredits > 0 ? { cgpa: finalCgpa, totalCredits } : null;
    }

    window.addPlanned = addPlanned;
    window.removePlanned = removePlanned;
    window.clearPlanned = clearPlanned;
    window.loadFromGradeReport = loadFromGradeReport;
    window.clearImportedStanding = clearImportedStanding;
})();
// ========================================
// Course Planner Page Logic
// Ports the documented EWU Planner rules:
// - Theory/Lab aggregation into one card per course+section
// - Duplicate course check, 15-credit limit, interval-overlap conflict
// - Daily theory limit (max 3/day)
// - Multiple combinations
// - Canvas image export (single + all)
// ========================================

(function () {
    const MAX_CREDITS = 15.0;
    const MAX_DAILY_THEORY = 3;
    const LOGO_URL = 'assets/images/ewu.png';

    let currentUserId = null;
    let catalog = [];        // merged course cards: { key, courseCode, section, shortName, faculty, theorySlots[], labSlots[], creditHour, seatsLeft }
    let filtered = [];
    let combinations = [];   // [{ id, name, selected: Map(key => card) }]
    let activeComboId = null;
    let selectedCourseFilter = null;
    let uniqueCourseCodes = [];

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    window.initCoursePlannerPage = init;

    async function init() {
        const gate = await gateFeaturePage('planner');
        if (!gate.allowed) return;
        const auth = await requireAuth();
        if (!auth) return;
        currentUserId = auth.userId || 'Student';
        const uidEl = document.getElementById('userId');
        if (uidEl) uidEl.textContent = currentUserId;

        combinations = [];
        createCombination(true);

        document.getElementById('catalogSearch')?.addEventListener('input', onSearch);
        document.getElementById('refreshBtn')?.addEventListener('click', () => loadCatalog(true));
        document.getElementById('previewModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'previewModal') closePreview();
        });
        initDragAndDrop();

        await loadCatalog(false);
    }

    // -----------------------------------------
    // Drag & drop: drag a catalog card into the plan panel to add it
    // -----------------------------------------
    function initDragAndDrop() {
        const catalogList = document.getElementById('catalogList');
        const dropZone = document.getElementById('planDropZone') || document.getElementById('planList');
        if (!catalogList || !dropZone) return;

        let dragKey = null;

        catalogList.addEventListener('dragstart', (e) => {
            const cardEl = e.target.closest('[data-key]');
            if (!cardEl) { e.preventDefault(); return; }
            dragKey = cardEl.getAttribute('data-key');
            cardEl.classList.add('dragging');
            try {
                e.dataTransfer.setData('text/plain', dragKey);
                e.dataTransfer.effectAllowed = 'copy';
            } catch (_) {}
        });

        catalogList.addEventListener('dragend', (e) => {
            const cardEl = e.target.closest('[data-key]');
            if (cardEl) cardEl.classList.remove('dragging');
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            dropZone.classList.add('fp-drop-active');
        });
        dropZone.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dropZone.classList.add('fp-drop-active');
        });
        dropZone.addEventListener('dragleave', (e) => {
            if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('fp-drop-active');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('fp-drop-active');
            let key = dragKey;
            try { key = e.dataTransfer.getData('text/plain') || key; } catch (_) {}
            if (key) addCourse(key);
            dragKey = null;
        });
    }

    function activeCombo() {
        return combinations.find(c => c.id === activeComboId);
    }

    // -----------------------------------------
    // Catalog loading & aggregation
    // -----------------------------------------
    async function loadCatalog(manual) {
        const list = document.getElementById('catalogList');
        list.innerHTML = '<div class="fp-empty"><div class="fp-spinner"></div>Loading course routine…</div>';
        try {
            const result = await fetchJsonWithRetry(`${API_BASE_URL}/api/routine`);
            if (result.__unauthorized) { window.location.href = 'login.html'; return; }
            const data = result.data || {};
            if (data.status === 'error') throw new Error(data.message || 'Failed to load routine');
            catalog = buildCatalog(data.courses || []);
            const codesSet = new Set(catalog.map(c => c.courseCode));
            uniqueCourseCodes = Array.from(codesSet).sort((a, b) => a.localeCompare(b));
            renderCourseFilterButtons();
            onSearch();
            if (manual) showFeatureToast(`Loaded ${catalog.length} course sections`, 'success');
        } catch (e) {
            list.innerHTML = `<div class="fp-empty">Failed to load courses. ${escapeHtml(e.message || '')}<br><button class="fp-btn fp-btn-ghost" style="margin-top:14px;" onclick="location.reload()">Retry</button></div>`;
            showFeatureToast(e.message || 'Failed to load routine', 'error');
        }
    }

    // Merge raw routine rows (theory + Lab) into unified cards
    function buildCatalog(raw) {
        const map = new Map();
        const order = [];
        for (const c of raw) {
            const rawCode = String(c.CourseCode || '').trim();
            if (!rawCode) continue;
            const isLab = /\s*lab\b/i.test(rawCode);
            const baseCode = rawCode.replace(/\s*lab\b/gi, '').trim();
            const sec = c.SectionName;
            const key = `${baseCode}|${sec}`;

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    courseCode: baseCode,
                    section: sec,
                    shortName: c.ShortName || '',
                    faculty: c.FacultyName || c.ShortName || '',
                    creditHour: Number(c.CreditHour) || 0,
                    seatsCapacity: Number(c.SeatCapacity) || 0,
                    seatsTaken: Number(c.SeatTaken) || 0,
                    theorySlots: [],
                    labSlots: []
                });
                order.push(key);
            }
            const card = map.get(key);
            card.creditHour = Math.max(card.creditHour, Number(c.CreditHour) || 0);
            card.shortName = card.shortName || c.ShortName || '';

            const parsed = parsePortalSlot(c.TimeSlotName);
            if (parsed.days.length) {
                const startMin = timeToMinutes(parsed.time.split(' - ')[0]);
                const endMin = timeToMinutes(parsed.time.split(' - ')[1]);
                const slot = {
                    days: parsed.days,
                    startMin: startMin === null ? 0 : startMin,
                    endMin: endMin === null ? 0 : endMin,
                    startLabel: prettyTime(parsed.time.split(' - ')[0]),
                    endLabel: prettyTime(parsed.time.split(' - ')[1]),
                    room: trimRoomName(c.RoomName)
                };
                if (isLab) card.labSlots.push(slot); else card.theorySlots.push(slot);
            }
        }
        const cards = order.map(k => map.get(k));
        // Merge theory slots sharing identical time ranges across days (e.g. M + W)
        cards.forEach(card => {
            card.theorySlots = mergeSlots(card.theorySlots);
            card.labSlots = mergeSlots(card.labSlots);
        });
        return cards;
    }

    function mergeSlots(slots) {
        const out = [];
        slots.forEach(s => {
            const existing = out.find(o => o.startMin === s.startMin && o.endMin === s.endMin);
            if (existing) {
                s.days.forEach(d => { if (!existing.days.includes(d)) existing.days.push(d); });
                if (!existing.room && s.room) existing.room = s.room;
            } else {
                out.push({ ...s, days: [...s.days] });
            }
        });
        out.forEach(o => o.days.sort((a, b) => DOW.indexOf(a) - DOW.indexOf(b)));
        return out;
    }

    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const DOW_FULL = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };

    // -----------------------------------------
    // Course-based dynamic filtering
    // -----------------------------------------
    function renderCourseFilterButtons() {
        const container = document.getElementById('courseFilterContainer');
        if (!container) return;
        if (!uniqueCourseCodes.length) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = uniqueCourseCodes.map(code => {
            const isSelected = selectedCourseFilter === code;
            const btnClass = isSelected
                ? 'px-2.5 py-1 text-xs font-mono font-bold rounded-lg bg-[#5a8fd8] text-white border border-[#5a8fd8] shadow-sm transition-all cursor-pointer'
                : 'px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-white/[0.04] text-gray-300 border border-white/[0.08] hover:bg-white/[0.08] hover:text-white transition-all cursor-pointer';

            return `<button type="button" class="${btnClass}" onclick="toggleCourseFilter('${escapeHtml(code)}')">${escapeHtml(code)}</button>`;
        }).join('');
    }

    function toggleCourseFilter(code) {
        if (selectedCourseFilter === code) {
            selectedCourseFilter = null;
        } else {
            selectedCourseFilter = code;
        }
        renderCourseFilterButtons();
        onSearch();
    }
    window.toggleCourseFilter = toggleCourseFilter;

    // -----------------------------------------
    // Catalog rendering & search
    // -----------------------------------------
    function onSearch() {
        const q = (document.getElementById('catalogSearch')?.value || '').toLowerCase().replace(/[\s\-_]/g, '');
        filtered = catalog.filter(c => {
            if (selectedCourseFilter && c.courseCode !== selectedCourseFilter) {
                return false;
            }
            if (q) {
                const hay = `${c.courseCode} ${c.shortName} ${c.faculty} ${c.section}`.toLowerCase().replace(/[\s\-_]/g, '');
                if (!hay.includes(q)) return false;
            }
            return true;
        });
        renderCatalog();
    }

    function renderCatalog() {
        const list = document.getElementById('catalogList');
        const countEl = document.getElementById('catalogCount');
        if (countEl) countEl.textContent = `${filtered.length} section${filtered.length !== 1 ? 's' : ''} shown`;

        if (!filtered.length) {
            list.innerHTML = '<div class="fp-empty" style="padding:40px 16px;">No matching course sections.</div>';
            return;
        }

        const selected = activeCombo().selected;
        list.innerHTML = filtered.slice(0, 400).map(card => {
            const added = selected.has(card.key);
            return cardHtml(card, added ? 'added' : '', added
                ? '<button class="fp-btn" disabled style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);padding:7px 14px;">Added</button>'
                : `<button class="fp-btn fp-btn-primary" style="padding:7px 14px;" onclick="addCourse('${card.key.replace(/'/g, "\\'")}')">Add</button>`);
        }).join('');
    }

    function cardHtml(card, extraClass, actionHtml) {
        const theory = card.theorySlots.map(slotRow).join('');
        const lab = card.labSlots.map(labRow).join('');
        return `
            <div class="fp-catalog-card ${extraClass}" draggable="true" data-key="${escapeHtml(card.key)}">
                <div class="flex items-start justify-between gap-3 mb-2.5">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="fp-badge fp-badge-code">${escapeHtml(card.courseCode)}</span>
                        <span class="fp-badge fp-badge-sec">Sec ${escapeHtml(String(card.section))}</span>
                        ${card.shortName ? `<span class="fp-badge" style="background:rgba(168,85,247,0.12);border-color:rgba(168,85,247,0.25);color:#c084fc;">${escapeHtml(card.shortName)}</span>` : ''}
                    </div>
                    <div class="text-right flex-shrink-0">
                        <div class="text-xs font-mono text-[#7fb0ea]">${card.creditHour.toFixed(2)} cr</div>
                    </div>
                </div>
                ${theory}
                ${lab}
                ${!theory && !lab ? '<div class="sched-row"><span style="color:#9ca3af;">Schedule TBA / Unavailable</span></div>' : ''}
                <div class="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between">
                    <span class="text-[10.5px] text-gray-500 font-mono">${card.seatsCapacity ? `${Math.max(0, card.seatsCapacity - card.seatsTaken)} / ${card.seatsCapacity} seats` : ''}</span>
                    ${actionHtml}
                </div>
            </div>`;
    }

    function slotRow(s) {
        const days = s.days.map(d => d.slice(0, 3)).join(',');
        return `<div class="sched-row">
            <svg class="sched-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#7fb0ea;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
            <span>${escapeHtml(days)} • ${escapeHtml(s.startLabel)} – ${escapeHtml(s.endLabel)}</span>
        </div>`;
    }

    function labRow(s) {
        const days = s.days.map(d => d.slice(0, 3)).join(',');
        return `<div class="sched-row">
            <svg class="sched-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#fbbf24;"><path d="M10 2v7.31L3.39 17c-.77.87-.29 2.23.87 2.23h15.48c1.15 0 1.63-1.36.87-2.23L14 9.31V2"></path><line x1="8.5" y1="2" x2="15.5" y2="2"></line><line x1="6.5" y1="13.5" x2="17.5" y2="13.5"></line></svg>
            <span>${escapeHtml(days)} • ${escapeHtml(s.startLabel)} – ${escapeHtml(s.endLabel)}</span>
        </div>`;
    }

    // -----------------------------------------
    // Combinations
    // -----------------------------------------
    function createCombination(activate) {
        const id = 'combo_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        combinations.push({ id, name: `Combination ${combinations.length + 1}`, selected: new Map() });
        if (activate !== false) activeComboId = id;
        renderComboTabs();
    }

    function addCombination() {
        createCombination(true);
        renderCatalog();
        renderPlan();
        showFeatureToast('New combination created', 'info');
    }

    function deleteCombination() {
        if (combinations.length <= 1) {
            showFeatureToast('At least one combination is required', 'warning');
            return;
        }
        combinations = combinations.filter(c => c.id !== activeComboId);
        activeComboId = combinations[combinations.length - 1].id;
        renderComboTabs(); renderCatalog(); renderPlan();
        showFeatureToast('Combination deleted', 'info');
    }

    function switchCombination(id) {
        activeComboId = id;
        renderComboTabs(); renderCatalog(); renderPlan();
    }

    function clearCombination() {
        activeCombo().selected.clear();
        renderCatalog(); renderPlan();
        showFeatureToast('Combination cleared', 'info');
    }

    function renderComboTabs() {
        const tabs = document.getElementById('comboTabs');
        tabs.innerHTML = combinations.map(c =>
            `<div class="combo-tab ${c.id === activeComboId ? 'active' : ''}" onclick="switchCombination('${c.id}')">${escapeHtml(c.name)} <span style="opacity:.7;">(${c.selected.size})</span></div>`
        ).join('');
        document.getElementById('deleteComboBtn').disabled = combinations.length <= 1;
        document.getElementById('planTitle').textContent = activeCombo().name;
    }

    // -----------------------------------------
    // Selection & validation
    // -----------------------------------------
    function addCourse(key) {
        const card = catalog.find(c => c.key === key);
        if (!card) return;
        const combo = activeCombo();

        // Duplicate course check
        for (const existing of combo.selected.values()) {
            if (existing.courseCode === card.courseCode) {
                showFeatureToast(`"${card.courseCode}" is already in the plan. Only one section per course is allowed.`, 'error');
                return;
            }
        }

        // Credit limit
        const currentCredits = sumCredits(combo);
        if (currentCredits + card.creditHour > MAX_CREDITS + 1e-9) {
            showFeatureToast(`Credit limit exceeded: ${(currentCredits + card.creditHour).toFixed(2)} / ${MAX_CREDITS.toFixed(1)} credits.`, 'error');
            return;
        }

        // Schedule conflict
        const conflict = detectConflict(card, combo);
        if (conflict) {
            showFeatureToast(`Schedule conflict with ${conflict.courseCode} on ${conflict.day} (${conflict.range}).`, 'error');
            return;
        }

        // Daily theory limit
        const daily = checkDailyTheoryLimit(card, combo);
        if (daily) {
            showFeatureToast(`Adding this exceeds ${MAX_DAILY_THEORY} theory classes on ${daily}.`, 'warning');
            return;
        }

        combo.selected.set(card.key, card);
        renderCatalog(); renderPlan();
        showFeatureToast(`${card.courseCode} Sec ${card.section} added`, 'success');
    }

    function removeCourse(key) {
        const combo = activeCombo();
        const card = combo.selected.get(key);
        combo.selected.delete(key);
        renderCatalog(); renderPlan();
        if (card) showFeatureToast(`${card.courseCode} Sec ${card.section} removed`, 'info');
    }

    function sumCredits(combo) {
        let sum = 0;
        combo.selected.forEach(c => sum += c.creditHour);
        return sum;
    }

    function cardSlots(card) {
        return [...card.theorySlots.map(s => ({ ...s, type: 'theory' })), ...card.labSlots.map(s => ({ ...s, type: 'lab' }))];
    }

    function detectConflict(newCard, combo) {
        const newSlots = cardSlots(newCard);
        for (const existing of combo.selected.values()) {
            for (const e of cardSlots(existing)) {
                for (const n of newSlots) {
                    const shared = n.days.filter(d => e.days.includes(d));
                    if (shared.length && n.startMin < e.endMin && n.endMin > e.startMin) {
                        return {
                            courseCode: existing.courseCode + ' Sec ' + existing.section,
                            day: shared.map(d => d.slice(0, 3)).join(','),
                            range: `${e.startLabel}-${e.endLabel}`
                        };
                    }
                }
            }
        }
        return null;
    }

    function checkDailyTheoryLimit(newCard, combo) {
        const dayCount = {};
        const add = (card, isNew) => {
            card.theorySlots.forEach(s => s.days.forEach(d => { dayCount[d] = (dayCount[d] || 0) + 1; }));
        };
        combo.selected.forEach(c => add(c, false));
        const before = { ...dayCount };
        add(newCard, true);
        for (const d of Object.keys(dayCount)) {
            if ((before[d] || 0) < MAX_DAILY_THEORY && dayCount[d] > MAX_DAILY_THEORY) return d;
        }
        return null;
    }

    // -----------------------------------------
    // Plan rendering
    // -----------------------------------------
    function renderPlan() {
        const combo = activeCombo();
        const planList = document.getElementById('planList');
        const cards = [...combo.selected.values()];

        // Metrics
        let theory = 0, labs = 0, credits = 0;
        cards.forEach(c => {
            theory += c.theorySlots.length;
            labs += c.labSlots.length;
            credits += c.creditHour;
        });
        document.getElementById('metricCourses').textContent = cards.length;
        document.getElementById('metricTheory').textContent = theory;
        document.getElementById('metricLabs').textContent = labs;
        document.getElementById('metricCredits').textContent = credits.toFixed(1);

        renderComboTabs();

        if (!cards.length) {
            planList.innerHTML = '<div class="fp-empty" style="padding:34px 16px;">Your plan is empty. Add sections from the catalog.</div>';
            return;
        }

        planList.innerHTML = cards.map(card => {
            const theory = card.theorySlots.map(slotRow).join('');
            const lab = card.labSlots.map(labRow).join('');
            return `
                <div class="fp-catalog-card added">
                    <div class="flex items-start justify-between gap-3 mb-2">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="fp-badge fp-badge-code">${escapeHtml(card.courseCode)}</span>
                            <span class="fp-badge fp-badge-sec">Sec ${escapeHtml(String(card.section))}</span>
                        </div>
                        <span class="text-xs font-mono text-[#7fb0ea]">${card.creditHour.toFixed(2)} cr</span>
                    </div>
                    ${theory}${lab}
                    <div class="mt-2.5 flex justify-end">
                        <button class="fp-btn fp-btn-danger" style="padding:6px 14px;" onclick="removeCourse('${card.key.replace(/'/g, "\\'")}')">Remove</button>
                    </div>
                </div>`;
        }).join('');
    }

    // -----------------------------------------
    // Routine preview & exports (Matches Info/routine.png)
    // -----------------------------------------
    const STANDARD_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
    const DAY_MAP_SHORT_TO_LONG = {
        'Sun': 'Sunday', 'Sunday': 'Sunday',
        'Mon': 'Monday', 'Monday': 'Monday',
        'Tue': 'Tuesday', 'Tuesday': 'Tuesday',
        'Wed': 'Wednesday', 'Wednesday': 'Wednesday',
        'Thu': 'Thursday', 'Thursday': 'Thursday',
        'Fri': 'Friday', 'Friday': 'Friday',
        'Sat': 'Saturday', 'Saturday': 'Saturday'
    };

    function buildPlannerRoutineModel(cards) {
        // Separate Theory and Lab into distinct columns!
        const columns = [];
        cards.forEach(card => {
            if (card.theorySlots && card.theorySlots.length > 0) {
                columns.push({
                    courseCode: card.courseCode,
                    section: card.section,
                    slots: card.theorySlots.map(s => ({
                        ...s,
                        days: s.days.map(d => DAY_MAP_SHORT_TO_LONG[d] || d)
                    })),
                    isLab: false
                });
            }
            if (card.labSlots && card.labSlots.length > 0) {
                columns.push({
                    courseCode: `${card.courseCode} Lab`,
                    section: card.section,
                    slots: card.labSlots.map(s => ({
                        ...s,
                        days: s.days.map(d => DAY_MAP_SHORT_TO_LONG[d] || d)
                    })),
                    isLab: true
                });
            }
        });

        // Sort columns: earliest weekly start time, then day index, then code
        const dayOrder = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        columns.forEach(col => {
            let minTime = Infinity, minDay = Infinity;
            col.slots.forEach(s => {
                if (s.startMin < minTime) minTime = s.startMin;
                s.days.forEach(d => {
                    const idx = dayOrder.indexOf(d);
                    if (idx !== -1 && idx < minDay) minDay = idx;
                });
            });
            col._minTime = minTime === Infinity ? 9999 : minTime;
            col._minDay = minDay === Infinity ? 9999 : minDay;
        });

        columns.sort((a, b) => {
            if (a._minTime !== b._minTime) return a._minTime - b._minTime;
            if (a._minDay !== b._minDay) return a._minDay - b._minDay;
            const c = a.courseCode.localeCompare(b.courseCode);
            return c !== 0 ? c : String(a.section).localeCompare(String(b.section));
        });

        let hasSaturday = false, hasFriday = false;
        columns.forEach(col => {
            col.slots.forEach(s => {
                s.days.forEach(d => {
                    if (d === 'Saturday') hasSaturday = true;
                    if (d === 'Friday') hasFriday = true;
                });
            });
        });

        const daysToShow = [...STANDARD_DAYS];
        if (hasSaturday) daysToShow.unshift('Saturday');
        if (hasFriday) daysToShow.push('Friday');

        return { columns, daysToShow };
    }

    function findPlannerDaySlots(col, day) {
        const out = [];
        col.slots.forEach(s => {
            if (s.days.includes(day)) out.push(s);
        });
        return out.sort((a, b) => a.startMin - b.startMin);
    }

    function openPreview() {
        const combo = activeCombo();
        const cards = [...combo.selected.values()];
        if (!cards.length) { showFeatureToast('Add courses to preview a routine', 'warning'); return; }

        const model = buildPlannerRoutineModel(cards);
        const { columns, daysToShow } = model;
        if (!daysToShow.length || !columns.length) { showFeatureToast('No scheduled times available', 'warning'); return; }

        let html = '<div id="plannerRoutineExportArea" style="background:#ffffff;border-radius:14px;padding:24px 20px;box-shadow:0 8px 30px rgba(0,0,0,0.12);max-width:100%;overflow-x:auto;">';
        html += `<div style="text-align:center;margin-bottom:18px;">
            <img src="${LOGO_URL}" crossorigin="anonymous" style="max-height:56px;margin:0 auto 8px;display:block;" onerror="this.style.display='none'">
            <h2 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#222222;letter-spacing:0.5px;font-family:Inter,sans-serif;">CLASS ROUTINE</h2>
            <p style="margin:0;font-size:13px;color:#555555;font-weight:600;font-family:Inter,sans-serif;">${escapeHtml(combo.name)}</p>
            ${currentUserId ? `<p style="margin:3px 0 0;font-size:11px;color:#666666;font-family:monospace;">${escapeHtml(currentUserId)}</p>` : ''}
        </div>`;

        html += '<table style="width:100%;border-collapse:collapse;font-size:13px;border:2px solid #4285F4;margin:0 auto;font-family:Inter,sans-serif;">';
        html += '<thead><tr><th style="background:#1A73E8;color:#FFFFFF;padding:12px 10px;border:1px solid #4285F4;font-weight:700;text-align:center;min-width:85px;width:85px;white-space:nowrap;">Day</th>';
        columns.forEach(c => {
            html += `<th style="background:#1A73E8;color:#FFFFFF;padding:12px 10px;border:1px solid #4285F4;font-weight:700;text-align:center;min-width:115px;white-space:nowrap;">
                ${escapeHtml(c.courseCode)}<br><span style="font-size:0.85em;opacity:0.92;font-weight:600;">Sec ${escapeHtml(String(c.section))}</span>
            </th>`;
        });
        html += '</tr></thead><tbody>';

        daysToShow.forEach(day => {
            html += `<tr><td style="background:#E8F0FE;color:#111827;padding:14px 10px;border:1px solid #4285F4;font-weight:700;text-align:center;white-space:nowrap;font-size:13px;">${escapeHtml(day)}</td>`;
            columns.forEach(col => {
                const slots = findPlannerDaySlots(col, day);
                if (!slots.length) {
                    html += '<td style="background:#FAFAFA;padding:14px 10px;border:1px solid #4285F4;"></td>';
                    return;
                }
                html += '<td style="background:#FFFFFF;padding:12px 8px;border:1px solid #4285F4;text-align:center;vertical-align:middle;">';
                slots.forEach((s, idx) => {
                    if (idx > 0) html += '<hr style="margin:6px 0;border:none;border-top:1px solid #E2E8F0;">';
                    html += `<div style="font-size:12.5px;color:#1A73E8;font-weight:700;white-space:nowrap;line-height:1.4;">${escapeHtml(s.startLabel)} – ${escapeHtml(s.endLabel)}</div>`;
                    if (s.room) {
                        html += `<div style="font-size:11.5px;color:#444444;margin-top:2px;line-height:1.3;">${escapeHtml(s.room)}</div>`;
                    }
                });
                html += '</td>';
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';

        document.getElementById('previewTitle').textContent = `${combo.name} — Routine Preview`;
        const sub = document.getElementById('previewSubtitle');
        if (sub) sub.textContent = `${columns.length} columns • ${cards.length} courses planned`;
        document.getElementById('previewBody').innerHTML = html;
        document.getElementById('previewModal').classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closePreview() {
        document.getElementById('previewModal').classList.remove('open');
        document.body.style.overflow = '';
    }

    // ---- Routine PNG Export for Course Planner (Matches Info/routine.png) ----
    async function exportPlannerRoutinePng() {
        const combo = activeCombo();
        const cards = [...combo.selected.values()];
        if (!cards.length) { showFeatureToast('Add courses before exporting', 'warning'); return; }

        const model = buildPlannerRoutineModel(cards);
        const { columns, daysToShow } = model;
        if (!daysToShow.length) return;

        const scale = 2;
        const colWidth = 120;
        const dayColWidth = 85;
        const headerH = 100;
        const theadH = 50;
        const rowH = 68;
        const pad = 20;

        const tableWidth = dayColWidth + columns.length * colWidth;
        const width = tableWidth + pad * 2;
        const height = headerH + theadH + daysToShow.length * rowH + pad * 2;

        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        let logoDrawn = false;
        try {
            const logoImg = new Image();
            logoImg.crossOrigin = 'anonymous';
            await new Promise((resolve) => {
                logoImg.onload = () => {
                    const lHeight = 44;
                    const lWidth = (logoImg.width / logoImg.height) * lHeight;
                    ctx.drawImage(logoImg, width / 2 - lWidth / 2, pad, lWidth, lHeight);
                    logoDrawn = true;
                    resolve();
                };
                logoImg.onerror = () => resolve();
                logoImg.src = LOGO_URL;
                setTimeout(resolve, 350);
            });
        } catch (_) {}

        const titleY = pad + (logoDrawn ? 58 : 24);
        ctx.fillStyle = '#222222';
        ctx.font = '700 17px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('CLASS ROUTINE', width / 2, titleY);

        ctx.fillStyle = '#555555';
        ctx.font = '600 13px Inter, sans-serif';
        ctx.fillText(combo.name, width / 2, titleY + 18);

        if (currentUserId) {
            ctx.fillStyle = '#666666';
            ctx.font = '600 11px monospace';
            ctx.fillText(currentUserId, width / 2, titleY + 34);
        }

        const startY = pad + headerH;
        const startX = pad;
        const borderColor = '#4285F4';

        ctx.fillStyle = '#1A73E8';
        ctx.fillRect(startX, startY, tableWidth, theadH);
        ctx.strokeStyle = borderColor;
        ctx.strokeRect(startX, startY, tableWidth, theadH);

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Day', startX + dayColWidth / 2, startY + theadH / 2 + 5);

        columns.forEach((c, i) => {
            const x = startX + dayColWidth + i * colWidth;
            ctx.strokeRect(x, startY, colWidth, theadH);
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 12px Inter, sans-serif';
            ctx.fillText(c.courseCode, x + colWidth / 2, startY + 22);
            ctx.font = '600 10.5px Inter, sans-serif';
            ctx.fillText('Sec ' + c.section, x + colWidth / 2, startY + 38);
        });

        daysToShow.forEach((day, r) => {
            const y = startY + theadH + r * rowH;

            ctx.fillStyle = '#E8F0FE';
            ctx.fillRect(startX, y, dayColWidth, rowH);
            ctx.strokeStyle = borderColor;
            ctx.strokeRect(startX, y, dayColWidth, rowH);

            ctx.fillStyle = '#111827';
            ctx.font = '700 12.5px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(day, startX + dayColWidth / 2, y + rowH / 2 + 4);

            columns.forEach((col, ci) => {
                const x = startX + dayColWidth + ci * colWidth;
                const slots = findPlannerDaySlots(col, day);

                if (!slots.length) {
                    ctx.fillStyle = '#FAFAFA';
                    ctx.fillRect(x, y, colWidth, rowH);
                    ctx.strokeStyle = borderColor;
                    ctx.strokeRect(x, y, colWidth, rowH);
                    return;
                }

                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(x, y, colWidth, rowH);
                ctx.strokeStyle = borderColor;
                ctx.strokeRect(x, y, colWidth, rowH);

                slots.forEach((s, si) => {
                    const midY = slots.length > 1 ? y + 20 + si * 30 : y + rowH / 2 - 2;
                    ctx.fillStyle = '#1A73E8';
                    ctx.font = '700 11.5px Inter, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${s.startLabel} – ${s.endLabel}`, x + colWidth / 2, midY);

                    if (s.room) {
                        ctx.fillStyle = '#444444';
                        ctx.font = '500 11px Inter, sans-serif';
                        ctx.fillText(truncate(s.room, 16), x + colWidth / 2, midY + 16);
                    }
                });
            });
        });

        ctx.lineWidth = 2;
        ctx.strokeStyle = borderColor;
        ctx.strokeRect(startX, startY, tableWidth, theadH + daysToShow.length * rowH);

        const link = document.createElement('a');
        link.download = `EWU_Routine_${combo.name.replace(/[^a-z0-9]+/gi, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showFeatureToast('Routine image saved', 'success');
    }

    // ---- Routine PDF Export for Course Planner ----
    function exportPlannerRoutinePdf() {
        const combo = activeCombo();
        const cards = [...combo.selected.values()];
        if (!cards.length) { showFeatureToast('Add courses before exporting', 'warning'); return; }

        const model = buildPlannerRoutineModel(cards);
        const { columns, daysToShow } = model;
        if (!daysToShow.length) return;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape', 'mm', 'a4');
        const pageW = doc.internal.pageSize.width;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(34, 34, 34);
        doc.text('CLASS ROUTINE', pageW / 2, 14, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(85, 85, 85);
        doc.text(`${combo.name}${currentUserId ? '  •  ' + currentUserId : ''}`, pageW / 2, 20, { align: 'center' });

        const head = [['Day', ...columns.map(c => `${c.courseCode}\nSec ${c.section}`)]];
        const body = daysToShow.map(day => {
            const row = [day];
            columns.forEach(col => {
                const slots = findPlannerDaySlots(col, day);
                row.push(slots.map(s => `${s.startLabel} – ${s.endLabel}\n${s.room}`).join('\n\n'));
            });
            return row;
        });

        doc.autoTable({
            head, body, startY: 26,
            theme: 'grid',
            styles: { fontSize: 8.5, cellPadding: 4, halign: 'center', valign: 'middle', lineColor: [66, 133, 244], lineWidth: 0.25 },
            headStyles: { fillColor: [26, 115, 232], textColor: [255, 255, 255], fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 26, fillColor: [232, 240, 254], textColor: [17, 24, 39], fontStyle: 'bold' } }
        });

        doc.save(`EWU_Routine_${combo.name.replace(/[^a-z0-9]+/gi, '_')}.pdf`);
        showFeatureToast('Routine PDF saved', 'success');
    }

    // ---- Routine ICS Export for Course Planner ----
    async function exportPlannerRoutineIcs() {
        const combo = activeCombo();
        const cards = [...combo.selected.values()];
        if (!cards.length) { showFeatureToast('Add courses before exporting', 'warning'); return; }

        const model = buildPlannerRoutineModel(cards);
        const { columns } = model;
        if (!columns.length) return;

        let startDate = new Date();
        let endDate = new Date(Date.now() + 14 * 7 * 86400000);

        // Live academic calendar holidays (empty unless returned by API)
        let holidayDates = new Set();

        try {
            const calRes = await fetch(`${API_BASE_URL}/api/academic-calendar`, { credentials: 'include' }).catch(() => null);
            if (calRes && calRes.ok) {
                const calJson = await calRes.json();
                if (calJson && calJson.classesStart) startDate = new Date(calJson.classesStart);
                if (calJson && calJson.classesEnd) endDate = new Date(`${calJson.classesEnd}T23:59:59`);
                if (calJson && Array.isArray(calJson.holidays)) {
                    holidayDates.clear();
                    calJson.holidays.forEach(h => {
                        let cur = new Date(h.start);
                        const endH = new Date(h.end);
                        while (cur <= endH) {
                            holidayDates.add(cur.toISOString().slice(0, 10));
                            cur.setDate(cur.getDate() + 1);
                        }
                    });
                }
            }
        } catch (_) {}

        const icsDayCode = { Sunday: 'SU', Monday: 'MO', Tuesday: 'TU', Wednesday: 'WE', Thursday: 'TH', Friday: 'FR', Saturday: 'SA' };
        const dayIdxMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
        const pad = n => String(n).padStart(2, '0');
        const fmt = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

        function firstOccurrence(dayName, startMin) {
            const target = dayIdxMap[dayName] !== undefined ? dayIdxMap[dayName] : 0;
            const d = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0));
            const dhakaOffsetHours = 6;
            const hours = Math.floor(startMin / 60) - dhakaOffsetHours;
            const minutes = startMin % 60;
            const diff = (target - d.getUTCDay() + 7) % 7;
            d.setUTCDate(d.getUTCDate() + diff);
            d.setUTCHours(hours, minutes, 0, 0);
            return d;
        }

        let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//EWU Course Portal//Course Planner Routine//EN\r\nCALSCALE:GREGORIAN\r\n';
        const until = fmt(endDate);
        const stamp = fmt(new Date());

        columns.forEach((col, ci) => {
            col.slots.forEach((s, si) => {
                s.days.forEach(dayName => {
                    const occ = firstOccurrence(dayName, s.startMin);
                    const endOcc = new Date(occ.getTime() + (s.endMin - s.startMin) * 60000);
                    const uid = `ewu-plan-${col.courseCode.replace(/[^a-zA-Z0-9]/g, '')}-${col.section}-${ci}-${si}-${dayName}@aftabkabir.me`;

                    const exDates = [];
                    let checkDate = new Date(occ.getTime());
                    while (checkDate <= endDate) {
                        const dhakaDate = new Date(checkDate.getTime() + 6 * 3600 * 1000);
                        const dateStr = dhakaDate.toISOString().slice(0, 10);
                        if (holidayDates.has(dateStr)) {
                            exDates.push(fmt(checkDate));
                        }
                        checkDate = new Date(checkDate.getTime() + 7 * 24 * 3600 * 1000);
                    }

                    ics += 'BEGIN:VEVENT\r\n';
                    ics += `UID:${uid}\r\n`;
                    ics += `DTSTAMP:${stamp}\r\n`;
                    ics += `DTSTART:${fmt(occ)}\r\n`;
                    ics += `DTEND:${fmt(endOcc)}\r\n`;
                    ics += `RRULE:FREQ=WEEKLY;BYDAY=${icsDayCode[dayName] || 'MO'};UNTIL=${until}\r\n`;

                    if (exDates.length > 0) {
                        ics += `EXDATE:${exDates.join(',')}\r\n`;
                    }

                    ics += `SUMMARY:${col.courseCode} Sec ${col.section}\r\n`;
                    ics += `LOCATION:${s.room || 'East West University'}\r\n`;
                    ics += `DESCRIPTION:Planned Class Schedule for ${col.courseCode} Section ${col.section}\\nRoom: ${s.room || 'TBA'}\r\n`;

                    // 30-minute reminder
                    ics += 'BEGIN:VALARM\r\n';
                    ics += 'TRIGGER:-PT30M\r\n';
                    ics += 'ACTION:DISPLAY\r\n';
                    ics += `DESCRIPTION:Reminder: ${col.courseCode} Class in 30 minutes\r\n`;
                    ics += 'END:VALARM\r\n';

                    ics += 'END:VEVENT\r\n';
                });
            });
        });
        ics += 'END:VCALENDAR\r\n';

        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `EWU_Plan_Routine_${combo.name.replace(/[^a-z0-9]+/gi, '_')}.ics`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showFeatureToast('Calendar (.ics) downloaded with holiday exclusions & 30-min reminders', 'success');
    }

    // -----------------------------------------
    // Canvas image exports
    // -----------------------------------------
    function drawCombinationCanvas(ctx, combo, startY, width) {
        const cards = [...combo.selected.values()];
        let y = startY;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0f172a';
        ctx.font = '800 16px Inter, sans-serif';
        ctx.fillText(combo.name, 24, y + 22);
        y += 40;

        if (!cards.length) {
            ctx.fillStyle = '#6b7280';
            ctx.font = '500 13px Inter, sans-serif';
            ctx.fillText('No courses selected.', 24, y + 10);
            return y + 30;
        }

        cards.forEach(card => {
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(24, y, width - 48, 60);
            ctx.strokeStyle = '#e2e8f0';
            ctx.strokeRect(24, y, width - 48, 60);

            ctx.fillStyle = '#1d4ed8';
            ctx.font = '700 14px Inter, sans-serif';
            ctx.fillText(`${card.courseCode}  Sec ${card.section}`, 36, y + 24);

            const slots = cardSlots(card);
            ctx.font = '500 11px monospace';
            ctx.fillStyle = '#475569';
            const text = slots.map(s => {
                const days = s.days.map(d => d.slice(0, 3)).join(',');
                return `${days} ${s.startLabel}-${s.endLabel}`;
            }).join('   ');
            ctx.fillText(truncate(text, 88), 36, y + 44);

            ctx.fillStyle = '#334155';
            ctx.font = '600 11px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${card.creditHour.toFixed(2)} cr`, width - 36, y + 24);
            ctx.textAlign = 'left';

            y += 68;
        });

        // Stats footer
        let theory = 0, labs = 0, credits = 0;
        cards.forEach(c => { theory += c.theorySlots.length; labs += c.labSlots.length; credits += c.creditHour; });
        ctx.fillStyle = '#eef2ff';
        ctx.fillRect(24, y, width - 48, 34);
        ctx.fillStyle = '#1e293b';
        ctx.font = '700 12px Inter, sans-serif';
        ctx.fillText(`${cards.length} Courses   •   ${theory} Theory   •   ${labs} Labs   •   ${credits.toFixed(1)} Credits`, 36, y + 22);
        return y + 46;
    }

    function saveCombinationImage() {
        const combo = activeCombo();
        if (!combo.selected.size) { showFeatureToast('Add courses before saving', 'warning'); return; }

        const name = prompt('Name this combination:', combo.name) || combo.name;
        combo.name = name;
        renderComboTabs();

        const width = 620;
        const scale = 2;
        // Estimate height
        const estHeight = 70 + combo.selected.size * 68 + 60;
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = estHeight * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, estHeight);
        ctx.fillStyle = '#0f172a';
        ctx.font = '800 18px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('EWU COURSE PLAN', width / 2, 30);
        ctx.font = '600 11px monospace';
        ctx.fillStyle = '#64748b';
        ctx.fillText(currentUserId || '', width / 2, 48);
        ctx.textAlign = 'left';

        drawCombinationCanvas(ctx, combo, 62, width);

        const link = document.createElement('a');
        link.download = `EWU_Plan_${name.replace(/[^a-z0-9]+/gi, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        trackEvent('export_planner_png', { count: combo.selected.size });
        showFeatureToast('Combination saved as image', 'success');
    }

    function saveAllCombinationsImage() {
        const active = combinations.filter(c => c.selected.size > 0);
        if (!active.length) { showFeatureToast('No combinations with courses to save', 'warning'); return; }

        const width = 620;
        const scale = 2;
        let estHeight = 60;
        active.forEach(c => { estHeight += 40 + (c.selected.size ? c.selected.size * 68 + 16 : 44); });
        estHeight += 30;

        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = estHeight * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, estHeight);
        ctx.fillStyle = '#0f172a';
        ctx.font = '800 18px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('EWU COURSE PLANS — ALL COMBINATIONS', width / 2, 30);
        ctx.textAlign = 'left';

        let y = 50;
        active.forEach(combo => { y = drawCombinationCanvas(ctx, combo, y, width) + 10; });

        const link = document.createElement('a');
        link.download = 'EWU_All_Combinations.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        trackEvent('export_planner_all_png', { count: active.length });
        showFeatureToast('All combinations saved as image', 'success');
    }

    function truncate(t, n) { return t && t.length > n ? t.slice(0, n) + '…' : (t || ''); }

    window.addCourse = addCourse;
    window.removeCourse = removeCourse;
    window.addCombination = addCombination;
    window.deleteCombination = deleteCombination;
    window.switchCombination = switchCombination;
    window.clearCombination = clearCombination;
    window.openPreview = openPreview;
    window.closePreview = closePreview;
    window.saveCombinationImage = saveCombinationImage;
    window.saveAllCombinationsImage = saveAllCombinationsImage;
    window.exportPlannerRoutinePng = exportPlannerRoutinePng;
    window.exportPlannerRoutinePdf = exportPlannerRoutinePdf;
    window.exportPlannerRoutineIcs = exportPlannerRoutineIcs;
})();
// ========================================
// Class Schedule Page Logic
// ========================================

(function () {
    let currentUserId = null;
    let currentSemesterId = '';
    let currentSemesterName = '';
    let semesterMeta = null;
    let rawCourses = [];
    let routineCourses = []; // sorted course columns for the generated routine

    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const DOW_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const DOW_FULL = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
    const LOGO_URL = 'assets/images/ewu.png';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    window.initClassSchedulePage = init;

    async function init() {
        const gate = await gateFeaturePage('schedule');
        if (!gate.allowed) return;

        const auth = await requireAuth();
        if (!auth) return;
        currentUserId = auth.userId || 'Student';
        const uidEl = document.getElementById('userId');
        if (uidEl) uidEl.textContent = currentUserId;

        document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
            document.getElementById('mobileMenu')?.classList.toggle('hidden');
        });
        document.getElementById('refreshBtn')?.addEventListener('click', () => loadSchedule(true));
        document.getElementById('semesterSelect')?.addEventListener('change', onSemesterChange);
        document.getElementById('hideDropped')?.addEventListener('change', renderTable);
        document.getElementById('routineModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'routineModal') closeRoutine();
        });

        await loadSemesters();
    }

    async function loadSemesters() {
        const select = document.getElementById('semesterSelect');
        try {
            const result = await fetchJsonWithRetry(`${API_BASE_URL}/api/schedule/semesters`);
            if (result.__unauthorized) { window.location.href = 'login.html'; return; }
            const semesters = (result.data && result.data.semesters) || [];
            if (!semesters.length) {
                select.innerHTML = '<option value="">No semesters available</option>';
                renderEmpty('No semesters were returned by the portal.');
                return;
            }

            // Auto-detect current semester by date range
            const now = Date.now();
            let current = null;
            for (const s of semesters) {
                const start = s.StartingDate ? new Date(s.StartingDate).getTime() : null;
                const end = s.EndingDate ? new Date(s.EndingDate).getTime() : null;
                if (start && end && now >= start && now <= end) { current = s; break; }
            }
            if (!current) {
                // Fallback: nearest upcoming, else newest listed
                current = semesters.find(s => s.StartingDate && new Date(s.StartingDate).getTime() > now) || semesters[0];
            }

            select.innerHTML = semesters.map(s =>
                `<option value="${escapeHtml(String(s.SemesterId))}">${escapeHtml(s.SemesterName)}</option>`
            ).join('');

            currentSemesterId = String(current.SemesterId);
            semesterMeta = current;
            select.value = currentSemesterId;
            currentSemesterName = current.SemesterName;

            await loadSchedule(false);
        } catch (e) {
            select.innerHTML = '<option value="">Failed to load</option>';
            renderEmpty('Could not load semesters. Please retry.');
            showFeatureToast('Failed to load semesters', 'error');
        }
    }

    function onSemesterChange(e) {
        currentSemesterId = e.target.value;
        const opt = e.target.options[e.target.selectedIndex];
        currentSemesterName = opt ? opt.textContent : '';
        semesterMeta = null;
        loadSchedule(false);
    }

    async function loadSchedule(manual) {
        const tbody = document.getElementById('scheduleBody');
        tbody.innerHTML = '<tr><td colspan="8"><div class="fp-empty"><div class="fp-spinner"></div>Loading class schedule…</div></td></tr>';

        try {
            const result = await fetchJsonWithRetry(`${API_BASE_URL}/api/schedule?semesterId=${encodeURIComponent(currentSemesterId)}`);
            if (result.__unauthorized) { window.location.href = 'login.html'; return; }
            const data = result.data || {};
            if (data.status === 'error') throw new Error(data.message || 'Failed to load schedule');

            rawCourses = data.courses || [];
            computeSummary();
            renderTable();
            if (manual) showFeatureToast('Schedule refreshed', 'success');
        } catch (e) {
            renderEmpty('Failed to load class schedule. Please try again.');
            showFeatureToast(e.message || 'Failed to load schedule', 'error');
        }
    }

    // -------- Summary (deduped course + credit) --------
    function isDropped(c) {
        const yes = v => v === 'Yes' || v === true || v === 1 || v === '1' || v === 'True';
        return yes(c.DropStatus) || yes(c.WithDrawStatus) || yes(c.IsDrop) || yes(c.IsWithdraw);
    }

    function baseCode(code) {
        return String(code || '').replace(/\s*lab\b/gi, '').trim();
    }

    function computeSummary() {
        const map = new Map();
        let slots = 0;
        for (const c of rawCourses) {
            const key = `${baseCode(c.CourseCode)}_${c.SectionName}`;
            if (!map.has(key)) {
                map.set(key, { credit: 0, dropped: false });
            }
            const entry = map.get(key);
            entry.credit = Math.max(entry.credit, Number(c.CreditHour) || 0);
            if (isDropped(c)) entry.dropped = true;
            slots++;
        }
        let registeredCourses = 0, registeredCredits = 0, droppedCount = 0;
        for (const entry of map.values()) {
            if (entry.dropped) { droppedCount++; continue; }
            registeredCourses++;
            registeredCredits += entry.credit;
        }
        document.getElementById('statCourses').textContent = registeredCourses;
        document.getElementById('statCredits').textContent = registeredCredits.toFixed(2);
        document.getElementById('statSlots').textContent = slots;
        document.getElementById('statDropped').textContent = droppedCount;
    }

    function renderEmpty(message) {
        document.getElementById('scheduleBody').innerHTML =
            `<tr><td colspan="8"><div class="fp-empty">
                <svg class="w-9 h-9 mx-auto mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.6"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                ${escapeHtml(message)}
            </div></td></tr>`;
    }

    function renderTable() {
        const hideDropped = document.getElementById('hideDropped')?.checked;
        const rows = rawCourses.filter(c => !hideDropped || !isDropped(c));

        if (!rows.length) {
            renderEmpty(hideDropped ? 'No active registered courses for this semester.' : 'No courses found for this semester.');
            return;
        }

        const tbody = document.getElementById('scheduleBody');
        tbody.innerHTML = rows.map((c, i) => {
            const { day, time } = parsePortalSlot(c.TimeSlotName);
            const dropped = isDropped(c);
            const statusBadge = dropped
                ? '<span class="fp-badge" style="background:rgba(245,158,11,0.12);border-color:rgba(245,158,11,0.3);color:#fbbf24;">' +
                    (c.WithDrawStatus === 'Yes' ? 'Withdrawn' : 'Dropped') + '</span>'
                : '<span class="fp-status fp-status-emerald"><span class="dot"></span>Active</span>';
            return `
                <tr class="${dropped ? 'fp-row-muted' : ''}">
                    <td class="text-center text-gray-500 font-mono text-xs">${i + 1}</td>
                    <td><span class="fp-badge fp-badge-code">${escapeHtml(c.CourseCode)}</span></td>
                    <td class="text-center"><span class="fp-badge fp-badge-sec">${escapeHtml(String(c.SectionName))}</span></td>
                    <td><span class="faculty-name" title="${escapeHtml(c.FacultyName || c.ShortName)}">${escapeHtml(c.ShortName || c.FacultyName || 'TBA')}</span></td>
                    <td>
                        <div class="flex flex-col gap-0.5">
                            <span class="fp-badge fp-badge-day">${escapeHtml(day || 'TBA')}</span>
                            <span class="time-text" style="font-size:11px;">${escapeHtml(time || 'TBA')}</span>
                        </div>
                    </td>
                    <td><span class="fp-badge fp-badge-room">${escapeHtml(trimRoomName(c.RoomName) || 'TBA')}</span></td>
                    <td class="text-center font-mono">${(Number(c.CreditHour) || 0).toFixed(2)}</td>
                    <td class="text-center">${statusBadge}</td>
                </tr>`;
        }).join('');
    }

    // ========================================
    // Routine generation
    // ========================================
    // ========================================
    // Routine generation
    // ========================================
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

    function buildRoutineModel() {
        // Exclude dropped/withdrawn; preserve separate Theory and Lab columns!
        const map = new Map();
        const order = [];

        for (const c of rawCourses) {
            if (isDropped(c)) continue;
            const rawCode = String(c.CourseCode || '').trim();
            if (!rawCode) continue;

            const isLab = /\blab\b/i.test(rawCode) || /lab/i.test(String(c.RoomName || ''));
            let displayCode = rawCode;
            if (isLab && !/\blab$/i.test(displayCode)) {
                displayCode = `${displayCode} Lab`;
            }
            const key = `${displayCode}|${c.SectionName}`;

            if (!map.has(key)) {
                map.set(key, {
                    courseCode: displayCode,
                    section: c.SectionName,
                    shortName: c.ShortName || '',
                    slots: []
                });
                order.push(key);
            }

            const parsed = parsePortalSlot(c.TimeSlotName);
            const startMin = timeToMinutes(parsed.time.split(' - ')[0]);
            const endMin = timeToMinutes(parsed.time.split(' - ')[1]);
            if (parsed.days.length && startMin !== null && endMin !== null) {
                // Map short day names to full day names for consistent lookup
                const fullDays = parsed.days.map(d => DAY_MAP_SHORT_TO_LONG[d] || d);
                map.get(key).slots.push({
                    days: fullDays,
                    startMin,
                    endMin,
                    startLabel: prettyTime(parsed.time.split(' - ')[0]),
                    endLabel: prettyTime(parsed.time.split(' - ')[1]),
                    room: trimRoomName(c.RoomName),
                    isLab
                });
            }
        }

        const courses = order.map(k => map.get(k));

        // Sort columns: earliest weekly start time, then day index, then code
        const dayOrder = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        courses.forEach(course => {
            let minTime = Infinity, minDay = Infinity;
            course.slots.forEach(s => {
                if (s.startMin < minTime) minTime = s.startMin;
                s.days.forEach(d => {
                    const idx = dayOrder.indexOf(d);
                    if (idx !== -1 && idx < minDay) minDay = idx;
                });
            });
            course._minTime = minTime === Infinity ? 9999 : minTime;
            course._minDay = minDay === Infinity ? 9999 : minDay;
        });

        courses.sort((a, b) => {
            if (a._minTime !== b._minTime) return a._minTime - b._minTime;
            if (a._minDay !== b._minDay) return a._minDay - b._minDay;
            const c = a.courseCode.localeCompare(b.courseCode);
            return c !== 0 ? c : String(a.section).localeCompare(String(b.section));
        });

        // Determine active days present
        let hasSaturday = false, hasFriday = false;
        courses.forEach(course => {
            course.slots.forEach(s => {
                s.days.forEach(d => {
                    if (d === 'Saturday') hasSaturday = true;
                    if (d === 'Friday') hasFriday = true;
                });
            });
        });

        const daysToShow = [...STANDARD_DAYS];
        if (hasSaturday) daysToShow.unshift('Saturday');
        if (hasFriday) daysToShow.push('Friday');

        return { courses, daysToShow };
    }

    function findDaySlots(course, day) {
        const out = [];
        course.slots.forEach(s => {
            if (s.days.includes(day)) out.push(s);
        });
        return out.sort((a, b) => a.startMin - b.startMin);
    }

    function openRoutine() {
        const model = buildRoutineModel();
        if (!model.courses.length) {
            showFeatureToast('No registered courses to generate a routine.', 'warning');
            return;
        }
        routineCourses = model.courses;

        document.getElementById('routineTitle').textContent = 'Class Routine';
        document.getElementById('routineSubtitle').textContent =
            `${currentSemesterName || ''}${currentUserId ? ' • ' + currentUserId : ''}`;

        const preview = document.getElementById('routinePreview');
        preview.innerHTML = buildRoutineHtml(model);
        document.getElementById('routineModal').classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeRoutine() {
        document.getElementById('routineModal').classList.remove('open');
        document.body.style.overflow = '';
    }

    function buildRoutineHtml(model) {
        const { courses, daysToShow } = model;
        let h = '<div id="routineExportArea" style="background:#ffffff;border-radius:14px;padding:24px 20px;box-shadow:0 8px 30px rgba(0,0,0,0.12);max-width:100%;overflow-x:auto;">';
        h += `<div style="text-align:center;margin-bottom:18px;">
            <img src="${LOGO_URL}" crossorigin="anonymous" style="max-height:56px;margin:0 auto 8px;display:block;" onerror="this.style.display='none'">
            <h2 style="margin:0 0 4px;font-size:18px;font-weight:700;color:#222222;letter-spacing:0.5px;font-family:Inter,sans-serif;">CLASS ROUTINE</h2>
            <p style="margin:0;font-size:13px;color:#555555;font-weight:600;font-family:Inter,sans-serif;">${escapeHtml(currentSemesterName || '')}</p>
            ${currentUserId ? `<p style="margin:3px 0 0;font-size:11px;color:#666666;font-family:monospace;">${escapeHtml(currentUserId)}</p>` : ''}
        </div>`;

        if (!daysToShow.length || !courses.length) {
            h += '<p style="text-align:center;color:#6b7280;padding:20px;">No scheduled class times available.</p></div>';
            return h;
        }

        h += '<table style="width:100%;border-collapse:collapse;font-size:13px;border:2px solid #4285F4;margin:0 auto;font-family:Inter,sans-serif;">';
        h += '<thead><tr><th style="background:#1A73E8;color:#FFFFFF;padding:12px 10px;border:1px solid #4285F4;font-weight:700;text-align:center;min-width:85px;width:85px;white-space:nowrap;">Day</th>';
        courses.forEach(c => {
            h += `<th style="background:#1A73E8;color:#FFFFFF;padding:12px 10px;border:1px solid #4285F4;font-weight:700;text-align:center;min-width:115px;white-space:nowrap;">
                ${escapeHtml(c.courseCode)}<br><span style="font-size:0.85em;opacity:0.92;font-weight:600;">Sec ${escapeHtml(String(c.section))}</span>
            </th>`;
        });
        h += '</tr></thead><tbody>';

        daysToShow.forEach(day => {
            h += `<tr><td style="background:#E8F0FE;color:#111827;padding:14px 10px;border:1px solid #4285F4;font-weight:700;text-align:center;white-space:nowrap;font-size:13px;">${escapeHtml(day)}</td>`;
            courses.forEach(course => {
                const slots = findDaySlots(course, day);
                if (!slots.length) {
                    h += '<td style="background:#FAFAFA;padding:14px 10px;border:1px solid #4285F4;"></td>';
                    return;
                }
                h += '<td style="background:#FFFFFF;padding:12px 8px;border:1px solid #4285F4;text-align:center;vertical-align:middle;">';
                slots.forEach((s, idx) => {
                    if (idx > 0) h += '<hr style="margin:6px 0;border:none;border-top:1px solid #E2E8F0;">';
                    h += `<div style="font-size:12.5px;color:#1A73E8;font-weight:700;white-space:nowrap;line-height:1.4;">${escapeHtml(s.startLabel)} – ${escapeHtml(s.endLabel)}</div>`;
                    if (s.room) {
                        h += `<div style="font-size:11.5px;color:#444444;margin-top:2px;line-height:1.3;">${escapeHtml(s.room)}</div>`;
                    }
                });
                h += '</td>';
            });
            h += '</tr>';
        });
        h += '</tbody></table></div>';
        return h;
    }

    // ---- PNG export via canvas (Matches Info/routine.png) ----
    async function exportRoutinePng() {
        const model = buildRoutineModel();
        const { courses, daysToShow } = model;
        if (!daysToShow.length) { showFeatureToast('Nothing to export', 'warning'); return; }

        const scale = 2;
        const colWidth = 120;
        const dayColWidth = 85;
        const headerH = 100;
        const theadH = 50;
        const rowH = 68;
        const pad = 20;

        const tableWidth = dayColWidth + courses.length * colWidth;
        const width = tableWidth + pad * 2;
        const height = headerH + theadH + daysToShow.length * rowH + pad * 2;

        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Try drawing logo centered
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

        // Header text
        const titleY = pad + (logoDrawn ? 58 : 24);
        ctx.fillStyle = '#222222';
        ctx.font = '700 17px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('CLASS ROUTINE', width / 2, titleY);

        ctx.fillStyle = '#555555';
        ctx.font = '600 13px Inter, sans-serif';
        ctx.fillText(currentSemesterName || '', width / 2, titleY + 18);

        if (currentUserId) {
            ctx.fillStyle = '#666666';
            ctx.font = '600 11px monospace';
            ctx.fillText(currentUserId, width / 2, titleY + 34);
        }

        const startY = pad + headerH;
        const startX = pad;

        // Border styling
        const borderColor = '#4285F4';
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;

        // Header row: #1A73E8
        ctx.fillStyle = '#1A73E8';
        ctx.fillRect(startX, startY, tableWidth, theadH);
        ctx.strokeRect(startX, startY, tableWidth, theadH);

        // Day header
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Day', startX + dayColWidth / 2, startY + theadH / 2 + 5);

        // Course headers
        courses.forEach((c, i) => {
            const x = startX + dayColWidth + i * colWidth;
            ctx.strokeRect(x, startY, colWidth, theadH);
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 12px Inter, sans-serif';
            ctx.fillText(c.courseCode, x + colWidth / 2, startY + 22);
            ctx.font = '600 10.5px Inter, sans-serif';
            ctx.fillText('Sec ' + c.section, x + colWidth / 2, startY + 38);
        });

        // Body rows
        daysToShow.forEach((day, r) => {
            const y = startY + theadH + r * rowH;

            // Day column: #E8F0FE
            ctx.fillStyle = '#E8F0FE';
            ctx.fillRect(startX, y, dayColWidth, rowH);
            ctx.strokeStyle = borderColor;
            ctx.strokeRect(startX, y, dayColWidth, rowH);

            ctx.fillStyle = '#111827';
            ctx.font = '700 12.5px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(day, startX + dayColWidth / 2, y + rowH / 2 + 4);

            courses.forEach((course, ci) => {
                const x = startX + dayColWidth + ci * colWidth;
                const slots = findDaySlots(course, day);

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

        // Outer border
        ctx.lineWidth = 2;
        ctx.strokeStyle = borderColor;
        ctx.strokeRect(startX, startY, tableWidth, theadH + daysToShow.length * rowH);

        const link = document.createElement('a');
        link.download = `EWU_Routine_${(currentSemesterName || 'semester').replace(/[^a-z0-9]+/gi, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        trackEvent('export_routine_png', { count: courses.length });
        showFeatureToast('Routine image saved', 'success');
    }

    function truncate(t, n) { return t && t.length > n ? t.slice(0, n) + '…' : (t || ''); }

    // ---- PDF export ----
    function exportRoutinePdf() {
        const model = buildRoutineModel();
        const { courses, daysToShow } = model;
        if (!daysToShow.length) { showFeatureToast('Nothing to export', 'warning'); return; }
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
        doc.text(`${currentSemesterName || ''}${currentUserId ? '  •  ' + currentUserId : ''}`, pageW / 2, 20, { align: 'center' });

        const head = [['Day', ...courses.map(c => `${c.courseCode}\nSec ${c.section}`)]];
        const body = daysToShow.map(day => {
            const row = [day];
            courses.forEach(course => {
                const slots = findDaySlots(course, day);
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

        doc.save(`EWU_Routine_${(currentSemesterName || 'semester').replace(/[^a-z0-9]+/gi, '_')}.pdf`);
        trackEvent('export_routine_pdf', { count: courses.length });
        showFeatureToast('Routine PDF saved', 'success');
    }

    // ---- ICS export with holiday filtering & 30-min reminder ----
    async function exportRoutineIcs() {
        const model = buildRoutineModel();
        const { courses } = model;
        if (!courses.length) { showFeatureToast('Nothing to export', 'warning'); return; }

        let startDate = new Date();
        let endDate = new Date(Date.now() + 14 * 7 * 86400000);

        if (semesterMeta && semesterMeta.StartingDate && semesterMeta.EndingDate) {
            startDate = new Date(semesterMeta.StartingDate);
            endDate = new Date(semesterMeta.EndingDate);
        }

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

        // Find the first matching weekday on/after startDate
        function firstOccurrence(dayName, startMin) {
            const target = dayIdxMap[dayName] !== undefined ? dayIdxMap[dayName] : 0;
            const d = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0));
            // Offset to match Dhaka local time (UTC+6)
            const dhakaOffsetHours = 6;
            const hours = Math.floor(startMin / 60) - dhakaOffsetHours;
            const minutes = startMin % 60;
            const diff = (target - d.getUTCDay() + 7) % 7;
            d.setUTCDate(d.getUTCDate() + diff);
            d.setUTCHours(hours, minutes, 0, 0);
            return d;
        }

        let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//EWU Course Portal//Class Routine//EN\r\nCALSCALE:GREGORIAN\r\n';
        const until = fmt(endDate);
        const stamp = fmt(new Date());

        courses.forEach((course, ci) => {
            course.slots.forEach((s, si) => {
                s.days.forEach(dayName => {
                    const occ = firstOccurrence(dayName, s.startMin);
                    const endOcc = new Date(occ.getTime() + (s.endMin - s.startMin) * 60000);
                    const uid = `ewu-${course.courseCode.replace(/[^a-zA-Z0-9]/g, '')}-${course.section}-${ci}-${si}-${dayName}@aftabkabir.me`;

                    // Generate EXDATE for every holiday occurrence
                    const exDates = [];
                    let checkDate = new Date(occ.getTime());
                    while (checkDate <= endDate) {
                        // Check date in UTC+6
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

                    ics += `SUMMARY:${course.courseCode} Sec ${course.section}\r\n`;
                    ics += `LOCATION:${s.room || 'East West University'}\r\n`;
                    ics += `DESCRIPTION:EWU Class Schedule for ${course.courseCode} Section ${course.section}\\nRoom: ${s.room || 'TBA'}\r\n`;

                    // 30-minute reminder
                    ics += 'BEGIN:VALARM\r\n';
                    ics += 'TRIGGER:-PT30M\r\n';
                    ics += 'ACTION:DISPLAY\r\n';
                    ics += `DESCRIPTION:Reminder: ${course.courseCode} Class in 30 minutes\r\n`;
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
        a.download = `EWU_Routine_${(currentSemesterName || 'semester').replace(/[^a-z0-9]+/gi, '_')}.ics`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        trackEvent('export_routine_ics', { count: courses.length });
        showFeatureToast('Calendar (.ics) downloaded with holiday exclusions & 30-min reminders', 'success');
    }

    window.openRoutine = openRoutine;
    window.closeRoutine = closeRoutine;
    window.exportRoutinePng = exportRoutinePng;
    window.exportRoutinePdf = exportRoutinePdf;
    window.exportRoutineIcs = exportRoutineIcs;
})();
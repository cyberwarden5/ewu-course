// ========================================
// Grade Report Page Logic
// Parses the portal grade-sheet (ASP.NET AJAX delta stream) into a structured
// transcript with per-semester GPA/CGPA, and exports it as PDF / CSV.
// ========================================

(function () {
    let parsedResult = null;
    let currentUserId = 'Student';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    window.initGradeReportPage = init;

    async function init() {
        const gate = await gateFeaturePage('grades');
        if (!gate.allowed) return;
        const auth = await requireAuth();
        if (!auth) return;
        currentUserId = auth.userId || 'Student';
        const uidEl = document.getElementById('userId');
        if (uidEl) uidEl.textContent = currentUserId;

        document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
            document.getElementById('mobileMenu')?.classList.toggle('hidden');
        });
        document.getElementById('refreshBtn')?.addEventListener('click', () => load(true));
        document.getElementById('exportBtn')?.addEventListener('click', toggleExportMenu);

        document.addEventListener('click', (e) => {
            const menu = document.getElementById('exportMenu');
            if (menu && !menu.classList.contains('hidden') && !e.target.closest('#exportBtn') && !e.target.closest('#exportMenu')) {
                menu.classList.add('hidden');
            }
        });

        await load(false);
    }

    async function load(manual) {
        const content = document.getElementById('gradeContent');
        content.innerHTML = '<div class="fp-empty"><div class="fp-spinner"></div>Loading grade report…</div>';
        try {
            const result = await fetchJsonWithRetry(`${API_BASE_URL}/api/grades`);
            if (result.__unauthorized) { window.location.href = 'login.html'; return; }
            const data = result.data || {};
            if (data.status === 'error') throw new Error(data.message || 'Failed to load grade report');

            window.__rawReportHtml = window.extractReportHtml ? window.extractReportHtml(data.html || '') : (data.html || '');
            parsedResult = window.parseGradeReportHtml(data.html || '');
            render(parsedResult);
            if (manual) showFeatureToast('Grade report refreshed', 'success');
        } catch (e) {
            content.innerHTML = `<div class="fp-empty">Failed to load grade report.<br><span class="text-gray-500">${esc(e.message || '')}</span></div>`;
            showFeatureToast(e.message || 'Failed to load grade report', 'error');
        }
    }

    function render(parsed) {
        const content = document.getElementById('gradeContent');

        document.getElementById('sumCgpa').textContent = parsed.cgpa != null ? parsed.cgpa.toFixed(2) : '—';
        document.getElementById('sumCredits').textContent = parsed.totalCredits ? parsed.totalCredits.toFixed(1) : '—';
        document.getElementById('sumCourses').textContent = parsed.totalCourses || '—';
        document.getElementById('sumSemesters').textContent = parsed.semesters.length || '0';

        if (!parsed.semesters.length) {
            content.innerHTML = `
                <div class="fp-empty" style="padding:40px 20px;">
                    <svg class="w-10 h-10 mx-auto mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    <p class="text-gray-300 font-medium mb-1">Grade data could not be extracted</p>
                    <p class="text-gray-500 text-xs max-w-md mx-auto">The portal renders the grade sheet through an interactive report viewer. If your grades are not shown, open the original report below.</p>
                    <button onclick="openRawReport()" class="fp-btn fp-btn-ghost" style="margin-top:16px;">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        Open Original Report
                    </button>
                </div>`;
            return;
        }

        let html = '';

        // Progress toward minimum credits
        if (parsed.summary && parsed.summary.minCredits) {
            const pct = Math.min(100, Math.round((parsed.totalCredits / parsed.summary.minCredits) * 100));
            html += `<div class="mb-5 p-4 rounded-xl" style="background:rgba(90,143,216,0.07);border:1px solid rgba(90,143,216,0.2);">
                <div class="flex items-center justify-between mb-2 text-xs">
                    <span class="fp-eyebrow">Graduation Credits Progress</span>
                    <span class="font-mono text-white">${parsed.totalCredits.toFixed(1)} / ${parsed.summary.minCredits.toFixed(1)}</span>
                </div>
                <div style="height:8px;border-radius:999px;background:rgba(255,255,255,0.07);overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:linear-gradient(135deg,#5a8fd8,#06b6d4);"></div>
                </div>
            </div>`;
        }

        parsed.semesters.forEach(sem => {
            html += `<div class="mb-5">
                <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div class="fp-section-title"><svg class="w-4 h-4 text-[#D86C5A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>${esc(sem.name)}</div>
                    <div class="flex items-center gap-3 text-xs">
                        <span class="text-gray-400">Credits: <strong class="text-white">${sem.credits.toFixed(1)}</strong></span>
                        <span class="fp-status fp-status-sky">GPA: ${sem.gpa != null ? sem.gpa.toFixed(2) : '—'}</span>
                    </div>
                </div>
                <div class="fp-table-wrap fp-scroll" style="max-height:none;">
                    <table class="fp-table fp-transcript">
                        <thead><tr><th>Course</th><th>Title</th><th style="width:80px;text-align:center;">Credit</th><th style="width:90px;text-align:center;">Grade</th><th style="width:90px;text-align:center;">Point</th></tr></thead>
                        <tbody>
                            ${sem.courses.map(c => `
                                <tr>
                                    <td><span class="fp-badge fp-badge-code">${esc(c.code)}</span></td>
                                    <td class="text-gray-300">${esc(c.title || '—')}</td>
                                    <td class="text-center font-mono">${c.credit != null ? c.credit.toFixed(2) : '—'}</td>
                                    <td class="text-center"><span style="${gradeStyle(c.grade)}" class="fp-badge">${esc(c.grade)}</span></td>
                                    <td class="text-center font-mono">${c.point != null ? c.point.toFixed(2) : '—'}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
        });

        html += `<div class="mt-3 flex justify-end">
            <button onclick="openRawReport()" class="fp-btn fp-btn-ghost" style="font-size:12px;">View Original Portal Report</button>
        </div>`;

        content.innerHTML = html;
    }

    // ---- Exports ----
    function toggleExportMenu(e) {
        if (e) e.preventDefault();
        if (!parsedResult || !parsedResult.semesters.length) { showFeatureToast('Nothing to export yet', 'warning'); return; }
        document.getElementById('exportMenu')?.classList.toggle('hidden');
    }

    function exportGradePdf() {
        if (!parsedResult || !parsedResult.semesters.length) { showFeatureToast('Nothing to export', 'warning'); return; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('portrait', 'mm', 'a4');
        const pageW = doc.internal.pageSize.width;
        const pageH = doc.internal.pageSize.height;
        const margin = 12;

        doc.setFillColor(15, 15, 20);
        doc.rect(0, 0, pageW, 20, 'F');
        doc.setFillColor(90, 143, 216);
        doc.rect(0, 20, pageW, 1, 'F');

        doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(255, 255, 255);
        doc.text('EWU GRADE REPORT', margin, 12);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(150, 150, 160);
        doc.text('Generated from portal grade sheet', margin, 17);

        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(90, 143, 216);
        doc.text('Student ID:', pageW - margin - 52, 10);
        doc.setTextColor(255, 255, 255);
        doc.text(String(currentUserId), pageW - margin - 22, 10);
        doc.setTextColor(90, 143, 216);
        doc.text('CGPA:', pageW - margin - 52, 16);
        doc.setTextColor(255, 255, 255);
        doc.text(parsedResult.cgpa != null ? parsedResult.cgpa.toFixed(2) : '—', pageW - margin - 22, 16);

        let y = 26;
        parsedResult.semesters.forEach((sem) => {
            doc.autoTable({
                head: [[`${sem.name}`, `Credits: ${sem.credits.toFixed(1)}`, `GPA: ${sem.gpa != null ? sem.gpa.toFixed(2) : '—'}`, '', '']],
                body: [
                    ['Course', 'Title', 'Credit', 'Grade', 'Point'],
                    ...sem.courses.map(c => [c.code, c.title || '', c.credit != null ? c.credit.toFixed(2) : '', c.grade, c.point != null ? c.point.toFixed(2) : ''])
                ],
                startY: y,
                margin: { left: margin, right: margin },
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 2.2, valign: 'middle' },
                headStyles: { fillColor: [26, 115, 232], textColor: [255, 255, 255], fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: 30, fontStyle: 'bold', textColor: [29, 78, 216] },
                    1: { cellWidth: 'auto' },
                    2: { cellWidth: 20, halign: 'center' },
                    3: { cellWidth: 20, halign: 'center' },
                    4: { cellWidth: 20, halign: 'center' }
                },
                didParseCell: (d) => {
                    if (d.section === 'head') return;
                    if (d.row.index === 0) {
                        // column-label sub-header
                        d.cell.styles.fillColor = [238, 242, 255];
                        d.cell.styles.textColor = [71, 85, 105];
                        d.cell.styles.fontStyle = 'bold';
                    }
                }
            });
            y = doc.lastAutoTable.finalY + 6;
            if (y > pageH - 30) { doc.addPage(); y = 18; }
        });

        doc.setFontSize(9); doc.setTextColor(60, 60, 70);
        doc.text(`Total Credits: ${parsedResult.totalCredits.toFixed(1)}    Courses: ${parsedResult.totalCourses}    CGPA: ${parsedResult.cgpa != null ? parsedResult.cgpa.toFixed(2) : '—'}`, margin, y + 2);

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(150, 150, 160);
            doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pageH - 6, { align: 'right' });
        }

        doc.save(`EWU_Grade_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
        trackEvent('export_grade_pdf', { count: parsedResult.totalCourses });
        showFeatureToast('Grade report PDF exported', 'success');
    }

    function exportGradeCsv() {
        if (!parsedResult || !parsedResult.semesters.length) { showFeatureToast('Nothing to export', 'warning'); return; }
        const rows = [['Semester', 'Course', 'Title', 'Credit', 'Grade', 'Point']];
        parsedResult.semesters.forEach(sem => {
            sem.courses.forEach(c => {
                rows.push([sem.name, c.code, c.title || '', c.credit != null ? c.credit : '', c.grade, c.point != null ? c.point : '']);
            });
        });
        rows.push([]);
        rows.push(['Summary', 'CGPA', parsedResult.cgpa != null ? parsedResult.cgpa.toFixed(2) : '', 'Total Credits', parsedResult.totalCredits.toFixed(1), 'Courses ' + parsedResult.totalCourses]);

        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `EWU_Grade_Report_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        trackEvent('export_grade_csv', { count: parsedResult.totalCourses });
        showFeatureToast('Grade report CSV exported', 'success');
    }

    function openRawReport() {
        const html = window.__rawReportHtml;
        if (!html) { showFeatureToast('No raw report available', 'warning'); return; }
        const w = window.open('', '_blank');
        if (w) { w.document.open(); w.document.write(html); w.document.close(); }
    }

    function gradeStyle(grade) {
        const g = String(grade).toUpperCase();
        if (g === 'A+' || g === 'A' || g === 'A-') return 'background:rgba(16,185,129,0.12);border-color:rgba(16,185,129,0.3);color:#34d399;';
        if (g.startsWith('B')) return 'background:rgba(90,143,216,0.14);border-color:rgba(90,143,216,0.3);color:#7fb0ea;';
        if (g.startsWith('C')) return 'background:rgba(245,158,11,0.12);border-color:rgba(245,158,11,0.3);color:#fbbf24;';
        if (g === 'D') return 'background:rgba(251,146,60,0.12);border-color:rgba(251,146,60,0.3);color:#fb923c;';
        if (g.startsWith('F')) return 'background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.3);color:#f87171;';
        return 'background:rgba(156,163,175,0.1);border-color:rgba(156,163,175,0.25);color:#9ca3af;';
    }

    function esc(s) { return (typeof window.escapeHtml === 'function') ? window.escapeHtml(s) : String(s == null ? '' : s); }

    window.openRawReport = openRawReport;
    window.exportGradePdf = exportGradePdf;
    window.exportGradeCsv = exportGradeCsv;
})();
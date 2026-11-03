// ========================================
// Account Ledger Page Logic
// ========================================

(function () {
    let transactions = [];

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (!window.__EWU_AJAX_NAV__) init(); });
    } else if (!window.__EWU_AJAX_NAV__) {
        init();
    }
    window.initAccountLedgerPage = init;

    async function init() {
        const gate = await gateFeaturePage('ledger');
        if (!gate.allowed) return;
        const auth = await requireAuth();
        if (!auth) return;
        const uidEl = document.getElementById('userId');
        if (uidEl) uidEl.textContent = auth.userId || 'Student ID';

        document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
            document.getElementById('mobileMenu')?.classList.toggle('hidden');
        });
        document.getElementById('refreshBtn')?.addEventListener('click', () => loadLedger(true));
        document.getElementById('txnSearch')?.addEventListener('input', renderTransactions);

        await loadLedger(false);
    }

    async function loadLedger(manual) {
        const tbody = document.getElementById('ledgerBody');
        tbody.innerHTML = '<tr><td colspan="8"><div class="fp-empty"><div class="fp-spinner"></div>Loading ledger…</div></td></tr>';
        try {
            const result = await fetchJsonWithRetry(`${API_BASE_URL}/api/ledger`);
            if (result.__unauthorized) { window.location.href = 'login'; return; }
            const data = result.data || {};
            if (data.status === 'error') throw new Error(data.message || 'Failed to load ledger');

            transactions = data.transactions || [];
            renderBalance(data.closingBalance || {});
            renderTransactions();
            if (manual) showFeatureToast('Ledger refreshed', 'success');
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="8"><div class="fp-empty">Failed to load account ledger.<br>${escapeHtml(e.message || '')}</div></td></tr>`;
            showFeatureToast(e.message || 'Failed to load ledger', 'error');
        }
    }

    function renderBalance(bal) {
        document.getElementById('balName').textContent = bal.StudentName || '—';
        document.getElementById('balDue').textContent = bal.CurrentDue != null ? '৳ ' + formatBDT(bal.CurrentDue) : '—';
        document.getElementById('balBalance').textContent = bal.Balance != null ? '৳ ' + formatBDT(bal.Balance) : '—';

        let credit = 0, debit = 0;
        transactions.forEach(t => { credit += t.AmountCr || 0; debit += t.AmountDr || 0; });
        document.getElementById('balTotals').innerHTML =
            `<span class="text-emerald-400">৳${formatBDT(credit)}</span> <span class="text-gray-500">/</span> <span class="text-rose-400">৳${formatBDT(debit)}</span>`;
    }

    function renderTransactions() {
        const q = (document.getElementById('txnSearch')?.value || '').toLowerCase().trim();
        const rows = !q ? transactions : transactions.filter(t =>
            `${t.SemesterName} ${t.Description} ${t.VoucherType}`.toLowerCase().includes(q));

        const tbody = document.getElementById('ledgerBody');
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="8"><div class="fp-empty">${transactions.length ? 'No transactions match your search.' : 'No ledger transactions available.'}</div></td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map((t, i) => {
            const date = formatDate(t.CreatedDate || t.AccTransferDate);
            return `
                <tr>
                    <td class="text-center text-gray-500 font-mono text-xs">${i + 1}</td>
                    <td class="font-mono text-xs text-gray-300">${escapeHtml(date)}</td>
                    <td><span class="fp-badge fp-badge-day">${escapeHtml(t.SemesterName || '—')}</span></td>
                    <td><span class="fp-badge" style="${voucherStyle(t.VoucherType)}">${escapeHtml(t.VoucherType || '—')}</span></td>
                    <td class="font-mono text-xs text-gray-400">${escapeHtml(t.AccountsReferance || '—')}</td>
                    <td class="text-right font-mono ${t.AmountCr ? 'text-emerald-400' : 'text-gray-600'}">${t.AmountCr ? formatBDT(t.AmountCr) : '—'}</td>
                    <td class="text-right font-mono ${t.AmountDr ? 'text-rose-400' : 'text-gray-600'}">${t.AmountDr ? formatBDT(t.AmountDr) : '—'}</td>
                    <td class="text-xs text-gray-400" style="max-width:280px;">${escapeHtml(t.Description || '—')}</td>
                </tr>`;
        }).join('');
    }

    function voucherStyle(type) {
        const t = String(type || '').toLowerCase();
        if (t.includes('receipt') || t.includes('credit')) return 'background:rgba(16,185,129,0.12);border-color:rgba(16,185,129,0.28);color:#34d399;';
        if (t.includes('debit')) return 'background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.3);color:#f87171;';
        return 'background:rgba(90,143,216,0.14);border-color:rgba(90,143,216,0.3);color:#7fb0ea;';
    }

    function formatDate(d) {
        if (!d) return '—';
        const date = new Date(d);
        if (isNaN(date.getTime())) return String(d).split('T')[0];
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
})();
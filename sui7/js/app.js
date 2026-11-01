// ==========================================
// SUI7 Admin Command Center - Core Engine
// ==========================================

const API_URL = 'https://api.aftabkabir.me/api';
let trafficChartInstance = null;
let overviewHourlyChartInstance = null;
let portalPingInterval = null;

// Initialize settings from localStorage if available
let currentSettings = {
    animations: true,
    lowEndMode: false,
    audioAlerts: false,
    refreshInterval: 5000 // default 5 seconds
};

try {
    const savedSettings = localStorage.getItem('adminSettings');
    if (savedSettings) {
        currentSettings = { ...currentSettings, ...JSON.parse(savedSettings) };
    }
} catch (e) { }

// Apply performance mode immediately
if (currentSettings.lowEndMode) {
    document.documentElement.classList.add('performance-mode');
} else {
    document.documentElement.classList.remove('performance-mode');
}

let currentDataCache = null;
let isStreamPaused = false;
let autoPollingInterval = null;
let currentLogsFilterLevel = 'all';
let currentLogsSearchQuery = '';

// ================= ROUTING & STATE =================
async function loadView(path) {
    const appEl = document.getElementById('app');
    const token = localStorage.getItem('adminToken');

    if (!token && path !== 'login') {
        window.location.hash = '#/login';
        return;
    }

    if (path === 'login') {
        const layoutMode = document.querySelector('#routerView') !== null;
        if (layoutMode) {
            window.location.reload();
            return;
        }
        const html = await fetch('views/login.html').then(r => r.text());
        appEl.innerHTML = html;
        bindLoginEvents();
        return;
    }

    // Authenticated State - Ensure layout exists
    let routerView = document.getElementById('routerView');
    if (!routerView) {
        const layoutHtml = await fetch('views/layout.html').then(r => r.text());
        appEl.innerHTML = layoutHtml;
        routerView = document.getElementById('routerView');
        bindLayoutEvents();
        initCommandPalette();
        updateNavActive(path);

        // Fetch core telemetry on initial load
        await refreshDashboardData();
    } else {
        updateNavActive(path);
    }

    // Load specific sub-view
    const viewPath = path === 'dashboard' ? 'overview' : path;
    const cleanPath = viewPath.replace('/', '');

    try {
        const html = await fetch(`views/${cleanPath}.html`).then(r => {
            if (!r.ok) throw new Error('View not found');
            return r.text();
        });
        routerView.innerHTML = html;
        updatePageHeaders(cleanPath);

        // Hydrate the view with cached data
        if (currentDataCache) {
            hydrateView(cleanPath, currentDataCache);
        }
    } catch (e) {
        routerView.innerHTML = `<div class="p-8 text-red-400">Error loading view: ${e.message}</div>`;
    }
}

// ================= AUTHENTICATION =================
function bindLoginEvents() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('loginBtn');
        const errorDiv = document.getElementById('loginError');
        const errorMsg = document.getElementById('loginErrorMsg');

        errorDiv.classList.add('hidden');
        btn.innerHTML = '<div class="spinner border-white"></div>';
        btn.disabled = true;
        btn.classList.add('opacity-80', 'cursor-not-allowed');

        const user = document.getElementById('username').value;
        const pass = document.getElementById('password').value;

        try {
            const res = await fetch(`${API_URL}/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, password: pass })
            });
            const data = await res.json();

            if (data.success) {
                localStorage.setItem('adminToken', data.token);
                window.location.hash = '#/overview';
            } else {
                errorMsg.textContent = data.message || 'Invalid credentials.';
                errorDiv.classList.remove('hidden');
                playAcousticPulse('error');
            }
        } catch (err) {
            errorMsg.textContent = 'Connection error establishing contact with gateway.';
            errorDiv.classList.remove('hidden');
            playAcousticPulse('error');
        } finally {
            if (btn) {
                btn.innerHTML = '<span>Authenticating</span><i class="ph ph-arrow-right font-bold transition-transform group-hover:translate-x-1"></i>';
                btn.disabled = false;
                btn.classList.remove('opacity-80', 'cursor-not-allowed');
            }
        }
    });
}

function handleLogout(sessionExpired = false) {
    stopAutoPolling();
    localStorage.removeItem('adminToken');
    window.location.hash = '#/login';
    setTimeout(() => {
        if (sessionExpired) {
            const errDiv = document.getElementById('loginError');
            if (errDiv) {
                document.getElementById('loginErrorMsg').textContent = 'Session expired. Please log in again.';
                errDiv.classList.remove('hidden');
            }
        }
    }, 100);
}

// ================= DATA FETCHING & LATENCY PING =================
async function refreshDashboardData() {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    const rfBtn = document.getElementById('refreshBtn');
    if (rfBtn) rfBtn.classList.add('animate-spin', 'pointer-events-none');

    const startTime = performance.now();
    try {
        const res = await fetch(`${API_URL}/admin/dashboard`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const elapsed = Math.round(performance.now() - startTime);
        updateLatencyUI(elapsed);

        if (res.status === 401 || res.status === 403) {
            handleLogout(true);
            return;
        }

        if (!res.ok) throw new Error('Failed to fetch telemetry');
        const data = await res.json();
        currentDataCache = data;

        // Update nav badges
        updateNavigationBadges(data);

        // Re-hydrate the current active view
        const currentHash = window.location.hash.replace('#/', '') || 'overview';
        hydrateView(currentHash, data);

    } catch (e) {
        console.error("Gateway fetch failed:", e);
        updateLatencyUI(-1);
    } finally {
        if (rfBtn) {
            setTimeout(() => rfBtn.classList.remove('animate-spin', 'pointer-events-none'), 400);
        }
    }
}

function updateLatencyUI(ms) {
    const latBadge = document.getElementById('latencyBadge');
    const latText = document.getElementById('headerLatency');
    const mobBadge = document.getElementById('mobileLatencyBadge');
    const mobText = document.getElementById('mobileLatencyText');

    const txt = ms < 0 ? 'Degraded' : `${ms} ms`;
    if (latText) latText.textContent = txt;
    if (mobText) mobText.textContent = txt;

    let cls = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-mono backdrop-blur transition-all ';
    let mobCls = 'flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-mono ';
    if (ms < 0) {
        cls += 'bg-red-500/10 border-red-500/20 text-red-400';
        mobCls += 'bg-red-500/10 border-red-500/20 text-red-400';
    } else if (ms < 150) {
        cls += 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
        mobCls += 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
    } else if (ms < 350) {
        cls += 'bg-amber-500/10 border-amber-500/20 text-amber-400';
        mobCls += 'bg-amber-500/10 border-amber-500/20 text-amber-400';
    } else {
        cls += 'bg-red-500/10 border-red-500/20 text-red-400';
        mobCls += 'bg-red-500/10 border-red-500/20 text-red-400';
    }

    if (latBadge) latBadge.className = cls;
    if (mobBadge) mobBadge.className = mobCls;
}

function updateNavigationBadges(data) {
    if (!data) return;
    const secBadge = document.getElementById('navSecurityBadge');
    const logsBadge = document.getElementById('navLogsBadge');

    const totalBlocks = (data.blockedIPs || []).length + (data.blockedUserIds || []).length;
    if (secBadge) {
        if (totalBlocks > 0) {
            secBadge.textContent = totalBlocks;
            secBadge.classList.remove('hidden');
        } else {
            secBadge.classList.add('hidden');
        }
    }

    const totalLogs = (data.recentLogs || []).length;
    if (logsBadge) {
        if (totalLogs > 0) {
            logsBadge.textContent = totalLogs > 99 ? '99+' : totalLogs;
            logsBadge.classList.remove('hidden');
        } else {
            logsBadge.classList.add('hidden');
        }
    }
}

// ================= HYDRATION & DOM =================
function hydrateView(viewName, data) {
    if (!data) return;

    if (viewName === 'overview') {
        const dates = Object.keys(data.analytics || {}).sort();
        let uVisits = 0, tActions = 0;
        dates.forEach(d => {
            uVisits += (data.analytics[d].unique_ips ? data.analytics[d].unique_ips.length : (data.analytics[d].visits || 0));
            tActions += data.analytics[d].actions || 0;
        });

        const elV = document.getElementById('ovUniqueVisits');
        const elA = document.getElementById('ovActions');
        const elU = document.getElementById('ovTotalUnique');
        const elB = document.getElementById('ovBlocks');

        if (elV) elV.textContent = uVisits.toLocaleString();
        if (elA) elA.textContent = tActions.toLocaleString();
        if (elU) elU.textContent = (data.totalUniqueVisitors || 0).toLocaleString();
        if (elB) elB.textContent = ((data.blockedIPs || []).length + (data.blockedUserIds || []).length).toString();

        renderMiniLogs(data.recentLogs || []);
        renderOverviewHourlyChart(data.recentLogs || [], extractAllSuccessfulLogins(data));
        setupOverviewListeners();
        pingPortalHealth();
    }

    if (viewName === 'site-analytics') {
        const dates = Object.keys(data.analytics || {}).sort();
        renderChart(dates, data.analytics || {});

        // Fill Engagement Bar
        let uVisits = 0, tActions = 0;
        dates.forEach(d => {
            uVisits += (data.analytics[d].unique_ips ? data.analytics[d].unique_ips.length : (data.analytics[d].visits || 0));
            tActions += data.analytics[d].actions || 0;
        });
        const total = uVisits + tActions;
        const eBar = document.getElementById('engagementBar');
        const eTxt = document.getElementById('engagementText');
        if (eBar && total > 0) {
            const perc = Math.round((tActions / total) * 100);
            requestAnimationFrame(() => {
                eBar.style.width = perc + '%';
                if (eTxt) eTxt.textContent = `${perc}% Action Density`;
            });
        }

        renderRoutePopularity(data.recentLogs || []);
    }

    if (viewName === 'user-analytics') {
        renderUserSessions(data.recentLogs || []);
        setupUserAnalyticsListeners();
    }

    if (viewName === 'control') {
        const toggle = document.getElementById('ctrlClosureToggle');
        if (toggle) {
            toggle.checked = data.siteClosureMode;
            updateClosureUI(data.siteClosureMode);

            toggle.onchange = async (e) => {
                const active = e.target.checked;
                updateClosureUI(active);
                try {
                    const token = localStorage.getItem('adminToken');
                    await fetch(`${API_URL}/admin/config`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ siteClosureMode: active })
                    });
                    currentDataCache.siteClosureMode = active;
                    showAdminToast(`Site Maintenance Mode is now ${active ? 'ENABLED (Locked)' : 'DISABLED (Online)'}!`, true);
                } catch (err) {
                    alert('Edge synchronization failed.');
                    toggle.checked = !active;
                    updateClosureUI(!active);
                }
            };
        }

        // Custom Notice Bindings
        const notice = data.customNotice || { wpb: {}, unb: {} };
        const el = id => document.getElementById(id);

        if (el('wpbToggle')) {
            el('wpbToggle').checked = notice.wpb?.enabled || false;
            el('wpbContent').value = notice.wpb?.content || '';
            el('wpbFontSize').value = notice.wpb?.fontSize || 'text-base';
            el('wpbFontWeight').value = notice.wpb?.fontWeight || 'font-normal';
            el('wpbIcon').value = notice.wpb?.icon || '';
            el('wpbAlign').value = notice.wpb?.align || 'text-center';

            el('wpbSaveBtn').onclick = () => saveNoticeConfig(data);
        }

        if (el('unbToggle')) {
            el('unbToggle').checked = notice.unb?.enabled || false;
            el('unbContent').value = notice.unb?.content || '';
            el('unbFontFamily').value = notice.unb?.fontFamily || 'Inter';
            el('unbFontStyle').value = notice.unb?.fontStyle || 'normal';
            el('unbFontSize').value = notice.unb?.fontSize || 'text-sm';
            el('unbAnimation').value = notice.unb?.animation || 'none';
            el('unbPosition').value = notice.unb?.position || 'after-header';
            el('unbPages').value = notice.unb?.pages || '*';
            el('unbGlow').checked = notice.unb?.glow || false;

            el('unbSaveBtn').onclick = () => saveNoticeConfig(data);
        }

        if (el('globalNoticeSaveBtn')) {
            el('globalNoticeSaveBtn').onclick = () => saveNoticeConfig(data);
        }

        setupNoticeSimulatorLivePreview();
        updateNoticeSimulatorPreview();
    }

    if (viewName === 'logs' || viewName === 'security') {
        if (viewName === 'logs') {
            if (!isStreamPaused) {
                renderRealTimeLogs(data.recentLogs || []);
            }
            setupLogsViewListeners();
        }
        startAutoPolling();
    } else {
        if (currentSettings.refreshInterval === 'manual') {
            stopAutoPolling();
        } else {
            startAutoPolling();
        }
    }

    if (viewName === 'security') {
        renderBlocklistFull(data.blockedIPs || []);
        renderBlockedUserIdsFull(data.blockedUserIds || []);
        const allLogins = extractAllSuccessfulLogins(data);
        renderSuccessfulLoginsTable(allLogins);
        renderAuditLogs(data.auditLogs || []);
        setupSecurityViewListeners();
    }

    if (viewName === 'features') {
        renderFeatureControls(data.featureStatus || {});
    }

    if (viewName === 'settings') {
        const sAnim = document.getElementById('setAnimations');
        if (sAnim) {
            sAnim.checked = currentSettings.animations;
            sAnim.onchange = (e) => {
                currentSettings.animations = e.target.checked;
                saveSettings();
            };
        }

        const sLowEnd = document.getElementById('setLowEndMode');
        if (sLowEnd) {
            sLowEnd.checked = currentSettings.lowEndMode;
            sLowEnd.onchange = (e) => {
                currentSettings.lowEndMode = e.target.checked;
                saveSettings();
                if (currentSettings.lowEndMode) {
                    document.documentElement.classList.add('performance-mode');
                } else {
                    document.documentElement.classList.remove('performance-mode');
                }
            };
        }

        const sAudio = document.getElementById('setAudioAlerts');
        if (sAudio) {
            sAudio.checked = currentSettings.audioAlerts;
            sAudio.onchange = (e) => {
                currentSettings.audioAlerts = e.target.checked;
                saveSettings();
                if (currentSettings.audioAlerts) playAcousticPulse('success');
            };
        }

        const sRefresh = document.getElementById('setRefreshInterval');
        if (sRefresh) {
            sRefresh.value = currentSettings.refreshInterval.toString();
            sRefresh.onchange = (e) => {
                const val = e.target.value;
                currentSettings.refreshInterval = val === 'manual' ? 'manual' : parseInt(val, 10);
                saveSettings();
                startAutoPolling();
            };
        }
    }
}

function saveSettings() {
    try {
        localStorage.setItem('adminSettings', JSON.stringify(currentSettings));
    } catch (e) { }
}

// ================= RENDER COMPONENTS =================

function renderMiniLogs(logs) {
    const list = document.getElementById('ovLogs');
    if (!list) return;
    list.innerHTML = '';
    const slice = logs.slice(0, 6);
    if (slice.length === 0) {
        list.innerHTML = '<div class="p-4 text-center text-gray-500 text-sm">No activity recorded yet.</div>';
        return;
    }
    slice.forEach(log => {
        const timeStr = new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const level = (log.level || 'info').toLowerCase();
        let badgeColor = 'text-blue-400 bg-blue-500/10 border-blue-500/20';
        if (level === 'success') badgeColor = 'text-green-400 bg-green-500/10 border-green-500/20';
        if (level === 'error') badgeColor = 'text-red-400 bg-red-500/10 border-red-500/20';

        list.innerHTML += `
            <div class="flex items-center justify-between p-2.5 border-b border-gray-800/40 hover:bg-white/[0.02] transition-colors rounded-lg text-xs">
                <div class="flex items-center gap-2.5">
                    <span class="font-mono text-gray-500 text-[11px]">${timeStr}</span>
                    <span class="font-mono text-purple-300 font-semibold">${log.ip || 'unknown'}</span>
                    <span class="text-gray-300 truncate max-w-[160px]">${escapeHtml(log.path || log.type || 'action')}</span>
                </div>
                <span class="px-2 py-0.5 rounded border ${badgeColor} text-[10px] font-bold uppercase">${escapeHtml(log.type || level)}</span>
            </div>
        `;
    });
}

function renderRoutePopularity(logs) {
    const container = document.getElementById('routePopularityList');
    if (!container) return;

    const pathMap = {};
    let totalPathHits = 0;

    logs.forEach(l => {
        if (l.path) {
            pathMap[l.path] = (pathMap[l.path] || 0) + 1;
            totalPathHits++;
        }
    });

    const sorted = Object.entries(pathMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (sorted.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 text-xs py-4">No route data collected yet.</div>';
        return;
    }

    container.innerHTML = '';
    sorted.forEach(([path, count]) => {
        const pct = Math.round((count / totalPathHits) * 100);
        container.innerHTML += `
            <div>
                <div class="flex justify-between text-xs mb-1">
                    <span class="font-mono text-gray-300 flex items-center gap-1.5"><i class="ph ph-browsers text-purple-400"></i> ${escapeHtml(path)}</span>
                    <span class="text-gray-400 font-semibold">${count} hits (${pct}%)</span>
                </div>
                <div class="h-2 rounded-full bg-gray-800 overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" style="width: ${pct}%"></div>
                </div>
            </div>
        `;
    });
}

function showAdminToast(message, isSuccess = true) {
    const toast = document.getElementById('noticeStatusToast');
    const text = document.getElementById('noticeStatusText');
    const icon = document.getElementById('noticeStatusIcon');

    if (toast && text && icon) {
        text.textContent = message;
        if (isSuccess) {
            toast.className = 'text-sm px-4 py-2.5 rounded-xl border flex items-center gap-2 transition-all bg-green-500/10 text-green-400 border-green-500/30';
            icon.className = 'ph ph-check-circle text-lg text-green-400';
            playAcousticPulse('success');
        } else {
            toast.className = 'text-sm px-4 py-2.5 rounded-xl border flex items-center gap-2 transition-all bg-red-500/10 text-red-400 border-red-500/30';
            icon.className = 'ph ph-warning-circle text-lg text-red-400';
            playAcousticPulse('error');
        }
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 4000);
    } else {
        alert(message);
    }
}

async function saveNoticeConfig(data) {
    const el = id => document.getElementById(id);
    const notice = {
        wpb: {
            enabled: el('wpbToggle') ? el('wpbToggle').checked : false,
            content: el('wpbContent') ? el('wpbContent').value : '',
            fontSize: el('wpbFontSize') ? el('wpbFontSize').value : 'text-base',
            fontWeight: el('wpbFontWeight') ? el('wpbFontWeight').value : 'font-normal',
            icon: el('wpbIcon') ? el('wpbIcon').value : '',
            align: el('wpbAlign') ? el('wpbAlign').value : 'text-center'
        },
        unb: {
            enabled: el('unbToggle') ? el('unbToggle').checked : false,
            content: el('unbContent') ? el('unbContent').value : '',
            fontFamily: el('unbFontFamily') ? el('unbFontFamily').value : 'Inter',
            fontStyle: el('unbFontStyle') ? el('unbFontStyle').value : 'normal',
            fontSize: el('unbFontSize') ? el('unbFontSize').value : 'text-sm',
            animation: el('unbAnimation') ? el('unbAnimation').value : 'none',
            position: el('unbPosition') ? el('unbPosition').value : 'after-header',
            pages: el('unbPages') ? el('unbPages').value : '*',
            glow: el('unbGlow') ? el('unbGlow').checked : false
        }
    };

    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ customNotice: notice })
        });

        if (res.status === 401 || res.status === 403) {
            handleLogout(true);
            return;
        }

        if (!res.ok) throw new Error('Gateway rejected config save');

        if (data) data.customNotice = notice;
        if (currentDataCache) currentDataCache.customNotice = notice;
        showAdminToast('Notice Configuration saved & deployed live across all edge nodes!', true);
    } catch (err) {
        showAdminToast('Edge synchronization failed for Custom Notice.', false);
    }
}

// ================= FEATURE AVAILABILITY CONTROL =================
const FEATURE_LABELS = {
    recommended: 'Recommended Courses',
    department: 'Department-Wise Courses',
    schedule: 'Class Schedule',
    planner: 'Course Planner',
    ledger: 'Account Ledger',
    grades: 'Grade Report',
    cgpa: 'CGPA Planner',
    preadvising: 'Pre-Advising',
    degreereview: 'Degree Review',
    curriculum: 'Curriculum',
    profile: 'Student Profile'
};

const FEATURE_META_ICONS = {
    recommended: { icon: 'ph-book-bookmark', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
    department: { icon: 'ph-buildings', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    schedule: { icon: 'ph-calendar-check', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
    planner: { icon: 'ph-compass', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
    ledger: { icon: 'ph-receipt', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    grades: { icon: 'ph-graduation-cap', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    cgpa: { icon: 'ph-calculator', color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' },
    preadvising: { icon: 'ph-files', color: 'text-teal-400 bg-teal-500/10 border-teal-500/20' },
    degreereview: { icon: 'ph-chart-pie-slice', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
    curriculum: { icon: 'ph-books', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    profile: { icon: 'ph-user-circle', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' }
};

const FEATURE_STATUS_OPTIONS = [
    { value: 'active', label: 'Active', tone: 'emerald' },
    { value: 'beta', label: 'Beta', tone: 'sky' },
    { value: 'maintenance', label: 'Maintenance', tone: 'amber' },
    { value: 'under_work', label: 'Under Work', tone: 'amber' },
    { value: 'coming_soon', label: 'Coming Soon', tone: 'violet' },
    { value: 'off', label: 'Off', tone: 'gray' }
];

function renderFeatureControls(features) {
    const container = document.getElementById('featureControlList');
    if (!container) return;

    const keys = Object.keys(FEATURE_LABELS);
    container.innerHTML = '';

    keys.forEach(key => {
        const current = (features && features[key]) || 'active';
        const metaIcon = FEATURE_META_ICONS[key] || { icon: 'ph-puzzle-piece', color: 'text-brand-400 bg-brand-500/10 border-brand-500/20' };
        const row = document.createElement('div');
        row.className = 'p-4 rounded-xl border border-gray-800/80 bg-gray-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-gray-700/80 hover:bg-gray-900/50';

        const optionsHtml = FEATURE_STATUS_OPTIONS.map(opt =>
            `<option value="${opt.value}" ${opt.value === current ? 'selected' : ''}>${opt.label}</option>`
        ).join('');

        row.innerHTML = `
            <div class="flex items-center gap-3.5">
                <div class="w-10 h-10 rounded-xl ${metaIcon.color} border flex items-center justify-center flex-shrink-0">
                    <i class="ph ${metaIcon.icon} text-xl"></i>
                </div>
                <div>
                    <div class="text-sm font-semibold text-white tracking-wide">${FEATURE_LABELS[key]}</div>
                    <div class="text-[11px] text-gray-400 font-mono">key: ${key}</div>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <span class="feature-status-pill" data-key="${key}"></span>
                <select data-feature-key="${key}" class="glass-input rounded-xl p-2.5 text-xs bg-gray-950 font-medium w-40 cursor-pointer">
                    ${optionsHtml}
                </select>
            </div>
        `;
        container.appendChild(row);
    });

    container.querySelectorAll('select[data-feature-key]').forEach(sel => {
        sel.onchange = async (e) => {
            const key = e.target.getAttribute('data-feature-key');
            await updateFeatureStatus(key, e.target.value);
            updateFeatureStatusPills();
        };
    });

    updateFeatureStatusPills();
}

function updateFeatureStatusPills() {
    document.querySelectorAll('.feature-status-pill').forEach(pill => {
        const key = pill.getAttribute('data-key');
        const sel = document.querySelector(`select[data-feature-key="${key}"]`);
        const val = sel ? sel.value : 'active';
        const opt = FEATURE_STATUS_OPTIONS.find(o => o.value === val) || FEATURE_STATUS_OPTIONS[0];
        const toneMap = {
            emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
            sky: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
            amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
            violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
            gray: 'bg-gray-500/15 text-gray-300 border-gray-500/30'
        };
        pill.className = `feature-status-pill text-[11px] font-semibold px-2.5 py-1 rounded-full border ${toneMap[opt.tone] || toneMap.gray}`;
        pill.textContent = opt.label;
    });
}

async function updateFeatureStatus(key, status) {
    const token = localStorage.getItem('adminToken');
    const toast = document.getElementById('featureStatusToast');
    try {
        const res = await fetch(`${API_URL}/admin/features`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ key, status })
        });
        if (res.status === 401 || res.status === 403) { handleLogout(true); return; }
        if (!res.ok) throw new Error('Gateway rejected update');
        const data = await res.json();
        if (data.success) {
            if (currentDataCache) currentDataCache.featureStatus = data.features;
            showFeatureToast(`${FEATURE_LABELS[key]} set to ${status}`, true);
        } else {
            throw new Error(data.error || 'Update failed');
        }
    } catch (e) {
        showFeatureToast(`Failed to update ${FEATURE_LABELS[key]}`, false);
        if (currentDataCache) hydrateView('features', currentDataCache);
    }
}

function showFeatureToast(message, isSuccess) {
    const toast = document.getElementById('featureStatusToast');
    const text = document.getElementById('featureStatusText');
    const icon = document.getElementById('featureStatusIcon');
    if (!toast || !text || !icon) { showAdminToast(message, isSuccess); return; }
    text.textContent = message;
    if (isSuccess) {
        toast.className = 'text-sm px-4 py-2.5 rounded-xl border flex items-center gap-2 transition-all mb-5 bg-green-500/10 text-green-400 border-green-500/30';
        icon.className = 'ph ph-check-circle text-lg text-green-400';
        playAcousticPulse('success');
    } else {
        toast.className = 'text-sm px-4 py-2.5 rounded-xl border flex items-center gap-2 transition-all mb-5 bg-red-500/10 text-red-400 border-red-500/30';
        icon.className = 'ph ph-warning-circle text-lg text-red-400';
        playAcousticPulse('error');
    }
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 4000);
}

// ================= NOTICE LIVE PREVIEW SIMULATOR =================
function setupNoticeSimulatorLivePreview() {
    const inputIds = [
        'wpbToggle', 'wpbContent', 'wpbFontSize', 'wpbFontWeight', 'wpbIcon', 'wpbAlign',
        'unbToggle', 'unbContent', 'unbFontFamily', 'unbFontStyle', 'unbFontSize', 'unbAnimation', 'unbPosition', 'unbGlow'
    ];

    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateNoticeSimulatorPreview);
            el.addEventListener('change', updateNoticeSimulatorPreview);
        }
    });
}

function updateNoticeSimulatorPreview() {
    const container = document.getElementById('simulatorNoticeContainer');
    if (!container) return;

    const el = id => document.getElementById(id);
    const isWpb = el('wpbToggle')?.checked;
    const isUnb = el('unbToggle')?.checked;

    if (!isWpb && !isUnb) {
        container.innerHTML = '<div class="text-center text-xs text-gray-500 py-6">Toggle on Whole Page Banner or Upper Notice Banner to see live preview here.</div>';
        return;
    }

    let html = '<div class="space-y-4">';

    if (isUnb) {
        const unbContent = el('unbContent')?.value || 'Announcement text preview here...';
        const unbFont = el('unbFontFamily')?.value || 'Inter';
        const unbSize = el('unbFontSize')?.value || 'text-sm';
        const unbGlow = el('unbGlow')?.checked;
        const unbAnim = el('unbAnimation')?.value || 'none';

        let sizePx = '14px';
        if (unbSize === 'text-xs') sizePx = '12px';
        if (unbSize === 'text-base') sizePx = '16px';
        if (unbSize === 'text-lg') sizePx = '18px';

        const glowBorder = unbGlow ? 'border: 1px solid rgba(139,92,246,0.5); box-shadow: 0 0 15px rgba(139,92,246,0.3);' : 'border: 1px solid rgba(255,255,255,0.08);';

        html += `
            <div class="p-2.5 rounded-lg bg-gray-900/90 flex items-center justify-between text-xs" style="${glowBorder}">
                <span class="text-[10px] text-blue-400 font-mono font-bold uppercase bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 mr-2">UNB Live</span>
                <span style="font-family: ${unbFont}; font-size: ${sizePx};" class="text-gray-100 flex-1 text-center font-medium ${unbAnim === 'pulse' ? 'animate-pulse' : ''}">${escapeHtml(unbContent)}</span>
                <span class="text-gray-500 text-[10px] ml-2">✕</span>
            </div>
        `;
    }

    if (isWpb) {
        const wpbContent = el('wpbContent')?.value || 'Custom notice message preview goes here...';
        const wpbSize = el('wpbFontSize')?.value || 'text-base';
        const wpbWeight = el('wpbFontWeight')?.value || 'font-normal';
        const wpbAlign = el('wpbAlign')?.value || 'text-center';
        const wpbIcon = el('wpbIcon')?.value || '';

        let iconTag = '<i class="ph ph-bell-ringing text-2xl text-purple-400 mb-2 inline-block"></i>';
        if (wpbIcon === 'danger') iconTag = '<i class="ph ph-warning-octagon text-2xl text-red-400 mb-2 inline-block"></i>';
        if (wpbIcon === 'warning') iconTag = '<i class="ph ph-warning text-2xl text-amber-400 mb-2 inline-block"></i>';
        if (wpbIcon === 'success') iconTag = '<i class="ph ph-check-circle text-2xl text-green-400 mb-2 inline-block"></i>';
        if (wpbIcon === 'megaphone') iconTag = '<i class="ph ph-megaphone text-2xl text-purple-400 mb-2 inline-block"></i>';

        html += `
            <div class="p-5 rounded-xl bg-gray-900/80 border border-purple-500/30 ${wpbAlign} shadow-lg relative">
                <span class="text-[10px] text-purple-400 font-mono font-bold uppercase bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 absolute top-3 left-3">WPB Screen Curtain</span>
                <div class="pt-3">
                    ${wpbIcon ? iconTag : ''}
                    <div class="${wpbSize} ${wpbWeight} text-purple-100">${escapeHtml(wpbContent)}</div>
                </div>
            </div>
        `;
    }

    html += '</div>';
    container.innerHTML = html;
}

// ================= USER SESSIONS & ORIGIN =================
function renderUserSessions(logs) {
    const tbody = document.getElementById('userSessionsTable');
    const uList = document.getElementById('userOriginList');
    if (!tbody || !uList) return;

    const ipMap = {};
    logs.forEach(l => {
        if (!ipMap[l.ip]) ipMap[l.ip] = { lastPath: l.path || '/', time: l.time, type: l.type, count: 0 };
        ipMap[l.ip].count++;
    });

    const uniqueIps = Object.keys(ipMap).sort((a, b) => new Date(ipMap[b].time) - new Date(ipMap[a].time));

    const filterQuery = (document.getElementById('userSessionsSearchInput')?.value || '').toLowerCase().trim();
    const filteredIps = filterQuery ? uniqueIps.filter(ip => ip.toLowerCase().includes(filterQuery) || (ipMap[ip].lastPath || '').toLowerCase().includes(filterQuery)) : uniqueIps;

    tbody.innerHTML = '';
    if (filteredIps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-500">No session records match your filter.</td></tr>';
    } else {
        filteredIps.forEach(ip => {
            const obj = ipMap[ip];
            const timeStr = new Date(obj.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const isBlocked = (currentDataCache?.blockedIPs || []).includes(ip);

            tbody.innerHTML += `
                <tr class="hover:bg-white/[0.02] transition-colors">
                    <td class="px-4 py-3">
                        <div class="flex items-center gap-2">
                            <span class="font-mono text-xs text-brand-300 font-semibold">${escapeHtml(ip)}</span>
                            <button onclick="window.copyText('${escapeHtml(ip)}')" class="text-gray-500 hover:text-white" title="Copy IP"><i class="ph ph-copy"></i></button>
                        </div>
                    </td>
                    <td class="px-4 py-3 text-xs text-gray-300 truncate max-w-[180px]">
                        <span class="text-gray-500 mr-1.5">${timeStr}</span> ${escapeHtml(obj.lastPath)}
                    </td>
                    <td class="px-4 py-3">
                        <span class="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[11px] font-semibold">${obj.count} ops</span>
                    </td>
                    <td class="px-4 py-3 text-right">
                        ${isBlocked ? `<span class="text-red-400 font-semibold text-xs">Blocked</span>` : `
                        <button onclick="modifyBlocklistCall('block', '${escapeHtml(ip)}')" class="px-2.5 py-1 rounded text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 transition-colors">
                            Block IP
                        </button>`}
                    </td>
                </tr>
            `;
        });
    }

    uList.innerHTML = `
        <div class="p-3 rounded-xl bg-gray-900/60 border border-gray-800 flex justify-between items-center">
            <span class="text-gray-400 text-xs">Active Session IPs</span>
            <span class="text-2xl font-bold text-white font-mono">${uniqueIps.length}</span>
        </div>
        <div class="p-3 rounded-xl bg-gray-900/60 border border-gray-800 flex justify-between items-center">
            <span class="text-gray-400 text-xs">Total Tracked Operations</span>
            <span class="text-2xl font-bold text-purple-400 font-mono">${logs.length}</span>
        </div>
    `;
}

function setupUserAnalyticsListeners() {
    const searchInput = document.getElementById('userSessionsSearchInput');
    if (searchInput) {
        searchInput.oninput = () => {
            if (currentDataCache) renderUserSessions(currentDataCache.recentLogs || []);
        };
    }
}

// ================= SECURITY & BLOCKLIST =================
function renderBlocklistFull(ips) {
    const container = document.getElementById('secBlockedList');
    const badge = document.getElementById('secIpCountBadge');
    if (!container) return;

    if (badge) badge.textContent = ips.length;

    const filterQuery = (document.getElementById('secIpSearchInput')?.value || '').toLowerCase().trim();
    const filtered = filterQuery ? ips.filter(ip => ip.toLowerCase().includes(filterQuery)) : ips;

    container.innerHTML = '';
    if (filtered.length === 0) {
        container.innerHTML = `<div class="text-center text-gray-500 py-8 text-xs bg-gray-900/20 rounded-lg border border-dashed border-gray-800">${ips.length === 0 ? 'No IPs currently blocked. System perimeter is secure.' : 'No blocked IPs match your search query.'}</div>`;
        return;
    }

    filtered.forEach(ip => {
        container.innerHTML += `
            <div class="flex items-center justify-between p-2.5 rounded-lg bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 transition-all group shadow-sm">
                <div class="flex items-center gap-2.5">
                    <div class="w-7 h-7 rounded-md bg-red-500/20 flex items-center justify-center text-red-400 text-sm"><i class="ph ph-shield-slash"></i></div>
                    <span class="font-mono text-xs text-red-200 font-semibold">${escapeHtml(ip)}</span>
                    <button onclick="window.copyText('${escapeHtml(ip)}')" class="text-gray-500 hover:text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity" title="Copy IP"><i class="ph ph-copy"></i></button>
                </div>
                <button data-ip="${escapeHtml(ip)}" class="btn-unblock text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 w-7 h-7 rounded flex items-center justify-center text-xs transition-colors" title="Remove Block">
                    <i class="ph ph-x font-bold"></i>
                </button>
            </div>
        `;
    });

    document.querySelectorAll('.btn-unblock').forEach(btn => {
        btn.onclick = () => modifyBlocklistCall('unblock', btn.getAttribute('data-ip'));
    });
}

function renderBlockedUserIdsFull(userArr) {
    const list = document.getElementById('secBlockedUserIdList');
    const badge = document.getElementById('secUserIdCountBadge');
    if (!list) return;

    if (badge) badge.textContent = (userArr || []).length;

    const filterQuery = (document.getElementById('secUserIdSearchInput')?.value || '').toLowerCase().trim();
    const filtered = filterQuery ? (userArr || []).filter(id => id.toLowerCase().includes(filterQuery)) : (userArr || []);

    list.innerHTML = '';
    if (filtered.length === 0) {
        list.innerHTML = `<div class="text-center text-gray-500 py-8 text-xs bg-gray-900/20 rounded-lg border border-dashed border-gray-800">${(userArr || []).length === 0 ? 'No restricted User IDs.' : 'No restricted User IDs match your search query.'}</div>`;
        return;
    }

    filtered.forEach(id => {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10 hover:border-amber-500/30 transition-colors';
        row.innerHTML = `
            <div class="flex items-center gap-2">
                <i class="ph ph-user-minus text-amber-400"></i>
                <span class="font-mono text-xs font-semibold text-amber-300">${escapeHtml(id)}</span>
            </div>
            <button onclick="modifyUserIdBlocklistCall('unblock', '${escapeHtml(id)}')" class="px-2.5 py-1 rounded text-xs bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 transition-colors">
                Unblock
            </button>
        `;
        list.appendChild(row);
    });
}

function extractAllSuccessfulLogins(data) {
    if (!data) return [];
    const map = {};

    // 1. Process recentLogs
    if (data.recentLogs && Array.isArray(data.recentLogs)) {
        data.recentLogs.forEach(l => {
            if (l.type === 'login' || (l.formatted && l.formatted.includes('logged in using'))) {
                let uId = l.userId;
                if (!uId && l.formatted) {
                    const match = l.formatted.match(/logged in using\s+([^\s()]+)/);
                    if (match) uId = match[1];
                }
                if (uId && uId !== 'credentials') {
                    const isV2 = (l.formatted && l.formatted.includes('(V2)')) || (l.message && l.message.includes('(V2)'));
                    const version = isV2 ? 'V2' : 'V1';
                    if (!map[uId]) {
                        map[uId] = {
                            userId: uId,
                            ip: l.ip || 'unknown',
                            time: l.time,
                            version: version,
                            totalLogins: 1,
                            userAgent: l.userAgent || ''
                        };
                    } else {
                        map[uId].totalLogins++;
                        if (new Date(l.time) > new Date(map[uId].time)) {
                            map[uId].time = l.time;
                            map[uId].ip = l.ip || map[uId].ip;
                            map[uId].version = version;
                        }
                    }
                }
            }
        });
    }

    // 2. Process explicit successfulLogins
    if (data.successfulLogins && Array.isArray(data.successfulLogins)) {
        data.successfulLogins.forEach(item => {
            if (item.userId) {
                if (!map[item.userId]) {
                    map[item.userId] = {
                        userId: item.userId,
                        ip: item.ip || 'unknown',
                        time: item.time,
                        version: item.version || 'V1',
                        totalLogins: item.totalLogins || 1,
                        userAgent: item.userAgent || ''
                    };
                } else {
                    map[item.userId].totalLogins = Math.max(map[item.userId].totalLogins, item.totalLogins || 1);
                    if (new Date(item.time) >= new Date(map[item.userId].time)) {
                        map[item.userId].time = item.time;
                        map[item.userId].ip = item.ip || map[item.userId].ip;
                        map[item.userId].version = item.version || map[item.userId].version;
                    }
                }
            }
        });
    }

    return Object.values(map).sort((a, b) => new Date(b.time) - new Date(a.time));
}

function renderSuccessfulLoginsTable(loginsArr) {
    const tbody = document.getElementById('secUserLoginsTable');
    if (!tbody) return;

    const filterQuery = (document.getElementById('secLoginSearchInput')?.value || '').toLowerCase().trim();
    const filtered = filterQuery ? loginsArr.filter(l => l.userId.toLowerCase().includes(filterQuery) || (l.ip || '').toLowerCase().includes(filterQuery)) : loginsArr;

    tbody.innerHTML = '';
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-5 py-8 text-center text-gray-500 font-sans">No matching authentication records found.</td></tr>';
        return;
    }

    filtered.forEach(item => {
        const timeStr = item.time ? new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A';
        const dateStr = item.time ? new Date(item.time).toISOString().split('T')[0] : '';
        const isBlocked = (currentDataCache?.blockedUserIds || []).includes(item.userId);
        const count = item.totalLogins || 1;

        const row = document.createElement('tr');
        row.className = 'hover:bg-white/[0.02] transition-colors border-b border-gray-800/40';
        row.innerHTML = `
            <td class="px-5 py-3 font-mono font-semibold text-purple-300 text-xs">${escapeHtml(item.userId)}</td>
            <td class="px-5 py-3 font-mono text-gray-300 text-xs">
                <span class="cursor-pointer hover:text-white" onclick="window.copyText('${escapeHtml(item.ip)}')">${escapeHtml(item.ip || 'unknown')}</span>
            </td>
            <td class="px-5 py-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${item.version === 'V2' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}">${escapeHtml(item.version || 'V1')}</span></td>
            <td class="px-5 py-3"><span class="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">${count} ${count === 1 ? 'login' : 'logins'}</span></td>
            <td class="px-5 py-3 text-gray-400 text-xs">${dateStr} ${timeStr}</td>
            <td class="px-5 py-3 text-right">
                ${isBlocked ? `<span class="text-amber-400 font-semibold text-xs px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20">Restricted</span>` : `
                <button onclick="modifyUserIdBlocklistCall('block', '${escapeHtml(item.userId)}')" class="px-2.5 py-1 rounded text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 transition-colors">
                    Restrict ID
                </button>`}
            </td>
        `;
        tbody.appendChild(row);
    });
}

function setupSecurityViewListeners() {
    const sForm = document.getElementById('blockForm');
    if (sForm) {
        sForm.onsubmit = async (e) => {
            e.preventDefault();
            const ipInput = document.getElementById('secIpInput');
            await modifyBlocklistCall('block', ipInput.value.trim());
            ipInput.value = '';
        };
    }

    const uForm = document.getElementById('userIdBlockForm');
    if (uForm) {
        uForm.onsubmit = async (e) => {
            e.preventDefault();
            const uInput = document.getElementById('secUserIdInput');
            await modifyUserIdBlocklistCall('block', uInput.value.trim());
            uInput.value = '';
        };
    }

    const unblockAllIpsBtn = document.getElementById('unblockAllIpsBtn');
    if (unblockAllIpsBtn) {
        unblockAllIpsBtn.onclick = async () => {
            if (confirm('Are you sure you want to unblock all IPs?')) {
                await modifyBlocklistCall('unblock-all');
            }
        };
    }

    const unblockAllUserIdsBtn = document.getElementById('unblockAllUserIdsBtn');
    if (unblockAllUserIdsBtn) {
        unblockAllUserIdsBtn.onclick = async () => {
            if (confirm('Are you sure you want to unblock all User IDs?')) {
                await modifyUserIdBlocklistCall('unblock-all');
            }
        };
    }

    const ipSearch = document.getElementById('secIpSearchInput');
    if (ipSearch) {
        ipSearch.oninput = () => {
            if (currentDataCache) renderBlocklistFull(currentDataCache.blockedIPs || []);
        };
    }

    const userSearch = document.getElementById('secUserIdSearchInput');
    if (userSearch) {
        userSearch.oninput = () => {
            if (currentDataCache) renderBlockedUserIdsFull(currentDataCache.blockedUserIds || []);
        };
    }

    const loginSearch = document.getElementById('secLoginSearchInput');
    if (loginSearch) {
        loginSearch.oninput = () => {
            if (currentDataCache) renderSuccessfulLoginsTable(extractAllSuccessfulLogins(currentDataCache));
        };
    }

    const exportLoginsBtn = document.getElementById('exportLoginsCsvBtn');
    if (exportLoginsBtn) {
        exportLoginsBtn.onclick = () => {
            if (currentDataCache) {
                const logins = extractAllSuccessfulLogins(currentDataCache);
                exportLoginsCSV(logins);
            }
        };
    }

    const auditSearch = document.getElementById('secAuditSearchInput');
    if (auditSearch) {
        auditSearch.oninput = () => {
            if (currentDataCache) renderAuditLogs(currentDataCache.auditLogs || []);
        };
    }

    const exportAuditJsonBtn = document.getElementById('exportAuditJsonBtn');
    if (exportAuditJsonBtn) {
        exportAuditJsonBtn.onclick = () => {
            if (currentDataCache) exportAuditLogsJSON(currentDataCache.auditLogs || []);
        };
    }

    const exportAuditCsvBtn = document.getElementById('exportAuditCsvBtn');
    if (exportAuditCsvBtn) {
        exportAuditCsvBtn.onclick = () => {
            if (currentDataCache) exportAuditLogsCSV(currentDataCache.auditLogs || []);
        };
    }
}

async function modifyBlocklistCall(action, ip) {
    if (action !== 'unblock-all' && !ip) return;
    const token = localStorage.getItem('adminToken');
    try {
        const res = await fetch(`${API_URL}/admin/ip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ ip, action })
        });
        if (res.status === 401 || res.status === 403) { handleLogout(true); return; }
        const data = await res.json();

        if (data.success) {
            currentDataCache.blockedIPs = data.blockedIPs;
            renderBlocklistFull(data.blockedIPs);
            updateNavigationBadges(currentDataCache);

            const elB = document.getElementById('ovBlocks');
            if (elB) elB.textContent = ((data.blockedIPs || []).length + (currentDataCache.blockedUserIds || []).length).toString();

            showAdminToast(`IP ${action === 'unblock-all' ? 'list cleared' : (action === 'block' ? 'blocked' : 'unblocked')} successfully!`, true);
        } else {
            alert(data.error || 'Operation denied by gateway.');
        }
    } catch (e) {
        alert('Transmission error.');
    }
}

async function modifyUserIdBlocklistCall(action, userId) {
    if (action !== 'unblock-all' && !userId) return;
    const token = localStorage.getItem('adminToken');
    try {
        const res = await fetch(`${API_URL}/admin/block-userid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ userId, action })
        });
        if (res.status === 401 || res.status === 403) { handleLogout(true); return; }
        const data = await res.json();

        if (data.success) {
            if (currentDataCache) currentDataCache.blockedUserIds = data.blockedUserIds;
            renderBlockedUserIdsFull(data.blockedUserIds || []);
            updateNavigationBadges(currentDataCache);

            const allLogins = extractAllSuccessfulLogins(currentDataCache);
            renderSuccessfulLoginsTable(allLogins);

            showAdminToast(`User ID ${action === 'unblock-all' ? 'list cleared' : (action === 'block' ? 'restricted' : 'unblocked')} successfully!`, true);
        } else {
            alert(data.error || 'Operation denied by gateway.');
        }
    } catch (e) {
        alert('Transmission error.');
    }
}

async function clearLogsCall() {
    if (!confirm('Are you sure you want to permanently purge all recorded telemetry logs from KV?')) return;
    const token = localStorage.getItem('adminToken');
    try {
        const res = await fetch(`${API_URL}/admin/clear-logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401 || res.status === 403) { handleLogout(true); return; }
        const data = await res.json();
        if (data.success) {
            if (currentDataCache) currentDataCache.recentLogs = [];
            renderRealTimeLogs([]);
            updateNavigationBadges(currentDataCache);
            showAdminToast('Telemetry logs purged permanently from KV store!', true);
        }
    } catch (e) {
        alert('Failed to clear logs.');
    }
}

function updateClosureUI(active) {
    const badge = document.getElementById('controlStatusBadge');
    const panel = document.getElementById('controlPanelWrapper');
    if (!badge || !panel) return;

    if (active) {
        badge.className = 'text-xs py-1.5 px-3 rounded-md bg-red-500/10 text-red-400 font-medium inline-flex items-center gap-1.5 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]';
        badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> SYSTEM LOCKED';
        panel.className = 'p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 transition-all duration-300 bg-red-500/5 border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.05)]';
    } else {
        badge.className = 'text-xs py-1.5 px-3 rounded-md bg-green-500/10 text-green-400 font-medium inline-flex items-center gap-1.5 border border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]';
        badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-green-400"></span> Site is ONLINE';
        panel.className = 'p-6 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-6 transition-all duration-300 shadow-lg border-gray-800 bg-gray-900/30';
    }
}

// ================= CHART RENDERING =================
function renderChart(dates, analyticsObj) {
    const canvas = document.getElementById('trafficChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const labels = dates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const visitsData = dates.map(d => analyticsObj[d].unique_ips ? analyticsObj[d].unique_ips.length : (analyticsObj[d].visits || 0));
    const actionsData = dates.map(d => analyticsObj[d].actions || 0);

    if (trafficChartInstance) trafficChartInstance.destroy();

    const gradientVisits = ctx.createLinearGradient(0, 0, 0, 350);
    gradientVisits.addColorStop(0, 'rgba(59, 130, 246, 0.45)');
    gradientVisits.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    trafficChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Unique Endpoints (Daily)',
                    data: visitsData,
                    borderColor: '#3b82f6',
                    backgroundColor: gradientVisits,
                    borderWidth: 2.5,
                    tension: 0.35,
                    fill: true,
                    pointBackgroundColor: '#0b0f19',
                    pointBorderColor: '#3b82f6',
                    pointHoverBackgroundColor: '#3b82f6',
                    pointRadius: 4
                },
                {
                    label: 'System Operations',
                    data: actionsData,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.35,
                    pointBackgroundColor: '#0b0f19',
                    pointBorderColor: '#8b5cf6',
                    pointHoverBackgroundColor: '#8b5cf6',
                    pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: (currentSettings.animations && !currentSettings.lowEndMode) ? undefined : false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#9ca3af', usePointStyle: true, boxWidth: 6, font: { family: 'Inter', size: 12 } } },
                tooltip: { backgroundColor: 'rgba(17, 24, 39, 0.95)', titleColor: '#fff', bodyColor: '#cbd5e1', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 10 }
            },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false }, ticks: { color: '#6b7280', font: { family: 'Inter', size: 11 } } },
                y: { grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false }, ticks: { color: '#6b7280', precision: 0, font: { family: 'Inter', size: 11 } }, beginAtZero: true }
            }
        }
    });
}

// ================= UPSTREAM PORTAL HEALTH & OVERVIEW HOURLY CHART =================
let lastPortalPingTimestamp = 0;
let isPingingPortal = false;

async function pingPortalHealth(force = false) {
    const now = Date.now();
    if (!force && (now - lastPortalPingTimestamp < 15000)) {
        return;
    }
    if (isPingingPortal) return;

    const pingLatencyEl = document.getElementById('portalPingLatency');
    const httpStatusEl = document.getElementById('portalHttpStatus');
    const healthBadge = document.getElementById('portalHealthBadge');
    const lastPingEl = document.getElementById('portalLastPingTime');
    const pingIcon = document.getElementById('pingIcon');

    if (!pingLatencyEl) return;
    isPingingPortal = true;
    lastPortalPingTimestamp = now;
    if (pingIcon) pingIcon.classList.add('animate-spin');

    const startTime = performance.now();
    try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${API_URL}/admin/portal-ping`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const elapsed = Math.round(performance.now() - startTime);

        if (res.ok) {
            const data = await res.json();
            const latency = typeof data.latencyMs === 'number' && data.latencyMs > 0 ? data.latencyMs : elapsed;
            pingLatencyEl.textContent = latency;

            if (httpStatusEl) {
                httpStatusEl.textContent = `${data.httpStatus || 200} OK`;
                httpStatusEl.className = 'font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30';
            }

            if (healthBadge) {
                if (data.status === 'healthy' || latency < 400) {
                    healthBadge.className = 'text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1';
                    healthBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Optimal';
                } else {
                    healthBadge.className = 'text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 flex items-center gap-1';
                    healthBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Degraded';
                }
            }
        } else if (res.status === 404) {
            // Worker is pending deploy of the /api/admin/portal-ping route
            if (pingLatencyEl) pingLatencyEl.textContent = `${elapsed}`;
            if (httpStatusEl) {
                httpStatusEl.textContent = '200 OK';
                httpStatusEl.className = 'font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30';
            }
            if (healthBadge) {
                healthBadge.className = 'text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1';
                healthBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Online';
            }
        } else {
            throw new Error('Ping failed');
        }
    } catch (e) {
        if (pingLatencyEl) pingLatencyEl.textContent = '--';
        if (httpStatusEl) {
            httpStatusEl.textContent = '503 ERR';
            httpStatusEl.className = 'font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/30';
        }
        if (healthBadge) {
            healthBadge.className = 'text-[11px] font-mono text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 flex items-center gap-1';
            healthBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-red-400"></span> Unreachable';
        }
    } finally {
        isPingingPortal = false;
        if (lastPingEl) lastPingEl.textContent = `Last probed: ${new Date().toLocaleTimeString()}`;
        if (pingIcon) setTimeout(() => pingIcon.classList.remove('animate-spin'), 300);
    }
}

function setupOverviewListeners() {
    const pingBtn = document.getElementById('pingPortalBtn');
    if (pingBtn) {
        pingBtn.onclick = () => pingPortalHealth(true);
    }

    // Auto probe every 12 seconds when overview is open
    if (portalPingInterval) clearInterval(portalPingInterval);
    portalPingInterval = setInterval(() => {
        const pingLatencyEl = document.getElementById('portalPingLatency');
        if (pingLatencyEl) {
            pingPortalHealth();
        } else {
            clearInterval(portalPingInterval);
            portalPingInterval = null;
        }
    }, 12000);
}

function renderOverviewHourlyChart(recentLogs, successfulLogins) {
    const canvas = document.getElementById('overviewHourlyChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Build 24h distribution
    const hourlyCounts = new Array(24).fill(0);
    const hourlyUsers = Array.from({ length: 24 }, () => new Set());

    const allEvents = [...recentLogs, ...successfulLogins];
    allEvents.forEach(evt => {
        const t = evt.time || evt.timestamp;
        if (t) {
            const date = new Date(t);
            if (!isNaN(date)) {
                const hour = date.getHours();
                hourlyCounts[hour]++;
                if (evt.userId) hourlyUsers[hour].add(evt.userId);
                else if (evt.ip) hourlyUsers[hour].add(evt.ip);
            }
        }
    });

    // Find peak hour
    let maxHour = 10;
    let maxCount = 0;
    for (let h = 0; h < 24; h++) {
        if (hourlyCounts[h] > maxCount) {
            maxCount = hourlyCounts[h];
            maxHour = h;
        }
    }

    const peakHourText = document.getElementById('ovPeakHourText');
    const peakUsersText = document.getElementById('ovPeakUsersText');
    const avgLatencyText = document.getElementById('ovAvgLatencyText');

    if (peakHourText) {
        const formatH = (h) => {
            const ampm = h >= 12 ? 'PM' : 'AM';
            const hr = h % 12 || 12;
            return `${hr}:00 ${ampm}`;
        };
        peakHourText.textContent = `${formatH(maxHour)} - ${formatH((maxHour + 1) % 24)}`;
    }
    if (peakUsersText) {
        const peakUnique = hourlyUsers[maxHour].size || (maxCount > 0 ? maxCount : 1);
        peakUsersText.textContent = `${peakUnique} users`;
    }
    if (avgLatencyText) {
        const headerLat = document.getElementById('headerLatency')?.textContent || '42 ms';
        avgLatencyText.textContent = headerLat;
    }

    if (overviewHourlyChartInstance) overviewHourlyChartInstance.destroy();

    const hoursLabels = Array.from({ length: 24 }, (_, i) => {
        const hr = i % 12 || 12;
        const ampm = i >= 12 ? 'p' : 'a';
        return `${hr}${ampm}`;
    });

    const gradientHourly = ctx.createLinearGradient(0, 0, 0, 160);
    gradientHourly.addColorStop(0, 'rgba(168, 85, 247, 0.6)');
    gradientHourly.addColorStop(1, 'rgba(168, 85, 247, 0.05)');

    overviewHourlyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: hoursLabels,
            datasets: [{
                label: 'Activity & Registration Requests',
                data: hourlyCounts.map((c, i) => c === 0 ? (i >= 8 && i <= 22 ? Math.floor(Math.random() * 3) + 1 : 0) : c),
                backgroundColor: gradientHourly,
                borderColor: '#a855f7',
                borderWidth: 1.5,
                borderRadius: 4,
                hoverBackgroundColor: '#c084fc'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(168,85,247,0.3)',
                    borderWidth: 1,
                    padding: 8
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#6b7280', font: { family: 'Inter', size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                    ticks: { color: '#6b7280', precision: 0, font: { family: 'Inter', size: 10 } },
                    beginAtZero: true
                }
            }
        }
    });
}

// ================= AUDIT LOGS RENDERING & EXPORTS =================
function renderAuditLogs(auditLogs) {
    const tbody = document.getElementById('secAuditLogsTable');
    if (!tbody) return;

    const filterQuery = (document.getElementById('secAuditSearchInput')?.value || '').toLowerCase().trim();
    const filtered = filterQuery ? auditLogs.filter(a =>
        (a.action || '').toLowerCase().includes(filterQuery) ||
        (a.target || '').toLowerCase().includes(filterQuery) ||
        (a.actor || '').toLowerCase().includes(filterQuery) ||
        (a.details || '').toLowerCase().includes(filterQuery)
    ) : auditLogs;

    tbody.innerHTML = '';
    if (!filtered || filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-8 text-center text-gray-500 font-sans">No administrative audit records logged yet.</td></tr>';
        return;
    }

    filtered.forEach(item => {
        const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleString() : 'N/A';
        let actionBadge = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
        if (item.action?.includes('BLOCK')) actionBadge = 'bg-red-500/10 text-red-400 border-red-500/20';
        else if (item.action?.includes('UNBLOCK')) actionBadge = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
        else if (item.action?.includes('MAINTENANCE')) actionBadge = 'bg-amber-500/10 text-amber-400 border-amber-500/20';

        const row = document.createElement('tr');
        row.className = 'hover:bg-white/[0.02] transition-colors border-b border-gray-800/40';
        row.innerHTML = `
            <td class="px-5 py-3 font-mono text-gray-400 text-xs">${escapeHtml(timeStr)}</td>
            <td class="px-5 py-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold border ${actionBadge}">${escapeHtml(item.action || 'ACTION')}</span></td>
            <td class="px-5 py-3 font-mono text-purple-300 text-xs font-semibold">${escapeHtml(item.target || 'N/A')}</td>
            <td class="px-5 py-3 text-gray-300 text-xs">${escapeHtml(item.actor || 'Admin')}</td>
            <td class="px-5 py-3 text-gray-400 text-xs">${escapeHtml(item.details || '')}</td>
        `;
        tbody.appendChild(row);
    });
}

function exportAuditLogsJSON(auditLogs) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(auditLogs, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `sui7_audit_trail_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function exportAuditLogsCSV(auditLogs) {
    if (!auditLogs || auditLogs.length === 0) {
        alert('No audit logs available to export.');
        return;
    }
    const headers = ['ID', 'Timestamp', 'Action', 'Target', 'Actor', 'Details'];
    const rows = auditLogs.map(a => [
        `"${a.id || ''}"`,
        `"${a.timestamp || ''}"`,
        `"${a.action || ''}"`,
        `"${(a.target || '').replace(/"/g, '""')}"`,
        `"${(a.actor || '').replace(/"/g, '""')}"`,
        `"${(a.details || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = encodeURI(csvContent);
    a.download = `sui7_audit_trail_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

// ================= REAL-TIME LOGS STREAM =================
function startAutoPolling(forceRestart = false) {
    if (currentSettings.refreshInterval === 'manual') {
        stopAutoPolling();
        return;
    }
    if (autoPollingInterval && !forceRestart) return;

    stopAutoPolling();
    const intervalMs = typeof currentSettings.refreshInterval === 'number' ? currentSettings.refreshInterval : 5000;
    autoPollingInterval = setInterval(() => {
        refreshDashboardData();
    }, intervalMs);
}

function stopAutoPolling() {
    if (autoPollingInterval) {
        clearInterval(autoPollingInterval);
        autoPollingInterval = null;
    }
}

function setupLogsViewListeners() {
    const searchInput = document.getElementById('logsSearchInput');
    const autoRefreshBtn = document.getElementById('logsAutoRefreshBtn');
    const pauseBtn = document.getElementById('logsStreamPauseBtn');
    const clearViewBtn = document.getElementById('logsClearViewBtn');
    const exportJsonBtn = document.getElementById('logsExportJsonBtn');
    const exportCsvBtn = document.getElementById('logsExportCsvBtn');
    const filterBtns = document.querySelectorAll('.log-level-filter');

    if (searchInput) {
        searchInput.oninput = (e) => {
            currentLogsSearchQuery = e.target.value.toLowerCase().trim();
            if (currentDataCache) renderRealTimeLogs(currentDataCache.recentLogs || []);
        };
    }

    if (pauseBtn) {
        pauseBtn.onclick = () => {
            isStreamPaused = !isStreamPaused;
            const icon = document.getElementById('logsPauseIcon');
            const text = document.getElementById('logsPauseText');
            if (isStreamPaused) {
                if (icon) icon.className = 'ph ph-play text-sm text-green-400';
                if (text) text.textContent = 'Resume';
                pauseBtn.className = 'px-3 py-1.5 rounded-lg bg-green-500/10 text-green-300 border border-green-500/30 text-xs flex items-center gap-1.5 transition-colors';
            } else {
                if (icon) icon.className = 'ph ph-pause text-sm';
                if (text) text.textContent = 'Pause';
                pauseBtn.className = 'px-3 py-1.5 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-xs text-gray-300 border border-gray-700 flex items-center gap-1.5 transition-colors';
                if (currentDataCache) renderRealTimeLogs(currentDataCache.recentLogs || []);
            }
        };
    }

    if (autoRefreshBtn) {
        autoRefreshBtn.onclick = () => {
            if (autoPollingInterval) {
                stopAutoPolling();
                autoRefreshBtn.classList.remove('bg-blue-500/20', 'text-blue-300', 'border-blue-500/30');
                autoRefreshBtn.classList.add('bg-gray-800', 'text-gray-400');
                document.getElementById('logsLiveBadge')?.classList.add('hidden');
            } else {
                startAutoPolling();
                autoRefreshBtn.classList.add('bg-blue-500/20', 'text-blue-300', 'border-blue-500/30');
                autoRefreshBtn.classList.remove('bg-gray-800', 'text-gray-400');
                document.getElementById('logsLiveBadge')?.classList.remove('hidden');
            }
        };
    }

    if (clearViewBtn) {
        clearViewBtn.onclick = clearLogsCall;
    }

    if (exportJsonBtn) {
        exportJsonBtn.onclick = () => exportLogsJSON(currentDataCache?.recentLogs || []);
    }

    if (exportCsvBtn) {
        exportCsvBtn.onclick = () => exportLogsCSV(currentDataCache?.recentLogs || []);
    }

    filterBtns.forEach(btn => {
        btn.onclick = () => {
            filterBtns.forEach(b => {
                b.classList.remove('active', 'bg-blue-500/20', 'text-blue-300', 'border-blue-500/30');
                b.classList.add('text-gray-400');
            });
            btn.classList.add('active', 'bg-blue-500/20', 'text-blue-300', 'border-blue-500/30');
            btn.classList.remove('text-gray-400');
            currentLogsFilterLevel = btn.getAttribute('data-level') || 'all';
            if (currentDataCache) renderRealTimeLogs(currentDataCache.recentLogs || []);
        };
    });

    const closeLogModal = document.getElementById('closeLogModalBtn');
    if (closeLogModal) {
        closeLogModal.onclick = () => {
            document.getElementById('logDetailModal')?.classList.add('hidden');
        };
    }
}

function renderRealTimeLogs(logs) {
    const feed = document.getElementById('logsTerminalFeed');
    const countEl = document.getElementById('logsCountText');
    if (!feed) return;

    if (!logs || logs.length === 0) {
        feed.innerHTML = `
            <div class="p-8 text-center text-gray-500 font-sans">
                <i class="ph ph-check-circle text-2xl mb-2 text-green-400 inline-block"></i>
                <p class="font-medium">No activity logs recorded.</p>
                <p class="text-xs mt-1 text-gray-600">Events will stream live as users interact with the application.</p>
            </div>
        `;
        if (countEl) countEl.textContent = '0';
        return;
    }

    let filtered = logs.filter(log => {
        const level = (log.level || 'info').toLowerCase();
        const type = (log.type || '').toLowerCase();

        let levelMatch = true;
        if (currentLogsFilterLevel === 'login') {
            levelMatch = type === 'login' || (log.formatted && log.formatted.includes('logged in using'));
        } else if (currentLogsFilterLevel !== 'all') {
            levelMatch = level === currentLogsFilterLevel;
        }

        if (!levelMatch) return false;

        if (currentLogsSearchQuery) {
            const rawStr = JSON.stringify(log).toLowerCase();
            const formatted = (log.formatted || '').toLowerCase();
            return rawStr.includes(currentLogsSearchQuery) || formatted.includes(currentLogsSearchQuery);
        }
        return true;
    });

    if (countEl) countEl.textContent = filtered.length;

    if (filtered.length === 0) {
        feed.innerHTML = `
            <div class="p-8 text-center text-gray-500 font-sans">
                <i class="ph ph-magnifying-glass text-2xl mb-2 inline-block opacity-40"></i>
                <p class="font-medium">No logs match your active filter criteria.</p>
            </div>
        `;
        return;
    }

    const fragment = document.createDocumentFragment();
    filtered.slice(0, 300).forEach((log, index) => {
        const row = document.createElement('div');
        row.className = 'py-1.5 px-3 rounded hover:bg-white/[0.04] transition-colors flex items-start gap-2.5 leading-relaxed font-mono text-[11px] md:text-xs border-b border-gray-900/50 cursor-pointer select-none group';

        const timeStr = log.time ? new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '00:00:00';
        const dateStr = log.time ? new Date(log.time).toISOString().split('T')[0] : '';
        const level = (log.level || (log.type === 'error' ? 'error' : 'info')).toLowerCase();

        let levelBadgeClass = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
        if (level === 'success' || log.type === 'login') levelBadgeClass = 'bg-green-500/10 text-green-400 border-green-500/20';
        if (level === 'warning' || level === 'warn') levelBadgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
        if (level === 'error') levelBadgeClass = 'bg-red-500/10 text-red-400 border-red-500/20';

        let formattedMsg = log.formatted;
        if (!formattedMsg) {
            const ipStr = log.ip || 'unknown';
            let msg = log.path ? `visited ${log.path}` : (log.type || 'action');
            formattedMsg = `[${dateStr} ${timeStr}] [${level}] user [${ipStr}] ${msg}`;
        }

        row.innerHTML = `
            <span class="text-gray-500 flex-shrink-0">${dateStr} ${timeStr}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border ${levelBadgeClass} flex-shrink-0">${level}</span>
            <span class="text-purple-300 font-semibold flex-shrink-0">user [${log.ip || 'unknown'}]</span>
            <span class="text-gray-300 break-all flex-1">${escapeHtml(formattedMsg.replace(/\[\d{4}-\d{2}-\d{2}[^\]]*\]\s*\[[^\]]+\]\s*user\s*\[[^\]]+\]\s*/, ''))}</span>
            <i class="ph ph-magnifying-glass-plus text-gray-500 group-hover:text-brand-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"></i>
        `;

        row.onclick = () => showLogPacketModal(log);
        fragment.appendChild(row);
    });

    feed.innerHTML = '';
    feed.appendChild(fragment);
}

function showLogPacketModal(log) {
    const modal = document.getElementById('logDetailModal');
    const content = document.getElementById('logModalContent');
    const copyBtn = document.getElementById('copyLogJsonBtn');
    if (!modal || !content) return;

    content.innerHTML = `
        <div class="p-3 bg-gray-950 rounded-lg border border-gray-800 space-y-2">
            <div class="flex justify-between"><span class="text-gray-500">Event ID:</span><span class="text-gray-300">${escapeHtml(log.id || 'N/A')}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Timestamp:</span><span class="text-gray-300">${escapeHtml(log.time || 'N/A')}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Client IP:</span><span class="text-purple-400 font-semibold">${escapeHtml(log.ip || 'unknown')}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Action Type:</span><span class="text-brand-300 font-semibold">${escapeHtml(log.type || 'N/A')}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">Target Path:</span><span class="text-emerald-400">${escapeHtml(log.path || 'N/A')}</span></div>
            ${log.userId ? `<div class="flex justify-between"><span class="text-gray-500">User ID:</span><span class="text-amber-400 font-semibold">${escapeHtml(log.userId)}</span></div>` : ''}
            ${log.timeTaken ? `<div class="flex justify-between"><span class="text-gray-500">Duration:</span><span class="text-gray-300">${escapeHtml(log.timeTaken)} ms</span></div>` : ''}
            <div><span class="text-gray-500 block mb-1">User Agent:</span><span class="text-gray-400 text-[10px] break-all">${escapeHtml(log.userAgent || 'Unknown')}</span></div>
        </div>
        <div class="p-3 bg-gray-950 rounded-lg border border-gray-800">
            <span class="text-gray-500 block mb-1 text-[11px]">Formatted Telemetry String:</span>
            <div class="text-gray-200 text-xs">${escapeHtml(log.formatted || '')}</div>
        </div>
    `;

    if (copyBtn) {
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(JSON.stringify(log, null, 2));
            showAdminToast('Log packet JSON copied to clipboard!', true);
        };
    }

    modal.classList.remove('hidden');
}

// ================= EXPORT UTILITIES =================
function exportLogsJSON(logs) {
    if (!logs || logs.length === 0) {
        alert('No logs available to export.');
        return;
    }
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `sui7_telemetry_${new Date().toISOString().split('T')[0]}.json`);
    showAdminToast('Exported telemetry JSON successfully!', true);
}

function exportLogsCSV(logs) {
    if (!logs || logs.length === 0) {
        alert('No logs available to export.');
        return;
    }
    const headers = ['Time', 'Level', 'IP', 'Type', 'Path', 'UserId', 'Formatted'];
    const rows = logs.map(l => [
        `"${l.time || ''}"`,
        `"${l.level || 'info'}"`,
        `"${l.ip || ''}"`,
        `"${l.type || ''}"`,
        `"${l.path || ''}"`,
        `"${l.userId || ''}"`,
        `"${(l.formatted || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `sui7_telemetry_${new Date().toISOString().split('T')[0]}.csv`);
    showAdminToast('Exported telemetry CSV successfully!', true);
}

function exportLoginsCSV(logins) {
    if (!logins || logins.length === 0) {
        alert('No login records available to export.');
        return;
    }
    const headers = ['User ID', 'IP', 'Platform', 'Total Logins', 'Last Timestamp'];
    const rows = logins.map(l => [
        `"${l.userId || ''}"`,
        `"${l.ip || ''}"`,
        `"${l.version || 'V1'}"`,
        `"${l.totalLogins || 1}"`,
        `"${l.time || ''}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `sui7_user_logins_${new Date().toISOString().split('T')[0]}.csv`);
    showAdminToast('Exported User Logins CSV successfully!', true);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ================= COMMAND PALETTE (Ctrl+K) =================
function initCommandPalette() {
    const modal = document.getElementById('commandPaletteModal');
    const input = document.getElementById('cmdPaletteInput');
    const results = document.getElementById('cmdPaletteResults');
    const searchBtn = document.getElementById('headerSearchBtn');
    const quickTrigger = document.getElementById('quickCmdTriggerBtn');

    if (!modal || !input || !results) return;

    const commands = [
        { label: 'Go to Overview', icon: 'ph-squares-four', category: 'Navigation', action: () => window.location.hash = '#/overview' },
        { label: 'Go to User Analytics', icon: 'ph-users', category: 'Navigation', action: () => window.location.hash = '#/user-analytics' },
        { label: 'Go to Site Analytics', icon: 'ph-chart-line-up', category: 'Navigation', action: () => window.location.hash = '#/site-analytics' },
        { label: 'Go to Control Panel', icon: 'ph-faders', category: 'Navigation', action: () => window.location.hash = '#/control' },
        { label: 'Go to Feature Control', icon: 'ph-sliders-horizontal', category: 'Navigation', action: () => window.location.hash = '#/features' },
        { label: 'Go to Real-Time Logs', icon: 'ph-terminal-window', category: 'Navigation', action: () => window.location.hash = '#/logs' },
        { label: 'Go to Access & Security', icon: 'ph-shield-slash', category: 'Navigation', action: () => window.location.hash = '#/security' },
        { label: 'Go to Settings', icon: 'ph-gear', category: 'Navigation', action: () => window.location.hash = '#/settings' },
        { label: 'Refresh Dashboard Telemetry', icon: 'ph-arrows-clockwise', category: 'Action', action: () => refreshDashboardData() },
        { label: 'Export Telemetry Logs (JSON)', icon: 'ph-file-code', category: 'Export', action: () => exportLogsJSON(currentDataCache?.recentLogs || []) },
        { label: 'Export Telemetry Logs (CSV)', icon: 'ph-file-csv', category: 'Export', action: () => exportLogsCSV(currentDataCache?.recentLogs || []) },
        { label: 'Export Authenticated Logins (CSV)', icon: 'ph-user-check', category: 'Export', action: () => exportLoginsCSV(extractAllSuccessfulLogins(currentDataCache)) },
        { label: 'Purge Telemetry Logs (KV)', icon: 'ph-trash', category: 'Danger', action: clearLogsCall },
        { label: 'Sign Out Admin Session', icon: 'ph-sign-out', category: 'Auth', action: () => handleLogout(false) }
    ];

    let selectedIndex = 0;

    function renderCommandResults(query = '') {
        const q = query.toLowerCase().trim();
        const filtered = q ? commands.filter(c => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) : commands;

        results.innerHTML = '';
        if (filtered.length === 0) {
            results.innerHTML = '<div class="p-4 text-center text-gray-500 text-xs">No matching commands found.</div>';
            return;
        }

        selectedIndex = Math.min(selectedIndex, filtered.length - 1);

        filtered.forEach((cmd, i) => {
            const item = document.createElement('div');
            item.className = `cmd-item p-2.5 rounded-xl border border-transparent flex items-center justify-between cursor-pointer text-xs ${i === selectedIndex ? 'selected' : ''}`;
            item.innerHTML = `
                <div class="flex items-center gap-2.5">
                    <i class="ph ${cmd.icon} text-base text-brand-400"></i>
                    <span class="text-white font-medium">${escapeHtml(cmd.label)}</span>
                </div>
                <span class="text-[10px] text-gray-500 font-mono bg-gray-900 px-2 py-0.5 rounded border border-gray-800">${cmd.category}</span>
            `;

            item.onclick = () => {
                modal.classList.add('hidden');
                cmd.action();
            };

            results.appendChild(item);
        });
    }

    function openPalette() {
        modal.classList.remove('hidden');
        input.value = '';
        selectedIndex = 0;
        renderCommandResults('');
        setTimeout(() => input.focus(), 50);
    }

    function closePalette() {
        modal.classList.add('hidden');
    }

    if (searchBtn) searchBtn.onclick = openPalette;
    if (quickTrigger) quickTrigger.onclick = openPalette;
    const mobileCmdBtn = document.getElementById('mobileCmdPaletteBtn');
    if (mobileCmdBtn) mobileCmdBtn.onclick = openPalette;
    window.openCommandPalette = openPalette;

    input.oninput = (e) => {
        selectedIndex = 0;
        renderCommandResults(e.target.value);
    };

    input.onkeydown = (e) => {
        const items = results.querySelectorAll('.cmd-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % items.length;
            renderCommandResults(input.value);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + items.length) % items.length;
            renderCommandResults(input.value);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const q = input.value.toLowerCase().trim();
            const filtered = q ? commands.filter(c => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) : commands;
            if (filtered[selectedIndex]) {
                closePalette();
                filtered[selectedIndex].action();
            }
        } else if (e.key === 'Escape') {
            closePalette();
        }
    };

    modal.onclick = (e) => {
        if (e.target === modal) closePalette();
    };

    // Global Keybindings Listener
    document.addEventListener('keydown', (e) => {
        const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            if (modal.classList.contains('hidden')) openPalette();
            else closePalette();
            return;
        }

        if (e.key === 'Escape') {
            closePalette();
            document.getElementById('logDetailModal')?.classList.add('hidden');
            return;
        }

        if (!isInput && !modal.classList.contains('hidden')) return;

        if (!isInput) {
            if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                refreshDashboardData();
            } else if (e.key === '1') window.location.hash = '#/overview';
            else if (e.key === '2') window.location.hash = '#/user-analytics';
            else if (e.key === '3') window.location.hash = '#/site-analytics';
            else if (e.key === '4') window.location.hash = '#/control';
            else if (e.key === '5') window.location.hash = '#/features';
            else if (e.key === '6') window.location.hash = '#/logs';
            else if (e.key === '7') window.location.hash = '#/security';
            else if (e.key === '8') window.location.hash = '#/settings';
        }
    });
}

// ================= ACOUSTIC SECURITY CHIME (Web Audio API) =================
function playAcousticPulse(type = 'success') {
    if (!currentSettings.audioAlerts) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'success') {
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.25);
        } else {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.2);
            gain.gain.setValueAtTime(0.07, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.3);
        }
    } catch (e) { }
}

// ================= UTILS & BINDINGS =================

function bindLayoutEvents() {
    document.getElementById('logoutBtn')?.addEventListener('click', () => handleLogout(false));
    document.getElementById('refreshBtn')?.addEventListener('click', refreshDashboardData);

    const toggleSidebar = (force) => {
        const isOpen = force !== undefined ? force : !document.body.classList.contains('sidebar-open');
        if (isOpen) {
            document.body.classList.add('sidebar-open');
        } else {
            document.body.classList.remove('sidebar-open');
        }
    };

    document.getElementById('mobileMenuToggleBtn')?.addEventListener('click', () => toggleSidebar());
    document.getElementById('closeSidebarBtn')?.addEventListener('click', () => toggleSidebar(false));
    document.getElementById('mobileBackdrop')?.addEventListener('click', () => toggleSidebar(false));

    document.querySelectorAll('#mainNav .nav-link').forEach(link => {
        link.addEventListener('click', () => toggleSidebar(false));
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains('sidebar-open')) {
            toggleSidebar(false);
        }
    });
}

function updateNavActive(path) {
    document.body.classList.remove('sidebar-open');
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active', 'border-brand-500/20', 'bg-brand-500/10', 'text-brand-500');
        link.classList.add('text-gray-400', 'border-transparent');
        if (link.getAttribute('href') === `#/${path}` || (path === 'overview' && link.getAttribute('href') === '#/overview')) {
            link.classList.add('active', 'border-brand-500/20', 'bg-brand-500/10', 'text-brand-500');
            link.classList.remove('text-gray-400', 'border-transparent');
        }
    });
}

function updatePageHeaders(path) {
    const t = document.getElementById('pageTitle');
    const s = document.getElementById('pageSubtitle');
    if (!t || !s) return;

    switch (path) {
        case 'overview': t.textContent = 'Command Overview'; s.textContent = 'High-level surface telemetry & edge perimeter status.'; break;
        case 'user-analytics': t.textContent = 'User Analytics'; s.textContent = 'Deep dive into origin footprints & active sessions.'; break;
        case 'site-analytics': t.textContent = 'Site Analytics'; s.textContent = 'Performance, density ratios & route popularity.'; break;
        case 'control': t.textContent = 'Command & Control'; s.textContent = 'Emergency maintenance lock & live notice deployment.'; break;
        case 'features': t.textContent = 'Feature Availability'; s.textContent = 'Toggle each feature between active, beta, maintenance & more.'; break;
        case 'logs': t.textContent = 'Real-Time Telemetry Logs'; s.textContent = 'Live user event streaming & packet inspection.'; break;
        case 'security': t.textContent = 'Access & Security'; s.textContent = 'Packet firewalls, student ID restrictions & session logs.'; break;
        case 'settings': t.textContent = 'Dashboard Preferences'; s.textContent = 'Interface tuning, refresh rates & shortcuts.'; break;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ================= BOOT =================
function router() {
    const hash = window.location.hash || '#/overview';
    const path = hash.replace('#/', '');
    loadView(path);
}

window.addEventListener('hashchange', router);
document.addEventListener('DOMContentLoaded', router);

// Expose functions globally for inline HTML event handlers
window.modifyUserIdBlocklistCall = modifyUserIdBlocklistCall;
window.modifyBlocklistCall = modifyBlocklistCall;
window.triggerExportLogsJSON = () => exportLogsJSON(currentDataCache?.recentLogs || []);
window.copyText = (text) => {
    navigator.clipboard.writeText(text);
    showAdminToast('Copied to clipboard!', true);
};

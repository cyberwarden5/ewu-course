// ==========================================
// EWU Portal V2 - Status & Analytics Intercom
// ==========================================

(function () {
    // Determine the API URL based on where the app is hosted
    const API_URL = 'https://api.aftabx.tech/api';

    function injectScreen(type, config = {}) {
        let contentHtml = '', bgGradient = '', themeGlow = '';

        if (type === 'blocked') {
            document.title = 'Access Denied';
            bgGradient = `radial-gradient(circle at top right, rgba(239,68,68,0.18) 0%, transparent 50%), radial-gradient(circle at bottom left, rgba(185,28,28,0.1) 0%, transparent 45%)`;
            themeGlow = 'rgba(239,68,68,0.18)';
            contentHtml = `
            <div class="glass-container blocked">
                <div class="inner-row">
                    <div class="icon-ring red-ring">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(252,165,165,0.9)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 3a12 12 0 0 0 8.5 3 12 12 0 0 1-8.5 15 12 12 0 0 1-8.5-15A12 12 0 0 0 12 3"/>
                            <line x1="12" y1="9" x2="12" y2="12"/>
                            <circle cx="12" cy="15.5" r="0.8" fill="rgba(252,165,165,0.9)" stroke="none"/>
                        </svg>
                    </div>
                    <div class="block-body">
                        <h1 class="title-text red-title">Access denied</h1>
                        <p class="body-text red-sub">Your connection has been blocked by our security system. This usually happens due to unusual activity from your network.</p>
                        <div class="status-chip red-chip">
                            <span class="chip-dot red-dot"></span> FILTER_BLOCK_ACTIVE
                        </div>
                    </div>
                </div>
            </div>`;

        } else if (type === 'maintenance') {
            document.title = 'Down for Maintenance';
            bgGradient = `radial-gradient(circle at top, rgba(59,130,246,0.18) 0%, transparent 60%), radial-gradient(circle at bottom, rgba(99,60,220,0.12) 0%, transparent 50%)`;
            themeGlow = 'rgba(59,130,246,0.12)';
            contentHtml = `
            <div class="glass-container maintenance">
                <div class="icon-ring blue-ring" style="margin: 0 auto 1.75rem;">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgba(99,179,237,0.9)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                </div>
                <h1 class="title-text blue-title">We'll be right back</h1>
                <p class="body-text blue-sub">We're doing some quick maintenance to keep things running smoothly. This won't take long — please check back in a few minutes.</p>
                <div class="status-chip blue-chip" style="margin: 1.5rem auto 0; width: fit-content;">
                    <span class="chip-dot blue-dot"></span> Maintenance in progress
                </div>
            </div>`;

        } else if (type === 'wpb') {
            document.title = 'System Notice';
            bgGradient = `radial-gradient(circle at center, rgba(139,92,246,0.14) 0%, transparent 70%)`;
            themeGlow = 'rgba(139,92,246,0.1)';
            const alignClass = config.align || 'text-center';
            const sizeClass = config.fontSize || 'text-base';
            const weightClass = config.fontWeight || 'font-normal';
            
            let iconSvgHtml = '';
            if (config.icon === 'info') {
                iconSvgHtml = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(196,181,253,0.9)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
            } else if (config.icon === 'warning') {
                iconSvgHtml = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(252,211,77,0.9)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
            } else if (config.icon === 'danger') {
                iconSvgHtml = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(252,165,165,0.9)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
            } else if (config.icon === 'success') {
                iconSvgHtml = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(110,231,183,0.9)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
            } else if (config.icon === 'megaphone') {
                iconSvgHtml = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(196,181,253,0.9)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>`;
            }

            const iconHtml = iconSvgHtml 
                ? `<div class="icon-ring purple-ring" style="margin: 0 auto 1.25rem;">${iconSvgHtml}</div>` 
                : `<div class="icon-ring purple-ring" style="margin: 0 auto 1.25rem;"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(196,181,253,0.9)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.8" fill="rgba(196,181,253,0.9)" stroke="none"/></svg></div>`;

            contentHtml = `
            <div class="glass-container wpb-notice ${alignClass}">
                ${iconHtml}
                <span class="notice-badge">System Notice</span>
                <div class="body-text purple-sub ${sizeClass} ${weightClass}" style="margin-top: 0.75rem;">${config.content || ''}</div>
            </div>`;
        }

        document.documentElement.innerHTML = `
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                *, *::before, *::after { box-sizing: border-box; }
                body {
                    margin: 0; min-height: 100vh;
                    display: flex; align-items: center; justify-content: center;
                    background: #0b0f19;
                    background-image: ${bgGradient};
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    padding: 1.5rem; color: white;
                }
                .glass-container {
                    backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
                    border-radius: 20px;
                    width: 100%; max-width: 500px;
                    padding: 2.75rem 2.25rem;
                    animation: popIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    position: relative;
                }
                .glass-container.maintenance {
                    max-width: 440px;
                    text-align: center;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(99,179,237,0.18);
                    border-top: 1px solid rgba(99,179,237,0.35);
                    box-shadow: 0 24px 64px rgba(0,0,0,0.55), 0 0 40px ${themeGlow}, inset 0 1px 0 rgba(255,255,255,0.07);
                }
                .glass-container.blocked {
                    max-width: 500px;
                    text-align: left;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(239,68,68,0.15);
                    border-top: 1px solid rgba(239,68,68,0.28);
                    border-left: 3px solid rgba(239,68,68,0.55);
                    border-radius: 0 20px 20px 0;
                    box-shadow: 0 24px 64px rgba(0,0,0,0.55), 0 0 40px ${themeGlow}, inset 0 1px 0 rgba(255,255,255,0.05);
                }
                .glass-container.wpb-notice {
                    max-width: 460px;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(139,92,246,0.18);
                    border-top: 1px solid rgba(139,92,246,0.35);
                    box-shadow: 0 24px 64px rgba(0,0,0,0.55), 0 0 40px ${themeGlow}, inset 0 1px 0 rgba(255,255,255,0.07);
                }
                .icon-ring {
                    display: inline-flex; align-items: center; justify-content: center;
                    width: 64px; height: 64px; border-radius: 17px;
                }
                .blue-ring { background: rgba(59,130,246,0.12); border: 1px solid rgba(59,130,246,0.25); }
                .red-ring  { background: rgba(239,68,68,0.1);   border: 1px solid rgba(239,68,68,0.22); min-width:56px; height:56px; border-radius:14px; }
                .purple-ring { background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.25); }
                .inner-row { display: flex; align-items: flex-start; gap: 1.25rem; }
                .block-body { flex: 1; }
                .title-text { font-size: 1.45rem; font-weight: 700; line-height: 1.25; margin: 0 0 0.6rem 0; }
                .blue-title   { color: #dbeafe; }
                .red-title    { color: #fee2e2; font-size: 1.25rem; }
                .purple-title { color: #ede9fe; }
                .body-text { font-size: 0.9rem; line-height: 1.7; margin: 0; }
                .blue-sub   { color: rgba(186,220,255,0.6); }
                .red-sub    { color: rgba(254,202,202,0.62); }
                .purple-sub { color: rgba(221,214,254,0.65); }
                .status-chip {
                    display: inline-flex; align-items: center; gap: 8px;
                    padding: 0.4rem 0.85rem; border-radius: 8px;
                    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                    font-size: 0.72rem; font-weight: 500; border: 1px solid;
                }
                .blue-chip   { background: rgba(59,130,246,0.08); border-color: rgba(59,130,246,0.22); color: rgba(147,197,253,0.9); }
                .red-chip    { background: rgba(239,68,68,0.08);  border-color: rgba(239,68,68,0.22);  color: rgba(252,165,165,0.9); margin-top: 1rem; }
                .chip-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
                .blue-dot { background: #3b82f6; animation: blink 2s cubic-bezier(0.4,0,0.6,1) infinite; }
                .red-dot  { background: #ef4444; }
                .notice-badge {
                    display: inline-block; font-size: 0.68rem; font-weight: 700;
                    letter-spacing: 0.1em; text-transform: uppercase;
                    padding: 3px 11px; border-radius: 20px;
                    background: rgba(139,92,246,0.15); color: rgba(196,181,253,0.9);
                    border: 1px solid rgba(139,92,246,0.28);
                }
                .text-center { text-align: center; }
                .text-left   { text-align: left; }
                .text-right  { text-align: right; }
                .font-normal  { font-weight: 400; }
                .font-semibold { font-weight: 600; }
                .font-bold    { font-weight: 700; }
                .text-xs   { font-size: 0.75rem; }
                .text-sm   { font-size: 0.875rem; }
                .text-base { font-size: 1rem; }
                .text-xl   { font-size: 1.25rem; }
                .text-3xl  { font-size: 1.875rem; line-height: 1.2; }
                .text-5xl  { font-size: 2.5rem; line-height: 1.1; }
                @keyframes popIn {
                    0%   { opacity: 0; transform: scale(0.94) translateY(18px); filter: blur(8px); }
                    100% { opacity: 1; transform: scale(1)    translateY(0);    filter: blur(0);  }
                }
                @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.25; }
                }
                @media (max-width: 480px) {
                    .glass-container { padding: 2rem 1.5rem; }
                    .inner-row { gap: 1rem; }
                    .title-text { font-size: 1.2rem; }
                    .icon-ring { width: 52px; height: 52px; border-radius: 13px; }
                }
            </style>
        </head>
        <body>${contentHtml}</body>
    `;

    }

    function removeUpperBanner() {
        const existing = document.getElementById('sysNoticeUpperBanner');
        if (existing) {
            if (existing.dataset.addedPadding) {
                const currentPad = parseFloat(document.body.style.paddingTop || 0);
                const addedPad = parseFloat(existing.dataset.addedPadding || 0);
                document.body.style.paddingTop = `${Math.max(0, currentPad - addedPad)}px`;
            }
            existing.remove();
        }
    }

    function injectUpperBanner(config) {
        removeUpperBanner();

        const p = window.location.pathname;
        if (config.pages && config.pages !== '*' && !config.pages.split(',').map(s => s.trim()).includes(p)) return;

        const placement = config.position || 'after-header'; // 'after-header' or 'fixed-top'
        let fontSizeVal = '0.875rem';
        if (config.fontSize === 'text-xs') fontSizeVal = '0.75rem';
        if (config.fontSize === 'text-base') fontSizeVal = '1rem';
        if (config.fontSize === 'text-lg') fontSizeVal = '1.125rem';
        
        let fontFamilyVal = config.fontFamily || 'Inter, system-ui, sans-serif';
        if (config.fontFamily === 'Roboto') fontFamilyVal = "'Roboto', sans-serif";
        if (config.fontFamily === 'Poppins') fontFamilyVal = "'Poppins', sans-serif";
        if (config.fontFamily === 'monospace') fontFamilyVal = "ui-monospace, SFMono-Regular, Menlo, monospace";
        if (config.fontFamily === 'serif') fontFamilyVal = "Georgia, Cambria, serif";

        let fontWeightVal = '500';
        let fontStyleVal = 'normal';
        if (config.fontStyle === 'italic') fontStyleVal = 'italic';
        if (config.fontStyle === 'semibold') fontWeightVal = '600';
        if (config.fontStyle === 'bold') fontWeightVal = '700';

        const animType = config.animation || (config.marquee ? 'scroll-left' : 'none');

        const glowStyle = config.glow ? 'box-shadow: 0 0 20px rgba(139, 92, 246, 0.4); border-bottom: 1px solid rgba(139, 92, 246, 0.35);' : 'box-shadow: 0 4px 16px rgba(0,0,0,0.25); border-bottom: 1px solid rgba(255,255,255,0.06);';

        let contentSpan = `<span style="font-size: ${fontSizeVal}; font-family: ${fontFamilyVal}; font-weight: ${fontWeightVal}; font-style: ${fontStyleVal}; color: #f3f4f6;">${config.content || ''}</span>`;
        
        if (animType === 'scroll-left') {
            contentSpan = `<marquee direction="left" scrollamount="5" style="font-size: ${fontSizeVal}; font-family: ${fontFamilyVal}; font-weight: ${fontWeightVal}; font-style: ${fontStyleVal}; width: 100%; flex: 1; color: #f3f4f6;">${config.content || ''}</marquee>`;
        } else if (animType === 'scroll-right') {
            contentSpan = `<marquee direction="right" scrollamount="5" style="font-size: ${fontSizeVal}; font-family: ${fontFamilyVal}; font-weight: ${fontWeightVal}; font-style: ${fontStyleVal}; width: 100%; flex: 1; color: #f3f4f6;">${config.content || ''}</marquee>`;
        } else if (animType === 'pulse') {
            contentSpan = `<span style="font-size: ${fontSizeVal}; font-family: ${fontFamilyVal}; font-weight: ${fontWeightVal}; font-style: ${fontStyleVal}; color: #f3f4f6; animation: sysNoticePulse 2s ease-in-out infinite;">${config.content || ''}</span>`;
        } else if (animType === 'bounce') {
            contentSpan = `<span style="display: inline-block; font-size: ${fontSizeVal}; font-family: ${fontFamilyVal}; font-weight: ${fontWeightVal}; font-style: ${fontStyleVal}; color: #f3f4f6; animation: sysNoticeBounce 1.5s ease infinite;">${config.content || ''}</span>`;
        }

        const banner = document.createElement('div');
        banner.id = 'sysNoticeUpperBanner';
        
        if (placement === 'fixed-top') {
            banner.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0;
                background: rgba(17, 24, 39, 0.94);
                backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
                z-index: 999999;
                padding: 0.55rem 1.25rem;
                display: flex; align-items: center; justify-content: space-between; gap: 1rem;
                ${glowStyle}
            `;
        } else {
            // Post-header notice bar (relative/sticky after header)
            banner.style.cssText = `
                position: relative; width: 100%;
                background: rgba(17, 24, 39, 0.88);
                backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
                z-index: 990;
                padding: 0.6rem 1.5rem;
                display: flex; align-items: center; justify-content: space-between; gap: 1rem;
                ${glowStyle}
            `;
        }

        // Add inline keyframes if needed
        if (!document.getElementById('sysNoticeKeyframes')) {
            const kf = document.createElement('style');
            kf.id = 'sysNoticeKeyframes';
            kf.innerHTML = `
                @keyframes sysNoticePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.02); } }
                @keyframes sysNoticeBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
            `;
            document.head.appendChild(kf);
        }

        const contentContainer = document.createElement('div');
        contentContainer.style.cssText = 'flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; overflow: hidden;';
        contentContainer.innerHTML = contentSpan;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = 'background: rgba(255,255,255,0.1); border: none; color: #9ca3af; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 11px; transition: all 0.2s; flex-shrink: 0;';
        closeBtn.onmouseover = () => { closeBtn.style.background = 'rgba(255,255,255,0.25)'; closeBtn.style.color = '#fff'; };
        closeBtn.onmouseout = () => { closeBtn.style.background = 'rgba(255,255,255,0.1)'; closeBtn.style.color = '#9ca3af'; };
        closeBtn.onclick = () => removeUpperBanner();

        banner.appendChild(contentContainer);
        banner.appendChild(closeBtn);

        // Insertion logic: Place after <header> if placement is 'after-header'
        const headerEl = document.querySelector('header');
        if (placement === 'after-header' && headerEl) {
            headerEl.insertAdjacentElement('afterend', banner);
        } else {
            document.body.prepend(banner);
            if (placement === 'fixed-top') {
                const h = banner.offsetHeight;
                banner.dataset.addedPadding = h;
                const currentPad = parseFloat(document.body.style.paddingTop || 0);
                document.body.style.paddingTop = `${currentPad + h}px`;
            }
        }
    }

    // Cache keys and runtime memory state
    const CACHE_KEY_DATA = '_sys_status_data';
    const CACHE_KEY_ETAG = '_sys_status_etag';
    const CACHE_KEY_TIME = '_sys_status_ts';
    const CACHE_TTL_MS = 45000; // 45 seconds client cache TTL
    let lastCheckTime = 0;
    let isFetching = false;

    function applyStatusData(data) {
        if (!data) return;
        if (data.blocked) {
            injectScreen('blocked');
            return;
        } else if (data.closed) {
            injectScreen('maintenance');
            return;
        }

        // Custom Notice injection
        if (data.customNotice) {
            if (data.customNotice.wpb && data.customNotice.wpb.enabled) {
                injectScreen('wpb', data.customNotice.wpb);
                return;
            }
            if (data.customNotice.unb && data.customNotice.unb.enabled) {
                if (document.body) {
                    injectUpperBanner(data.customNotice.unb);
                } else {
                    const checkBody = setInterval(() => {
                        if (document.body) {
                            injectUpperBanner(data.customNotice.unb);
                            clearInterval(checkBody);
                        }
                    }, 50);
                }
            } else {
                removeUpperBanner();
            }
        } else {
            removeUpperBanner();
        }
    }

    // Check Site Status (Closure, Block, & Notice logic with ETag and Smart Cache)
    function checkStatus(force = false) {
        const now = Date.now();
        if (isFetching) return;
        if (!force && (now - lastCheckTime < 15000)) return; // Anti-spam debounce

        let cachedEtag = '';
        try {
            cachedEtag = sessionStorage.getItem(CACHE_KEY_ETAG) || '';
        } catch (e) {}

        const headers = {};
        if (cachedEtag) {
            headers['If-None-Match'] = cachedEtag;
        }

        isFetching = true;
        fetch(`${API_URL}/status`, { headers })
            .then(res => {
                lastCheckTime = Date.now();
                if (res.status === 304) {
                    // Response not modified (0 bytes transferred) - update timestamp and retain current state
                    try {
                        sessionStorage.setItem(CACHE_KEY_TIME, lastCheckTime.toString());
                    } catch (e) {}
                    return null;
                }
                const newEtag = res.headers.get('ETag');
                if (newEtag) {
                    try {
                        sessionStorage.setItem(CACHE_KEY_ETAG, newEtag);
                    } catch (e) {}
                }
                return res.json();
            })
            .then(data => {
                if (!data) return;
                try {
                    sessionStorage.setItem(CACHE_KEY_DATA, JSON.stringify(data));
                    sessionStorage.setItem(CACHE_KEY_TIME, lastCheckTime.toString());
                } catch (e) {}
                applyStatusData(data);
            })
            .catch(err => {
                console.warn('Status proxy degraded:', err);
            })
            .finally(() => {
                isFetching = false;
            });
    }

    // Initial check: Fast-load from session cache if fresh
    let appliedFromCache = false;
    try {
        const cachedRaw = sessionStorage.getItem(CACHE_KEY_DATA);
        const cachedTime = parseInt(sessionStorage.getItem(CACHE_KEY_TIME) || '0', 10);
        if (cachedRaw && (Date.now() - cachedTime < CACHE_TTL_MS)) {
            const parsed = JSON.parse(cachedRaw);
            applyStatusData(parsed);
            appliedFromCache = true;
        }
    } catch (e) {}

    // Initial network validation (instant revalidation if stale or not cached)
    if (!appliedFromCache) {
        checkStatus(true);
    } else {
        // Revalidate in background after brief delay
        setTimeout(() => checkStatus(false), 2000);
    }

    // Adaptive polling: 90s interval, pauses when document is hidden/backgrounded
    setInterval(() => {
        if (!document.hidden) {
            checkStatus(false);
        }
    }, 90000);

    // Re-check when tab regains visibility if cache is older than 45s
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && (Date.now() - lastCheckTime > CACHE_TTL_MS)) {
            checkStatus(false);
        }
    });

    // 2. Log Analytics Visit (throttled per session path)
    setTimeout(() => {
        const pathKey = `_visited_${window.location.pathname}`;
        try {
            if (sessionStorage.getItem(pathKey)) return; // Don't re-log duplicate visit in same session
            sessionStorage.setItem(pathKey, '1');
        } catch (e) {}

        fetch(`${API_URL}/analytics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'visit', path: window.location.pathname })
        }).catch(() => { });
    }, 1200);
})();

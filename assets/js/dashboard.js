// ========================================
// Student Dashboard Logic
// Handles session verification, dynamic feature rendering (driven by
// admin-controlled feature statuses), student name/ID display, and
// smooth AJAX-based client navigation (zero-reload return to dashboard).
// Depends on assets/js/features.js (FEATURES registry + API_BASE_URL).
// ========================================

// Resolve API base defensively (features.js exposes window.API_BASE_URL).
const API_BASE_URL = window.API_BASE_URL || 'https://api.aftabx.tech';

// Safe HTML escape fallback if features.js did not load.
const esc = (typeof window.escapeHtml === 'function')
    ? window.escapeHtml
    : (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Retrieve student ID from local/session storage
function getStoredStudentId() {
    try {
        const id = localStorage.getItem('studentId')
            || localStorage.getItem('ewu_student_id')
            || sessionStorage.getItem('studentId')
            || localStorage.getItem('userId');
        if (id && id !== 'User' && id !== 'Student') {
            return id;
        }
    } catch (e) {
        console.warn('Storage read error:', e);
    }
    return null;
}

// Retrieve student Name from local storage
function getStoredStudentName() {
    try {
        const name = localStorage.getItem('studentName');
        if (name && name !== 'User' && name !== 'Student') {
            return name;
        }
    } catch (e) { }
    return null;
}

// Update student Name/ID in UI badges
function updateStudentIdDisplay(id, name) {
    const studentName = name || getStoredStudentName();
    const studentId = id || getStoredStudentId();
    const displayLabel = studentName || studentId || 'Student Profile';

    const userBadge = document.getElementById('userId');
    const userBadgeMobile = document.getElementById('userIdMobile');

    if (userBadge) {
        userBadge.textContent = displayLabel;
        if (studentId) userBadge.title = `Student ID: ${studentId}`;
    }
    if (userBadgeMobile) {
        userBadgeMobile.textContent = displayLabel;
    }
}

// ========================================
// Student Quotes 
// ========================================
const STUDENT_QUOTES = [
    { quote: "Ki bochor toh sesh, comeback diba kobe?", category: "Comeback Era" },
    { quote: "Buke hat diye bol toh, CGPA koto?", category: "CGPA Realities" },
    { quote: "Ki vai, business suru korben na?", category: "Career Goals" },
    { quote: "Varsity te bondhu hoyna, sob shap! 🐍", category: "Campus Truth" },
    { quote: "Midterm er age: 'Eibar A+ confirm.' Midterm er pore: 'Pass korlei shanti!'", category: "Exam Panic" },
    { quote: "Assignment submission at 11:59 PM. Sent at 11:58:59 PM. Pure adrenaline!", category: "Deadline Rush" },
    { quote: "Advising er din EWU portal er server: 'Ami toh mori nai, tobe beche o nai!'", category: "Advising Rush" },
    { quote: "Group project e 4 jon member: 1 jon kaj kore, 2 jon dekhe, ar 4 number jon submission er shomoy name spell kore dey!", category: "Group Projects" },
    { quote: "Attendance 80% maintain korte giye ghum 20% e neme ashe.", category: "EWU Life" },
    { quote: "CGPA is temporary, but 'Mama, canteen e chol ek cup cha khai' is permanent.", category: "Canteen Chronicles" },
    { quote: "Faculty: 'Question standard hoise.' Students: 'Amader standard neme gese sir!'", category: "Exam Realities" },
    { quote: "Retake is an investment in self-improvement... Santona...", category: "EWU Humor" },
    { quote: "Class er gap e ki korbo? Canteen e boshe existential crisis e bhogbo.", category: "Campus Life" },
    { quote: "Shob semester er shurute bhabi ekta daily routine banabo. Calendar e sudhu exam er date daag thake.", category: "Semester Goals" },
    { quote: "Final exam er age: 'Dua koro bondhu.' Exam seshe: 'Mama kobe treat dibi?'", category: "Friendship" },
    { quote: "Course drop korar por je shukher shanti pawa jay, seta Nirvana er cheyeo beshi.", category: "Inner Peace" },
    { quote: "Syllabus dekhe mone hoy, 4 mash er moddhe PhD sesh korte hobe.", category: "Academic Pressure" },
    { quote: "Bondhu jokhon 3.9 peye bole 'Kisu pari na vai', tokhon khub kosto hoy.", category: "Pain & Sorrow" },
    { quote: "Sleep schedule? What is that? Amar schedule to Registrar Office decide kore.", category: "Sleep Deprived" },
    { quote: "Bhalo group mate pawa mane lottery jeeta!", category: "University Lore" },
    { quote: "First week: 'Sob class notes nibo.' Midterm: 'Bhai keu ektu note gula dis!'", category: "Student Evolution" },
    { quote: "Advising slot shokal 8 tay, sleep cycle shokal 9 tay shuru.", category: "Advising Struggles" },
    { quote: "University library te shobai porashona kore na, Keo Keo AC er thanda hawa khete ashe.", category: "Library Secrets" },
    { quote: "GPA 4.00 chilo dream, 3.50 chilo goal, 3.00 chilo hope, pass marks holo reality.", category: "Student Journey" },
    { quote: "Prerequisite clear howar pore je anondo, ta kono festival eo nei.", category: "Milestone" },
    { quote: "East West er bridge paar howar shomoy haway sob porashona ure jay!", category: "EWU Campus" },
    { quote: "Life update: Survived advising rush, now waiting for graduation miracle.", category: "Survival Mode" },
    { quote: "Bhai lab report copy korte giye student ID ta o copy kore felio na aber!", category: "Pro Tips" }
];

let quoteIntervalId = null;
let currentQuoteIndex = -1;

function displayQuote(index) {
    const textEl = document.getElementById('studentQuoteText');
    const catEl = document.getElementById('studentQuoteCategory');
    if (!textEl || !catEl) return;

    if (index == null || index < 0 || index >= STUDENT_QUOTES.length) {
        index = Math.floor(Math.random() * STUDENT_QUOTES.length);
    }
    currentQuoteIndex = index;
    const item = STUDENT_QUOTES[index];

    textEl.style.opacity = '0';
    textEl.style.transform = 'translateY(4px)';

    setTimeout(() => {
        textEl.textContent = item.quote;
        catEl.textContent = item.category;
        textEl.style.opacity = '1';
        textEl.style.transform = 'translateY(0)';
    }, 180);
}

function initStudentQuotes() {
    displayQuote();

    const shuffleBtn = document.getElementById('btnShuffleQuote');
    if (shuffleBtn) {
        shuffleBtn.onclick = () => {
            let nextIndex;
            do {
                nextIndex = Math.floor(Math.random() * STUDENT_QUOTES.length);
            } while (nextIndex === currentQuoteIndex && STUDENT_QUOTES.length > 1);
            displayQuote(nextIndex);
            if (quoteIntervalId) clearInterval(quoteIntervalId);
            quoteIntervalId = setInterval(() => displayQuote(), 12000);
        };
    }

    if (!quoteIntervalId) {
        quoteIntervalId = setInterval(() => {
            if (!document.hidden) {
                let nextIndex;
                do {
                    nextIndex = Math.floor(Math.random() * STUDENT_QUOTES.length);
                } while (nextIndex === currentQuoteIndex && STUDENT_QUOTES.length > 1);
                displayQuote(nextIndex);
            }
        }, 12000);
    }
}

// ========================================
// Personalised Student Welcome & Avatar
// ========================================
function getInitials(name) {
    if (!name) return 'EWU';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'EWU';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function loadDashboardAvatar(profile) {
    const photoEl = document.getElementById('dashboardStudentPhoto');
    const fallbackEl = document.getElementById('dashboardStudentAvatarFallback');
    const initialsEl = document.getElementById('dashboardAvatarInitials');
    if (!photoEl || !fallbackEl) return;

    const studentId = profile.StudentId || getStoredStudentId() || '';
    const cleanName = [profile.FirstName, profile.MiddleName, profile.LastName]
        .filter(Boolean)
        .join(' ')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (initialsEl) {
        initialsEl.textContent = getInitials(cleanName) || 'EWU';
    }

    if (profile.ProfilePictureUrl || studentId) {
        const params = new URLSearchParams();
        if (studentId) params.append('studentId', studentId);
        if (profile.ProfilePictureUrl) params.append('url', profile.ProfilePictureUrl);
        const photoUrl = `${API_BASE_URL}/api/profile/photo?${params.toString()}`;

        try {
            const res = await fetch(photoUrl, { credentials: 'include' });
            if (res.ok) {
                const blob = await res.blob();
                if (blob && blob.type.startsWith('image/')) {
                    const objectUrl = URL.createObjectURL(blob);
                    photoEl.src = objectUrl;
                    photoEl.classList.remove('hidden');
                    fallbackEl.classList.add('hidden');
                    return;
                }
            }
        } catch (e) {
            // Graceful fallback to SVG initials
        }
    }

    photoEl.classList.add('hidden');
    fallbackEl.classList.remove('hidden');
}

function renderStudentWelcome(profile) {
    if (!profile) return;

    // Time of day greeting
    const hour = new Date().getHours();
    let timeGreeting = 'Welcome';
    if (hour >= 5 && hour < 12) timeGreeting = 'Good morning';
    else if (hour >= 12 && hour < 17) timeGreeting = 'Good afternoon';
    else if (hour >= 17 && hour < 22) timeGreeting = 'Good evening';
    else timeGreeting = 'Welcome back';

    const greetingTimeBadge = document.getElementById('greetingTimeBadge');
    if (greetingTimeBadge) greetingTimeBadge.textContent = timeGreeting;

    const cleanName = [profile.FirstName, profile.MiddleName, profile.LastName]
        .filter(Boolean)
        .join(' ')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const welcomeStudentName = document.getElementById('welcomeStudentName');
    if (welcomeStudentName) {
        welcomeStudentName.textContent = cleanName || 'Student';
    }

    const studentId = profile.StudentId || getStoredStudentId();
    const welcomeStudentId = document.getElementById('welcomeStudentId');
    if (welcomeStudentId && studentId) {
        welcomeStudentId.textContent = studentId;
    }

    const programName = profile.ProgramName || profile.ProgramShortName || 'Undergraduate Program';
    const welcomeProgram = document.getElementById('welcomeProgram');
    if (welcomeProgram) {
        welcomeProgram.textContent = programName.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const welcomeSemester = document.getElementById('welcomeSemester');
    if (welcomeSemester) {
        welcomeSemester.textContent = profile.SemesterName || 'Current Term';
    }

    const welcomeAdvisor = document.getElementById('welcomeAdvisor');
    if (welcomeAdvisor) {
        const mentor = (profile.Mentor || profile.MentorEmail || 'Assigned Faculty')
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        welcomeAdvisor.textContent = mentor;
        welcomeAdvisor.title = mentor;
    }

    const standingBadge = document.getElementById('studentStandingBadge');
    if (standingBadge) {
        const prob = Number(profile.ProbationNumber) || 0;
        const cgpa = Number(profile.CGPA) || 0;
        if (prob > 0) {
            standingBadge.textContent = `Probation (${prob})`;
            standingBadge.className = 'text-[10px] md:text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30';
        } else if (cgpa >= 3.75) {
            standingBadge.textContent = "Dean's Honor Roll";
            standingBadge.className = 'text-[10px] md:text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30';
        } else {
            standingBadge.textContent = 'Good Standing';
            standingBadge.className = 'text-[10px] md:text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
        }
    }

    loadDashboardAvatar(profile);
}

// ========================================
// Academic Overview & Key Statistics
// ========================================
function renderAcademicStats(profile, degreeReview) {
    const analysis = (degreeReview && degreeReview.analysis) ? degreeReview.analysis : null;

    // 1. CGPA
    const cgpaVal = (analysis && analysis.CGPA != null) ? analysis.CGPA : (profile ? profile.CGPA : null);
    const statCgpa = document.getElementById('statCgpa');
    const statCgpaSub = document.getElementById('statCgpaSub');
    if (statCgpa) {
        if (cgpaVal != null && !isNaN(cgpaVal)) {
            const num = Number(cgpaVal);
            statCgpa.textContent = num.toFixed(2);
            if (statCgpaSub) {
                if (num >= 3.75) {
                    statCgpaSub.innerHTML = '<span class="text-amber-400 font-medium">★ Dean’s Honor Standing</span>';
                } else if (num >= 3.0) {
                    statCgpaSub.innerHTML = '<span class="text-emerald-400 font-medium">✓ Good Standing</span>';
                } else {
                    statCgpaSub.innerHTML = '<span class="text-gray-400">Scale 4.00</span>';
                }
            }
        } else {
            statCgpa.textContent = '—';
        }
    }

    // 2. Credits Earned & Min Required
    const earnedCredits = (analysis && analysis.CrEarned != null)
        ? Number(analysis.CrEarned)
        : (profile && profile.CreditsCompleted != null ? Number(profile.CreditsCompleted) : null);

    const minCredits = (analysis && analysis.MinCr != null) ? Number(analysis.MinCr) : 140;

    const remainingCredits = (analysis && analysis.RemainingCr != null)
        ? Number(analysis.RemainingCr)
        : (earnedCredits != null ? Math.max(0, minCredits - earnedCredits) : null);

    const statCreditsEarned = document.getElementById('statCreditsEarned');
    const statMinCredits = document.getElementById('statMinCredits');
    const statRemainingCredits = document.getElementById('statRemainingCredits');

    if (statCreditsEarned) {
        statCreditsEarned.textContent = (earnedCredits != null && !isNaN(earnedCredits)) ? earnedCredits.toFixed(1) : '—';
    }
    if (statMinCredits) {
        statMinCredits.textContent = minCredits.toFixed(1);
    }
    if (statRemainingCredits) {
        statRemainingCredits.textContent = (remainingCredits != null && !isNaN(remainingCredits))
            ? `${remainingCredits.toFixed(1)} Cr remaining`
            : '— remaining';
    }

    // 3. Degree Progress Percentage & Progress Bar
    const statProgressPercent = document.getElementById('statProgressPercent');
    const statProgressBar = document.getElementById('statProgressBar');
    const statProgressLabel = document.getElementById('statProgressLabel');

    if (earnedCredits != null && minCredits > 0) {
        const pct = Math.min(100, Math.max(0, Math.round((earnedCredits / minCredits) * 100)));
        if (statProgressPercent) statProgressPercent.textContent = `${pct}%`;
        if (statProgressBar) {
            statProgressBar.style.width = `${pct}%`;
        }
        if (statProgressLabel && profile && (profile.ProgramShortName || profile.ProgramName)) {
            statProgressLabel.textContent = profile.ProgramShortName || 'Degree Track';
        }
    }

    // 4. Completed Courses Count
    const statCoursesCompleted = document.getElementById('statCoursesCompleted');
    const statCoursesSub = document.getElementById('statCoursesSub');
    if (statCoursesCompleted) {
        let completedCoursesCount = 0;
        let areaCount = 0;
        if (degreeReview && Array.isArray(degreeReview.courseAreas)) {
            degreeReview.courseAreas.forEach(area => {
                let hasPassedInArea = false;
                if (Array.isArray(area.CourseView)) {
                    area.CourseView.forEach(course => {
                        const grade = (course.Grade || '').trim().toUpperCase();
                        if (grade && grade !== 'F' && grade !== 'W' && grade !== 'I') {
                            completedCoursesCount++;
                            hasPassedInArea = true;
                        }
                    });
                }
                if (hasPassedInArea) areaCount++;
            });
        }

        if (completedCoursesCount > 0) {
            statCoursesCompleted.textContent = completedCoursesCount;
            if (statCoursesSub) {
                statCoursesSub.textContent = `Across ${areaCount} Areas`;
            }
        } else if (earnedCredits != null && earnedCredits > 0) {
            const estimated = Math.round(earnedCredits / 3);
            statCoursesCompleted.textContent = `~${estimated}`;
            if (statCoursesSub) statCoursesSub.textContent = 'Estimated Completed';
        } else {
            statCoursesCompleted.textContent = '—';
        }
    }
}

function hydrateCachedAcademicData() {
    try {
        const p = sessionStorage.getItem('_ewu_profile_cache');
        const d = sessionStorage.getItem('_ewu_degree_cache');
        const prof = p ? JSON.parse(p) : null;
        const deg = d ? JSON.parse(d) : null;
        if (prof) renderStudentWelcome(prof);
        if (prof || deg) renderAcademicStats(prof, deg);
    } catch (e) { }
}

async function fetchStudentAcademicData() {
    try {
        const [profRes, degRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/profile`, { credentials: 'include' }).catch(() => null),
            fetch(`${API_BASE_URL}/api/degree-review`, { credentials: 'include' }).catch(() => null)
        ]);

        let profData = null;
        if (profRes && profRes.ok) {
            const j = await profRes.json();
            profData = j && j.data ? j.data : j;
            if (profData) {
                try {
                    sessionStorage.setItem('_ewu_profile_cache', JSON.stringify(profData));
                    if (profData.StudentId) localStorage.setItem('studentId', profData.StudentId);
                    const cleanName = [profData.FirstName, profData.MiddleName, profData.LastName].filter(Boolean).join(' ').trim();
                    if (cleanName) localStorage.setItem('studentName', cleanName);
                    updateStudentIdDisplay(profData.StudentId, cleanName);
                } catch (e) { }
            }
        }

        let degData = null;
        if (degRes && degRes.ok) {
            const j = await degRes.json();
            degData = j;
            if (degData) {
                try { sessionStorage.setItem('_ewu_degree_cache', JSON.stringify(degData)); } catch (e) { }
            }
        }

        if (profData) renderStudentWelcome(profData);
        if (profData || degData) renderAcademicStats(profData, degData);
    } catch (err) {
        console.warn('Academic data fetch error:', err);
    }
}

// ========================================
// Upcoming Academic Calendar & Events
// ========================================
let allAcademicEvents = [];

function parseEventCountdown(dateStr, semesterTitle) {
    if (!dateStr) return { diffDays: -999, label: 'TBD', cls: 'bg-white/5 text-gray-500 border-white/10', isUpcoming: false };

    let year = new Date().getFullYear();
    const yrMatch = String(semesterTitle || '').match(/\b(20\d\d)\b/);
    if (yrMatch) year = parseInt(yrMatch[1], 10);

    const parts = dateStr.match(/([a-zA-Z]+)\s*(\d+)/);
    if (!parts) return { diffDays: -999, label: 'Scheduled', cls: 'bg-white/10 text-gray-400 border-white/20', isUpcoming: true };

    const month = parts[1];
    const day = parseInt(parts[2], 10);
    const eventDate = new Date(`${month} ${day}, ${year} 00:00:00`);
    if (isNaN(eventDate.getTime())) return { diffDays: -999, label: 'Scheduled', cls: 'bg-white/10 text-gray-400 border-white/20', isUpcoming: true };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffMs = eventDate.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return { diffDays, label: 'Today', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', isUpcoming: true };
    } else if (diffDays === 1) {
        return { diffDays, label: 'Tomorrow', cls: 'bg-sky-500/20 text-sky-300 border-sky-500/30', isUpcoming: true };
    } else if (diffDays > 1 && diffDays <= 7) {
        return { diffDays, label: `In ${diffDays} days`, cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30', isUpcoming: true };
    } else if (diffDays > 7 && diffDays <= 30) {
        const weeks = Math.ceil(diffDays / 7);
        return { diffDays, label: `In ${weeks} wk${weeks > 1 ? 's' : ''}`, cls: 'bg-purple-500/20 text-purple-300 border-purple-500/30', isUpcoming: true };
    } else if (diffDays > 30) {
        return { diffDays, label: `In ${diffDays} days`, cls: 'bg-white/10 text-gray-300 border-white/20', isUpcoming: true };
    } else {
        return { diffDays, label: 'Concluded', cls: 'bg-white/5 text-gray-500 border-white/10', isUpcoming: false };
    }
}

function getCategoryPill(category) {
    const map = {
        exam: { label: 'Exam', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
        advising: { label: 'Advising', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
        holiday: { label: 'Holiday', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
        class: { label: 'Class', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
        deadline: { label: 'Deadline', cls: 'bg-red-500/15 text-red-300 border-red-500/30' }
    };
    return map[category] || { label: 'Academic', cls: 'bg-white/10 text-gray-300 border-white/20' };
}

function renderUpcomingEventsList(events, semesterTitle) {
    const listEl = document.getElementById('upcomingEventsList');
    if (!listEl || !Array.isArray(events) || events.length === 0) return;

    const parsed = events.map(e => ({
        ...e,
        countdown: parseEventCountdown(e.date, semesterTitle)
    }));

    const upcoming = parsed.filter(e => e.countdown.diffDays >= 0);
    upcoming.sort((a, b) => a.countdown.diffDays - b.countdown.diffDays);

    let displayList = upcoming.slice(0, 3);
    if (displayList.length === 0) {
        displayList = parsed.slice(-3);
    }

    listEl.innerHTML = displayList.map(e => {
        const cat = getCategoryPill(e.category);
        const dateMatch = (e.date || '').match(/([a-zA-Z]+)\s*(\d+)/);
        const monthShort = dateMatch ? dateMatch[1].slice(0, 3).toUpperCase() : 'DATE';
        const dayNum = dateMatch ? dateMatch[2] : '';

        return `
            <div class="event-item-card p-2.5 sm:p-3 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] flex flex-col items-center justify-center flex-shrink-0 text-center leading-none">
                        <span class="text-[9px] font-mono uppercase text-[#D86C5A] font-bold tracking-wider">${esc(monthShort)}</span>
                        <span class="text-sm font-extrabold text-white mt-0.5">${esc(dayNum)}</span>
                    </div>
                    <div class="min-w-0">
                        <div class="text-xs sm:text-sm font-semibold text-gray-100 truncate">${esc(e.event)}</div>
                        <div class="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                            <span>${esc(e.date)}</span>
                            <span>•</span>
                            <span>${esc(e.day)}</span>
                        </div>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1 flex-shrink-0">
                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border ${e.countdown.cls}">
                        ${e.countdown.label}
                    </span>
                    <span class="text-[9px] font-medium px-1.5 py-0.2 rounded border ${cat.cls} hidden sm:inline-block">
                        ${cat.label}
                    </span>
                </div>
            </div>
        `;
    }).join('');

    initCalendarModal(parsed);
}

function initCalendarModal(events) {
    const modal = document.getElementById('calendarModal');
    const openBtn = document.getElementById('btnOpenCalendarModal');
    const closeBtn = document.getElementById('btnCloseCalendarModal');
    const searchInput = document.getElementById('calendarSearchInput');
    const listContainer = document.getElementById('modalCalendarList');
    if (!modal || !openBtn || !closeBtn || !listContainer) return;

    function renderModalList(filterText = '') {
        const lower = filterText.toLowerCase().trim();
        const filtered = events.filter(e => {
            if (!lower) return true;
            return (e.event && e.event.toLowerCase().includes(lower))
                || (e.date && e.date.toLowerCase().includes(lower))
                || (e.day && e.day.toLowerCase().includes(lower))
                || (e.category && e.category.toLowerCase().includes(lower));
        });

        if (filtered.length === 0) {
            listContainer.innerHTML = '<div class="py-8 text-center text-xs text-gray-400">No matching events found.</div>';
            return;
        }

        listContainer.innerHTML = filtered.map(e => {
            const cat = getCategoryPill(e.category);
            return `
                <div class="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] transition-colors flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 mb-1 flex-wrap">
                            <span class="text-[10px] font-semibold px-2 py-0.5 rounded border ${cat.cls}">
                                ${cat.label}
                            </span>
                            <span class="text-[10px] font-mono text-gray-400">${esc(e.day)}</span>
                        </div>
                        <h4 class="text-xs sm:text-sm font-semibold text-white leading-snug">${esc(e.event)}</h4>
                    </div>
                    <div class="text-right flex-shrink-0">
                        <div class="text-xs font-mono font-medium text-gray-200">${esc(e.date)}</div>
                        <span class="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${e.countdown.cls}">
                            ${e.countdown.label}
                        </span>
                    </div>
                </div>
            `;
        }).join('');
    }

    openBtn.onclick = () => {
        renderModalList('');
        if (searchInput) searchInput.value = '';
        modal.classList.remove('hidden');
    };

    closeBtn.onclick = () => {
        modal.classList.add('hidden');
    };

    modal.onclick = (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    };

    if (searchInput) {
        searchInput.oninput = (e) => {
            renderModalList(e.target.value);
        };
    }
}

async function fetchAcademicCalendarEvents() {
    const badgeEl = document.getElementById('calendarSemesterBadge');

    try {
        const cached = sessionStorage.getItem('_ewu_calendar_cache');
        if (cached) {
            const data = JSON.parse(cached);
            if (data && Array.isArray(data.events)) {
                allAcademicEvents = data.events;
                if (badgeEl && data.semester) badgeEl.textContent = data.semester;
                renderUpcomingEventsList(data.events, data.semester);
            }
        }
    } catch (e) { }

    try {
        const res = await fetch(`${API_BASE_URL}/api/academic-calendar`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.status === 'success' && Array.isArray(data.events)) {
                allAcademicEvents = data.events;
                try { sessionStorage.setItem('_ewu_calendar_cache', JSON.stringify(data)); } catch (e) { }
                if (badgeEl && data.semester) badgeEl.textContent = data.semester;
                renderUpcomingEventsList(data.events, data.semester);
            }
        }
    } catch (err) {
        console.warn('Academic calendar fetch notice:', err);
    }
}

// Check authentication state on page load
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/status`, { credentials: 'include' });
        const data = await response.json();
        if (!data || !data.loggedIn) {
            window.location.href = 'login';
            return false;
        }
        if (data.userId && data.userId !== 'User' && data.userId !== 'Student') {
            try { localStorage.setItem('studentId', data.userId); } catch (e) { }
            updateStudentIdDisplay(data.userId);
        } else {
            updateStudentIdDisplay(getStoredStudentId());
        }

        // Asynchronously fetch profile and degree review to populate student dashboard
        fetchStudentAcademicData();

        return true;
    } catch (error) {
        console.warn('Auth status check failed, redirecting to login:', error);
        window.location.href = 'login';
        return false;
    }
}

// Handle user logout
async function handleLogout(event) {
    if (event) event.preventDefault();
    try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (error) {
        console.error('Logout error:', error);
    }
    try {
        localStorage.removeItem('studentId');
        localStorage.removeItem('studentName');
        localStorage.removeItem('ewu_student_id');
        localStorage.removeItem('userId');
        sessionStorage.clear();
        sessionStorage.setItem('ewu_just_logged_out', 'true');
    } catch (e) { }
    window.location.href = 'login';
}
window.handleLogout = handleLogout;

// ========================================
// Dynamic feature rendering
// ========================================
const CARD_THEME = {
    coral: { accent: '#D86C5A', bg: 'linear-gradient(135deg, rgba(216,108,90,0.2) 0%, rgba(216,108,90,0.05) 100%)', border: 'rgba(216,108,90,0.35)', btn: 'linear-gradient(135deg,#D86C5A,#c5584a)', glow: 'rgba(216,108,90,0.35)' },
    blue: { accent: '#5a8fd8', bg: 'linear-gradient(135deg, rgba(90,143,216,0.2) 0%, rgba(90,143,216,0.05) 100%)', border: 'rgba(90,143,216,0.35)', btn: 'linear-gradient(135deg,#5a8fd8,#4075c0)', glow: 'rgba(90,143,216,0.35)' },
    cyan: { accent: '#06b6d4', bg: 'linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(6,182,212,0.05) 100%)', border: 'rgba(6,182,212,0.35)', btn: 'linear-gradient(135deg,#06b6d4,#0891b2)', glow: 'rgba(6,182,212,0.35)' },
    violet: { accent: '#8b5cf6', bg: 'linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(139,92,246,0.05) 100%)', border: 'rgba(139,92,246,0.35)', btn: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', glow: 'rgba(139,92,246,0.35)' },
    emerald: { accent: '#10b981', bg: 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.05) 100%)', border: 'rgba(16,185,129,0.35)', btn: 'linear-gradient(135deg,#10b981,#059669)', glow: 'rgba(16,185,129,0.35)' },
    amber: { accent: '#f59e0b', bg: 'linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(245,158,11,0.05) 100%)', border: 'rgba(245,158,11,0.35)', btn: 'linear-gradient(135deg,#f59e0b,#d97706)', glow: 'rgba(245,158,11,0.35)' },
    rose: { accent: '#f43f5e', bg: 'linear-gradient(135deg, rgba(244,63,94,0.2) 0%, rgba(244,63,94,0.05) 100%)', border: 'rgba(244,63,94,0.35)', btn: 'linear-gradient(135deg,#f43f5e,#e11d48)', glow: 'rgba(244,63,94,0.35)' },
    teal: { accent: '#0d9488', bg: 'linear-gradient(135deg, rgba(13,148,136,0.2) 0%, rgba(13,148,136,0.05) 100%)', border: 'rgba(13,148,136,0.35)', btn: 'linear-gradient(135deg,#0d9488,#0f766e)', glow: 'rgba(13,148,136,0.35)' },
    indigo: { accent: '#6366f1', bg: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(99,102,241,0.05) 100%)', border: 'rgba(99,102,241,0.35)', btn: 'linear-gradient(135deg,#6366f1,#4f46e5)', glow: 'rgba(99,102,241,0.35)' }
};

const STATUS_PILL = {
    active: { label: 'Active', cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300', dot: 'bg-emerald-400' },
    beta: { label: 'Beta', cls: 'bg-sky-500/15 border-sky-500/30 text-sky-300', dot: 'bg-sky-400' },
    maintenance: { label: 'Maintenance', cls: 'bg-amber-500/15 border-amber-500/30 text-amber-300', dot: 'bg-amber-400' },
    under_work: { label: 'Under Work', cls: 'bg-amber-500/15 border-amber-500/30 text-amber-300', dot: 'bg-amber-400' },
    coming_soon: { label: 'Coming Soon', cls: 'bg-violet-500/15 border-violet-500/30 text-violet-300', dot: 'bg-violet-400' },
    off: { label: 'Disabled', cls: 'bg-gray-500/15 border-gray-500/30 text-gray-300', dot: 'bg-gray-400' }
};

// Feature display order + lightweight dashboard copy
const DASHBOARD_FEATURES = [
    'recommended', 'department', 'preadvising', 'degreereview', 'curriculum', 'schedule', 'planner', 'ledger', 'grades', 'cgpa'
];

// Local fallback registry so the dashboard still renders even if the shared
// features.js fails to load (e.g. stale cache or blocked asset).
const FALLBACK_FEATURES = {
    recommended: { name: 'Recommended Courses', page: 'advise', color: 'coral', icon: '', description: 'Personalized course offerings from your advising routine.' },
    department: { name: 'Department-Wise Courses', page: 'department-courses', color: 'blue', icon: '', description: 'Search and filter course offerings across all departments.' },
    preadvising: { name: 'Pre-Advising', page: 'pre-advising', color: 'teal', icon: '', description: 'Review your pre-advised courses, total credit load, and upcoming semester offerings.' },
    degreereview: { name: 'Degree Review', page: 'degree-review', color: 'indigo', icon: '', description: 'Degree audit, earned credits, remaining graduation requirements and course areas.' },
    curriculum: { name: 'Curriculum', page: 'curriculum', color: 'amber', icon: '', description: 'Explore full academic curriculum structure, major tracks, prerequisites, and courses.' },
    schedule: { name: 'Class Schedule', page: 'class-schedule', color: 'cyan', icon: '', description: 'Personalized weekly timetable grid and registered credits.' },
    planner: { name: 'Course Planner', page: 'course-planner', color: 'violet', icon: '', description: 'Build and validate multiple course combinations.' },
    ledger: { name: 'Account Ledger', page: 'account-ledger', color: 'emerald', icon: '', description: 'Track tuition balances, payments and scholarships.' },
    grades: { name: 'Grade Report', page: 'grade-report', color: 'amber', icon: '', description: 'Academic transcript with term-by-term GPA history.' },
    cgpa: { name: 'CGPA Planner', page: 'cgpa-planner', color: 'rose', icon: '', description: 'Project target GPA and required grades.' },
    profile: { name: 'Student Profile', page: 'profile', color: 'coral', icon: '', description: 'Personal, academic, advisor contact information and institutional records.' }
};

function getFeatureMeta(key) {
    return (typeof window.FEATURES === 'object' && window.FEATURES[key]) || FALLBACK_FEATURES[key] || { name: key, page: '#', color: 'coral', icon: '', description: '' };
}

function getStatusMeta(status) {
    const map = (typeof window.FEATURE_STATUS_META === 'object' && window.FEATURE_STATUS_META) || {
        active: { label: 'Active', usable: true }, beta: { label: 'Beta', usable: true },
        maintenance: { label: 'Maintenance', usable: false }, under_work: { label: 'Under Work', usable: false },
        coming_soon: { label: 'Coming Soon', usable: false }, off: { label: 'Disabled', usable: false }
    };
    return map[status] || map.active;
}

function renderFeatureCards(statuses) {
    const activeGrid = document.getElementById('activeGrid');
    const comingGrid = document.getElementById('comingGrid');
    const activeSection = document.getElementById('activeSection');
    const comingSection = document.getElementById('comingSection');
    if (!activeGrid || !comingGrid) return;

    statuses = statuses || {};
    const activeKeys = [];
    const unavailableKeys = [];

    DASHBOARD_FEATURES.forEach(key => {
        const status = statuses[key] || 'active';
        const meta = getStatusMeta(status);
        if (meta.usable) activeKeys.push({ key, status });
        else unavailableKeys.push({ key, status });
    });

    // Active / usable features
    activeGrid.innerHTML = activeKeys.map(({ key, status }) => activeCardHtml(key, status)).join('') ||
        '<div class="glass-card p-8 text-center text-gray-400 text-sm" style="grid-column:1/-1;">No features are currently available. Please check back later.</div>';

    const activeCount = document.getElementById('activeCount');
    if (activeCount) activeCount.textContent = `${activeKeys.length} Available`;
    const toolsSummaryPill = document.getElementById('toolsSummaryPill');
    if (toolsSummaryPill) toolsSummaryPill.textContent = `${activeKeys.length} Tools Available`;

    // Unavailable features
    if (unavailableKeys.length) {
        comingSection.classList.remove('hidden');
        comingGrid.innerHTML = unavailableKeys.map(({ key, status }) => lockedCardHtml(key, status)).join('');
        const comingCount = document.getElementById('comingCount');
        if (comingCount) comingCount.textContent = `${unavailableKeys.length} Unavailable`;
    } else {
        comingSection.classList.add('hidden');
    }
}

function activeCardHtml(key, status) {
    const f = getFeatureMeta(key);
    const theme = CARD_THEME[f.color] || CARD_THEME.coral;
    const pill = STATUS_PILL[status] || STATUS_PILL.active;
    const isBeta = status === 'beta';

    return `
        <div class="fade-in feature-tile-card" style="position:relative;background:linear-gradient(145deg, rgba(22,22,32,0.75) 0%, rgba(14,14,20,0.85) 100%);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border:1px solid ${theme.border};box-shadow:0 10px 30px rgba(0,0,0,0.4);display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;">
            <div class="feature-tile-bar" style="position:absolute;top:0;left:0;right:0;background:${theme.btn};"></div>
            <div class="p-3 md:p-6 lg:p-7">
                <div class="flex items-center md:items-start justify-between gap-2 md:gap-3 mb-2 md:mb-4">
                    <div class="feature-tile-icon" style="background:${theme.bg};border:1px solid ${theme.border};display:flex;align-items:center;justify-content:center;color:${theme.accent};flex-shrink:0;">
                        ${f.icon}
                    </div>
                    <span class="inline-flex items-center gap-1 md:gap-1.5 px-1.5 py-0.5 md:px-2.5 md:py-1 rounded-full border text-[10px] md:text-xs font-semibold ${pill.cls}">
                        <span class="w-1.5 h-1.5 rounded-full ${pill.dot}"></span>
                        <span class="hidden md:inline">${pill.label}</span>
                        <span class="md:hidden">${isBeta ? 'Beta' : 'Live'}</span>
                    </span>
                </div>
                <div class="flex items-center justify-between gap-1 md:block">
                    <h3 class="text-[12.5px] leading-tight md:text-lg lg:text-xl font-bold text-white md:mb-2">${esc(f.name)}</h3>
                    <svg class="w-3.5 h-3.5 md:hidden flex-shrink-0 opacity-85" style="color:${theme.accent};" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
                <p class="hidden md:block text-gray-300 text-xs sm:text-sm leading-relaxed mb-6">${esc(f.description)}</p>
            </div>
            <div class="feature-tile-footer px-6 sm:px-7 pb-6 sm:pb-7 pt-0">
                <a href="${f.page}" class="no-underline ajax-nav-link feature-tile-btn" style="background:${theme.btn};color:#fff;box-shadow:0 4px 18px ${theme.glow};">
                    <span>${isBeta ? 'Open (Beta)' : 'Open'}</span>
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </a>
            </div>
        </div>`;
}

function lockedCardHtml(key, status) {
    const f = getFeatureMeta(key);
    const pill = STATUS_PILL[status] || STATUS_PILL.coming_soon;
    return `
        <div class="feature-locked-card" style="position:relative;background:linear-gradient(145deg, rgba(16,16,24,0.5) 0%, rgba(10,10,16,0.65) 100%);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;">
            <div class="p-3 md:p-5 lg:p-6">
                <div class="flex items-center md:items-start justify-between gap-2 md:gap-3 mb-2 md:mb-4">
                    <div class="feature-locked-icon" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.45);flex-shrink:0;">
                        ${f.icon}
                    </div>
                    <span class="inline-flex items-center gap-1 md:gap-1.5 px-1.5 md:px-2.5 py-0.5 rounded-full border text-[10px] md:text-[11px] font-medium ${pill.cls}">
                        <svg class="w-2.5 h-2.5 md:w-3 md:h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        ${pill.label}
                    </span>
                </div>
                <h3 class="text-[12.5px] leading-tight md:text-base font-bold text-gray-200 md:mb-1.5">${esc(f.name)}</h3>
                <p class="hidden md:block text-gray-400 text-xs leading-relaxed">${esc(f.description)}</p>
            </div>
            <div class="hidden md:flex mt-2 px-5 sm:px-6 pb-5 sm:pb-6 pt-3.5 border-t border-white/[0.06] items-center justify-between text-[11px] text-gray-500 font-mono">
                <span class="flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full ${pill.dot}"></span>
                    ${pill.label}
                </span>
            </div>
        </div>`;
}

// ========================================
// AJAX Navigation Router (Zero-Reload Return)
// Preserves dashboard state in memory when switching views
// ========================================
const pageCache = new Map();
const loadedScripts = new Set();
const loadedStyles = new Set();

function loadScriptAsync(src) {
    if (!src) return Promise.resolve();
    const cleanSrc = src.split('?')[0];
    if (loadedScripts.has(cleanSrc)) return Promise.resolve();

    // Check if script already exists in document
    const existing = document.querySelector(`script[src*="${cleanSrc}"]`);
    if (existing) {
        loadedScripts.add(cleanSrc);
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            loadedScripts.add(cleanSrc);
            resolve();
        };
        script.onerror = () => {
            console.warn('Script failed to load:', src);
            resolve(); // Don't crash router
        };
        document.body.appendChild(script);
    });
}

function loadStyleAsync(href) {
    if (!href) return;
    const cleanHref = href.split('?')[0];
    if (loadedStyles.has(cleanHref)) return;

    const existing = document.querySelector(`link[rel="stylesheet"][href*="${cleanHref}"]`);
    if (existing) {
        loadedStyles.add(cleanHref);
        return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    loadedStyles.add(cleanHref);
    document.head.appendChild(link);
}

function cleanupPreviousPage() {
    // Stop auto-refresh intervals from advise.js if active
    if (typeof window.stopAutoRefresh === 'function') {
        try { window.stopAutoRefresh(); } catch (e) { }
    }
    // Stop recurring timers registered by other feature pages
    if (typeof window.stopDepartmentClock === 'function') {
        try { window.stopDepartmentClock(); } catch (e) { }
    }
    if (typeof window.stopAdviseClock === 'function') {
        try { window.stopAdviseClock(); } catch (e) { }
    }
    // Remove page-scoped styles injected during the previous navigation
    document.querySelectorAll('style[data-subpage-style]').forEach(el => el.remove());
}

function invokePageLifecycle(url) {
    const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
    try {
        if (cleanUrl.includes('profile')) {
            if (typeof window.initProfilePage === 'function') window.initProfilePage();
            else if (typeof window.fetchProfile === 'function') window.fetchProfile();
        } else if (cleanUrl.includes('pre-advising')) {
            if (typeof window.initPreAdvisingPage === 'function') window.initPreAdvisingPage();
        } else if (cleanUrl.includes('degree-review')) {
            if (typeof window.initDegreeReviewPage === 'function') window.initDegreeReviewPage();
        } else if (cleanUrl.includes('curriculum')) {
            if (typeof window.initCurriculumPage === 'function') window.initCurriculumPage();
        } else if (cleanUrl.includes('class-schedule')) {
            if (typeof window.initClassSchedulePage === 'function') window.initClassSchedulePage();
        } else if (cleanUrl.includes('course-planner')) {
            if (typeof window.initCoursePlannerPage === 'function') window.initCoursePlannerPage();
        } else if (cleanUrl.includes('department-courses')) {
            if (typeof window.initDepartmentCoursesPage === 'function') window.initDepartmentCoursesPage();
        } else if (cleanUrl.includes('account-ledger')) {
            if (typeof window.initAccountLedgerPage === 'function') window.initAccountLedgerPage();
        } else if (cleanUrl.includes('grade-report')) {
            if (typeof window.initGradeReportPage === 'function') window.initGradeReportPage();
        } else if (cleanUrl.includes('cgpa-planner')) {
            if (typeof window.initCgpaPlannerPage === 'function') window.initCgpaPlannerPage();
        } else if (cleanUrl.includes('advise')) {
            if (typeof window.initAdvisePage === 'function') window.initAdvisePage();
        }
    } catch (err) {
        console.warn('Page lifecycle invocation notice:', err);
    }
}

// Normalize a link/URL to a clean route slug (no leading slash, no .html).
function cleanRouteSlug(url) {
    if (!url) return '';
    let slug = String(url).split('?')[0].split('#')[0];
    slug = slug.replace(/^\.\//, '').replace(/^\/+/, '');
    slug = slug.replace(/\.html$/i, '');
    return slug.toLowerCase();
}

// Fetch a subpage by its clean URL, falling back to the .html file on hosts
// that do not implement extensionless rewrites (e.g. a bare static server).
async function fetchPageHtml(slug) {
    const cached = pageCache.get(slug);
    if (cached) return cached;
    let res = await fetch('/' + slug);
    if (!res.ok) res = await fetch('/' + slug + '.html');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    pageCache.set(slug, html);
    return html;
}

async function navigateToPage(url, pushState = true) {
    const homeView = document.getElementById('dashboardHomeView');
    const pageView = document.getElementById('dashboardPageView');
    const loadingView = document.getElementById('dashboardPageLoading');

    const slug = cleanRouteSlug(url);
    if (!slug || slug === 'dashboard' || slug === 'index') {
        restoreDashboardHome(pushState);
        return;
    }

    if (!homeView || !pageView) {
        window.location.href = '/' + slug;
        return;
    }

    cleanupPreviousPage();

    if (pushState) {
        history.pushState({ page: slug }, '', '/' + slug);
    }

    homeView.classList.add('hidden');
    pageView.classList.add('hidden');
    if (loadingView) loadingView.classList.remove('hidden');

    try {
        const htmlText = await fetchPageHtml(slug);

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');

        if (doc.title) document.title = doc.title;

        // Load stylesheets from subpage head
        const stylesheets = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
        for (const link of stylesheets) {
            const href = link.getAttribute('href');
            if (href && !href.includes('styles.css')) {
                loadStyleAsync(href);
            }
        }

        // Inject the whole page body minus its own chrome (top-level
        // nav/header/footer), the ambient background and scripts. Using the
        // body rather than just <main> keeps sibling elements that live
        // outside <main> (e.g. routine/preview modals, toasts) working under
        // AJAX navigation.
        const fragment = document.createElement('div');
        fragment.innerHTML = doc.body.innerHTML;
        // Never inject <script> tags via innerHTML: they are inert (do not run)
        // and would falsely satisfy the "already loaded" check in
        // loadScriptAsync, preventing the real scripts from ever loading.
        // Feature scripts are loaded explicitly in the loop below instead.
        fragment.querySelectorAll('script').forEach(s => s.remove());
        // Remove only top-level page chrome and the duplicate background layer;
        // inner <header>/<nav> inside the content are preserved.
        Array.from(fragment.children).forEach(child => {
            const tag = child.tagName;
            if (tag === 'NAV' || tag === 'HEADER' || tag === 'FOOTER' || child.classList.contains('fp-bg')) {
                child.remove();
            }
        });
        // Unwrap a nested <main> so we don't create a <main> inside <main>.
        Array.from(fragment.querySelectorAll('main')).forEach(m => m.replaceWith(...m.childNodes));

        pageView.innerHTML = fragment.innerHTML;

        // Copy page-scoped <style> blocks (e.g. print styles) so behaviour on
        // AJAX-opened pages matches a full page load. Tagged for cleanup.
        Array.from(doc.querySelectorAll('style')).forEach(st => {
            const clone = document.createElement('style');
            clone.setAttribute('data-subpage-style', 'true');
            clone.textContent = st.textContent;
            document.head.appendChild(clone);
        });

        // Dynamically load vendor & feature scripts needed. While these execute,
        // set a flag so page scripts skip their own auto-init (the router calls
        // the page initializer explicitly to avoid duplicate requests).
        const scripts = Array.from(doc.querySelectorAll('script'));
        window.__EWU_AJAX_NAV__ = true;
        try {
            for (const s of scripts) {
                const src = s.getAttribute('src');
                if (src) {
                    if (src.includes('tailwind') || src.includes('styles.css') || src.includes('dashboard.js') || src.includes('system-metrics.js') || src.includes('main.js')) {
                        continue;
                    }
                    await loadScriptAsync(src);
                }
            }
        } finally {
            window.__EWU_AJAX_NAV__ = false;
        }

        if (loadingView) loadingView.classList.add('hidden');
        pageView.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Invoke page lifecycle initializer
        invokePageLifecycle(slug);

        // Bind all Back to Dashboard links in the newly rendered view
        bindSubpageBackButtons();
    } catch (err) {
        console.error('AJAX navigation fallback to full load:', err);
        window.location.href = '/' + slug;
    }
}

function restoreDashboardHome(pushState = true) {
    const homeView = document.getElementById('dashboardHomeView');
    const pageView = document.getElementById('dashboardPageView');
    const loadingView = document.getElementById('dashboardPageLoading');

    if (!homeView) return;

    cleanupPreviousPage();

    if (pushState) {
        history.pushState({ page: 'dashboard' }, '', '/dashboard');
    }

    if (pageView) pageView.classList.add('hidden');
    if (loadingView) loadingView.classList.add('hidden');
    homeView.classList.remove('hidden');

    document.title = 'Academic Dashboard - EWU Course Fetching';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindSubpageBackButtons() {
    // Anchor links to the dashboard are handled by the global router below;
    // only bind non-anchor [data-back-dashboard] controls here to avoid the
    // same click being handled twice.
    document.querySelectorAll('[data-back-dashboard]').forEach(el => {
        if (el.tagName === 'A' && el.getAttribute('href')) return;
        el.onclick = (e) => {
            e.preventDefault();
            restoreDashboardHome(true);
        };
    });
}

function initAjaxRouter() {
    // Subpages reachable through the in-memory AJAX router (clean slugs).
    const targetRoutes = [
        'advise',
        'department-courses',
        'pre-advising',
        'degree-review',
        'curriculum',
        'class-schedule',
        'course-planner',
        'account-ledger',
        'grade-report',
        'cgpa-planner',
        'profile',
        'documentation',
        'learn-more'
    ];

    // Intercept clicks on links globally
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
            return;
        }

        // Leave the legacy V2 sub-app and truly external URLs to the browser
        if (/^v2\//i.test(href) || href.startsWith('/V2/')) return;
        if (/^https?:\/\//i.test(href) && !href.startsWith(window.location.origin)) return;

        const homeView = document.getElementById('dashboardHomeView');
        if (!homeView) return;

        const slug = cleanRouteSlug(href);
        if (!slug || slug === 'index') return;

        // Return to dashboard
        if (slug === 'dashboard') {
            e.preventDefault();
            restoreDashboardHome(true);
            return;
        }

        // Instant in-memory navigation for connected dashboard subpages
        if (targetRoutes.includes(slug)) {
            e.preventDefault();
            navigateToPage(slug, true);
        }
    });

    // Handle browser Back / Forward buttons
    window.addEventListener('popstate', (e) => {
        const state = e.state;
        if (state && state.page && state.page !== 'dashboard') {
            navigateToPage(state.page, false);
        } else {
            restoreDashboardHome(false);
        }
    });

    history.replaceState({ page: 'dashboard' }, '', '/dashboard');
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
    const yearEl = document.getElementById('dynamicYear');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    updateStudentIdDisplay();
    initAjaxRouter();

    // Instant optimistic hydration of cards and academic widgets from cache
    try {
        const cachedStatusesStr = sessionStorage.getItem('ewu_dashboard_statuses');
        if (cachedStatusesStr) {
            const cachedStatuses = JSON.parse(cachedStatusesStr);
            renderFeatureCards(cachedStatuses);
        }
    } catch (e) { }

    initStudentQuotes();
    hydrateCachedAcademicData();
    fetchAcademicCalendarEvents();

    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', () => mobileMenu.classList.toggle('hidden'));
    }

    // Verify authentication first
    const authed = await checkAuth();
    if (!authed) return;

    // Render features based on admin-controlled statuses
    try {
        const statuses = (typeof window.fetchFeatureStatuses === 'function')
            ? await window.fetchFeatureStatuses()
            : {};
        renderFeatureCards(statuses);
        try {
            sessionStorage.setItem('ewu_dashboard_statuses', JSON.stringify(statuses));
        } catch (err) { }
    } catch (e) {
        renderFeatureCards({});
    }
});

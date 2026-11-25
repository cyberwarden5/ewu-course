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
// Student Quotes (Curated mixture of recognized wisdom & relatable EWU campus lore)
// ========================================
const STUDENT_QUOTES = [
    // Recognized inspiration
    { quote: "It always seems impossible until it's done.", author: "Nelson Mandela" },
    { quote: "Stay hungry, stay foolish.", author: "Steve Jobs" },
    { quote: "You don't have to see the whole staircase, just take the first step.", author: "Martin Luther King Jr." },
    { quote: "The beautiful thing about learning is that no one can take it away from you.", author: "B.B. King" },
    { quote: "Consistency is what transforms average into excellence.", author: "Tony Dungy" },
    { quote: "Don't count the days, make the days count.", author: "Muhammad Ali" },
    { quote: "Focus on progress, not perfection.", author: "Bill Phillips" },
    { quote: "Education is the most powerful weapon which you can use to change the world.", author: "Nelson Mandela" },
    { quote: "If you want to shine like a sun, first burn like a sun.", author: "A.P.J. Abdul Kalam" },

    // Relatable university, campus life & EWU student lore
    { quote: "Ki bochor toh sesh, comeback diba kobe?", author: "EWU Student Lore" },
    { quote: "Buke hat diye bol toh, CGPA koto?", author: "Campus Reality" },
    { quote: "Ki vai, business suru korben na?", author: "Senior Advice" },
    { quote: "Varsity te bondhu hoyna, sob shap!", author: "Campus Lore" },
    { quote: "Midterm er age: 'Eibar A+ confirm.' Midterm er pore: 'Pass korlei shanti!'", author: "Exam Chronicles" },
    { quote: "Assignment submission at 11:59 PM. Sent at 11:58:59 PM. Pure adrenaline!", author: "Deadline Adrenaline" },
    { quote: "Attendance 80% maintain korte giye ghum 20% e neme ashe.", author: "EWU Life" },
    { quote: "CGPA is temporary, but 'Mama, canteen e chol ek cup cha khai' is permanent.", author: "Canteen Chronicles" },
    { quote: "Advising slot shokal 8 tay, sleep cycle shokal 9 tay shuru.", author: "Advising Chronicles" },
    { quote: "Course drop korar por je shukher shanti pawa jay, seta Nirvana er cheyeo beshi.", author: "Inner Peace" },
    { quote: "East West er bridge paar howar shomoy haway sob porashona ure jay!", author: "EWU Campus" }
];

let quoteIntervalId = null;
let currentQuoteIndex = -1;

function displayQuote(index) {
    const textEl = document.getElementById('studentQuoteText');
    const authorEl = document.getElementById('studentQuoteAuthor');
    if (!textEl || !authorEl) return;

    if (index == null || index < 0 || index >= STUDENT_QUOTES.length) {
        index = Math.floor(Math.random() * STUDENT_QUOTES.length);
    }
    currentQuoteIndex = index;
    const item = STUDENT_QUOTES[index];

    // Smooth subtle fade out
    textEl.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
    textEl.style.opacity = '0';
    textEl.style.transform = 'translateY(4px)';
    authorEl.style.transition = 'opacity 0.35s ease';
    authorEl.style.opacity = '0';

    setTimeout(() => {
        textEl.textContent = item.quote;
        authorEl.textContent = `— ${item.author}`;
        textEl.style.transition = 'opacity 0.45s ease, transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)';
        textEl.style.opacity = '1';
        textEl.style.transform = 'translateY(0)';
        authorEl.style.transition = 'opacity 0.45s ease';
        authorEl.style.opacity = '1';
    }, 350);
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
            quoteIntervalId = setInterval(() => displayQuote(), 26000);
        };
    }

    if (!quoteIntervalId) {
        // Relaxed 26s rotation gives users ample time to read without distraction
        quoteIntervalId = setInterval(() => {
            if (!document.hidden) {
                let nextIndex;
                do {
                    nextIndex = Math.floor(Math.random() * STUDENT_QUOTES.length);
                } while (nextIndex === currentQuoteIndex && STUDENT_QUOTES.length > 1);
                displayQuote(nextIndex);
            }
        }, 26000);
    }
}

// ========================================
// Personalised Sequential Name Animation
// Relaxed timing & gentle eased transition
// ========================================
let nameParts = ['Student'];
let nameIndex = 0;
let nameIntervalId = null;

function initNameAnimation(fullName) {
    if (!fullName) return;
    const tokens = fullName
        .replace(/[\r\n\t]+/g, ' ')
        .split(/\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 0 && !/^(mr|ms|mrs|dr|engr)\.?$/i.test(s));

    if (tokens.length === 0) return;
    nameParts = tokens;
    nameIndex = 0;

    const el = document.getElementById('animatedStudentName');
    if (!el) return;
    el.textContent = nameParts[0];

    if (nameIntervalId) {
        clearInterval(nameIntervalId);
        nameIntervalId = null;
    }

    if (nameParts.length <= 1) return;

    // 4.5 second delay provides plenty of comfortable reading time
    nameIntervalId = setInterval(() => {
        if (document.hidden) return;
        const target = document.getElementById('animatedStudentName');
        if (!target) return;

        // Smoothly glide upward and fade out
        target.style.transition = 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s ease-in';
        target.style.transform = 'translateY(-100%)';
        target.style.opacity = '0';

        setTimeout(() => {
            nameIndex = (nameIndex + 1) % nameParts.length;
            target.textContent = nameParts[nameIndex];
            target.style.transition = 'none';
            target.style.transform = 'translateY(100%)';

            void target.offsetHeight; // force reflow

            // Gentle deceleration into place
            target.style.transition = 'transform 0.65s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.65s ease-out';
            target.style.transform = 'translateY(0)';
            target.style.opacity = '1';
        }, 550);
    }, 4500);
}

// ========================================
// Current Semester Detection
// ========================================
let currentSemesterGlobal = null;

function detectCurrentSemester(semesters) {
    if (!Array.isArray(semesters) || semesters.length === 0) return null;
    const now = new Date();

    // 1. Try finding one where now is between StartingDate and EndingDate
    for (const sem of semesters) {
        if (sem.StartingDate && sem.EndingDate) {
            const start = new Date(sem.StartingDate);
            const end = new Date(sem.EndingDate);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                if (now >= start && now <= end) {
                    return sem;
                }
            }
        }
    }

    // 2. Fallback to IsActive flag
    const active = semesters.find(s => s.IsActive === true);
    if (active) return active;

    // 3. Fallback to first available semester
    return semesters[0];
}

function updateCurrentSemesterDisplay(sem) {
    if (!sem) return;
    currentSemesterGlobal = sem;
    const el = document.getElementById('welcomeSemester');
    if (el) {
        el.textContent = sem.SemesterName || 'Current Term';
    }
}

function getShortenedDegree(fullName, shortName) {
    if (!fullName) return shortName || 'Degree';
    let clean = fullName.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

    const replacements = [
        { regex: /Computer\s+Science\s+and\s+Engineering/i, short: 'CSE' },
        { regex: /Electrical\s+and\s+Electronic\s+Engineering/i, short: 'EEE' },
        { regex: /Electronic\s+and\s+Telecommunication\s+Engineering/i, short: 'ETE' },
        { regex: /Information\s+and\s+Communication\s+Engineering/i, short: 'ICE' },
        { regex: /Civil\s+Engineering/i, short: 'CE' },
        { regex: /Bachelor\s+of\s+Business\s+Administration/i, short: 'BBA' },
        { regex: /Master\s+of\s+Business\s+Administration/i, short: 'MBA' },
        { regex: /Pharmacy/i, short: 'Pharm.' },
        { regex: /Economics/i, short: 'ECON' },
        { regex: /English/i, short: 'ENG' },
        { regex: /Law/i, short: 'LLB' }
    ];

    for (const r of replacements) {
        if (r.regex.test(clean)) {
            return clean.replace(r.regex, r.short);
        }
    }

    if (shortName && shortName.length <= 8) {
        if (/^B\.?\s*Sc\.?/i.test(clean)) return `B.Sc. in ${shortName}`;
        return shortName;
    }

    return clean;
}

// ========================================
// Personalised Student Welcome Rendering
// ========================================
function renderStudentWelcome(profile) {
    if (!profile) return;

    const cleanName = [profile.FirstName, profile.MiddleName, profile.LastName]
        .filter(Boolean)
        .join(' ')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    initNameAnimation(cleanName || 'Student');

    const studentId = profile.StudentId || getStoredStudentId();
    const welcomeStudentId = document.getElementById('welcomeStudentId');
    if (welcomeStudentId && studentId) {
        welcomeStudentId.textContent = studentId;
    }

    const programName = (profile.ProgramName || profile.ProgramShortName || 'Undergraduate Program')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Desktop full program name
    const welcomeProgram = document.getElementById('welcomeProgram');
    if (welcomeProgram) {
        welcomeProgram.textContent = programName;
    }

    // Mobile shortened program name (e.g. B.Sc. in CSE)
    const welcomeProgramMobile = document.getElementById('welcomeProgramMobile');
    if (welcomeProgramMobile) {
        welcomeProgramMobile.textContent = getShortenedDegree(programName, profile.ProgramShortName);
    }

    // Current semester (will be refined by detectCurrentSemester)
    const welcomeSemester = document.getElementById('welcomeSemester');
    if (welcomeSemester && !currentSemesterGlobal) {
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
}

// ========================================
// Scholarship Extraction from Account Ledger
// ========================================
function parseScholarshipFromLedger(ledgerData) {
    if (!ledgerData || !Array.isArray(ledgerData.transactions)) {
        return { hasScholarship: false, title: 'None', details: 'No active waiver or award' };
    }
    const txns = ledgerData.transactions;
    const keywords = ['scholarship', 'waiver', 'medha', 'merit', 'financial aid', 'fellowship', 'stipend', 'dean'];

    const scholarshipTxns = txns.filter(t => {
        const desc = (t.Description || '').toLowerCase();
        const ref = (t.AccountsReferance || '').toLowerCase();
        const vtype = (t.VoucherType || '').toLowerCase();
        return keywords.some(k => desc.includes(k) || ref.includes(k) || vtype.includes(k));
    });

    if (scholarshipTxns.length === 0) {
        return { hasScholarship: false, title: 'None', details: 'No active waiver or award' };
    }

    const latest = scholarshipTxns[scholarshipTxns.length - 1];
    const desc = (latest.Description || latest.AccountsReferance || 'Scholarship')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    let title = 'Scholarship';
    if (/dean/i.test(desc)) title = "Dean's Scholarship";
    else if (/merit/i.test(desc)) title = 'Merit Scholarship';
    else if (/waiver/i.test(desc)) title = 'Tuition Waiver';
    else if (/medha/i.test(desc)) title = 'Medha Lalon';

    let adjustedText = '';
    const adjMatch = desc.match(/(?:tk\.?|bdt)?\s*([\d,]+)\s*(?:\/-)?\s*adjusted/i)
        || desc.match(/adjusted\s*(?:tk\.?|bdt)?\s*([\d,]+)/i);
    if (adjMatch) {
        adjustedText = `Tk. ${adjMatch[1]} adjusted`;
    } else if (latest.AmountCr > 0) {
        adjustedText = `Tk. ${latest.AmountCr.toLocaleString()} adjusted`;
    }

    let subDetails = '';
    const balMatch = desc.match(/balance:?\s*([\d,]+)\/?-?\s*(?:till\s*([^.]+))?/i);
    const durationMatch = desc.match(/from\s*([A-Za-z0-9\s–\-]+?)(?:\.|$)/i);

    if (balMatch) {
        const balAmt = balMatch[1];
        const balTill = balMatch[2] ? ` till ${balMatch[2].trim()}` : '';
        subDetails = `${adjustedText ? adjustedText + ' • ' : ''}Bal: ${balAmt}${balTill}`;
    } else if (durationMatch) {
        subDetails = `${adjustedText ? adjustedText + ' • ' : ''}${durationMatch[1].trim()}`;
    } else if (latest.SemesterName) {
        subDetails = `${adjustedText ? adjustedText + ' • ' : ''}${latest.SemesterName}`;
    } else {
        subDetails = adjustedText || desc.slice(0, 45);
    }

    return {
        hasScholarship: true,
        title,
        details: subDetails,
        raw: desc
    };
}

function renderScholarshipCard(scholarshipInfo) {
    const titleEl = document.getElementById('statScholarshipTitle');
    const subEl = document.getElementById('statScholarshipSub');
    if (!titleEl || !subEl) return;

    if (!scholarshipInfo) {
        titleEl.textContent = 'None';
        subEl.textContent = 'No active waiver or award';
        return;
    }

    titleEl.textContent = scholarshipInfo.title || 'None';
    subEl.textContent = scholarshipInfo.details || (scholarshipInfo.hasScholarship ? 'Active scholarship' : 'No active waiver or award');
    if (scholarshipInfo.hasScholarship) {
        titleEl.title = scholarshipInfo.raw || scholarshipInfo.title;
        subEl.title = scholarshipInfo.raw || scholarshipInfo.details;
    }
}

// ========================================
// Academic Overview & Key Statistics
// ========================================
function renderAcademicStats(profile, degreeReview, ledgerData) {
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

    // 4. Scholarship Card
    if (ledgerData) {
        renderScholarshipCard(parseScholarshipFromLedger(ledgerData));
    }
}

// ========================================
// Upcoming Class Routine Engine
// ========================================
const EWU_DAY_MAP = {
    'S': 0, // Sunday
    'M': 1, // Monday
    'T': 2, // Tuesday
    'W': 3, // Wednesday
    'R': 4, // Thursday
    'F': 5, // Friday
    'A': 6  // Saturday
};

const EWU_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseTimeMinutes(tStr) {
    if (!tStr) return null;
    const match = tStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return null;
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 60 + m;
}

function parseCourseSlotOccurrences(course) {
    const slot = course.TimeSlotName || '';
    const match = slot.match(/^([SMTWTRFA]+)\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
    if (!match) return [];

    const daysPart = match[1].toUpperCase();
    const startTimeStr = match[2];
    const endTimeStr = match[3];

    const startMinutes = parseTimeMinutes(startTimeStr);
    const endMinutes = parseTimeMinutes(endTimeStr);
    if (startMinutes == null || endMinutes == null) return [];

    const occurrences = [];
    for (const char of daysPart) {
        if (EWU_DAY_MAP[char] !== undefined) {
            occurrences.push({
                course,
                day: EWU_DAY_MAP[char],
                dayName: EWU_DAY_NAMES[EWU_DAY_MAP[char]],
                startMinutes,
                endMinutes,
                startTimeStr,
                endTimeStr,
                timeRange: `${startTimeStr} - ${endTimeStr}`
            });
        }
    }
    return occurrences;
}

function getUpcomingClassInfo(courses) {
    if (!Array.isArray(courses) || courses.length === 0) return null;

    const activeCourses = courses.filter(c => !c.IsDrop && !c.IsWithdraw && c.DropStatus !== 'Yes' && c.WithDrawStatus !== 'Yes');
    if (activeCourses.length === 0) return null;

    const occurrences = [];
    activeCourses.forEach(c => occurrences.push(...parseCourseSlotOccurrences(c)));
    if (occurrences.length === 0) return null;

    const now = new Date();
    const nowDay = now.getDay();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // 1. Ongoing / In Session
    const ongoing = occurrences.find(o => o.day === nowDay && nowMinutes >= o.startMinutes && nowMinutes < o.endMinutes);
    if (ongoing) {
        const leftM = ongoing.endMinutes - nowMinutes;
        return {
            status: 'ongoing',
            badgeText: 'In Session',
            badgeCls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
            pulse: true,
            occ: ongoing,
            note: `Ends in ${leftM}m (${ongoing.endTimeStr})`
        };
    }

    // 2. Next class today
    const todayUpcoming = occurrences
        .filter(o => o.day === nowDay && o.startMinutes > nowMinutes)
        .sort((a, b) => a.startMinutes - b.startMinutes);

    if (todayUpcoming.length > 0) {
        const next = todayUpcoming[0];
        const diffM = next.startMinutes - nowMinutes;
        const diffText = diffM >= 60 ? `${Math.floor(diffM / 60)}h ${diffM % 60}m` : `${diffM}m`;
        return {
            status: 'today',
            badgeText: 'Today',
            badgeCls: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
            pulse: false,
            occ: next,
            note: `Starts in ${diffText} (${next.startTimeStr})`
        };
    }

    // 3. Earliest class on upcoming days
    let best = null;
    let minMinutesTill = Infinity;

    occurrences.forEach(o => {
        let dayDiff = o.day - nowDay;
        if (dayDiff <= 0) dayDiff += 7;
        const minutesTill = dayDiff * 24 * 60 + (o.startMinutes - nowMinutes);
        if (minutesTill < minMinutesTill) {
            minMinutesTill = minutesTill;
            best = { occ: o, dayDiff };
        }
    });

    if (best) {
        const isTomorrow = best.dayDiff === 1;
        return {
            status: isTomorrow ? 'tomorrow' : 'upcoming',
            badgeText: isTomorrow ? 'Tomorrow' : best.occ.dayName,
            badgeCls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
            pulse: false,
            occ: best.occ,
            note: `${isTomorrow ? 'Tomorrow' : 'Next ' + best.occ.dayName} at ${best.occ.startTimeStr}`
        };
    }

    return null;
}

function renderUpcomingClassCard(classInfo) {
    const badgeEl = document.getElementById('upcomingClassStatusBadge');
    const container = document.getElementById('upcomingClassContent');
    if (!container) return;

    if (!classInfo) {
        if (badgeEl) {
            badgeEl.textContent = 'No Classes';
            badgeEl.className = 'text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-400';
        }
        container.innerHTML = `
            <div class="py-2 flex items-center gap-2.5 text-gray-400">
                <div class="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-gray-500 flex-shrink-0">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                </div>
                <div>
                    <div class="text-xs font-semibold text-gray-300">No classes scheduled</div>
                    <div class="text-[10px] text-gray-500">Enjoy your break or check advising routine.</div>
                </div>
            </div>
        `;
        return;
    }

    const { occ, badgeText, badgeCls, pulse, note } = classInfo;
    const c = occ.course;

    if (badgeEl) {
        badgeEl.textContent = badgeText;
        badgeEl.className = `text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${badgeCls} ${pulse ? 'animate-pulse' : ''}`;
    }

    const facultyDisplay = c.FacultyName || c.ShortName || 'Faculty';
    const roomDisplay = c.RoomName ? `Room ${c.RoomName}` : 'Room TBD';
    const sectionDisplay = c.SectionName ? `Sec ${c.SectionName}` : '';

    container.innerHTML = `
        <div class="space-y-1.5">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-sm sm:text-base font-black text-white font-mono tracking-tight">${esc(c.CourseCode)}</span>
                        ${sectionDisplay ? `<span class="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-[#D86C5A]/15 border border-[#D86C5A]/30 text-[#D86C5A]">${esc(sectionDisplay)}</span>` : ''}
                    </div>
                    <div class="text-[11px] text-gray-400 truncate mt-0.5" title="${esc(facultyDisplay)}">
                        ${esc(facultyDisplay)}
                    </div>
                </div>
                <div class="text-right flex-shrink-0">
                    <span class="text-xs sm:text-sm font-bold text-white font-mono block">${esc(occ.startTimeStr)}</span>
                    <span class="text-[10px] text-gray-400 block">${esc(roomDisplay)}</span>
                </div>
            </div>

            <div class="pt-1.5 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-gray-400">
                <span class="flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full ${pulse ? 'bg-emerald-400 animate-ping' : 'bg-[#5a8fd8]'}"></span>
                    <span>${esc(note)}</span>
                </span>
                <span class="text-gray-500">${esc(occ.dayName)}</span>
            </div>
        </div>
    `;
}

// Hydrate cached data on initial render
function hydrateCachedAcademicData() {
    try {
        const p = sessionStorage.getItem('_ewu_profile_cache');
        const d = sessionStorage.getItem('_ewu_degree_cache');
        const l = sessionStorage.getItem('_ewu_ledger_cache');
        const s = sessionStorage.getItem('_ewu_semesters_cache');
        const r = sessionStorage.getItem('_ewu_routine_cache');

        const prof = p ? JSON.parse(p) : null;
        const deg = d ? JSON.parse(d) : null;
        const led = l ? JSON.parse(l) : null;
        const sem = s ? JSON.parse(s) : null;
        const routine = r ? JSON.parse(r) : null;

        if (sem && Array.isArray(sem)) {
            const detected = detectCurrentSemester(sem);
            if (detected) updateCurrentSemesterDisplay(detected);
        }
        if (prof) renderStudentWelcome(prof);
        if (prof || deg || led) renderAcademicStats(prof, deg, led);
        if (routine && Array.isArray(routine)) {
            renderUpcomingClassCard(getUpcomingClassInfo(routine));
        }
    } catch (e) { }
}

async function fetchStudentAcademicData() {
    try {
        const [profRes, degRes, ledRes, semRes] = await Promise.all([
            fetch(`${API_BASE_URL}/api/profile`, { credentials: 'include' }).catch(() => null),
            fetch(`${API_BASE_URL}/api/degree-review`, { credentials: 'include' }).catch(() => null),
            fetch(`${API_BASE_URL}/api/ledger`, { credentials: 'include' }).catch(() => null),
            fetch(`${API_BASE_URL}/api/semesters`, { credentials: 'include' }).catch(() => null)
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

        let ledgerData = null;
        if (ledRes && ledRes.ok) {
            const j = await ledRes.json();
            ledgerData = j;
            if (ledgerData) {
                try { sessionStorage.setItem('_ewu_ledger_cache', JSON.stringify(ledgerData)); } catch (e) { }
            }
        } else {
            renderScholarshipCard({ hasScholarship: false, title: 'None', details: 'No active waiver or award' });
        }

        let semestersList = null;
        let activeSem = null;
        if (semRes && semRes.ok) {
            const j = await semRes.json();
            if (j && Array.isArray(j.semesters)) {
                semestersList = j.semesters;
                try { sessionStorage.setItem('_ewu_semesters_cache', JSON.stringify(semestersList)); } catch (e) { }
                activeSem = detectCurrentSemester(semestersList);
                if (activeSem) updateCurrentSemesterDisplay(activeSem);
            }
        }

        if (profData) renderStudentWelcome(profData);
        if (profData || degData || ledgerData) renderAcademicStats(profData, degData, ledgerData);

        // Fetch class schedule for upcoming class card
        const targetSemesterId = activeSem ? activeSem.SemesterId : (profData ? profData.SemesterId : null);
        if (targetSemesterId) {
            try {
                const schedRes = await fetch(`${API_BASE_URL}/api/schedule?semesterId=${encodeURIComponent(targetSemesterId)}`, { credentials: 'include' });
                if (schedRes.ok) {
                    const schedJson = await schedRes.json();
                    if (schedJson && Array.isArray(schedJson.courses)) {
                        try { sessionStorage.setItem('_ewu_routine_cache', JSON.stringify(schedJson.courses)); } catch (e) { }
                        renderUpcomingClassCard(getUpcomingClassInfo(schedJson.courses));
                    } else {
                        renderUpcomingClassCard(null);
                    }
                } else {
                    renderUpcomingClassCard(null);
                }
            } catch (err) {
                renderUpcomingClassCard(null);
            }
        } else {
            renderUpcomingClassCard(null);
        }
    } catch (err) {
        console.warn('Academic data fetch error:', err);
    }
}

// ========================================
// Important Dates & Academic Calendar
// ========================================
let allAcademicEvents = [];

const MONTH_MAP = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
};

function parseDateRangeRobust(dateStr, defaultYear) {
    if (!dateStr) return null;
    let clean = String(dateStr)
        .replace(/&nbsp;/gi, ' ')
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .trim();

    let year = defaultYear || new Date().getFullYear();
    const yrMatch = clean.match(/\b(20\d\d)\b/);
    if (yrMatch) {
        year = parseInt(yrMatch[1], 10);
        // Strip out the year and trailing comma so it doesn't get conflated with day numbers
        clean = clean.replace(/\b20\d\d\b/g, '').replace(/,\s*,/g, ',').trim().replace(/,\s*$/, '');
    }

    // Range across two months: "Nov 30-Dec 03" or "Dec 26 - Jan 04"
    const twoMonthsMatch = clean.match(/([a-zA-Z]+)\s+(\d+)\s*(?:-|–|to)\s*([a-zA-Z]+)\s+(\d+)/i);
    if (twoMonthsMatch) {
        const m1 = MONTH_MAP[twoMonthsMatch[1].toLowerCase()];
        const d1 = parseInt(twoMonthsMatch[2], 10);
        const m2 = MONTH_MAP[twoMonthsMatch[3].toLowerCase()];
        const d2 = parseInt(twoMonthsMatch[4], 10);
        if (m1 !== undefined && m2 !== undefined) {
            let endYear = year;
            if (m2 < m1) endYear = year + 1; // cross into next year (e.g. Dec to Jan)
            return {
                start: new Date(year, m1, d1, 0, 0, 0),
                end: new Date(endYear, m2, d2, 23, 59, 59),
                isRange: true
            };
        }
    }

    // Range within same month: "October 19-21" or "December 13-20"
    const oneMonthRangeMatch = clean.match(/([a-zA-Z]+)\s+(\d+)\s*(?:-|–|to)\s*(\d+)/i);
    if (oneMonthRangeMatch) {
        const m = MONTH_MAP[oneMonthRangeMatch[1].toLowerCase()];
        const d1 = parseInt(oneMonthRangeMatch[2], 10);
        const d2 = parseInt(oneMonthRangeMatch[3], 10);
        if (m !== undefined) {
            return {
                start: new Date(year, m, d1, 0, 0, 0),
                end: new Date(year, m, d2, 23, 59, 59),
                isRange: true
            };
        }
    }

    // Comma-separated list in same month: "Sept 13, 14, 15"
    const commaListMatch = clean.match(/([a-zA-Z]+)\s+(\d+)(?:\s*,\s*(\d+))+/i);
    if (commaListMatch) {
        const m = MONTH_MAP[commaListMatch[1].toLowerCase()];
        const rawNums = clean.match(/\b\d+\b/g);
        const numbers = rawNums ? rawNums.map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 31) : [];
        if (m !== undefined && numbers.length > 0) {
            const d1 = Math.min(...numbers);
            const d2 = Math.max(...numbers);
            return {
                start: new Date(year, m, d1, 0, 0, 0),
                end: new Date(year, m, d2, 23, 59, 59),
                isRange: true
            };
        }
    }

    // Single date: "November 19" or "October 01"
    const singleMatch = clean.match(/([a-zA-Z]+)\s+(\d+)/i);
    if (singleMatch) {
        const m = MONTH_MAP[singleMatch[1].toLowerCase()];
        const d = parseInt(singleMatch[2], 10);
        if (m !== undefined) {
            return {
                start: new Date(year, m, d, 0, 0, 0),
                end: new Date(year, m, d, 23, 59, 59),
                isRange: false
            };
        }
    }

    return null;
}

function classifyAcademicDate(dateStr, semesterTitle) {
    if (!dateStr) return { status: 'tbd', label: 'TBD', cls: 'bg-white/5 text-gray-500 border-white/10', pulse: false, diffDays: 999 };

    let defaultYear = new Date().getFullYear();
    const yrMatch = String(semesterTitle || '').match(/\b(20\d\d)\b/);
    if (yrMatch) defaultYear = parseInt(yrMatch[1], 10);

    const range = parseDateRangeRobust(dateStr, defaultYear);
    if (!range) return { status: 'scheduled', label: 'Scheduled', cls: 'bg-white/10 text-gray-300 border-white/20', pulse: false, diffDays: 999 };

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).getTime();
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).getTime();

    // 1. Ongoing / Active Now (today is within range)
    if (todayEnd >= range.start.getTime() && todayStart <= range.end.getTime()) {
        return {
            status: 'ongoing',
            label: 'Active Now',
            cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
            pulse: true,
            diffDays: 0,
            range
        };
    }

    // 2. Future / Upcoming (range.start is after today)
    if (range.start.getTime() > todayEnd) {
        const diffMs = range.start.getTime() - todayStart;
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

        let label = `In ${diffDays} days`;
        let cls = 'bg-white/10 text-gray-300 border-white/20';
        if (diffDays === 0) {
            label = 'Today';
            cls = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
        } else if (diffDays === 1) {
            label = 'Tomorrow';
            cls = 'bg-sky-500/20 text-sky-300 border-sky-500/30';
        } else if (diffDays <= 7) {
            label = `In ${diffDays} days`;
            cls = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
        } else if (diffDays <= 30) {
            const w = Math.ceil(diffDays / 7);
            label = `In ${w} wk${w > 1 ? 's' : ''}`;
            cls = 'bg-purple-500/20 text-purple-300 border-purple-500/30';
        }

        return {
            status: 'upcoming',
            label,
            cls,
            pulse: false,
            diffDays,
            range
        };
    }

    // 3. Concluded / Past (range.end is before today)
    return {
        status: 'concluded',
        label: 'Concluded',
        cls: 'bg-white/5 text-gray-500 border-white/10',
        pulse: false,
        diffDays: -1,
        range
    };
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
    if (!listEl) return;

    if (!Array.isArray(events) || events.length === 0) {
        listEl.innerHTML = `
            <div class="event-item-card p-4 text-center">
                <div class="text-xs font-semibold text-gray-300">No events found</div>
                <div class="text-[10px] text-gray-500 mt-0.5">Academic calendar schedule will appear here.</div>
            </div>
        `;
        return;
    }

    const parsed = events.map(e => ({
        ...e,
        classification: classifyAcademicDate(e.date, semesterTitle)
    }));

    // Filter strictly for active ongoing and upcoming events (exclude concluded past dates)
    const relevantEvents = parsed.filter(e => e.classification.status === 'ongoing' || e.classification.status === 'upcoming');

    // Sort: ongoing periods first, then nearest upcoming events by diffDays
    relevantEvents.sort((a, b) => {
        if (a.classification.status === 'ongoing' && b.classification.status !== 'ongoing') return -1;
        if (b.classification.status === 'ongoing' && a.classification.status !== 'ongoing') return 1;
        return a.classification.diffDays - b.classification.diffDays;
    });

    const displayList = relevantEvents.slice(0, 4);

    if (displayList.length === 0) {
        // Genuinely inform the student if all events in current calendar have ended, rather than showing confusing ancient events
        listEl.innerHTML = `
            <div class="event-item-card p-4 text-center">
                <div class="text-xs font-semibold text-gray-300">No upcoming events scheduled</div>
                <div class="text-[10px] text-gray-500 mt-1">All events for the current term have concluded. Check official calendar for upcoming schedules.</div>
            </div>
        `;
    } else {
        listEl.innerHTML = displayList.map(e => {
            const cat = getCategoryPill(e.category);
            const dateMatch = (e.date || '').replace(/\./g, '').match(/([a-zA-Z]+)\s*(\d+)/);
            const monthShort = dateMatch ? dateMatch[1].slice(0, 3).toUpperCase() : 'DATE';
            const dayNum = dateMatch ? dateMatch[2] : '';
            const cl = e.classification;

            return `
                <div class="event-item-card p-3 sm:p-3.5 flex items-start justify-between gap-3 min-h-[64px]">
                    <div class="flex items-start gap-3 min-w-0 flex-1">
                        <div class="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] flex flex-col items-center justify-center flex-shrink-0 text-center leading-none mt-0.5 shadow-sm">
                            <span class="text-[9px] font-mono uppercase text-[#D86C5A] font-bold tracking-wider">${esc(monthShort)}</span>
                            <span class="text-xs sm:text-sm font-extrabold text-white mt-0.5">${esc(dayNum)}</span>
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="event-title text-xs sm:text-sm font-semibold text-gray-100 leading-snug break-words whitespace-normal">${esc(e.event)}</div>
                            <div class="flex items-center gap-1.5 sm:gap-2 mt-1 text-[10px] sm:text-[11px] text-gray-400 flex-wrap leading-tight">
                                <span class="text-gray-300 font-medium">${esc(e.date)}</span>
                                <span class="text-gray-600">•</span>
                                <span>${esc(e.day)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex flex-col items-end gap-1.5 flex-shrink-0 pt-0.5">
                        <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${cl.cls} ${cl.pulse ? 'animate-pulse' : ''}">
                            ${cl.label}
                        </span>
                        <span class="text-[9px] font-medium px-1.5 py-0.5 rounded border ${cat.cls} hidden sm:inline-block whitespace-nowrap">
                            ${cat.label}
                        </span>
                    </div>
                </div>
            `;
        }).join('');
    }

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
            const cl = e.classification || classifyAcademicDate(e.date);
            return `
                <div class="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] transition-colors flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 mb-1 flex-wrap">
                            <span class="text-[10px] font-semibold px-2 py-0.5 rounded border ${cat.cls}">
                                ${cat.label}
                            </span>
                            <span class="text-[10px] font-mono text-gray-400">${esc(e.day)}</span>
                        </div>
                        <h4 class="text-xs sm:text-sm font-semibold text-white leading-snug break-words whitespace-normal">${esc(e.event)}</h4>
                    </div>
                    <div class="text-right flex-shrink-0">
                        <div class="text-xs font-mono font-medium text-gray-200">${esc(e.date)}</div>
                        <span class="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cl.cls} ${cl.pulse ? 'animate-pulse' : ''}">
                            ${cl.label}
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
                // Check if cached events are relevant to current year/semester
                const activeParsed = data.events.map(e => classifyAcademicDate(e.date, data.semester));
                const hasUpcoming = activeParsed.some(c => c.status === 'ongoing' || c.status === 'upcoming');
                if (hasUpcoming) {
                    allAcademicEvents = data.events;
                    if (badgeEl && data.semester) badgeEl.textContent = data.semester;
                    renderUpcomingEventsList(data.events, data.semester);
                }
            }
        }
    } catch (e) { }

    try {
        let apiUrl = `${API_BASE_URL}/api/academic-calendar`;
        if (currentSemesterGlobal && currentSemesterGlobal.SemesterName) {
            apiUrl += `?semester=${encodeURIComponent(currentSemesterGlobal.SemesterName)}`;
        }
        const res = await fetch(apiUrl);
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
        const authHeaders = (typeof window.getAuthHeaders === 'function')
            ? window.getAuthHeaders()
            : {};
        const response = await fetch(`${API_BASE_URL}/api/auth/status`, {
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                ...authHeaders
            }
        });

        if (!response.ok && response.status !== 401 && response.status !== 403) {
            console.warn('Auth status endpoint returned non-OK status:', response.status);
            // If student ID is stored, treat as logged in temporarily during gateway latency
            if (getStoredStudentId()) {
                updateStudentIdDisplay(getStoredStudentId());
                fetchStudentAcademicData();
                return true;
            }
        }

        const data = await response.json();
        if (!data || !data.loggedIn) {
            try {
                localStorage.removeItem('ewu_session_id');
                sessionStorage.removeItem('ewu_session_id');
            } catch (e) {}
            window.location.href = 'login?expired=1';
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
        console.warn('Auth status check network error:', error);
        if (getStoredStudentId()) {
            updateStudentIdDisplay(getStoredStudentId());
            fetchStudentAcademicData();
            return true;
        }
        try {
            localStorage.removeItem('ewu_session_id');
            sessionStorage.removeItem('ewu_session_id');
        } catch (e) {}
        window.location.href = 'login?expired=1';
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
        localStorage.removeItem('ewu_session_id');
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
        <div class="fade-in feature-tile-card" style="position:relative;background:linear-gradient(145deg, rgba(22,22,32,0.8) 0%, rgba(14,14,20,0.9) 100%);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border:1px solid ${theme.border};box-shadow:0 10px 30px rgba(0,0,0,0.4);display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;">
            <div class="feature-tile-bar" style="position:absolute;top:0;left:0;right:0;background:${theme.btn};"></div>
            
            <div class="p-3.5 sm:p-4 md:p-6 lg:p-7">
                <!-- Mobile row / Desktop header -->
                <div class="flex items-center md:items-start justify-between gap-3 md:gap-3 mb-1.5 md:mb-4">
                    <div class="feature-tile-icon" style="background:${theme.bg};border:1px solid ${theme.border};display:flex;align-items:center;justify-content:center;color:${theme.accent};flex-shrink:0;">
                        ${f.icon}
                    </div>

                    <!-- Content block on mobile (<md) -->
                    <div class="flex-1 min-w-0 md:hidden">
                        <div class="flex items-center justify-between gap-2">
                            <h3 class="text-sm sm:text-base font-bold text-white tracking-tight truncate">${esc(f.name)}</h3>
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold flex-shrink-0 ${pill.cls}">
                                <span class="w-1.5 h-1.5 rounded-full ${pill.dot}"></span>
                                <span>${isBeta ? 'Beta' : 'Live'}</span>
                            </span>
                        </div>
                        <p class="text-[11.5px] text-gray-400 line-clamp-1 mt-0.5 leading-snug">${esc(f.description)}</p>
                    </div>

                    <!-- Right chevron button on mobile -->
                    <div class="md:hidden flex-shrink-0">
                        <div class="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center transition-colors" style="color:${theme.accent};">
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </div>
                    </div>

                    <!-- Desktop Status Pill (hidden on mobile) -->
                    <span class="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${pill.cls}">
                        <span class="w-1.5 h-1.5 rounded-full ${pill.dot}"></span>
                        <span>${pill.label}</span>
                    </span>
                </div>

                <!-- Desktop Title & Description (hidden on mobile) -->
                <div class="hidden md:block">
                    <h3 class="text-lg lg:text-xl font-bold text-white mb-2">${esc(f.name)}</h3>
                    <p class="text-gray-300 text-xs sm:text-sm leading-relaxed mb-6">${esc(f.description)}</p>
                </div>
            </div>

            <!-- Desktop Action Button Footer (hidden on mobile) -->
            <div class="hidden md:block feature-tile-footer px-6 sm:px-7 pb-6 sm:pb-7 pt-0">
                <a href="${f.page}" class="no-underline ajax-nav-link feature-tile-btn" style="background:${theme.btn};color:#fff;box-shadow:0 4px 18px ${theme.glow};">
                    <span>${isBeta ? 'Open (Beta)' : 'Open'}</span>
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </a>
            </div>

            <!-- Full-card clickable anchor for mobile touch accessibility -->
            <a href="${f.page}" class="mobile-card-link md:hidden absolute inset-0 z-10 ajax-nav-link opacity-0" aria-label="Open ${esc(f.name)}"></a>
        </div>`;
}

function lockedCardHtml(key, status) {
    const f = getFeatureMeta(key);
    const pill = STATUS_PILL[status] || STATUS_PILL.coming_soon;
    return `
        <div class="feature-locked-card" style="position:relative;background:linear-gradient(145deg, rgba(16,16,24,0.5) 0%, rgba(10,10,16,0.65) 100%);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;">
            <div class="p-3.5 sm:p-4 md:p-5 lg:p-6">
                <div class="flex items-center md:items-start justify-between gap-3 md:gap-3 mb-1 md:mb-4">
                    <div class="feature-locked-icon" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.45);flex-shrink:0;">
                        ${f.icon}
                    </div>

                    <!-- Content block on mobile (<md) -->
                    <div class="flex-1 min-w-0 md:hidden">
                        <div class="flex items-center justify-between gap-2">
                            <h3 class="text-sm sm:text-base font-bold text-gray-200 tracking-tight truncate">${esc(f.name)}</h3>
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium flex-shrink-0 ${pill.cls}">
                                <svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                <span>${pill.label}</span>
                            </span>
                        </div>
                        <p class="text-[11.5px] text-gray-500 line-clamp-1 mt-0.5 leading-snug">${esc(f.description)}</p>
                    </div>

                    <!-- Desktop Status Pill (hidden on mobile) -->
                    <span class="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${pill.cls}">
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        ${pill.label}
                    </span>
                </div>

                <!-- Desktop Title & Description (hidden on mobile) -->
                <div class="hidden md:block">
                    <h3 class="text-base font-bold text-gray-200 mb-1.5">${esc(f.name)}</h3>
                    <p class="text-gray-400 text-xs leading-relaxed">${esc(f.description)}</p>
                </div>
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

        // Ensure a Back to Dashboard button is always present at the top of the rendered subpage
        if (!pageView.querySelector('a[href="dashboard"], a[href="/dashboard"], [data-back-dashboard]')) {
            const topBar = document.createElement('div');
            topBar.className = 'mb-4 sm:mb-5';
            topBar.innerHTML = `
                <a href="dashboard" class="inline-flex items-center gap-2 px-3.5 py-2 sm:py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.16] text-xs font-medium text-gray-300 hover:text-white transition-all group no-underline shadow-sm cursor-pointer" title="Return to Dashboard">
                    <svg class="w-3.5 h-3.5 text-[#D86C5A] group-hover:-translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    <span>Back to Dashboard</span>
                </a>
            `;
            pageView.insertBefore(topBar, pageView.firstChild);
        }

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

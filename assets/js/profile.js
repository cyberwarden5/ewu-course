// ========================================
// Student Profile Page Logic
// Fetches official student profile from EWU portal via worker proxy
// ========================================

(() => {
    const API_BASE_URL = window.API_BASE_URL || 'https://api.aftabkabir.me';

    function cleanStr(s) {
        if (s == null) return '';
        return String(s).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function formatDate(dStr) {
        if (!dStr) return '--';
        try {
            const d = new Date(dStr);
            if (isNaN(d.getTime())) return cleanStr(dStr);
            return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) {
            return cleanStr(dStr);
        }
    }

    function copyToClipboard(text, msg) {
        if (!text || text === '--') return;
        navigator.clipboard.writeText(text).then(() => {
            showToast(msg || 'Copied to clipboard');
        }).catch(() => {
            showToast('Unable to copy', true);
        });
    }
    window.copyToClipboard = copyToClipboard;

    function showToast(msg, isError = false) {
        const toast = document.getElementById('profileToast');
        const toastText = document.getElementById('profileToastText');
        const toastIcon = document.getElementById('profileToastIcon');
        if (!toast || !toastText) return;

        toastText.textContent = msg;
        if (toastIcon) {
            toastIcon.textContent = isError ? '✕' : '✓';
            toastIcon.className = isError ? 'text-red-400' : 'text-emerald-400';
        }

        toast.classList.remove('translate-y-20', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');

        setTimeout(() => {
            toast.classList.remove('translate-y-0', 'opacity-100');
            toast.classList.add('translate-y-20', 'opacity-0');
        }, 2500);
    }

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
        } catch (e) {}
        window.location.href = 'login.html';
    }
    window.handleLogout = handleLogout;

    async function fetchProfile() {
        const loadingEl = document.getElementById('profileLoading');
        const errorEl = document.getElementById('profileError');
        const contentEl = document.getElementById('profileContent');

        if (loadingEl) loadingEl.classList.remove('hidden');
        if (errorEl) errorEl.classList.add('hidden');
        if (contentEl) contentEl.classList.add('hidden');

        try {
            const res = await fetch(`${API_BASE_URL}/api/profile`, { credentials: 'include' });
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
                throw new Error(json?.message || 'Empty or invalid profile data received');
            }

            renderProfile(data);

            if (loadingEl) loadingEl.classList.add('hidden');
            if (contentEl) contentEl.classList.remove('hidden');
        } catch (err) {
            console.error('Profile fetch error:', err);
            if (loadingEl) loadingEl.classList.add('hidden');
            if (errorEl) {
                errorEl.classList.remove('hidden');
                const msgEl = document.getElementById('profileErrorMsg');
                if (msgEl) msgEl.textContent = err.message || 'Unable to load student profile';
            }
        }
    }
    window.fetchProfile = fetchProfile;

    function renderProfile(data) {
        const studentId = cleanStr(data.StudentId) || 'Student';
        const fullName = [cleanStr(data.FirstName), cleanStr(data.MiddleName), cleanStr(data.LastName)].filter(Boolean).join(' ') || studentId;

        try {
            localStorage.setItem('studentId', studentId);
            localStorage.setItem('studentName', fullName);
        } catch (e) {}

        const nameEl = document.getElementById('studentFullName');
        const idEl = document.getElementById('studentIdText');
        const deptEl = document.getElementById('studentDepartment');
        if (nameEl) nameEl.textContent = fullName;
        if (idEl) idEl.textContent = studentId;
        if (deptEl) deptEl.textContent = cleanStr(data.AcademicDepartmentName) || cleanStr(data.ProgramName) || 'Department of CSE';

        const standingBadge = document.getElementById('studentStandingBadge');
        if (standingBadge) {
            const prob = String(data.ProbationNumber || '0');
            if (prob === '0') {
                standingBadge.textContent = 'Good Standing';
                standingBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300';
            } else {
                standingBadge.textContent = `Probation (${prob})`;
                standingBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 border border-rose-500/30 text-rose-300';
            }
        }

        const photoEl = document.getElementById('studentPhoto');
        const avatarFallback = document.getElementById('studentAvatarFallback');
        if (data.ProfilePictureUrl) {
            const photoUrl = `${API_BASE_URL}/api/profile/photo?url=${encodeURIComponent(data.ProfilePictureUrl)}`;
            photoEl.src = photoUrl;
            photoEl.onload = () => {
                photoEl.classList.remove('hidden');
                if (avatarFallback) avatarFallback.classList.add('hidden');
            };
            photoEl.onerror = () => {
                photoEl.classList.add('hidden');
                if (avatarFallback) avatarFallback.classList.remove('hidden');
            };
        } else {
            if (photoEl) photoEl.classList.add('hidden');
            if (avatarFallback) avatarFallback.classList.remove('hidden');
        }

        const cgpa = (data.CGPA != null && !isNaN(data.CGPA)) ? Number(data.CGPA).toFixed(2) : '--';
        const credits = data.CreditsCompleted != null ? data.CreditsCompleted : (data.CrEarned || '--');
        const semester = cleanStr(data.SemesterName) || '--';
        const year = data.Year ? String(data.Year) : '';

        const statCgpa = document.getElementById('statCgpa');
        const statCgpaLabel = document.getElementById('statCgpaLabel');
        const statCredits = document.getElementById('statCredits');
        const statSemester = document.getElementById('statSemester');
        const statYear = document.getElementById('statYear');

        if (statCgpa) statCgpa.textContent = cgpa;
        if (statCredits) statCredits.textContent = credits;
        if (statSemester) statSemester.textContent = semester;
        if (statYear && year) statYear.textContent = `Academic Year ${year}`;

        if (statCgpaLabel && cgpa !== '--') {
            const numCgpa = parseFloat(cgpa);
            if (numCgpa >= 3.8) statCgpaLabel.textContent = 'Excellent Standing';
            else if (numCgpa >= 3.5) statCgpaLabel.textContent = 'Very Good Standing';
            else if (numCgpa >= 3.0) statCgpaLabel.textContent = 'Good Standing';
            else statCgpaLabel.textContent = 'Scale 4.00';
        }

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val || '--';
        };

        setTxt('infoProgramName', cleanStr(data.ProgramName));
        setTxt('infoDepartmentName', cleanStr(data.AcademicDepartmentName));
        setTxt('infoProgramShort', cleanStr(data.ProgramShortName));
        setTxt('infoStartedSemester', cleanStr(data.StartedSemester));
        setTxt('infoDateOfEnrollment', formatDate(data.DateOfEnrollment));
        setTxt('infoMentorName', cleanStr(data.Mentor));
        setTxt('infoUniqueId', cleanStr(data.UniqueId));

        const mentorEmailEl = document.getElementById('infoMentorEmail');
        if (mentorEmailEl) {
            const mEmail = cleanStr(data.MentorEmail);
            if (mEmail) {
                mentorEmailEl.textContent = mEmail;
                mentorEmailEl.href = `mailto:${mEmail}`;
            } else {
                mentorEmailEl.textContent = '';
                mentorEmailEl.removeAttribute('href');
            }
        }

        setTxt('infoDob', formatDate(data.DateofBirth));
        setTxt('infoGender', cleanStr(data.Gender));
        setTxt('infoBloodGroup', cleanStr(data.BloodGroup));
        setTxt('infoReligion', cleanStr(data.Religion));
        setTxt('infoMaritalStatus', cleanStr(data.MaritalStatus));
        setTxt('infoNid', cleanStr(data.NationalId || data.NID));

        setTxt('infoEmail', cleanStr(data.EmailAddress));
        const rawMobile = cleanStr(data.MobileNo);
        const formattedMobile = rawMobile ? (rawMobile.startsWith('0') ? rawMobile : `0${rawMobile}`) : '--';
        setTxt('infoPhone', formattedMobile);
        setTxt('infoPresentAddress', cleanStr(data.PresentAddress));
        setTxt('infoPermanentAddress', cleanStr(data.PermanentAddress));
    }

    function initProfilePage() {
        const backBtn = document.getElementById('backToDashBtn');
        if (backBtn) {
            backBtn.onclick = (e) => {
                if (window.history.length > 1 && document.referrer.includes('dashboard')) {
                    e.preventDefault();
                    window.history.back();
                }
            };
        }
        fetchProfile();
    }
    window.initProfilePage = initProfilePage;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProfilePage);
    } else {
        initProfilePage();
    }
})();

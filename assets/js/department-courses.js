// ========================================
// Department-Wise Course Fetch Logic
// Main Website Integration with Intelligent Retry
// ========================================

const API_BASE_URL = 'https://api.aftabkabir.me';
const retryHandler = new RetryHandler();

// Application State
let availableDepartments = [];
let availableSemesters = [];
let selectedSemesterId = '';
let selectedSemesterName = '';
let loadedDeptIds = new Set();
let allCourses = [];
let filteredCourses = [];
let currentPage = 1;
let pageSize = 50;
let searchQuery = '';
let availableOnly = false;
let sortOption = 'code_asc';
let currentUserId = 'Student';

// Day codes mapping
const dayMapping = {
    'A': 'Sat',
    'S': 'Sun',
    'M': 'Mon',
    'T': 'Tue',
    'W': 'Wed',
    'R': 'Thu',
    'F': 'Fri'
};

// Parse schedule into days and time
function parseSchedule(schedule) {
    if (!schedule || schedule === 'N/A' || schedule.trim() === '') {
        return { days: 'TBA', time: 'TBA' };
    }

    const parts = schedule.trim().split(/\s+/);
    if (parts.length === 0) return { days: 'TBA', time: 'TBA' };

    const dayCodesStr = parts[0];
    const isDayCode = /^[ASMTWRF]+$/i.test(dayCodesStr);

    if (isDayCode) {
        const dayNames = dayCodesStr.toUpperCase().split('')
            .map(code => dayMapping[code] || code)
            .filter(Boolean);
        const days = dayNames.length > 0 ? dayNames.join(', ') : 'TBA';
        const time = parts.slice(1).join(' ') || 'TBA';
        return { days, time };
    }

    return { days: 'TBA', time: schedule };
}

// Clean department name
function cleanDepartmentName(name) {
    if (!name) return 'Department';
    return name.replace(/^Department of\s+/i, '').trim();
}

// Bangladesh Standard Time update
function updateBDTime() {
    const now = new Date();
    const options = {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    };
    const bdTime = now.toLocaleString('en-US', options);

    const desktopEl = document.getElementById('currentTime');
    const mobileEl = document.getElementById('currentTimeMobile');

    if (desktopEl) desktopEl.textContent = bdTime;
    if (mobileEl) mobileEl.textContent = bdTime;
}

// Show alert banner
function showAlert(message, type = 'error') {
    const alertBox = document.getElementById('alertBox');
    const alertIcon = document.getElementById('alertIcon');
    const alertMessage = document.getElementById('alertMessage');

    if (!alertBox || !alertMessage) return;

    alertBox.className = 'mb-6 p-4 rounded-xl border transition-all text-sm flex items-center gap-3 ';

    if (type === 'error') {
        alertBox.classList.add('bg-red-500/10', 'border-red-500/30', 'text-red-300');
        if (alertIcon) alertIcon.innerHTML = '<svg class="w-5 h-5 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else if (type === 'success') {
        alertBox.classList.add('bg-emerald-500/10', 'border-emerald-500/30', 'text-emerald-300');
        if (alertIcon) alertIcon.innerHTML = '<svg class="w-5 h-5 text-emerald-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else {
        alertBox.classList.add('bg-[#5a8fd8]/10', 'border-[#5a8fd8]/30', 'text-blue-300');
        if (alertIcon) alertIcon.innerHTML = '<svg class="w-5 h-5 text-[#5a8fd8] flex-shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>';
    }

    alertMessage.textContent = message;
    alertBox.classList.remove('hidden');
}

function hideAlert() {
    const alertBox = document.getElementById('alertBox');
    if (alertBox) alertBox.classList.add('hidden');
}

// Session authentication check
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/status`, {
            credentials: 'include'
        });

        const data = await response.json();

        if (!data || !data.loggedIn) {
            window.location.href = 'login.html';
            return false;
        }

        if (data.userId) {
            currentUserId = data.userId;
            const uId = document.getElementById('userId');
            const uIdMob = document.getElementById('userIdMobile');
            if (uId) uId.textContent = data.userId;
            if (uIdMob) uIdMob.textContent = data.userId;
        }

        return true;
    } catch (error) {
        console.warn('Auth check error:', error);
        window.location.href = 'login.html';
        return false;
    }
}

// Logout handler
async function handleLogout(event) {
    if (event) event.preventDefault();

    try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (e) {}

    try {
        localStorage.removeItem('studentId');
        localStorage.removeItem('ewu_student_id');
        sessionStorage.clear();
        sessionStorage.setItem('ewu_just_logged_out', 'true');
    } catch (e) {}

    window.location.href = 'login.html';
}
window.handleLogout = handleLogout;

// Load department and semester options
async function loadInitialOptions() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/options`, {
            credentials: 'include'
        });

        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }

        const data = await response.json();

        if (data.status === 'success') {
            availableDepartments = data.departments || [];
            availableSemesters = data.semesters || [];

            renderDepartmentList(availableDepartments);
            renderSemesterDropdown(availableSemesters);
        } else {
            showAlert(data.message || 'Failed to load department options from portal.', 'error');
        }
    } catch (error) {
        console.error('Failed to load initial options:', error);
        showAlert('Could not reach portal API. Retrying...', 'info');
    }
}

// Render department checkboxes in selection card
function renderDepartmentList(departments) {
    const listContainer = document.getElementById('deptCheckboxList');
    const selectAll = document.getElementById('selectAllDepts');
    const badge = document.getElementById('deptCountBadge');
    const fetchBtn = document.getElementById('btnFetchCourses');

    if (!listContainer) return;

    if (!departments || departments.length === 0) {
        listContainer.innerHTML = '<div class="text-center py-6 text-xs text-gray-500">No departments available</div>';
        return;
    }

    listContainer.innerHTML = '';

    departments.forEach(dept => {
        const label = document.createElement('label');
        label.className = 'dept-row flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.05] cursor-pointer text-xs text-gray-200 transition-colors select-none';
        label.dataset.name = cleanDepartmentName(dept.AcademicDepartmentName).toLowerCase();

        const cleanName = cleanDepartmentName(dept.AcademicDepartmentName);

        label.innerHTML = `
            <span class="truncate pr-2">${cleanName}</span>
            <input type="checkbox" class="dept-checkbox w-4 h-4 accent-[#5a8fd8] rounded cursor-pointer flex-shrink-0" value="${dept.AcademicDepartmentId}" data-name="${cleanName}" checked>
        `;

        listContainer.appendChild(label);
    });

    function updateBadge() {
        const total = document.querySelectorAll('.dept-checkbox').length;
        const checked = document.querySelectorAll('.dept-checkbox:checked').length;
        if (badge) badge.textContent = `${checked} of ${total} selected`;

        const semSelect = document.getElementById('semesterSelect');
        const hasSem = semSelect && semSelect.value;
        if (fetchBtn) {
            fetchBtn.disabled = !(checked > 0 && hasSem);
        }

        if (selectAll) {
            selectAll.checked = (checked === total && total > 0);
            selectAll.indeterminate = (checked > 0 && checked < total);
        }
    }

    // Bind change listeners
    document.querySelectorAll('.dept-checkbox').forEach(cb => {
        cb.addEventListener('change', updateBadge);
    });

    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('.dept-checkbox').forEach(cb => {
                // only toggle visible rows if filtered
                const row = cb.closest('.dept-row');
                if (!row || row.style.display !== 'none') {
                    cb.checked = isChecked;
                }
            });
            updateBadge();
        });
    }

    // Department search filter inside selection
    const deptSearchInput = document.getElementById('deptSearchInput');
    if (deptSearchInput) {
        deptSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            document.querySelectorAll('.dept-row').forEach(row => {
                const name = row.dataset.name || '';
                row.style.display = name.includes(query) ? 'flex' : 'none';
            });
        });
    }

    updateBadge();
}

// Render semester dropdown
function renderSemesterDropdown(semesters) {
    const select = document.getElementById('semesterSelect');
    const fetchBtn = document.getElementById('btnFetchCourses');
    if (!select) return;

    select.innerHTML = '<option value="">-- Choose a Semester --</option>';

    if (semesters && semesters.length > 0) {
        semesters.forEach(sem => {
            const opt = document.createElement('option');
            opt.value = sem.SemesterId;
            opt.textContent = sem.SemesterName;
            select.appendChild(opt);
        });

        select.disabled = false;
        // Select first active semester by default
        if (semesters.length > 0) {
            select.selectedIndex = 1;
            selectedSemesterId = select.value;
            selectedSemesterName = select.options[select.selectedIndex]?.text || '';
        }
    }

    select.addEventListener('change', () => {
        selectedSemesterId = select.value;
        selectedSemesterName = select.options[select.selectedIndex]?.text || '';
        const checkedCount = document.querySelectorAll('.dept-checkbox:checked').length;
        if (fetchBtn) {
            fetchBtn.disabled = !(checkedCount > 0 && selectedSemesterId);
        }
    });

    const checkedCount = document.querySelectorAll('.dept-checkbox:checked').length;
    if (fetchBtn) {
        fetchBtn.disabled = !(checkedCount > 0 && selectedSemesterId);
    }
}

// Fetch single department courses with retry
async function fetchDepartmentCourses(departmentId, semesterId) {
    const response = await fetch(`${API_BASE_URL}/api/department-courses`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: JSON.stringify({
            departmentId: departmentId,
            semesterId: semesterId
        })
    });

    if (response.status === 401) {
        return {
            status: 'invalid_credentials',
            message: 'Session expired. Please log in again.'
        };
    }

    const data = await response.json();

    if (data.status === 'error' || data.error) {
        throw new Error(data.message || data.error || 'Failed to fetch department courses');
    }

    return {
        status: 'success',
        courses: data.courses || []
    };
}

// Sequential department fetch queue
async function startDepartmentFetchQueue(selectedDepts, semesterId) {
    const spinner = document.getElementById('fetchBtnSpinner');
    const btnText = document.getElementById('fetchBtnText');
    const fetchBtn = document.getElementById('btnFetchCourses');
    const tbody = document.getElementById('coursesTableBody');

    if (spinner) spinner.classList.remove('hidden');
    if (btnText) btnText.textContent = 'Fetching Courses...';
    if (fetchBtn) fetchBtn.disabled = true;

    hideAlert();

    for (let i = 0; i < selectedDepts.length; i++) {
        const dept = selectedDepts[i];
        if (loadedDeptIds.has(String(dept.id))) continue;

        showAlert(`Fetching courses for ${dept.name} (${i + 1}/${selectedDepts.length})...`, 'info');

        try {
            await retryHandler.executeWithRetry(
                () => fetchDepartmentCourses(dept.id, semesterId),
                {
                    operationName: `Fetching ${dept.name}`,
                    retryDelay: 1000,
                    onSuccess: (result) => {
                        const courses = result.courses || [];
                        courses.forEach(c => {
                            c.departmentId = dept.id;
                            c.departmentName = dept.name;
                            // avoid duplicate by routineId or coursecode+section
                            const key = `${c.CourseCode}_${c.Section}_${c.TimeSlotName}`;
                            if (!allCourses.some(existing => `${existing.CourseCode}_${existing.Section}_${existing.TimeSlotName}` === key)) {
                                allCourses.push(c);
                            }
                        });
                        loadedDeptIds.add(String(dept.id));
                        updateLoadedDeptBadge();
                        applyFiltersAndRender();
                    },
                    onInvalidCredentials: (result) => {
                        showAlert(result.message || 'Session expired. Redirecting to login...', 'error');
                        setTimeout(() => window.location.href = 'login.html', 1500);
                    },
                    onRetryAttempt: (attemptNum, elapsed, reason) => {
                        showAlert(`Portal busy while fetching ${dept.name}. Auto retrying (Attempt ${attemptNum + 1})...`, 'info');
                    }
                }
            );
        } catch (error) {
            console.error(`Error fetching department ${dept.name}:`, error);
        }
    }

    if (spinner) spinner.classList.add('hidden');
    if (btnText) btnText.textContent = 'Fetch Offered Courses';
    if (fetchBtn) fetchBtn.disabled = false;

    showAlert(`Successfully loaded courses from ${loadedDeptIds.size} departments.`, 'success');
    setTimeout(hideAlert, 4000);
}

// Initial Fetch Trigger
function handleFetchInitial() {
    const checkboxes = Array.from(document.querySelectorAll('.dept-checkbox:checked'));
    if (checkboxes.length === 0) {
        showAlert('Please select at least one department', 'error');
        return;
    }
    if (!selectedSemesterId) {
        showAlert('Please choose an academic semester', 'error');
        return;
    }

    const selectedDepts = checkboxes.map(cb => ({
        id: cb.value,
        name: cb.dataset.name
    }));

    // Switch view
    document.getElementById('selectionSection').classList.add('hidden');
    document.getElementById('coursesExplorerSection').classList.remove('hidden');
    document.getElementById('btnChangeSelection').classList.remove('hidden');

    const semDisplay = document.getElementById('semesterNameDisplay');
    if (semDisplay) semDisplay.textContent = selectedSemesterName || 'Semester';

    // Reset courses
    allCourses = [];
    loadedDeptIds = new Set();
    currentPage = 1;

    renderDynamicDeptPills();
    startDepartmentFetchQueue(selectedDepts, selectedSemesterId);
}

// Dynamic Department Management Pills
function renderDynamicDeptPills() {
    const container = document.getElementById('dynamicDeptPills');
    const selectAll = document.getElementById('dynamicSelectAll');
    if (!container) return;

    container.innerHTML = '';

    availableDepartments.forEach(dept => {
        const cleanName = cleanDepartmentName(dept.AcademicDepartmentName);
        const isLoaded = loadedDeptIds.has(String(dept.AcademicDepartmentId));

        const pill = document.createElement('label');
        pill.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs cursor-pointer select-none border transition-all ' + 
            (isLoaded ? 'bg-[#5a8fd8]/15 border-[#5a8fd8]/30 text-white' : 'bg-white/[0.03] border-white/[0.08] text-gray-400 hover:text-white');

        pill.innerHTML = `
            <input type="checkbox" class="dynamic-dept-cb w-3 h-3 accent-[#5a8fd8] rounded cursor-pointer" value="${dept.AcademicDepartmentId}" data-name="${cleanName}" ${isLoaded ? 'checked' : ''}>
            <span>${cleanName}</span>
        `;

        pill.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) {
                pill.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs cursor-pointer select-none border transition-all bg-[#5a8fd8]/15 border-[#5a8fd8]/30 text-white';
            } else {
                pill.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs cursor-pointer select-none border transition-all bg-white/[0.03] border-white/[0.08] text-gray-400 hover:text-white';
            }
        });

        container.appendChild(pill);
    });

    if (selectAll) {
        selectAll.checked = Array.from(document.querySelectorAll('.dynamic-dept-cb')).every(c => c.checked);
        selectAll.addEventListener('change', (e) => {
            const checked = e.target.checked;
            document.querySelectorAll('.dynamic-dept-cb').forEach(c => {
                c.checked = checked;
                c.dispatchEvent(new Event('change'));
            });
        });
    }

    updateLoadedDeptBadge();
}

function updateLoadedDeptBadge() {
    const badge = document.getElementById('loadedDeptBadge');
    if (badge) badge.textContent = `${loadedDeptIds.size} departments loaded`;
}

// Apply Dynamic Department changes
function handleApplyDeptChanges() {
    const checkedBoxes = Array.from(document.querySelectorAll('.dynamic-dept-cb:checked'));
    const checkedIds = new Set(checkedBoxes.map(c => String(c.value)));

    // Departments to add
    const toAdd = [];
    checkedBoxes.forEach(c => {
        if (!loadedDeptIds.has(String(c.value))) {
            toAdd.push({
                id: c.value,
                name: c.dataset.name
            });
        }
    });

    // Departments removed -> filter out from allCourses
    allCourses = allCourses.filter(c => checkedIds.has(String(c.departmentId)));
    
    // Update loadedDeptIds
    const updatedLoaded = new Set();
    loadedDeptIds.forEach(id => {
        if (checkedIds.has(String(id))) updatedLoaded.add(String(id));
    });
    loadedDeptIds = updatedLoaded;

    updateLoadedDeptBadge();
    applyFiltersAndRender();

    if (toAdd.length > 0) {
        startDepartmentFetchQueue(toAdd, selectedSemesterId);
    }
}

// Filtering, Sorting, and Pagination Rendering
function applyFiltersAndRender() {
    let result = [...allCourses];

    // Filter: Available Seats Only
    if (availableOnly) {
        result = result.filter(c => (c.SeatsLeft || 0) > 0);
    }

    // Filter: Search Query (Code, Title, Faculty, Room)
    if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        result = result.filter(c => {
            const code = (c.CourseCode || '').toLowerCase();
            const faculty = (c.ShortName || '').toLowerCase();
            const section = String(c.Section || c.SectionName || '').toLowerCase();
            const room = (c.RoomName || c.RoomCode || '').toLowerCase();
            const sched = (c.Schedule || c.TimeSlotName || '').toLowerCase();
            return code.includes(q) || faculty.includes(q) || section.includes(q) || room.includes(q) || sched.includes(q);
        });
    }

    // Sort
    if (sortOption === 'code_asc') {
        result.sort((a, b) => (a.CourseCode || '').localeCompare(b.CourseCode || ''));
    } else if (sortOption === 'seats_desc') {
        result.sort((a, b) => (b.SeatsLeft || 0) - (a.SeatsLeft || 0));
    } else if (sortOption === 'name_asc') {
        result.sort((a, b) => (a.CourseCode || '').localeCompare(b.CourseCode || ''));
    } else if (sortOption === 'time_asc') {
        result.sort((a, b) => (a.TimeSlotName || '').localeCompare(b.TimeSlotName || ''));
    }

    filteredCourses = result;

    // Stats updates
    const countFiltered = document.getElementById('countFiltered');
    const countTotal = document.getElementById('countTotal');
    if (countFiltered) countFiltered.textContent = filteredCourses.length;
    if (countTotal) countTotal.textContent = allCourses.length;

    renderTablePage();
    renderPagination();
}

// Render Table Rows
function renderTablePage() {
    const tbody = document.getElementById('coursesTableBody');
    if (!tbody) return;

    if (filteredCourses.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-12 text-gray-400">
                    <svg class="w-10 h-10 mx-auto text-gray-600 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <span>No matching courses found</span>
                </td>
            </tr>
        `;
        return;
    }

    const startIdx = pageSize === 'all' ? 0 : (currentPage - 1) * pageSize;
    const endIdx = pageSize === 'all' ? filteredCourses.length : startIdx + pageSize;
    const pageItems = filteredCourses.slice(startIdx, endIdx);

    let html = '';
    pageItems.forEach(c => {
        const capacity = c.SeatCapacity || 0;
        const taken = c.SeatTaken || 0;
        const left = typeof c.SeatsLeft === 'number' ? c.SeatsLeft : Math.max(0, capacity - taken);

        let badgeClass = 'badge-available';
        let badgeText = `${left} Left`;

        if (left === 0) {
            badgeClass = 'badge-full';
            badgeText = 'Full';
        } else if (left <= 5) {
            badgeClass = 'badge-limited';
            badgeText = `${left} Left`;
        }

        const scheduleInfo = parseSchedule(c.Schedule || c.TimeSlotName);

        html += `
            <tr class="hover:bg-white/[0.03] transition-colors border-b border-white/[0.03]">
                <td class="py-3 px-4 font-bold text-white tracking-wide">
                    <span class="text-[#D86C5A]">${c.CourseCode || 'N/A'}</span>
                </td>
                <td class="py-3 px-3 text-center font-mono font-bold text-gray-300">
                    ${c.Section || c.SectionName || '1'}
                </td>
                <td class="py-3 px-4 text-gray-300 font-medium">
                    ${c.ShortName && c.ShortName !== 'N/A' ? `<span class="px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.08] font-mono text-xs text-[#5a8fd8]">${c.ShortName}</span>` : '<span class="text-gray-500 font-mono text-xs">TBA</span>'}
                </td>
                <td class="py-3 px-3 text-center font-mono text-xs text-gray-400">
                    ${capacity} / <span class="text-gray-200 font-semibold">${taken}</span>
                </td>
                <td class="py-3 px-3 text-center">
                    <span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${badgeClass}">
                        ${badgeText}
                    </span>
                </td>
                <td class="py-3 px-4 text-xs font-medium text-gray-300">
                    ${scheduleInfo.days}
                </td>
                <td class="py-3 px-4 text-xs font-mono text-gray-400">
                    ${scheduleInfo.time}
                </td>
                <td class="py-3 px-3 text-xs font-mono text-gray-300">
                    ${c.RoomName && c.RoomName !== 'N/A' ? c.RoomName : (c.RoomCode || 'TBA')}
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// Render Pagination Controls
function renderPagination() {
    const pageInfo = document.getElementById('pageInfoDisplay');
    const buttonsContainer = document.getElementById('pageNumberButtons');
    const btnFirst = document.getElementById('btnPageFirst');
    const btnPrev = document.getElementById('btnPagePrev');
    const btnNext = document.getElementById('btnPageNext');
    const btnLast = document.getElementById('btnPageLast');

    if (pageSize === 'all') {
        if (pageInfo) pageInfo.textContent = `Showing all ${filteredCourses.length} entries`;
        if (buttonsContainer) buttonsContainer.innerHTML = '';
        if (btnFirst) btnFirst.disabled = true;
        if (btnPrev) btnPrev.disabled = true;
        if (btnNext) btnNext.disabled = true;
        if (btnLast) btnLast.disabled = true;
        return;
    }

    const totalPages = Math.ceil(filteredCourses.length / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

    if (btnFirst) btnFirst.disabled = (currentPage === 1);
    if (btnPrev) btnPrev.disabled = (currentPage === 1);
    if (btnNext) btnNext.disabled = (currentPage === totalPages);
    if (btnLast) btnLast.disabled = (currentPage === totalPages);

    if (buttonsContainer) {
        buttonsContainer.innerHTML = '';
        const maxButtons = 5;
        let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
        let end = Math.min(totalPages, start + maxButtons - 1);
        if (end - start < maxButtons - 1) {
            start = Math.max(1, end - maxButtons + 1);
        }

        for (let i = start; i <= end; i++) {
            const btn = document.createElement('button');
            btn.className = `w-8 h-8 rounded-lg text-xs font-mono font-semibold transition-all ${
                i === currentPage 
                ? 'bg-[#5a8fd8] text-white shadow' 
                : 'bg-white/[0.04] text-gray-300 hover:bg-white/[0.08]'
            }`;
            btn.textContent = i;
            btn.addEventListener('click', () => {
                currentPage = i;
                renderTablePage();
                renderPagination();
            });
            buttonsContainer.appendChild(btn);
        }
    }
}

// Export Table to PDF using jsPDF
function exportCoursesToPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert('PDF generator is initializing. Please try again.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: 'a4'
    });

    const title = `EWU Offered Courses - ${selectedSemesterName || 'Semester'}`;
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text(title, 40, 40);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on ${new Date().toLocaleString()} | Total Courses: ${filteredCourses.length}`, 40, 56);

    const headers = [['Course Code', 'Sec', 'Faculty', 'Capacity', 'Taken', 'Left', 'Days', 'Time', 'Room']];
    const data = filteredCourses.map(c => {
        const capacity = c.SeatCapacity || 0;
        const taken = c.SeatTaken || 0;
        const left = typeof c.SeatsLeft === 'number' ? c.SeatsLeft : Math.max(0, capacity - taken);
        const sched = parseSchedule(c.Schedule || c.TimeSlotName);

        return [
            c.CourseCode || 'N/A',
            c.Section || c.SectionName || '1',
            c.ShortName || 'TBA',
            capacity,
            taken,
            left,
            sched.days,
            sched.time,
            c.RoomName || c.RoomCode || 'TBA'
        ];
    });

    doc.autoTable({
        head: headers,
        body: data,
        startY: 70,
        styles: { fontSize: 8, cellPadding: 5 },
        headStyles: { fillColor: [40, 50, 70], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 250, 252] }
    });

    doc.save(`EWU_Department_Courses_${Date.now()}.pdf`);
}

// Export Table to TXT format
function exportCoursesToTxt() {
    if (!filteredCourses || filteredCourses.length === 0) {
        alert('No courses to export.');
        return;
    }

    let lines = [];
    lines.push('========================================================================================');
    lines.push(`       EAST WEST UNIVERSITY - OFFERED COURSES (${selectedSemesterName || 'Semester'})`);
    lines.push('========================================================================================');
    lines.push(`Generated On : ${new Date().toLocaleString()}`);
    lines.push(`Total Courses: ${filteredCourses.length}`);
    lines.push('========================================================================================\n');
    lines.push('COURSE CODE   SEC  FACULTY   CAP  TAKEN  LEFT  DAYS      TIME SLOT              ROOM');
    lines.push('----------------------------------------------------------------------------------------');

    filteredCourses.forEach(c => {
        const code = (c.CourseCode || 'N/A').padEnd(13);
        const sec = String(c.Section || c.SectionName || '1').padStart(3);
        const fac = (c.ShortName || 'TBA').padEnd(9);
        const cap = String(c.SeatCapacity || 0).padStart(4);
        const taken = String(c.SeatTaken || 0).padStart(6);
        const left = String(typeof c.SeatsLeft === 'number' ? c.SeatsLeft : Math.max(0, (c.SeatCapacity || 0) - (c.SeatTaken || 0))).padStart(5);
        const sched = parseSchedule(c.Schedule || c.TimeSlotName);
        const days = (sched.days || 'TBA').padEnd(9);
        const time = (sched.time || 'TBA').padEnd(22);
        const room = c.RoomName || c.RoomCode || 'TBA';
        lines.push(`${code} ${sec}  ${fac} ${cap} ${taken} ${left}  ${days} ${time} ${room}`);
    });

    const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EWU_Offered_Courses_${(selectedSemesterName || 'Semester').replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    // Dynamic Year
    const yearEl = document.getElementById('dynamicYear');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // Clock
    updateBDTime();
    setInterval(updateBDTime, 1000);

    // Mobile menu toggle
    const mobBtn = document.getElementById('mobileMenuBtn');
    const mobMenu = document.getElementById('mobileMenu');
    if (mobBtn && mobMenu) {
        mobBtn.addEventListener('click', () => mobMenu.classList.toggle('hidden'));
    }

    // Auth verification
    checkAuth();

    // Load departments and semesters
    loadInitialOptions();

    // Bind event listeners
    const fetchBtn = document.getElementById('btnFetchCourses');
    if (fetchBtn) fetchBtn.addEventListener('click', handleFetchInitial);

    const btnChange = document.getElementById('btnChangeSelection');
    if (btnChange) {
        btnChange.addEventListener('click', () => {
            document.getElementById('coursesExplorerSection').classList.add('hidden');
            document.getElementById('selectionSection').classList.remove('hidden');
            btnChange.classList.add('hidden');
        });
    }

    const applyDeptBtn = document.getElementById('btnApplyDeptChanges');
    if (applyDeptBtn) applyDeptBtn.addEventListener('click', handleApplyDeptChanges);

    const searchInput = document.getElementById('courseSearchInput');
    if (searchInput) {
        let timer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                searchQuery = e.target.value;
                currentPage = 1;
                applyFiltersAndRender();
            }, 180);
        });
    }

    const sortFilter = document.getElementById('sortFilter');
    if (sortFilter) {
        sortFilter.addEventListener('change', (e) => {
            sortOption = e.target.value;
            applyFiltersAndRender();
        });
    }

    const pageSizeSelect = document.getElementById('pageSizeSelect');
    if (pageSizeSelect) {
        pageSizeSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            pageSize = val === 'all' ? 'all' : parseInt(val, 10);
            currentPage = 1;
            applyFiltersAndRender();
        });
    }

    const availableToggle = document.getElementById('availableOnlyToggle');
    if (availableToggle) {
        availableToggle.addEventListener('change', (e) => {
            availableOnly = e.target.checked;
            currentPage = 1;
            applyFiltersAndRender();
        });
    }

    const exportBtn = document.getElementById('btnExportPdf');
    if (exportBtn) exportBtn.addEventListener('click', exportCoursesToPdf);

    const exportTxtBtn = document.getElementById('btnExportTxt');
    if (exportTxtBtn) exportTxtBtn.addEventListener('click', exportCoursesToTxt);

    // Pagination nav buttons
    document.getElementById('btnPageFirst')?.addEventListener('click', () => {
        currentPage = 1;
        renderTablePage();
        renderPagination();
    });
    document.getElementById('btnPagePrev')?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTablePage();
            renderPagination();
        }
    });
    document.getElementById('btnPageNext')?.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredCourses.length / pageSize) || 1;
        if (currentPage < totalPages) {
            currentPage++;
            renderTablePage();
            renderPagination();
        }
    });
    document.getElementById('btnPageLast')?.addEventListener('click', () => {
        currentPage = Math.ceil(filteredCourses.length / pageSize) || 1;
        renderTablePage();
        renderPagination();
    });

    const pageJumpInput = document.getElementById('pageJumpInput');
    if (pageJumpInput) {
        pageJumpInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const p = parseInt(pageJumpInput.value, 10);
                const totalPages = Math.ceil(filteredCourses.length / pageSize) || 1;
                if (p >= 1 && p <= totalPages) {
                    currentPage = p;
                    renderTablePage();
                    renderPagination();
                }
            }
        });
    }

    // Floating action buttons
    const fabScrollTop = document.getElementById('fabScrollTop');
    if (fabScrollTop) {
        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 300) {
                fabScrollTop.classList.remove('hidden');
            } else {
                fabScrollTop.classList.add('hidden');
            }
        });
        fabScrollTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    const fabRefresh = document.getElementById('fabRefresh');
    if (fabRefresh) {
        fabRefresh.addEventListener('click', () => {
            if (loadedDeptIds.size > 0 && selectedSemesterId) {
                const depts = Array.from(loadedDeptIds).map(id => {
                    const d = availableDepartments.find(item => String(item.AcademicDepartmentId) === String(id));
                    return { id, name: d ? cleanDepartmentName(d.AcademicDepartmentName) : `Dept ${id}` };
                });
                allCourses = [];
                loadedDeptIds.clear();
                startDepartmentFetchQueue(depts, selectedSemesterId);
            }
        });
    }
});

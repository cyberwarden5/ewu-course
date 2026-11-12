/**
 * ============================================
 * EWU COURSE FILTER V2 - MAIN JAVASCRIPT
 * ============================================
 * 
 * Updated to use Worker API endpoints under /V2/api/*
 * All requests use credentials: 'include' for cookie-based authentication
 */

// ===== CONFIGURATION =====
const API_BASE_URL = 'https://api.aftabx.tech/V2/api';

// ===== GLOBAL ERROR HANDLER =====

/**
 * Global error handler - redirects to error page
 */
function handleGlobalError(errorCode, details = '', fromPage = '') {
    console.error('Global error:', errorCode, details, fromPage);
    alert('An error occurred: ' + details);
}

/**
 * Check if user is trying to access restricted pages
 */
function checkPageAccess() {
    const restrictedPaths = ['/api/', '/logs/', '/worker/'];
    const currentPath = window.location.pathname;

    for (const path of restrictedPaths) {
        if (currentPath.includes(path)) {
            handleGlobalError('403', 'This page is restricted', currentPath);
            return false;
        }
    }
    return true;
}

// Run access check on page load
window.addEventListener('DOMContentLoaded', checkPageAccess);

// ===== UTILITY FUNCTIONS =====

/**
 * Display error message to user
 */
function showError(message, elementId = 'error-message') {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
    }
}

/**
 * Display success message to user
 */
function showSuccess(message, elementId = 'success-message') {
    const successElement = document.getElementById(elementId);
    if (successElement) {
        successElement.textContent = message;
        successElement.classList.remove('hidden');
    }
}

/**
 * Hide message elements
 */
function hideMessage(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.classList.add('hidden');
    }
}

/**
 * Show loading spinner
 */
function showSpinner(elementId = 'loading-spinner') {
    const spinner = document.getElementById(elementId);
    if (spinner) {
        spinner.classList.remove('hidden');
    }
}

/**
 * Hide loading spinner
 */
function hideSpinner(elementId = 'loading-spinner') {
    const spinner = document.getElementById(elementId);
    if (spinner) {
        spinner.classList.add('hidden');
    }
}

// ===== LOGIN PAGE FUNCTIONS =====

/**
 * Handle login form submission
 */
async function handleLogin(event) {
    event.preventDefault();

    const userId = document.getElementById('user-id').value.trim();
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('login-btn');
    const spinner = document.getElementById('login-spinner');

    // Clear previous messages
    hideMessage('error-message');
    hideMessage('success-message');

    // Validate inputs
    if (!userId || !password) {
        showError('Please enter both User ID and Password', 'error-message');
        return;
    }

    // Disable button and show loading
    loginBtn.disabled = true;
    loginBtn.classList.add('loading-state');
    if (spinner) {
        spinner.classList.remove('hidden');
    }

    try {
        // Send POST request to login API with retry logic
        const result = await fetchWithRetry(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'include',
            body: JSON.stringify({
                username: userId,
                password: password
            })
        }, 'Logging in to EWU Portal');

        const data = result.data;

        // Hide spinner
        if (spinner) {
            spinner.classList.add('hidden');
        }

        // Check response status
        if (data.status === 'success') {
            // Show success message
            showSuccess('Login successful! Redirecting...', 'success-message');

            // Redirect to courses page after brief delay
            setTimeout(() => {
                window.location.href = 'courses';
            }, 1000);
        } else {
            // Show error message
            showError(data.message || 'Login failed. Please try again.', 'error-message');

            // Re-enable button
            loginBtn.disabled = false;
            loginBtn.classList.remove('loading-state');
        }

    } catch (error) {
        // Hide spinner
        if (spinner) {
            spinner.classList.add('hidden');
        }

        // Re-enable button
        loginBtn.disabled = false;
        loginBtn.classList.remove('loading-state');

        const errorMsg = error.message || '';

        // Check if cancelled by user
        if (errorMsg === 'Cancelled by user') {
            showError('Login cancelled', 'error-message');
        } else {
            // Show error message
            showError(errorMsg || 'Connection error. Please try again.', 'error-message');
            console.error('Login error:', error);
        }
    }
}

// ===== LOGOUT FUNCTION =====

/**
 * Handle logout
 */
async function handleLogout() {
    try {
        await fetch(`${API_BASE_URL}/logout`, {
            method: 'POST',
            credentials: 'include'
        });

        // Redirect to login page
        window.location.href = 'login';
    } catch (error) {
        console.error('Logout error:', error);
        // Redirect anyway
        window.location.href = 'login';
    }
}

// Make logout available globally
window.handleLogout = handleLogout;

// ===== DASHBOARD PAGE FUNCTIONS =====

/**
 * Load department and semester options from API
 */
async function loadDashboardOptions() {
    const spinner = document.getElementById('options-loading-spinner');
    const semSelect = document.getElementById('semester-select');
    const fetchBtn = document.getElementById('fetch-courses-btn');

    if (spinner) spinner.classList.remove('hidden');

    try {
        const result = await fetchWithRetry(`${API_BASE_URL}/options`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'include'
        }, 'Fetching Department & Semester Options');

        const data = result.data;
        if (spinner) spinner.classList.add('hidden');

        if (data.status === 'success') {
            populateDepartments(data.departments);
            populateSemesters(data.semesters);
            if (semSelect) semSelect.disabled = false;
            if (fetchBtn) fetchBtn.disabled = false;
        } else {
            showError(data.message || 'Failed to load options. Please try logging in again.', 'error-message');
            if (semSelect) semSelect.innerHTML = '<option value="">Failed to load</option>';
        }
    } catch (error) {
        if (spinner) spinner.classList.add('hidden');
        if (error.message !== 'Cancelled by user') {
            showError('Connection error. Please check your internet or log in again.', 'error-message');
        }
        if (semSelect) semSelect.innerHTML = '<option value="">Error loading</option>';
    }
}

/**
 * Trim "Department of " prefix from department name
 */
function trimDepartmentPrefix(deptName) {
    if (!deptName) return deptName;
    return deptName.replace(/^Department of /i, '').trim();
}

function populateDepartments(departments) {
    const container = document.getElementById('department-checkboxes');
    const selectAllToggle = document.getElementById('select-all-depts');

    if (!container) return;

    function updateDeptBadge() {
        const badge = document.getElementById('dept-count-badge');
        if (!badge) return;
        const count = document.querySelectorAll('.dept-checkbox:checked').length;
        badge.textContent = count + ' selected';
    }

    if (departments && departments.length > 0) {
        container.innerHTML = '';
        departments.forEach(dept => {
            const label = document.createElement('label');
            label.style.cssText = 'display:flex;align-items:center;gap:0.5rem;cursor:pointer;padding:5px 10px;border-radius:8px;transition:background 0.15s;font-size:0.9rem;color:var(--text-primary);';
            label.onmouseover = () => label.style.background = 'rgba(255,255,255,0.05)';
            label.onmouseout = () => label.style.background = 'transparent';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'dept-checkbox';
            checkbox.value = dept.AcademicDepartmentId;
            checkbox.dataset.name = trimDepartmentPrefix(dept.AcademicDepartmentName);
            checkbox.checked = selectAllToggle ? selectAllToggle.checked : true;
            checkbox.style.cssText = 'width:15px;height:15px;accent-color:var(--accent-primary);cursor:pointer;flex-shrink:0;';

            checkbox.addEventListener('change', () => {
                if (selectAllToggle && !checkbox.checked) {
                    selectAllToggle.checked = false;
                } else if (selectAllToggle) {
                    selectAllToggle.checked = Array.from(document.querySelectorAll('.dept-checkbox')).every(cb => cb.checked);
                }
                updateDeptBadge();
            });

            const span = document.createElement('span');
            span.textContent = checkbox.dataset.name;
            label.appendChild(checkbox);
            label.appendChild(span);
            container.appendChild(label);
        });

        if (selectAllToggle) {
            selectAllToggle.addEventListener('change', (e) => {
                document.querySelectorAll('.dept-checkbox').forEach(cb => cb.checked = e.target.checked);
                updateDeptBadge();
            });
        }
        updateDeptBadge();
    } else {
        container.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 1rem 0;">No departments available</div>';
    }
}

/**
 * Populate semester dropdown with fetched data
 */
function populateSemesters(semesters) {
    const select = document.getElementById('semester-select');
    if (!select) return;

    // Clear existing options
    select.innerHTML = '<option value="">-- Select Semester --</option>';

    // Add semesters from API
    if (semesters && semesters.length > 0) {
        semesters.forEach(sem => {
            const option = document.createElement('option');
            option.value = sem.SemesterId;
            option.textContent = sem.SemesterName;
            select.appendChild(option);
        });

        console.log(`Loaded ${semesters.length} semesters`);
    } else {
        select.innerHTML = '<option value="">No semesters available</option>';
    }
}

function handleFetchCourses() {
    const semSelect = document.getElementById('semester-select');
    const semesterId = semSelect ? semSelect.value : '';
    const semesterName = semSelect ? semSelect.options[semSelect.selectedIndex].text : '';

    const checkboxes = Array.from(document.querySelectorAll('.dept-checkbox:checked'));
    if (checkboxes.length === 0) {
        showError('Please select at least one department', 'error-message');
        return;
    }
    if (!semesterId) {
        showError('Please select a semester', 'error-message');
        return;
    }

    const selectedDepartments = checkboxes.map(cb => ({
        id: cb.value,
        name: cb.dataset.name
    }));

    sessionStorage.setItem('selectedDepartmentId', selectedDepartments.map(d => d.id).join(','));
    sessionStorage.setItem('selectedDepartmentName', selectedDepartments.length > 1 ? 'Multiple Departments' : selectedDepartments[0].name);
    sessionStorage.setItem('selectedSemesterId', semesterId);
    sessionStorage.setItem('selectedSemesterName', semesterName);

    hideMessage('error-message');
    showSuccess('Loading courses...', 'success-message');

    const initialSection = document.getElementById('initial-selection');
    const coursesSection = document.getElementById('courses-section');

    if (initialSection) initialSection.classList.add('hidden');
    if (coursesSection) coursesSection.classList.remove('hidden');

    allCourses = [];
    loadedDeptIds = new Set();
    currentPage = 1;

    const tbody = document.getElementById('courses-table-body');
    if (tbody) tbody.innerHTML = '';

    loadCoursesFilters().then(() => {
        populateDynamicDeptPanel();
        fetchDepartmentsQueue(selectedDepartments, semesterId);
    });
}

// ===== COURSES PAGE FUNCTIONS =====

// Global variables for courses page
let allCourses = [];
let searchTags = [];
let availableDepartments = [];
let availableSemesters = [];
let loadedDeptIds = new Set();
let currentPage = 1;
let pageSize = 50;

// Day code mapping
const DAY_CODES = {
    'A': 'SATURDAY',
    'S': 'SUNDAY',
    'M': 'MONDAY',
    'T': 'TUESDAY',
    'W': 'WEDNESDAY',
    'R': 'THURSDAY',
    'F': 'FRIDAY'
};

/**
 * Parse schedule string into days and time
 */
function parseSchedule(schedule) {
    if (!schedule || schedule === 'N/A') {
        return { days: 'TBA', time: 'TBA' };
    }

    const parts = schedule.trim().split(' ');

    if (parts.length === 0) {
        return { days: 'TBA', time: 'TBA' };
    }

    // First part is day codes
    const dayCodesStr = parts[0];
    const dayCodeChars = dayCodesStr.split('');

    // Convert day codes to full names
    const dayNames = dayCodeChars
        .map(code => DAY_CODES[code] || code)
        .filter(day => day.length > 1);

    const days = dayNames.length > 0 ? dayNames.join(', ') : 'TBA';

    // Remaining parts form the time
    const time = parts.slice(1).join(' ') || 'TBA';

    return { days, time };
}

/**
 * Load departments and semesters for filter dropdowns
 */
async function loadCoursesFilters() {
    try {
        const result = await fetchWithRetry(`${API_BASE_URL}/options`, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'include'
        }, 'Loading Filter Options');
        const data = result.data;

        if (data.status === 'success') {
            availableDepartments = data.departments || [];
            availableSemesters = data.semesters || [];

            populateFilterDropdowns();
        }
    } catch (error) {
        if (error.message === 'Cancelled by user') {
            console.log('Filter options fetch cancelled by user');
        } else {
            console.error('Failed to load filter options:', error);
        }
    }

    return Promise.resolve();
}

function populateFilterDropdowns() {
    // No longer needed - dept/sem filters removed from courses section
}

/**
 * Populate the dynamic department management panel in courses view
 */
function populateDynamicDeptPanel() {
    const container = document.getElementById('dynamic-dept-checkboxes');
    const selectAllToggle = document.getElementById('dynamic-select-all');
    if (!container || availableDepartments.length === 0) return;

    const selectedDeptStr = sessionStorage.getItem('selectedDepartmentId') || '';
    const selectedIds = new Set(selectedDeptStr.split(','));

    container.innerHTML = '';
    availableDepartments.forEach(dept => {
        const id = dept.AcademicDepartmentId;
        const name = trimDepartmentPrefix(dept.AcademicDepartmentName);
        const isSelected = selectedIds.has(String(id));

        const label = document.createElement('label');
        label.style.cssText = 'display:inline-flex;align-items:center;gap:4px;cursor:pointer;padding:4px 10px;border-radius:8px;font-size:0.8rem;color:var(--text-primary);background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);transition:all 0.15s;white-space:nowrap;user-select:none;';
        label.onmouseover = () => label.style.borderColor = 'rgba(108,99,255,0.3)';
        label.onmouseout = () => label.style.borderColor = 'rgba(255,255,255,0.06)';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'dynamic-dept-cb';
        cb.value = id;
        cb.dataset.name = name;
        cb.checked = isSelected;
        cb.style.cssText = 'width:13px;height:13px;accent-color:var(--accent-primary);cursor:pointer;';

        cb.addEventListener('change', () => {
            if (selectAllToggle) {
                selectAllToggle.checked = Array.from(document.querySelectorAll('.dynamic-dept-cb')).every(c => c.checked);
            }
        });

        label.appendChild(cb);
        label.appendChild(document.createTextNode(name));
        container.appendChild(label);
    });

    if (selectAllToggle) {
        selectAllToggle.checked = Array.from(document.querySelectorAll('.dynamic-dept-cb')).every(c => c.checked);
        selectAllToggle.addEventListener('change', (e) => {
            document.querySelectorAll('.dynamic-dept-cb').forEach(cb => cb.checked = e.target.checked);
        });
    }

    updateLoadedDeptBadge();
}

function updateLoadedDeptBadge() {
    const badge = document.getElementById('loaded-dept-badge');
    if (badge) badge.textContent = loadedDeptIds.size + ' loaded';
}

/**
 * Load and display courses from API
 */
async function loadCourses() {
    // Determine selected departments from session
    const selectedDeptStr = sessionStorage.getItem('selectedDepartmentId');
    const selectedSemId = sessionStorage.getItem('selectedSemesterId');

    if (!selectedDeptStr || !selectedSemId) {
        const tbody = document.getElementById('courses-table-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                        Please select department and semester to begin
                    </td>
                </tr>
            `;
        }
        return;
    }

    const deptIds = selectedDeptStr.split(',');

    // Attempt to reconstruct department info for fetching queue
    const departments = deptIds.map(id => {
        // Find name if possible
        const option = availableDepartments.find(d => d.AcademicDepartmentId === id);
        return {
            id: id,
            name: option ? trimDepartmentPrefix(option.AcademicDepartmentName) : `Dept ${id}`
        };
    });

    // Reset courses array
    allCourses = [];
    loadedDeptIds = new Set();
    currentPage = 1;
    const tbody = document.getElementById('courses-table-body');
    if (tbody) tbody.innerHTML = '';

    hideMessage('error-message');

    // Start sequential fetch
    fetchDepartmentsQueue(departments, selectedSemId);
}

/**
 * Sequentially fetch departments with live update and retries
 */
async function fetchDepartmentsQueue(departments, semesterId) {
    const tbody = document.getElementById('courses-table-body');
    const statusRowId = 'fetch-status-row';
    const fetchBtn = document.getElementById('fetch-courses-btn');
    const applyBtn = document.getElementById('apply-dept-changes-btn');
    const spinner = document.getElementById('loading-spinner');

    if (fetchBtn) fetchBtn.disabled = true;
    if (applyBtn) applyBtn.disabled = true;
    if (spinner) spinner.classList.remove('hidden');

    for (let i = 0; i < departments.length; i++) {
        const dept = departments[i];

        if (loadedDeptIds.has(String(dept.id))) continue;

        let statusRow = document.getElementById(statusRowId);
        if (!statusRow && tbody) {
            statusRow = document.createElement('tr');
            statusRow.id = statusRowId;
            const statusCell = document.createElement('td');
            statusCell.colSpan = 8;
            statusCell.id = 'fetch-status-cell';
            statusCell.style.textAlign = 'center';
            statusCell.style.padding = '1.5rem';
            statusRow.appendChild(statusCell);
            tbody.appendChild(statusRow);
        }

        const statusCell = document.getElementById('fetch-status-cell');
        if (statusCell) {
            statusCell.innerHTML = `
                <div class="spinner" style="display: inline-block; margin-right: 10px; width: 18px; height: 18px; border-width: 2px;"></div>
                <span style="color: var(--accent-primary); font-size: 0.9rem;">Fetching ${dept.name}... (${i + 1}/${departments.length})</span>
            `;
        }

        let success = false;
        let retries = 0;

        while (!success && retries < 3) {
            try {
                const response = await fetchWithRetry(`${API_BASE_URL}/courses`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                        departmentId: dept.id,
                        semesterId: semesterId
                    })
                }, `Fetching ${dept.name}`);

                const data = response.data;
                if (data.status === 'success') {
                    const parsedCourses = (data.courses || []).map(course => {
                        const { days, time } = parseSchedule(course.TimeSlotName);
                        return { ...course, Days: days, Time: time, _deptId: String(dept.id) };
                    });

                    allCourses = [...allCourses, ...parsedCourses];
                    loadedDeptIds.add(String(dept.id));
                    updateLoadedDeptBadge();

                    if (statusRow && statusRow.parentNode) {
                        statusRow.parentNode.removeChild(statusRow);
                    }

                    currentPage = 1;
                    applyFiltersAndDisplay();
                    success = true;
                } else {
                    throw new Error(data.message || 'API error');
                }
            } catch (error) {
                if (error.message === 'Cancelled by user') break;
                retries++;
                if (retries >= 3) {
                    showError(`Skipped ${dept.name} after 3 failed attempts.`, 'error-message');
                    setTimeout(() => hideMessage('error-message'), 5000);
                } else {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }
    }

    const finalStatusRow = document.getElementById(statusRowId);
    if (finalStatusRow && finalStatusRow.parentNode) finalStatusRow.parentNode.removeChild(finalStatusRow);

    if (spinner) spinner.classList.add('hidden');
    if (fetchBtn) fetchBtn.disabled = false;
    if (applyBtn) applyBtn.disabled = false;

    if (allCourses.length === 0) {
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-secondary);">No courses found.</td></tr>`;
        }
    } else {
        showSuccess('All selected departments loaded!', 'success-message');
        setTimeout(() => hideMessage('success-message'), 4000);
    }
}

// ===== CLIENT-SIDE FUZZY SEARCH & LIVE INDEXING ENGINE =====
class CourseSearchIndex {
    constructor() {
        this.index = [];
        this.tokenMap = new Map();
        this.codeMap = new Map();
        this.lastIndexedLength = 0;
    }

    buildIndex(courses) {
        if (!courses || courses.length === 0) {
            this.index = [];
            this.tokenMap.clear();
            this.codeMap.clear();
            this.lastIndexedLength = 0;
            return;
        }

        if (this.lastIndexedLength === courses.length && this.index.length === courses.length) {
            return; // Already up to date
        }

        const len = courses.length;
        this.index = new Array(len);
        this.tokenMap.clear();
        this.codeMap.clear();

        for (let i = 0; i < len; i++) {
            const course = courses[i];
            const cleanCode = cleanCourseCode(course.CourseCode || '');
            const codeNorm = cleanCode.toLowerCase().replace(/[\s\-_]/g, '');
            const rawCodeNorm = (course.CourseCode || '').toLowerCase().replace(/[\s\-_]/g, '');
            const facultyNorm = (course.ShortName || '').toLowerCase().trim();
            const roomNorm = (course.RoomCode || '').toLowerCase().trim();
            const sectionNorm = String(course.Section || '').toLowerCase().trim();
            const daysNorm = (course.Days || '').toLowerCase().trim();
            const timeNorm = (course.Time || '').toLowerCase().trim();

            const fullBlob = `${cleanCode} ${course.CourseCode || ''} ${sectionNorm} ${facultyNorm} ${roomNorm} ${daysNorm} ${timeNorm}`.toLowerCase();

            const tokens = new Set([
                codeNorm,
                rawCodeNorm,
                cleanCode.toLowerCase(),
                sectionNorm,
                facultyNorm,
                roomNorm,
                ...fullBlob.split(/\s+/).filter(t => t.length > 0)
            ]);

            this.index[i] = {
                course,
                cleanCode,
                codeNorm,
                rawCodeNorm,
                facultyNorm,
                roomNorm,
                sectionNorm,
                fullBlob,
                tokens
            };

            if (!this.codeMap.has(codeNorm)) {
                this.codeMap.set(codeNorm, []);
            }
            this.codeMap.get(codeNorm).push(i);

            tokens.forEach(token => {
                if (!this.tokenMap.has(token)) {
                    this.tokenMap.set(token, new Set());
                }
                this.tokenMap.get(token).add(i);
            });
        }
        this.lastIndexedLength = len;
    }

    search(query, tags = [], availableOnly = false) {
        const startTime = performance.now();

        if ((!query || !query.trim()) && (!tags || tags.length === 0)) {
            let result = [];
            for (let i = 0; i < this.index.length; i++) {
                const entry = this.index[i];
                if (!entry) continue;
                if (availableOnly && entry.course.SeatsLeft <= 0) continue;
                result.push(entry.course);
            }
            return {
                courses: result,
                elapsedMs: Math.round((performance.now() - startTime) * 100) / 100
            };
        }

        const normQuery = query ? query.toLowerCase().trim() : '';
        const queryNormCode = normQuery.replace(/[\s\-_]/g, '');
        const queryTokens = normQuery.split(/\s+/).filter(Boolean);

        const allTagsNorm = tags.map(t => ({
            raw: t.toLowerCase().trim(),
            normCode: t.toLowerCase().replace(/[\s\-_]/g, '')
        }));

        const matchedCourses = [];

        for (let i = 0; i < this.index.length; i++) {
            const entry = this.index[i];
            if (!entry) continue;
            if (availableOnly && entry.course.SeatsLeft <= 0) continue;

            // 1. Tag matching
            if (allTagsNorm.length > 0) {
                const matchTag = allTagsNorm.some(tag => 
                    (tag.normCode && (entry.codeNorm.includes(tag.normCode) || entry.rawCodeNorm.includes(tag.normCode))) ||
                    entry.fullBlob.includes(tag.raw)
                );
                if (!matchTag) continue;
            }

            // 2. Query matching
            if (normQuery) {
                // Priority 1: Exact / substring match on normalized code (e.g. cse110, mat101)
                if (queryNormCode && (entry.codeNorm.includes(queryNormCode) || entry.rawCodeNorm.includes(queryNormCode))) {
                    matchedCourses.push(entry.course);
                    continue;
                }

                // Priority 2: Multi-token match across all fields
                if (queryTokens.length > 0 && queryTokens.every(token => entry.fullBlob.includes(token))) {
                    matchedCourses.push(entry.course);
                    continue;
                }

                // Priority 3: Substring match
                if (entry.fullBlob.includes(normQuery)) {
                    matchedCourses.push(entry.course);
                    continue;
                }
            } else {
                matchedCourses.push(entry.course);
            }
        }

        const elapsedMs = Math.round((performance.now() - startTime) * 100) / 100;
        return {
            courses: matchedCourses,
            elapsedMs: elapsedMs
        };
    }
}

const courseSearchEngine = new CourseSearchIndex();
let lastFilteredCourses = [];

function applyFiltersAndDisplay() {
    const currentScrollY = window.scrollY;

    // Ensure live search index is built
    courseSearchEngine.buildIndex(allCourses);

    const availableOnlyToggle = document.getElementById('available-only-toggle');
    const isAvailableOnly = !!(availableOnlyToggle && availableOnlyToggle.checked);

    const searchInput = document.getElementById('search-input');
    const activeInputValue = searchInput ? searchInput.value.trim() : '';

    // Fast indexed fuzzy search (< 1ms across 10k items)
    const searchResult = courseSearchEngine.search(activeInputValue, searchTags, isAvailableOnly);
    let filteredCourses = searchResult.courses;

    const sortFilter = document.getElementById('sort-filter');
    if (sortFilter) {
        filteredCourses = sortCourses(filteredCourses, sortFilter.value);
    }

    lastFilteredCourses = filteredCourses;

    // Calculate pagination
    const pageSizeSelect = document.getElementById('page-size-select');
    const selectedSize = pageSizeSelect ? pageSizeSelect.value : '50';
    pageSize = selectedSize === 'all' ? filteredCourses.length : parseInt(selectedSize);

    const totalPages = Math.max(1, Math.ceil(filteredCourses.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    const pageSlice = filteredCourses.slice(startIdx, endIdx);

    displayCourses(pageSlice);
    updateStats(filteredCourses.length, allCourses.length);
    renderPagination(totalPages);

    const pageInfo = document.getElementById('page-info');
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

    // Update search performance badge if present
    const latencyBadge = document.getElementById('search-latency-badge');
    if (latencyBadge) {
        latencyBadge.textContent = `${searchResult.elapsedMs}ms (${filteredCourses.length} slots)`;
    }

    // Restore scroll position silently to prevent jumping
    window.scrollTo(0, currentScrollY);
}

function sortCourses(courses, sortBy) {
    const sorted = [...courses];
    switch (sortBy) {
        case 'code': sorted.sort((a, b) => a.CourseCode.localeCompare(b.CourseCode)); break;
        case 'seats-left': sorted.sort((a, b) => b.SeatsLeft - a.SeatsLeft); break;
        case 'name': sorted.sort((a, b) => a.ShortName.localeCompare(b.ShortName)); break;
        case 'time': sorted.sort((a, b) => a.Time.localeCompare(b.Time)); break;
    }
    return sorted;
}

function displayCourses(courses) {
    const tbody = document.getElementById('courses-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!courses || courses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-secondary);">No courses found matching your filters.</td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    courses.forEach((course, index) => {
        const row = document.createElement('tr');
        // Reduced animation for smooth scroll - only first 5 rows with minimal delay
        if (index < 5) {
            row.style.animation = `fadeIn 0.1s ease forwards`;
            row.style.animationDelay = `${index * 0.02}s`;
            row.style.opacity = '0';
        } else {
            row.style.opacity = '1';
        }

        const seatsDisplay = `${course.SeatTaken}/${course.SeatCapacity}`;
        const seatsLeft = course.SeatsLeft;
        let seatsColor = 'var(--success-color)';
        if (seatsLeft <= 0) seatsColor = 'var(--error-color)';
        else if (seatsLeft < 5) seatsColor = '#f59e0b';

        const cleanCode = cleanCourseCode(course.CourseCode);
        row.innerHTML = `
            <td><strong style="color: var(--accent-primary);">${cleanCode}</strong></td>
            <td><span style="background: rgba(108, 99, 255, 0.1); padding: 4px 8px; border-radius: 6px;">${course.Section}</span></td>
            <td><span style="font-weight: 500; word-break: break-word; max-width: 100px; display: inline-block;">${course.ShortName}</span></td>
            <td><span style="color: var(--text-secondary);">${seatsDisplay}</span></td>
            <td style="color: ${seatsColor}; font-weight: bold; font-size: 1.1em;">${seatsLeft}</td>
            <td><span style="color: #a855f7; word-break: break-word;">${course.Days}</span></td>
            <td><span style="font-family: monospace; color: #06b6d4; white-space: normal; word-break: break-word;">${course.Time}</span></td>
            <td><span style="background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 4px 8px; border-radius: 6px; word-break: break-word; display: inline-block;">${course.RoomCode}</span></td>
        `;
        fragment.appendChild(row);
    });
    tbody.appendChild(fragment);
}

function updateStats(visibleCount, totalCount) {
    const visibleEl = document.getElementById('visible-count');
    const totalEl = document.getElementById('total-count');
    if (visibleEl) visibleEl.textContent = visibleCount;
    if (totalEl) totalEl.textContent = totalCount;
}

function renderPagination(totalPages) {
    const container = document.getElementById('page-numbers');
    const prevBtn = document.getElementById('page-prev');
    const nextBtn = document.getElementById('page-next');
    const firstBtn = document.getElementById('page-first');
    const lastBtn = document.getElementById('page-last');
    const jumpInput = document.getElementById('page-jump-input');

    if (!container) return;
    container.innerHTML = '';

    if (totalPages <= 1) {
        const paginationControls = document.getElementById('pagination-controls');
        if (paginationControls) paginationControls.style.display = 'none';
        return;
    }

    const paginationControls = document.getElementById('pagination-controls');
    if (paginationControls) paginationControls.style.display = 'flex';

    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (firstBtn) firstBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    if (lastBtn) lastBtn.disabled = currentPage >= totalPages;
    if (jumpInput) jumpInput.max = totalPages;

    // Generate page number buttons with ellipsis
    const pages = [];
    const delta = 2;
    const rangeStart = Math.max(2, currentPage - delta);
    const rangeEnd = Math.min(totalPages - 1, currentPage + delta);

    pages.push(1);
    if (rangeStart > 2) pages.push('...');
    for (let i = rangeStart; i <= rangeEnd; i++) pages.push(i);
    if (rangeEnd < totalPages - 1) pages.push('...');
    if (totalPages > 1) pages.push(totalPages);

    pages.forEach(p => {
        if (p === '...') {
            const span = document.createElement('span');
            span.textContent = '...';
            span.style.cssText = 'padding: 6px 4px; color: var(--text-secondary); font-size: 0.85rem;';
            container.appendChild(span);
        } else {
            const btn = document.createElement('button');
            btn.textContent = p;
            btn.style.cssText = `padding: 6px 11px; border-radius: 8px; font-size: 0.85rem; cursor: pointer; border: 1px solid ${p === currentPage ? 'var(--accent-primary)' : 'rgba(108,99,255,0.2)'}; background: ${p === currentPage ? 'var(--accent-primary)' : 'rgba(108,99,255,0.1)'}; color: ${p === currentPage ? '#fff' : 'var(--text-primary)'}; font-weight: ${p === currentPage ? '700' : '400'}; transition: all 0.15s;`;
            btn.addEventListener('click', () => { currentPage = p; applyFiltersAndDisplay(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
            container.appendChild(btn);
        }
    });
}

/**
 * Clean course code by removing faculty initials
 */
function cleanCourseCode(courseCode) {
    if (!courseCode) return courseCode;
    return courseCode.split('-')[0].trim();
}

/**
 * Multi-tag search - Show suggestions as user types
 */
function showSearchSuggestions() {
    const searchInput = document.getElementById('search-input');
    const suggestionsEl = document.getElementById('search-suggestions');

    if (!searchInput || !suggestionsEl) return;

    const query = searchInput.value.toLowerCase().trim();
    const queryNorm = query.replace(/[\s\-_]/g, '');

    if (!query) {
        suggestionsEl.classList.add('hidden');
        return;
    }

    // Find matching courses and collect unique course codes
    const uniqueCourses = new Map();

    allCourses.forEach(course => {
        const cleanCode = cleanCourseCode(course.CourseCode);
        const codeNorm = cleanCode.toLowerCase().replace(/[\s\-_]/g, '');
        const searchString = [
            cleanCode,
            course.ShortName,
            course.CourseCode
        ].join(' ').toLowerCase();

        if ((queryNorm && codeNorm.includes(queryNorm)) || searchString.includes(query)) {
            if (!uniqueCourses.has(cleanCode)) {
                uniqueCourses.set(cleanCode, {
                    code: cleanCode,
                    name: course.ShortName
                });
            }
        }
    });

    // Convert to array and limit to 5
    const matches = Array.from(uniqueCourses.values()).slice(0, 5);

    // Display suggestions with minimal animations for smooth performance
    if (matches.length > 0) {
        suggestionsEl.innerHTML = matches
            .map((course, index) => {
                return `
                    <div class="suggestion-item" data-tag="${course.code}" onclick="addSearchTag('${course.code}')" style="animation: fadeIn 0.15s ease forwards; opacity: 0; cursor: pointer; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.15s;">
                        <strong style="color: var(--accent-primary);">${course.code}</strong> - <span style="font-size: 0.9em; color: var(--text-secondary);">${course.name}</span>
                    </div>
                `;
            })
            .join('');
        suggestionsEl.classList.remove('hidden');
    } else {
        suggestionsEl.innerHTML = `
            <div style="padding: 15px; text-align: center; color: var(--text-secondary); opacity: 0.7;">
                No matches found
            </div>
        `;
        suggestionsEl.classList.remove('hidden');
    }
}

/**
 * Add a search tag
 */
function addSearchTag(tagText) {
    if (!tagText || searchTags.includes(tagText)) return;

    searchTags.push(tagText);
    renderSearchTags();
    currentPage = 1;
    applyFiltersAndDisplay();

    // Clear input and hide suggestions
    const searchInput = document.getElementById('search-input');
    const suggestionsEl = document.getElementById('search-suggestions');
    if (searchInput) searchInput.value = '';
    if (suggestionsEl) suggestionsEl.classList.add('hidden');
}

/**
 * Remove a search tag
 */
function removeSearchTag(tagText) {
    searchTags = searchTags.filter(tag => tag !== tagText);
    renderSearchTags();
    currentPage = 1;
    applyFiltersAndDisplay();
}

// Make removeSearchTag available globally
window.removeSearchTag = removeSearchTag;

/**
 * Render search tags UI
 */
function renderSearchTags() {
    const tagsContainer = document.getElementById('search-tags');
    if (!tagsContainer) return;

    tagsContainer.innerHTML = searchTags
        .map(tag => `
            <div class="search-tag">
                <span>${tag}</span>
                <span class="search-tag-remove" onclick="removeSearchTag('${tag}')">×</span>
            </div>
        `)
        .join('');
}

/**
 * Handle dynamic department add/remove from courses view
 */
function handleDynamicDeptChange() {
    const checkboxes = Array.from(document.querySelectorAll('.dynamic-dept-cb'));
    const wantedIds = new Set(checkboxes.filter(cb => cb.checked).map(cb => String(cb.value)));
    const semesterId = sessionStorage.getItem('selectedSemesterId');

    if (!semesterId) {
        showError('No semester selected', 'error-message');
        return;
    }

    // Remove courses for unchecked departments
    const removedIds = [];
    loadedDeptIds.forEach(id => {
        if (!wantedIds.has(id)) removedIds.push(id);
    });
    if (removedIds.length > 0) {
        allCourses = allCourses.filter(c => !removedIds.includes(c._deptId));
        removedIds.forEach(id => loadedDeptIds.delete(id));
        updateLoadedDeptBadge();
        currentPage = 1;
        applyFiltersAndDisplay();
    }

    // Find departments to add
    const toFetch = [];
    checkboxes.forEach(cb => {
        if (cb.checked && !loadedDeptIds.has(String(cb.value))) {
            toFetch.push({ id: cb.value, name: cb.dataset.name });
        }
    });

    // Update session
    sessionStorage.setItem('selectedDepartmentId', Array.from(wantedIds).join(','));

    if (toFetch.length > 0) {
        fetchDepartmentsQueue(toFetch, semesterId);
    }

    // Close the details panel
    const panel = document.getElementById('dept-manager-panel');
    if (panel) panel.open = false;
}

function refreshCourses() {
    const refreshBtn = document.getElementById('refresh-btn');
    const floatingRefreshBtn = document.getElementById('floating-refresh');
    if (refreshBtn) refreshBtn.classList.add('refreshing');
    if (floatingRefreshBtn) floatingRefreshBtn.classList.add('refreshing');

    const selectedDeptStr = sessionStorage.getItem('selectedDepartmentId');
    const selectedSemId = sessionStorage.getItem('selectedSemesterId');

    if (selectedDeptStr && selectedSemId) {
        const deptIds = selectedDeptStr.split(',');
        const departments = deptIds.map(id => {
            const option = availableDepartments.find(d => d.AcademicDepartmentId === id);
            return {
                id: id,
                name: option ? trimDepartmentPrefix(option.AcademicDepartmentName) : `Dept ${id}`
            };
        });

        refreshDepartments(departments, selectedSemId);
    } else {
        if (refreshBtn) refreshBtn.classList.remove('refreshing');
        if (floatingRefreshBtn) floatingRefreshBtn.classList.remove('refreshing');
    }
}

async function refreshDepartments(departments, semesterId) {
    const refreshBtn = document.getElementById('refresh-btn');
    const floatingRefreshBtn = document.getElementById('floating-refresh');
    const tbody = document.getElementById('courses-table-body');

    let allNewCourses = [];
    let completedFetches = 0;

    for (let i = 0; i < departments.length; i++) {
        const dept = departments[i];

        try {
            const response = await fetchWithRetry(`${API_BASE_URL}/courses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'include',
                body: JSON.stringify({
                    departmentId: dept.id,
                    semesterId: semesterId
                })
            }, `Refreshing ${dept.name}`);

            const data = response.data;
            if (data.status === 'success') {
                const parsedCourses = (data.courses || []).map(course => {
                    const { days, time } = parseSchedule(course.TimeSlotName);
                    return { ...course, Days: days, Time: time, _deptId: String(dept.id) };
                });
                allNewCourses = [...allNewCourses, ...parsedCourses];
            }
        } catch (error) {
            console.error(`Failed to refresh ${dept.name}:`, error);
        }

        completedFetches++;
    }

    if (allNewCourses.length > 0) {
        allCourses = allNewCourses;
        loadedDeptIds = new Set(departments.map(d => d.id));
        currentPage = 1;
        applyFiltersAndDisplay();

        showSuccess(`Refreshed ${allNewCourses.length} courses`, 'success-message');
        setTimeout(() => hideMessage('success-message'), 2000);
    }

    if (refreshBtn) refreshBtn.classList.remove('refreshing');
    if (floatingRefreshBtn) floatingRefreshBtn.classList.remove('refreshing');
}

/**
 * Export currently visible courses to PDF
 */
function exportToPDF() {
    console.log('Exporting to PDF...');

    try {
        // Check if jsPDF is loaded
        if (typeof window.jspdf === 'undefined') {
            alert('PDF library not loaded. Please refresh the page and try again.');
            return;
        }

        // Get currently visible courses
        let coursesToExport = [...allCourses];

        // Apply same filters as display
        const availableOnlyToggle = document.getElementById('available-only-toggle');
        if (availableOnlyToggle && availableOnlyToggle.checked) {
            coursesToExport = coursesToExport.filter(course => course.SeatsLeft > 0);
        }

        if (searchTags.length > 0) {
            coursesToExport = coursesToExport.filter(course => {
                const searchString = [
                    course.CourseCode,
                    course.Section,
                    course.ShortName,
                    course.Days,
                    course.Time,
                    course.RoomCode
                ].join(' ').toLowerCase();
                return searchTags.some(tag => searchString.includes(tag.toLowerCase()));
            });
        }

        const sortFilter = document.getElementById('sort-filter');
        if (sortFilter) {
            coursesToExport = sortCourses(coursesToExport, sortFilter.value);
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        doc.setProperties({
            title: 'Faculty list',
            author: 'EWU Wiz'
        });

        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 12;

        // Department short name mapping
        const deptShortNames = {
            'MBA and EMBA Program': 'MBA',
            'BA': 'BA',
            'Civil Engineering': 'Civil',
            'CSE': 'CSE',
            'ECE': 'ECE',
            'Economics': 'ECO',
            'EEE': 'EEE',
            'English': 'English',
            'Information Studies': 'IS',
            'Law': 'Law',
            'Social Relations': 'SR',
            'Mathematical & Physical Sciences': 'MPS',
            'Genetic Engineering and Biotechnology': 'GEB',
            'Pharmacy': 'Pharmacy',
            'Sociology': 'SOC',

        };

        function getShortDeptName(deptName) {
            if (!deptName) return deptName;
            // Check for exact match first
            if (deptShortNames[deptName]) {
                return deptShortNames[deptName];
            }
            // Try to find partial match
            for (const [key, value] of Object.entries(deptShortNames)) {
                if (deptName.toLowerCase().includes(key.toLowerCase())) {
                    return value;
                }
            }
            return deptName;
        }

        let deptName = sessionStorage.getItem('selectedDepartmentName') || 'Multiple';
        const semName = sessionStorage.getItem('selectedSemesterName') || 'Unknown';

        // Use actual successfully loaded department names with short names
        if (loadedDeptIds && loadedDeptIds.size > 0) {
            const loadedDeptNames = [];
            loadedDeptIds.forEach(deptId => {
                const dept = availableDepartments.find(d => String(d.AcademicDepartmentId) === String(deptId));
                if (dept) {
                    const fullName = trimDepartmentPrefix(dept.AcademicDepartmentName);
                    loadedDeptNames.push(getShortDeptName(fullName));
                }
            });
            if (loadedDeptNames.length > 0) {
                deptName = loadedDeptNames.join(', ');
            }
        } else {
            deptName = getShortDeptName(trimDepartmentPrefix(deptName));
        }

        // Colors
        const primaryColor = [108, 99, 255];
        const accentColor = [78, 205, 196];
        const darkBg = [15, 15, 30];
        const lightText = [255, 255, 255];
        const grayText = [150, 150, 160];

        // Compact header - reduced to 28mm for more table space
        const headerHeight = 28;

        // Header Background
        doc.setFillColor(darkBg[0], darkBg[1], darkBg[2]);
        doc.rect(0, 0, pageWidth, headerHeight, 'F');

        // Gradient line
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, headerHeight, pageWidth, 1, 'F');

        // Title - smaller font
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(lightText[0], lightText[1], lightText[2]);
        doc.text('Updated Faculty List', margin, 12);

        // Department & Semester info (left side) - compact
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('Dept:', margin, 20);
        doc.setTextColor(lightText[0], lightText[1], lightText[2]);
        doc.setFont('helvetica', 'normal');
        doc.text(deptName, margin + 12, 20);

        // Info on right side - compact
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('Sem:', pageWidth - margin - 55, 12);
        doc.setTextColor(lightText[0], lightText[1], lightText[2]);
        doc.setFont('helvetica', 'normal');
        doc.text(semName, pageWidth - margin - 35, 12);

        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('Courses:', pageWidth - margin - 55, 18);
        doc.setTextColor(lightText[0], lightText[1], lightText[2]);
        doc.text(`${coursesToExport.length}`, pageWidth - margin - 35, 18);

        // Format date/time in BD timezone with custom time format (2-24 for 2:24)
        const now = new Date();
        const bdOptions = {
            timeZone: 'Asia/Dhaka',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        };
        const bdDateParts = now.toLocaleString('en-US', bdOptions).split(', ')[0].split('/');
        const bdDate = `${bdDateParts[2]}-${bdDateParts[0]}-${bdDateParts[1]}`;

        const bdTimeOptions = {
            timeZone: 'Asia/Dhaka',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        };
        const bdTimeStr = now.toLocaleString('en-US', bdTimeOptions);
        const [bdHour, bdMinute] = bdTimeStr.split(':');
        const bdTimeFormatted = `${parseInt(bdHour)}-${bdMinute}`;

        const filenameDateTime = `${semName.replace(/\s+/g, '')}.${bdDate}.${bdTimeFormatted}`;
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('Time:', pageWidth - margin - 55, 24);
        doc.setTextColor(lightText[0], lightText[1], lightText[2]);
        doc.text(bdTimeFormatted, pageWidth - margin - 35, 24);

        // Calculate column widths and table centering
        const columns = [
            { header: 'Code', width: 28 },
            { header: 'Sec', width: 14 },
            { header: 'Faculty', width: 26 },
            { header: 'Seats (T/C)', width: 22 },
            { header: 'Left', width: 14 },
            { header: 'Days', width: 55 },
            { header: 'Time', width: 42 },
            { header: 'Room', width: 40 }
        ];
        const totalTableWidth = columns.reduce((sum, col) => sum + col.width, 0);
        const tableMargin = (pageWidth - totalTableWidth) / 2;

        // Prepare table data
        const tableData = coursesToExport.map(course => {
            const cleanCode = cleanCourseCode(course.CourseCode);
            return [
                cleanCode,
                course.Section,
                course.ShortName,
                `${course.SeatTaken}/${course.SeatCapacity}`,
                course.SeatsLeft,
                course.Days,
                course.Time,
                course.RoomCode
            ];
        });

        // Generate table with centering and color coding
        doc.autoTable({
            startY: 30,
            head: [columns.map(c => c.header)],
            body: tableData,
            margin: { top: 5, bottom: 10, left: tableMargin, right: tableMargin },
            tableWidth: totalTableWidth,
            theme: 'striped',
            pageBreak: 'auto',
            rowPageBreak: 'avoid',
            styles: {
                fontSize: 8,
                cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 },
                lineColor: [220, 220, 230],
                lineWidth: 0.1,
                textColor: [60, 60, 70],
                font: 'helvetica',
                overflow: 'linebreak',
                minCellHeight: 8,
                halign: 'center',
                valign: 'middle'
            },
            headStyles: {
                fillColor: [108, 99, 255],
                textColor: 255,
                fontStyle: 'bold',
                fontSize: 8,
                halign: 'center',
                cellPadding: { top: 3, right: 2, bottom: 3, left: 2 }
            },
            columnStyles: {
                0: { cellWidth: 28, halign: 'center', fontStyle: 'bold', textColor: [108, 99, 255] },
                1: { cellWidth: 14, halign: 'center' },
                2: { cellWidth: 26, halign: 'center' },
                3: { cellWidth: 22, halign: 'center' },
                4: { cellWidth: 14, halign: 'center' },
                5: { cellWidth: 55, halign: 'center' },
                6: { cellWidth: 42, halign: 'center' },
                7: { cellWidth: 40, halign: 'center' }
            },
            alternateRowStyles: {
                fillColor: [248, 249, 252]
            },
            bodyStyles: {
                fillColor: [255, 255, 255]
            },
            didParseCell: function (data) {
                // Color code seats left column (column index 4)
                if (data.section === 'body' && data.column.index === 4) {
                    const seatsLeft = parseInt(data.cell.raw);
                    if (seatsLeft <= 0) {
                        data.cell.styles.textColor = [239, 68, 68]; // Red
                        data.cell.styles.fontStyle = 'bold';
                    } else if (seatsLeft <= 5) {
                        data.cell.styles.textColor = [245, 158, 11]; // Amber/Yellow
                        data.cell.styles.fontStyle = 'bold';
                    } else {
                        data.cell.styles.textColor = [16, 185, 129]; // Green
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }
        });

        // Compact Footer on all pages
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);

            // Sleek, compact footer background (6mm)
            doc.setFillColor(darkBg[0], darkBg[1], darkBg[2]);
            doc.rect(0, pageHeight - 6, pageWidth, 6, 'F');

            // Thin accent top line
            doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.rect(0, pageHeight - 6, pageWidth, 0.3, 'F');

            // Footer text
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(grayText[0], grayText[1], grayText[2]);
            doc.text('EWU Course Filter V2', margin, pageHeight - 2);

            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 2, { align: 'right' });
        }

        // Generate filename - format: Updated_Faculty_List_Summer-2026.2026-05-18.12-58-37.pdf
        const bdDateFilename = bdDate; // Already formatted as YYYY-MM-DD
        const semNameClean = semName.replace(/\s+/g, '-');
        const fileName = `Updated_Faculty_List_${semNameClean}.${bdDateFilename}.${bdTimeFormatted}.pdf`;

        // Save PDF
        doc.save(fileName);

        // Emit analytics telemetry
        fetch(`https://api.aftabx.tech/api/analytics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'export_pdf',
                count: coursesToExport.length,
                message: `exported ${coursesToExport.length} courses to PDF`
            })
        }).catch(() => {});

        // Show success message
        showSuccess('PDF exported successfully!', 'success-message');
        setTimeout(() => {
            hideMessage('success-message');
        }, 2000);

        console.log('PDF exported:', fileName);

    } catch (error) {
        console.error('PDF export error:', error);
        showError('Failed to export PDF. Please try again.', 'error-message');
    }
}

/**
 * Handle the merged courses page flow
 */
function handleMergedCoursesPage() {
    const initialSection = document.getElementById('initial-selection');
    const coursesSection = document.getElementById('courses-section');
    const fetchBtn = document.getElementById('fetch-courses-btn');

    // Load initial options
    loadDashboardOptions();

    // Handle fetch button click
    if (fetchBtn) {
        fetchBtn.addEventListener('click', handleFetchCourses);
    }
}

// ===== EVENT LISTENERS =====

document.addEventListener('DOMContentLoaded', function () {
    // Password toggle functionality
    const passwordToggle = document.getElementById('password-toggle');
    const passwordInput = document.getElementById('password');

    if (passwordToggle && passwordInput) {
        passwordToggle.addEventListener('click', () => {
            const eyeIcon = passwordToggle.querySelector('.eye-icon');
            const eyeOffIcon = passwordToggle.querySelector('.eye-off-icon');

            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                eyeIcon.classList.add('hidden');
                eyeOffIcon.classList.remove('hidden');
            } else {
                passwordInput.type = 'password';
                eyeIcon.classList.remove('hidden');
                eyeOffIcon.classList.add('hidden');
            }
        });
    }

    // Student ID Auto-Formatting (YYYY-S-XX-XXX)
    const userIdInput = document.getElementById('user-id');

    if (userIdInput) {
        userIdInput.addEventListener('input', function (e) {
            let value = e.target.value;

            // Remove all non-digit characters
            let digits = value.replace(/\D/g, '');

            // Limit to 10 digits max
            if (digits.length > 10) {
                digits = digits.substring(0, 10);
            }

            // Format: YYYY-S-XX-XXX
            let formatted = '';

            if (digits.length > 0) {
                formatted = digits.substring(0, 4); // YYYY
            }
            if (digits.length >= 5) {
                formatted += '-' + digits.substring(4, 5); // -S
            }
            if (digits.length >= 6) {
                formatted += '-' + digits.substring(5, 7); // -XX
            }
            if (digits.length >= 8) {
                formatted += '-' + digits.substring(7, 10); // -XXX
            }

            // Update the input value
            e.target.value = formatted;
        });

        // Handle paste events
        userIdInput.addEventListener('paste', function (e) {
            setTimeout(function () {
                userIdInput.dispatchEvent(new Event('input'));
            }, 10);
        });
    }

    // Hamburger menu toggle
    const checkbox = document.getElementById('checkbox');
    const mobileMenu = document.getElementById('mobile-menu');
    const hamburgerLabel = document.getElementById('hamburger-label');

    if (checkbox && mobileMenu) {
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                mobileMenu.classList.remove('hidden');
            } else {
                mobileMenu.classList.add('hidden');
            }
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (hamburgerLabel && !hamburgerLabel.contains(e.target) && !mobileMenu.contains(e.target) && !checkbox.contains(e.target)) {
                checkbox.checked = false;
                mobileMenu.classList.add('hidden');
            }
        });

        // Close menu when clicking a link
        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                checkbox.checked = false;
                mobileMenu.classList.add('hidden');
            });
        });
    }

    // Floating action buttons
    const floatingRefresh = document.getElementById('floating-refresh');
    const scrollToTop = document.getElementById('scroll-to-top');

    // Floating refresh button
    if (floatingRefresh) {
        floatingRefresh.addEventListener('click', () => {
            floatingRefresh.classList.add('refreshing');
            refreshCourses();
            setTimeout(() => {
                floatingRefresh.classList.remove('refreshing');
            }, 2500);
        });
    }

    // Scroll to top functionality
    if (scrollToTop) {
        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 300) {
                scrollToTop.classList.add('visible');
                scrollToTop.classList.remove('hidden');
            } else {
                scrollToTop.classList.remove('visible');
                setTimeout(() => {
                    if (!scrollToTop.classList.contains('visible')) {
                        scrollToTop.classList.add('hidden');
                    }
                }, 300);
            }
        });

        scrollToTop.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // Check which page we're on and initialize accordingly
    const currentPageUrl = window.location.pathname.split('/').pop();

    // Login page
    if (currentPageUrl.includes('login')) {
        const loginForm = document.getElementById('login-form');
        if (loginForm) loginForm.addEventListener('submit', handleLogin);
    }

    // Courses page
    if (currentPageUrl.includes('courses')) {
        handleMergedCoursesPage();

        // Sort filter
        const sortFilter = document.getElementById('sort-filter');
        if (sortFilter) sortFilter.addEventListener('change', () => { currentPage = 1; applyFiltersAndDisplay(); });

        // Available only toggle
        const availableToggle = document.getElementById('available-only-toggle');
        if (availableToggle) availableToggle.addEventListener('change', () => { currentPage = 1; applyFiltersAndDisplay(); });

        // Page size selector
        const pageSizeSelect = document.getElementById('page-size-select');
        if (pageSizeSelect) pageSizeSelect.addEventListener('change', () => { currentPage = 1; applyFiltersAndDisplay(); });

        // Pagination buttons
        const pageFirst = document.getElementById('page-first');
        const pagePrev = document.getElementById('page-prev');
        const pageNext = document.getElementById('page-next');
        const pageLast = document.getElementById('page-last');
        const pageJump = document.getElementById('page-jump-input');

        if (pageFirst) pageFirst.addEventListener('click', () => { currentPage = 1; applyFiltersAndDisplay(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
        if (pagePrev) pagePrev.addEventListener('click', () => { if (currentPage > 1) { currentPage--; applyFiltersAndDisplay(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
        if (pageNext) pageNext.addEventListener('click', () => { currentPage++; applyFiltersAndDisplay(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
        if (pageLast) pageLast.addEventListener('click', () => { const total = Math.max(1, Math.ceil(lastFilteredCourses.length / pageSize)); currentPage = total; applyFiltersAndDisplay(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
        if (pageJump) pageJump.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = parseInt(pageJump.value);
                if (val && val >= 1) {
                    currentPage = val;
                    applyFiltersAndDisplay();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    pageJump.value = '';
                }
            }
        });

        // Multi-tag & Live search input
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', () => {
                showSearchSuggestions();
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    currentPage = 1;
                    applyFiltersAndDisplay();
                }, 100);
            });
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const query = searchInput.value.trim();
                    if (query) { currentPage = 1; addSearchTag(query); }
                }
            });
        }

        // Suggestion click
        document.addEventListener('click', (e) => {
            if (e.target.closest('.suggestion-item')) {
                const tag = e.target.closest('.suggestion-item').dataset.tag;
                currentPage = 1;
                addSearchTag(tag);
            }
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            const searchContainer = document.querySelector('.search-container');
            const suggestionsEl = document.getElementById('search-suggestions');
            if (searchContainer && !searchContainer.contains(e.target) && suggestionsEl) {
                suggestionsEl.classList.add('hidden');
            }
        });

        // Dynamic department apply button
        const applyDeptBtn = document.getElementById('apply-dept-changes-btn');
        if (applyDeptBtn) {
            applyDeptBtn.addEventListener('click', handleDynamicDeptChange);
        }

        // Details chevron rotation
        const deptPanel = document.getElementById('dept-manager-panel');
        if (deptPanel) {
            deptPanel.addEventListener('toggle', () => {
                const chevron = deptPanel.querySelector('.details-chevron');
                if (chevron) chevron.style.transform = deptPanel.open ? 'rotate(180deg)' : 'rotate(0)';
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) refreshBtn.addEventListener('click', refreshCourses);

        // Export PDF button
        const exportBtn = document.getElementById('export-pdf-btn');
        if (exportBtn) exportBtn.addEventListener('click', exportToPDF);

        // Initialize auto-refresh for V2
        initAutoRefreshV2();
    }
});

// ===== AUTO REFRESH SYSTEM (V2) =====
let v2AutoRefreshInterval = null;
let v2AutoRefreshDelay = 30; // seconds

function initAutoRefreshV2() {
    const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
    const settingsBtn = document.getElementById('auto-refresh-settings-btn');
    const settingsMenu = document.getElementById('auto-refresh-menu');
    const closeMenuBtn = document.getElementById('close-auto-refresh-menu');
    const delayInput = document.getElementById('auto-refresh-delay-input');

    if (autoRefreshToggle) {
        autoRefreshToggle.addEventListener('change', function () {
            if (this.checked) {
                startV2AutoRefresh();
                showSuccess(`Auto Refresh enabled (${v2AutoRefreshDelay}s)`, 'success-message');
                setTimeout(() => hideMessage('success-message'), 2000);
            } else {
                stopV2AutoRefresh();
                showSuccess('Auto Refresh disabled', 'success-message');
                setTimeout(() => hideMessage('success-message'), 2000);
            }
        });
    }

    if (settingsBtn && settingsMenu) {
        settingsBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            settingsMenu.classList.toggle('hidden');
        });

        if (closeMenuBtn) {
            closeMenuBtn.addEventListener('click', () => {
                settingsMenu.classList.add('hidden');
            });
        }

        document.addEventListener('click', function (e) {
            if (!settingsMenu.contains(e.target) && !settingsBtn.contains(e.target)) {
                settingsMenu.classList.add('hidden');
            }
        });

        if (delayInput) {
            // Load saved preference
            const savedDelay = localStorage.getItem('ewu_v2_auto_refresh_delay');
            if (savedDelay) {
                v2AutoRefreshDelay = parseInt(savedDelay, 10);
                delayInput.value = v2AutoRefreshDelay;
            }

            const applyDelay = () => {
                let val = parseInt(delayInput.value, 10);
                if (isNaN(val) || val < 5) val = 5;
                if (val > 300) val = 300;
                delayInput.value = val;
                v2AutoRefreshDelay = val;
                localStorage.setItem('ewu_v2_auto_refresh_delay', val.toString());
                if (autoRefreshToggle && autoRefreshToggle.checked) {
                    startV2AutoRefresh();
                    showSuccess(`Interval updated to ${val}s`, 'success-message');
                    setTimeout(() => hideMessage('success-message'), 1500);
                }
            };
            delayInput.addEventListener('input', applyDelay);
            delayInput.addEventListener('change', applyDelay);
        }
    }
}

function startV2AutoRefresh() {
    stopV2AutoRefresh();
    v2AutoRefreshInterval = setInterval(() => {
        refreshCourses();
    }, v2AutoRefreshDelay * 1000);
}

function stopV2AutoRefresh() {
    if (v2AutoRefreshInterval) {
        clearInterval(v2AutoRefreshInterval);
        v2AutoRefreshInterval = null;
    }
}

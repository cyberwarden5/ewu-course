// ========================================
// Advise Page JavaScript - Enhanced Version
// Premium UI with Advanced Search & PDF Export
// Wrapped in an IIFE to avoid top-level global collisions when the script is
// injected dynamically by the dashboard AJAX router (see dashboard.js).
// ========================================

(() => {
// **IMPORTANT:** Update this to your actual Worker API domain
const API_BASE_URL = 'https://api.aftabx.tech';

// Initialize retry handler
const courseRetryHandler = new RetryHandler();

// State Management
let allCourses = [];
let filteredCourses = [];
let selectedCourseFilter = null;
let currentSort = 'default';
let currentSearch = '';
let scrollPosition = 0;
let currentUserId = 'User';
let suggestionIndex = -1;
let searchTimeout;

// Day abbreviation mapping
const dayMapping = {
    'A': 'Sat',
    'S': 'Sun',
    'M': 'Mon',
    'T': 'Tue',
    'W': 'Wed',
    'R': 'Thu',
    'F': 'Fri'
};

// Parse day and time from TimeSlotName
function parseDayTime(timeSlotName) {
    if (!timeSlotName) return { day: '', time: '' };

    // Extract day abbreviations (capital letters at the start)
    const dayMatch = timeSlotName.match(/^[ASMTWR]+/);
    const dayAbbr = dayMatch ? dayMatch[0] : '';

    // Convert abbreviations to short day names
    const dayNames = dayAbbr.split('').map(d => dayMapping[d] || d).join(', ');

    // Extract time (everything after day abbreviations)
    const time = timeSlotName.replace(/^[ASMTWR]+\s*/, '').trim();

    return { day: dayNames, time: time };
}

// BD Time Update (null-safe: #currentTime only exists while Advise is mounted)
function updateBDTime() {
    const el = document.getElementById('currentTime');
    if (!el) return;
    const now = new Date();
    const options = {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };
    el.textContent = now.toLocaleString('en-US', options);
}

// Live clock is started by initAdvisePage and stopped on navigation so it does
// not keep firing against a removed DOM node.
let adviseClockInterval = null;
function startAdviseClock() {
    stopAdviseClock();
    updateBDTime();
    adviseClockInterval = setInterval(updateBDTime, 1000);
}
function stopAdviseClock() {
    if (adviseClockInterval) {
        clearInterval(adviseClockInterval);
        adviseClockInterval = null;
    }
}
window.stopAdviseClock = stopAdviseClock;

// Check authentication status on page load
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/status`, {
            credentials: 'include'
        });

        const data = await response.json();

        if (!data.loggedIn) {
            window.location.href = 'login';
            return false;
        }

        // Set user ID if available
        if (data.userId) {
            currentUserId = data.userId;
            document.getElementById('userId').textContent = data.userId;
        }

        return true;
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = 'login';
        return false;
    }
}

// Handle logout
async function handleLogout(event) {
    event?.preventDefault();

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

    window.location.href = 'login';
}

// Course fetch attempt function (will be wrapped with retry logic)
async function attemptFetchCourses() {
    const response = await fetch(`${API_BASE_URL}/api/courses`, {
        credentials: 'include'
    });

    if (response.status === 401) {
        return {
            status: 'invalid_credentials',
            message: 'Session expired. Please login again.'
        };
    }

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error);
    }

    const courses = Array.isArray(data) ? data : (data.courses || []);

    return {
        status: 'success',
        data: courses
    };
}

// Load courses via API with retry support
async function loadCourses(maintainScroll = false, useRetry = false) {
    if (maintainScroll) {
        scrollPosition = window.pageYOffset;
    }

    if (!useRetry) {
        // Normal load without retry (for initial page load)
        try {
            const result = await attemptFetchCourses();

            if (result.status === 'invalid_credentials') {
                window.location.href = 'login';
                return;
            }

            if (result.status === 'success') {
                allCourses = result.data;
                populateCourseFilter();
                applyFilters();

                if (maintainScroll) {
                    window.scrollTo(0, scrollPosition);
                }
            }
        } catch (error) {
            console.error('Error loading courses:', error);
            showErrorMessage('Failed to load courses. Please check your connection.');
        }
    } else {
        // Use retry handler for refresh button
        await courseRetryHandler.executeWithRetry(
            () => attemptFetchCourses(),
            {
                operationName: 'Fetching Courses',
                onSuccess: (result) => {
                    allCourses = result.data;
                    populateCourseFilter();
                    applyFilters();

                    if (maintainScroll) {
                        window.scrollTo(0, scrollPosition);
                    }

                    showToast('Courses refreshed successfully', 2000);
                },
                onInvalidCredentials: (result) => {
                    window.location.href = 'login';
                },
                onRetryAttempt: (attemptNum, elapsedTime) => {
                    console.log(`Course fetch attempt ${attemptNum} failed. Elapsed time: ${elapsedTime}s`);
                }
            }
        );
    }
}

// Show error message in table
function showErrorMessage(message) {
    document.getElementById('courseTableBody').innerHTML = `
        <tr>
            <td colspan="10">
                <div class="empty-state">
                    <div class="empty-state-icon" style="background: rgba(239, 68, 68, 0.1);">
                        <svg class="w-6 h-6" style="color: #ef4444;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    </div>
                    <p class="text-red-400 font-medium">${message}</p>
                    <button onclick="loadCourses(false, true)" class="mt-4 px-4 py-2 rounded-lg text-sm font-medium transition-all inline-flex items-center"
                        style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444;">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>Try Again
                    </button>
                </div>
            </td>
        </tr>
    `;
    updateResultCount(0);
}

// Update result count
function updateResultCount(count) {
    const countEl = document.getElementById('resultCount');
    if (countEl) {
        countEl.textContent = `${count} course${count !== 1 ? 's' : ''}`;
    }
}

// Populate course filter dropdown
function populateCourseFilter() {
    const courseCodes = [...new Set(allCourses.map(c => c.CourseCode))].sort();
    const container = document.getElementById('courseFilterOptions');

    if (!container) return;

    const isAllSelected = !selectedCourseFilter;
    container.innerHTML = `
        <div class="filter-option ${isAllSelected ? 'active' : ''}" data-course="" onclick="selectCourseFilter(null, event)">
            <span class="text-white font-medium flex items-center gap-2">
                ${isAllSelected ? '<svg class="w-3.5 h-3.5 text-[#5a8fd8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' : ''} All Courses
            </span>
            <span class="text-gray-400 text-xs ml-2 font-mono">(${allCourses.length})</span>
        </div>
    ` + courseCodes.map(code => {
        const count = allCourses.filter(c => c.CourseCode === code).length;
        const isSelected = selectedCourseFilter === code;
        return `
            <div class="filter-option ${isSelected ? 'active' : ''}" data-course="${code}" onclick="selectCourseFilter('${code.replace(/'/g, "\\'")}', event)">
                <span class="text-white font-medium flex items-center gap-2">
                    ${isSelected ? '<svg class="w-3.5 h-3.5 text-[#5a8fd8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' : ''} ${code}
                </span>
                <span class="text-gray-400 text-xs ml-2 font-mono">(${count})</span>
            </div>
        `;
    }).join('');
}

// Select course filter
function selectCourseFilter(course, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    selectedCourseFilter = course;

    const filterText = document.getElementById('courseFilterText');
    const dropdown = document.getElementById('courseFilterDropdown');

    if (filterText) {
        filterText.textContent = course || 'All Courses';
    }

    if (dropdown) {
        dropdown.classList.add('hidden');
    }

    populateCourseFilter();
    applyFilters();

    // Show confirmation
    showToast(course ? `Filtered by: ${course}` : 'Showing all courses', 1500);
}

function applyFilters() {
    const currentScrollY = window.scrollY;
    let courses = [...allCourses];

    // Apply search filter
    if (currentSearch) {
        const searchNorm = currentSearch.toLowerCase().replace(/[\s\-_]/g, '');
        const searchTokens = currentSearch.toLowerCase().split(/\s+/).filter(Boolean);
        courses = courses.filter(c => {
            const codeNorm = (c.CourseCode || '').toLowerCase().replace(/[\s\-_]/g, '');
            const targetStr = [
                c.CourseCode, c.ShortName, c.RoomName,
                c.TimeSlotName, c.SectionName
            ].join(' ').toLowerCase();

            return (searchNorm && codeNorm.includes(searchNorm)) ||
                   (searchTokens.length > 0 && searchTokens.every(token => targetStr.includes(token)));
        });
    }

    // Apply course filter
    if (selectedCourseFilter) {
        courses = courses.filter(c => c.CourseCode === selectedCourseFilter);
    }

    // Apply available only filter
    const availOnlyEl = document.getElementById('availableOnly');
    if (availOnlyEl && availOnlyEl.checked) {
        courses = courses.filter(c => (c.SeatCapacity - c.SeatTaken) > 0);
    }

    // Apply sorting
    if (currentSort === 'az') {
        courses.sort((a, b) => a.ShortName.localeCompare(b.ShortName));
    } else if (currentSort === 'za') {
        courses.sort((a, b) => b.ShortName.localeCompare(a.ShortName));
    } else if (currentSort === 'seats') {
        courses.sort((a, b) => (b.SeatCapacity - b.SeatTaken) - (a.SeatCapacity - a.SeatTaken));
    }

    filteredCourses = courses;
    updateResultCount(courses.length);
    renderCourseTable();
    window.scrollTo(0, currentScrollY);
}

// Get availability status class and color
function getAvailabilityInfo(available, capacity) {
    const percentage = capacity > 0 ? (available / capacity) * 100 : 0;

    if (available <= 0) {
        return { class: 'status-full', color: '#f87171', bgColor: 'rgba(239, 68, 68, 0.15)' };
    } else if (percentage < 20 || available < 5) {
        return { class: 'status-limited', color: '#fbbf24', bgColor: 'rgba(245, 158, 11, 0.15)' };
    } else {
        return { class: 'status-available', color: '#34d399', bgColor: 'rgba(16, 185, 129, 0.15)' };
    }
}

// Truncate text with ellipsis
function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// Render course table with enhanced UI
function renderCourseTable() {
    const tbody = document.getElementById('courseTableBody');
    if (!tbody) return;

    if (filteredCourses.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10">
                    <div class="empty-state">
                        <div class="empty-state-icon flex items-center justify-center">
                            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
                        </div>
                        <p class="text-gray-400 font-medium">No courses found</p>
                        <p class="text-gray-500 text-sm mt-2">Try adjusting your search or filters</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filteredCourses.map((course, index) => {
        const available = course.SeatCapacity - course.SeatTaken;
        const takenPercentage = course.SeatCapacity > 0 ? (course.SeatTaken / course.SeatCapacity) * 100 : 0;
        const availInfo = getAvailabilityInfo(available, course.SeatCapacity);
        const { day, time } = parseDayTime(course.TimeSlotName);

        return `
            <tr class="course-row" style="animation: fadeInUp 0.3s ease forwards; animation-delay: ${Math.min(index * 0.02, 0.4)}s; opacity: 0;">
                <td class="text-center">
                    <span class="text-gray-500 text-xs font-mono">${index + 1}</span>
                </td>
                <td>
                    <span class="badge-course">${course.CourseCode}</span>
                </td>
                <td class="text-center">
                    <span class="badge-section">${course.SectionName}</span>
                </td>
                <td>
                    <span class="faculty-name" title="${course.ShortName}">${course.ShortName}</span>
                </td>
                <td class="text-center">
                    <span class="text-gray-300 font-medium text-sm">${course.SeatCapacity}</span>
                </td>
                <td class="text-center">
                    <div>
                        <span class="text-amber-400 font-semibold text-sm">${course.SeatTaken}</span>
                        <div class="capacity-bar mx-auto">
                            <div class="capacity-fill" style="width: ${Math.min(takenPercentage, 100)}%; background: ${availInfo.color};"></div>
                        </div>
                    </div>
                </td>
                <td class="text-center">
                    <span class="${availInfo.class} text-sm">${available}</span>
                </td>
                <td class="text-center">
                    <span class="day-badge">${day || 'TBA'}</span>
                </td>
                <td>
                    <span class="time-text">${time || 'TBA'}</span>
                </td>
                <td>
                    <span class="badge-room" title="${course.RoomName}">${course.RoomName}</span>
                </td>
            </tr>
        `;
    }).join('');
}

// Advanced search functionality with intelligent suggestions
function initializeSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchSuggestions = document.getElementById('searchSuggestions');
    const searchClear = document.getElementById('searchClear');

    if (!searchInput) {
        console.warn('Search input not found');
        return;
    }

    // Input handler - INSTANT suggestions with minimal debounce
    searchInput.addEventListener('input', function (e) {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();

        // Toggle clear button visibility
        if (searchClear) {
            searchClear.classList.toggle('hidden', query.length === 0);
        }

        // Show suggestions INSTANTLY (no debounce for suggestions)
        if (query.length >= 1 && allCourses.length > 0) {
            showSearchSuggestions(query);
        } else if (searchSuggestions) {
            searchSuggestions.classList.add('hidden');
            suggestionIndex = -1;
        }

        // Debounce only the table filter for performance
        searchTimeout = setTimeout(() => {
            currentSearch = query.toLowerCase();
            applyFilters();
        }, 80);
    });

    // Focus handler - show suggestions if there's a query
    searchInput.addEventListener('focus', function () {
        const query = this.value.trim();
        if (query.length >= 1 && allCourses.length > 0) {
            showSearchSuggestions(query);
        }
    });

    // Keyboard navigation for suggestions
    searchInput.addEventListener('keydown', function (e) {
        if (!searchSuggestions) return;

        const suggestions = searchSuggestions.querySelectorAll('.suggestion-item-premium');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            suggestionIndex = Math.min(suggestionIndex + 1, suggestions.length - 1);
            updateSuggestionHighlight(suggestions);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            suggestionIndex = Math.max(suggestionIndex - 1, -1);
            updateSuggestionHighlight(suggestions);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (suggestionIndex >= 0 && suggestions[suggestionIndex]) {
                suggestions[suggestionIndex].click();
            } else if (this.value.trim().length > 0) {
                // Apply search filter directly on Enter
                currentSearch = this.value.trim().toLowerCase();
                searchSuggestions.classList.add('hidden');
                applyFilters();
            }
        } else if (e.key === 'Escape') {
            searchSuggestions.classList.add('hidden');
            suggestionIndex = -1;
        }
    });

    // Clear button handler
    if (searchClear) {
        searchClear.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            searchInput.value = '';
            currentSearch = '';
            searchClear.classList.add('hidden');
            if (searchSuggestions) {
                searchSuggestions.classList.add('hidden');
            }
            suggestionIndex = -1;
            applyFilters();
            searchInput.focus();
        });
    }

    // Global keyboard shortcut (Ctrl+K)
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }

        // R for refresh (only when not in input)
        if (e.key === 'r' && !e.ctrlKey && !e.metaKey && document.activeElement !== searchInput) {
            if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault();
                document.getElementById('refreshBtn')?.click();
            }
        }
    });
}

// Update suggestion highlight
function updateSuggestionHighlight(suggestions) {
    suggestions.forEach((item, index) => {
        item.classList.toggle('active', index === suggestionIndex);
    });

    // Scroll into view
    if (suggestionIndex >= 0 && suggestions[suggestionIndex]) {
        suggestions[suggestionIndex].scrollIntoView({ block: 'nearest' });
    }
}

// Show search suggestions with intelligent matching
function showSearchSuggestions(query) {
    const searchSuggestions = document.getElementById('searchSuggestions');
    if (!searchSuggestions) return;

    const queryLower = query.toLowerCase();
    const queryNorm = queryLower.replace(/[\s\-_]/g, '');

    // Intelligent matching with priority scoring
    const scoredMatches = allCourses.map(c => {
        let score = 0;
        const courseCodeLower = c.CourseCode.toLowerCase();
        const courseCodeNorm = courseCodeLower.replace(/[\s\-_]/g, '');
        const shortNameLower = c.ShortName.toLowerCase();
        const roomNameLower = c.RoomName.toLowerCase();
        const timeSlotLower = c.TimeSlotName.toLowerCase();
        const sectionLower = c.SectionName.toLowerCase();

        // Course code exact match (highest priority)
        if (courseCodeLower === queryLower || courseCodeNorm === queryNorm) score += 100;
        else if (courseCodeLower.startsWith(queryLower) || courseCodeNorm.startsWith(queryNorm)) score += 60;
        else if (courseCodeLower.includes(queryLower) || courseCodeNorm.includes(queryNorm)) score += 30;

        // Faculty name matching
        if (shortNameLower.startsWith(queryLower)) score += 40;
        else if (shortNameLower.includes(queryLower)) score += 20;

        // Section matching
        if (sectionLower === queryLower) score += 25;
        else if (sectionLower.includes(queryLower)) score += 12;

        // Room matching
        if (roomNameLower.includes(queryLower)) score += 15;

        // Time matching
        if (timeSlotLower.includes(queryLower)) score += 8;

        return { course: c, score };
    }).filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10); // Increased to 10 suggestions

    if (scoredMatches.length > 0) {
        // Group by course code for better organization
        const uniqueCourses = {};
        scoredMatches.forEach(m => {
            const key = m.course.CourseCode;
            if (!uniqueCourses[key]) {
                uniqueCourses[key] = {
                    courses: [],
                    totalAvailable: 0,
                    highestScore: m.score
                };
            }
            uniqueCourses[key].courses.push(m.course);
            uniqueCourses[key].totalAvailable += (m.course.SeatCapacity - m.course.SeatTaken);
        });

        searchSuggestions.innerHTML = Object.entries(uniqueCourses).map(([code, data]) => {
            const course = data.courses[0];
            const available = data.totalAvailable;
            const availInfo = getAvailabilityInfo(available, data.courses.reduce((a, c) => a + c.SeatCapacity, 0));
            const { day, time } = parseDayTime(course.TimeSlotName);

            return `
                <div class="suggestion-item-premium" onclick="selectSearchSuggestion('${code.replace(/'/g, "\\'")}')"
                    style="animation: fadeInUp 0.2s ease forwards;">
                    <div class="flex justify-between items-start gap-3">
                        <div class="flex-1 min-w-0">
                            <div class="font-semibold text-[#5a8fd8] text-sm mb-1">${code}</div>
                            <div class="text-xs text-gray-400 truncate">${truncateText(course.ShortName, 28)}</div>
                        </div>
                        <div class="text-right flex-shrink-0">
                            <span class="text-sm font-semibold" style="color: ${availInfo.color};">${available} seats</span>
                            <div class="text-xs text-gray-500 mt-0.5">${data.courses.length} section${data.courses.length > 1 ? 's' : ''}</div>
                        </div>
                    </div>
                    <div class="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                        <span class="inline-flex items-center"><svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>${truncateText(course.RoomName, 12)}</span>
                        <span class="inline-flex items-center"><svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>${time || 'TBA'}</span>
                        <span class="inline-flex items-center"><svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>${day || 'TBA'}</span>
                    </div>
                </div>
            `;
        }).join('');

        searchSuggestions.classList.remove('hidden');
        suggestionIndex = -1;
    } else {
        searchSuggestions.innerHTML = `
            <div class="p-6 text-center text-gray-500 text-sm">
                <svg class="w-8 h-8 mx-auto mb-2 text-gray-500 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <p class="font-medium">No matches found</p>
                <p class="text-xs mt-1 text-gray-600">Try searching by course code or faculty name</p>
            </div>
        `;
        searchSuggestions.classList.remove('hidden');
    }
}

// Select search suggestion - filter and show only that course
function selectSearchSuggestion(courseCode) {
    const searchInput = document.getElementById('searchInput');
    const searchSuggestions = document.getElementById('searchSuggestions');
    const searchClear = document.getElementById('searchClear');

    if (searchInput) {
        searchInput.value = courseCode;
    }

    currentSearch = courseCode.toLowerCase();

    if (searchSuggestions) {
        searchSuggestions.classList.add('hidden');
    }

    if (searchClear) {
        searchClear.classList.remove('hidden');
    }

    suggestionIndex = -1;
    applyFilters();

    // Show confirmation toast
    showToast(`Showing results for "${courseCode}"`, 1500);
}

// Available only toggle with enhanced UI
function initializeToggle() {
    const toggle = document.getElementById('availableToggle');
    const checkbox = document.getElementById('availableOnly');

    if (!toggle || !checkbox) {
        return;
    }

    checkbox.addEventListener('change', function () {
        toggle.classList.toggle('active', this.checked);
        applyFilters();
        showToast(this.checked ? 'Showing available seats only' : 'Showing all courses', 1500);
    });

    // Initialize visual state
    if (checkbox.checked) {
        toggle.classList.add('active');
    }
}

// Course filter dropdown toggle - FIXED
function initializeCourseFilterDropdown() {
    const filterBtn = document.getElementById('courseFilterBtn');
    const dropdown = document.getElementById('courseFilterDropdown');

    if (!filterBtn || !dropdown) return;

    filterBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });
}

// Course filter search
function initializeCourseFilterSearch() {
    const filterSearch = document.getElementById('courseFilterSearch');
    if (!filterSearch) return;

    filterSearch.addEventListener('input', function (e) {
        const query = e.target.value.toLowerCase();
        const options = document.querySelectorAll('#courseFilterOptions .filter-option');

        options.forEach(option => {
            const text = option.textContent.toLowerCase();
            option.style.display = text.includes(query) ? '' : 'none';
        });
    });
}

// Close dropdowns when clicking outside
document.addEventListener('click', function (e) {
    const dropdown = document.getElementById('courseFilterDropdown');
    const searchSuggestions = document.getElementById('searchSuggestions');

    // Close course filter dropdown
    if (dropdown && !dropdown.classList.contains('hidden')) {
        if (!e.target.closest('#courseFilterBtn') && !e.target.closest('#courseFilterDropdown')) {
            dropdown.classList.add('hidden');
        }
    }

    // Close search suggestions
    if (searchSuggestions && !searchSuggestions.classList.contains('hidden')) {
        if (!e.target.closest('#searchInput') && !e.target.closest('#searchSuggestions') && !e.target.closest('#searchClear')) {
            searchSuggestions.classList.add('hidden');
            suggestionIndex = -1;
        }
    }
});

// Toast notification function
function showToast(message, duration = 3000) {
    const toast = document.getElementById('toastNotification');
    const toastMessage = document.getElementById('toastMessage');

    toastMessage.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');

        setTimeout(() => {
            toast.classList.remove('hide');
        }, 400);
    }, duration);
}

// Refresh button with AJAX, retry logic and toast notification
document.getElementById('refreshBtn')?.addEventListener('click', async function () {
    const btn = this;
    const icon = this.querySelector('.refresh-icon');

    btn.classList.add('refreshing');

    await loadCourses(true, true); // Enable retry for manual refresh

    setTimeout(() => {
        btn.classList.remove('refreshing');
    }, 600);
});

// ========================================
// ENHANCED PDF EXPORT - Professional Quality
// ========================================
function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape', 'mm', 'a4');
    doc.setProperties({
        title: 'Faculty list',
        author: 'EWU Wiz'
    });

    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 12;

    // Colors
    const primaryColor = [90, 143, 216];
    const accentColor = [216, 108, 90];
    const darkBg = [15, 15, 20];
    const lightText = [255, 255, 255];
    const grayText = [150, 150, 160];

    // Header Background (Reduced to 20mm height)
    doc.setFillColor(darkBg[0], darkBg[1], darkBg[2]);
    doc.rect(0, 0, pageWidth, 20, 'F');

    // Gradient line (Reduced thickness to 1.0mm)
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 20, pageWidth, 1.0, 'F');

    // Title (Reduced font size to 14 and adjusted Y coordinate to 12)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(lightText[0], lightText[1], lightText[2]);
    doc.text('EWU Updated Faculty List', margin, 12);

    // Subtitle (Reduced font size to 8.5 and adjusted Y coordinate to 17)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(grayText[0], grayText[1], grayText[2]);
    doc.text('Generated from recommended course', margin, 17);

    // User Info (right side - adjusted Y coordinates to fit 20mm height and reduced font size)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('Student ID:', pageWidth - margin - 55, 9);
    doc.setTextColor(lightText[0], lightText[1], lightText[2]);
    doc.text(currentUserId, pageWidth - margin - 30, 9);

    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('Generated:', pageWidth - margin - 55, 13);
    doc.setTextColor(lightText[0], lightText[1], lightText[2]);
    const dateStr = new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Dhaka',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
    doc.text(dateStr, pageWidth - margin - 30, 13);

    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('Total Courses:', pageWidth - margin - 55, 17);
    doc.setTextColor(lightText[0], lightText[1], lightText[2]);
    doc.text(String(filteredCourses.length), pageWidth - margin - 30, 17);

    // Prepare table data without text truncation to allow wrapping
    const tableData = filteredCourses.map((course) => {
        const available = course.SeatCapacity - course.SeatTaken;
        const { day, time } = parseDayTime(course.TimeSlotName);

        return [
            course.CourseCode,
            course.SectionName,
            course.ShortName,
            String(course.SeatCapacity),
            String(course.SeatTaken),
            String(available),
            day || 'TBA',
            time || 'TBA',
            course.RoomName
        ];
    });

    // Calculate table width for centering
    const totalTableWidth = 30 + 20 + 26 + 22 + 18 + 22 + 38 + 60 + 46; // Sum = 282mm
    const tableMargin = (pageWidth - totalTableWidth) / 2; // Center the table

    // Add table with professional styling - CENTER ALIGNED
    // Enforce exactly 20 courses per page by setting top margin, startY to 25mm, and bottom margin to 47mm (leaving exactly 138mm height)
    doc.autoTable({
        head: [['Course', 'Section', 'Faculty', 'Capacity', 'Taken', 'Available', 'Day', 'Time', 'Room']],
        body: tableData,
        startY: 25,
        margin: { top: 25, bottom: 47, left: tableMargin, right: tableMargin },
        tableWidth: totalTableWidth,
        theme: 'plain',
        pageBreak: 'auto',
        rowPageBreak: 'avoid',
        styles: {
            fontSize: 8.5,
            cellPadding: { top: 1.8, right: 3, bottom: 1.8, left: 3 },
            lineColor: [30, 30, 40],
            lineWidth: 0.1,
            textColor: [60, 60, 70],
            font: 'helvetica',
            overflow: 'linebreak', // Allow text wrapping
            minCellHeight: 6.5,
            halign: 'center',
            valign: 'middle'
        },
        headStyles: {
            fillColor: [25, 25, 35],
            textColor: [90, 143, 216],
            fontStyle: 'bold',
            fontSize: 8.5,
            halign: 'center',
            cellPadding: { top: 2.2, right: 3, bottom: 2.2, left: 3 }
        },
        columnStyles: {
            0: { cellWidth: 30, halign: 'center', fontStyle: 'bold', textColor: [90, 143, 216] },
            1: { cellWidth: 20, halign: 'center' },   // Section
            2: { cellWidth: 26, halign: 'left' },     // Faculty
            3: { cellWidth: 22, halign: 'center' },   // Capacity
            4: { cellWidth: 18, halign: 'center' },   // Taken
            5: { cellWidth: 22, halign: 'center' },   // Available
            6: { cellWidth: 38, halign: 'center' },   // Day
            7: { cellWidth: 60, halign: 'center' },   // Time
            8: { cellWidth: 46, halign: 'center' }    // Room
        },
        alternateRowStyles: {
            fillColor: [248, 249, 252]
        },
        bodyStyles: {
            fillColor: [255, 255, 255]
        },
        didParseCell: function (data) {
            // Color code availability column (column index 5)
            if (data.section === 'body' && data.column.index === 5) {
                const available = parseInt(data.cell.raw);
                if (available <= 0) {
                    data.cell.styles.textColor = [239, 68, 68]; // Red
                    data.cell.styles.fontStyle = 'bold';
                } else if (available < 5) {
                    data.cell.styles.textColor = [245, 158, 11]; // Amber
                    data.cell.styles.fontStyle = 'bold';
                } else {
                    data.cell.styles.textColor = [16, 185, 129]; // Green
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        },
        willDrawCell: function (data) {
            // Add subtle row border
            if (data.section === 'body') {
                doc.setDrawColor(240, 240, 245);
                doc.setLineWidth(0.1);
            }
        }
    });

    // Footer on all pages
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);

        // Footer background
        doc.setFillColor(darkBg[0], darkBg[1], darkBg[2]);
        doc.rect(0, pageHeight - 12, pageWidth, 12, 'F');

        // Footer line
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, pageHeight - 12, pageWidth, 0.5, 'F');

        // Footer text
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(grayText[0], grayText[1], grayText[2]);
        doc.text('EWU Courses Details', margin, pageHeight - 5);

        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 5, { align: 'right' });
    }

    // Generate filename with date
    const fileName = 'EWU_Courses_' + new Date().toISOString().slice(0, 10) + '.pdf';
    doc.save(fileName);

    // Emit analytics telemetry
    fetch(`${API_BASE_URL}/api/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'export_pdf',
            count: filteredCourses.length,
            message: `exported ${filteredCourses.length} courses to PDF`
        })
    }).catch(() => {});

    showToast('PDF exported successfully!', 2500);
}

// Helper function to truncate text for PDF
function truncateForPDF(text, maxLength) {
    if (!text) return '';
    text = String(text).trim();
    if (!maxLength || text.length <= maxLength) return text;
    // Just return the text and let jsPDF autoTable handle wrapping instead of dot truncation
    return text;
}

// Initialize on page load
async function initAdvisePage() {
    // Initialize all UI components
    startAdviseClock();
    initializeSearch();
    initializeToggle();
    initializeCourseFilterDropdown();
    initializeCourseFilterSearch();
    initializeSortSelect();
    initAutoRefresh();

    // Check authentication first
    const isAuthenticated = await checkAuth();

    if (isAuthenticated) {
        // Load courses after successful auth check
        loadCourses();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { if (!window.__EWU_AJAX_NAV__) initAdvisePage(); });
} else if (!window.__EWU_AJAX_NAV__) {
    initAdvisePage();
}
window.initAdvisePage = initAdvisePage;
window.loadCourses = loadCourses;
window.selectCourseFilter = selectCourseFilter;
window.selectSearchSuggestion = selectSearchSuggestion;
window.exportToPDF = exportToPDF;
window.handleLogout = handleLogout;

// Initialize sort select
function initializeSortSelect() {
    const sortSelect = document.getElementById('sortSelect');
    if (!sortSelect) return;

    sortSelect.addEventListener('change', function (e) {
        currentSort = e.target.value;
        applyFilters();
    });
}

// ========================================
// AUTO REFRESH SYSTEM
// ========================================
let autoRefreshInterval = null;
let autoRefreshDelay = 30; // seconds

function initAutoRefresh() {
    const autoRefreshToggle = document.getElementById('autoRefreshToggle');
    const autoRefreshCheckbox = document.getElementById('autoRefresh');
    const settingsBtn = document.getElementById('auto-refresh-settings-btn');
    const settingsMenu = document.getElementById('auto-refresh-menu');
    const closeMenuBtn = document.getElementById('close-auto-refresh-menu');
    const delayInput = document.getElementById('auto-refresh-delay-input');

    if (autoRefreshCheckbox) {
        autoRefreshCheckbox.addEventListener('change', function () {
            if (autoRefreshToggle) {
                autoRefreshToggle.classList.toggle('active', this.checked);
            }

            if (this.checked) {
                startAutoRefresh();
                showToast(`Auto Refresh enabled (${autoRefreshDelay}s)`, 2000);
            } else {
                stopAutoRefresh();
                showToast('Auto Refresh disabled', 2000);
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
            const savedDelay = localStorage.getItem('ewu_auto_refresh_delay');
            if (savedDelay) {
                autoRefreshDelay = parseInt(savedDelay, 10);
                delayInput.value = autoRefreshDelay;
            }

            // Live-update on input change
            const applyDelay = () => {
                let val = parseInt(delayInput.value, 10);
                if (isNaN(val) || val < 5) val = 5;
                if (val > 300) val = 300;
                delayInput.value = val;
                autoRefreshDelay = val;
                localStorage.setItem('ewu_auto_refresh_delay', val.toString());
                if (autoRefreshCheckbox && autoRefreshCheckbox.checked) {
                    startAutoRefresh();
                    showToast(`Interval updated to ${val}s`, 1500);
                }
            };
            delayInput.addEventListener('input', applyDelay);
            delayInput.addEventListener('change', applyDelay);
        }
    }
}

function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshInterval = setInterval(() => {
        const currentScrollY = window.pageYOffset;
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.classList.add('refreshing');
            loadCourses(true, true).then(() => {
                window.scrollTo(0, currentScrollY);
                refreshBtn.classList.remove('refreshing');
            });
        }
    }, autoRefreshDelay * 1000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}
window.stopAutoRefresh = stopAutoRefresh;

// initAutoRefresh is initialized inside the main DOMContentLoaded above

})();

/**
 * ============================================
 * EWU COURSE FILTER V2 - CLOUDFLARE WORKER
 * ============================================
 * 
 * Handles authentication, session management, and proxying to EWU portal
 * All routes begin with /V2/api/*
 */

// ===== CONFIGURATION =====
const CONFIG = {
    ALLOWED_ORIGINS: [
        'https://aftabx.tech',
        'https://www.aftabx.tech'
    ],
    PORTAL_BASE_URL: 'https://portal.ewubd.edu',
    SESSION_COOKIE_NAME: 'ASP.NET_SessionId',
    COOKIE_PATH: '/',
    MAX_RETRIES: 3,
    TIMEOUT: 60000
};

// ===== CORS HEADERS =====
function getCorsHeaders(request) {
    const origin = request ? request.headers.get('Origin') : null;
    const allowedOrigin = (origin && CONFIG.ALLOWED_ORIGINS.includes(origin)) ? origin : CONFIG.ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With, Cookie, Authorization',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400'
    };
}

// ===== MAIN WORKER HANDLER =====
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    const url = new URL(request.url);
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: getCorsHeaders(request)
        });
    }
    
    // Route handling for /V2/api/* endpoints
    if (url.pathname.startsWith('/V2/api/')) {
        return handleApiRequest(request, url);
    }
    
    // Default response for non-API routes
    return new Response('Not Found', { status: 404 });
}

// ===== API ROUTE HANDLER =====
async function handleApiRequest(request, url) {
    const path = url.pathname;
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    
    try {
        // Enforce Site Closure & IP Block if ADMIN_KV is bound globally
        if (typeof ADMIN_KV !== 'undefined') {
            const isClosed = await ADMIN_KV.get('site_closure_mode') === 'true';
            if (isClosed) {
                return jsonResponse(request, { status: 'error', message: 'Site is currently closed due to maintenance.' }, 503);
            }
            const blockedStr = await ADMIN_KV.get('blocked_ips');
            if (blockedStr) {
                try {
                    const blockedIPs = JSON.parse(blockedStr);
                    if (blockedIPs.includes(ip)) {
                        return jsonResponse(request, { status: 'error', message: 'Your IP is blocked.' }, 403);
                    }
                } catch(e) {}
            }
        }

        // Route to appropriate handler
        if (path === '/V2/api/login' && request.method === 'POST') {
            return await handleLogin(request);
        }
        
        if (path === '/V2/api/logout' && request.method === 'POST') {
            return await handleLogout(request);
        }

        if ((path === '/V2/api/auth/status' || path === '/V2/api/status') && request.method === 'GET') {
            const sessionId = getSessionCookie(request);
            return jsonResponse(request, {
                loggedIn: !!sessionId,
                status: sessionId ? 'success' : 'unauthorized'
            }, 200);
        }
        
        if (path === '/V2/api/options' && request.method === 'GET') {
            return await handleFetchOptions(request);
        }
        
        if (path === '/V2/api/courses' && request.method === 'POST') {
            return await handleFetchCourses(request);
        }
        
        // Unknown route
        return jsonResponse(request, { 
            status: 'error', 
            message: 'Unknown API endpoint' 
        }, 404);
        
    } catch (error) {
        console.error('API Error:', error);
        return jsonResponse(request, { 
            status: 'error', 
            message: 'Internal server error: ' + error.message 
        }, 500);
    }
}

// ===== LOGIN HANDLER =====
async function handleLogin(request) {
    const startTime = Date.now();
    try {
        const body = await request.json();
        const { username, password } = body;
        
        // Validate input
        if (!username || !password) {
            return jsonResponse(request, {
                status: 'failed',
                message: 'Username and password are required'
            });
        }
        
        // Enforce User ID Blocklist
        if (typeof ADMIN_KV !== 'undefined') {
            const blockedUserIdsStr = await ADMIN_KV.get('blocked_user_ids');
            if (blockedUserIdsStr) {
                try {
                    const blockedUserIds = JSON.parse(blockedUserIdsStr);
                    if (blockedUserIds.includes(username)) {
                        return jsonResponse(request, {
                            status: 'failed',
                            message: 'Your account has been restricted from logging in.'
                        }, 403);
                    }
                } catch (e) {}
            }
        }

        // STEP 1: Initial GET request to retrieve hidden values and session
        const getResponse = await fetch(CONFIG.PORTAL_BASE_URL + '/', {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Pragma': 'no-cache'
            }
        });
        
        if (!getResponse.ok) {
            throw new Error('Failed to connect to portal');
        }
        
        const html = await getResponse.text();
        
        // STEP 2: Parse hidden form values (FirstNo and SecondNo)
        const num1Match = html.match(/<input type="hidden" name="FirstNo" value="([^"]+)"/);
        const num2Match = html.match(/<input type="hidden" name="SecondNo" value="([^"]+)"/);
        
        if (!num1Match || !num2Match) {
            throw new Error('Failed to parse portal form values');
        }
        
        const num1 = num1Match[1];
        const num2 = num2Match[1];
        const sum = parseInt(num1) + parseInt(num2);
        
        // STEP 3: Parse ASP.NET session cookie
        const cookies = getResponse.headers.get('set-cookie') || '';
        const sessionMatch = cookies.match(/ASP\.NET_SessionId=([^;]+)/);
        
        if (!sessionMatch) {
            throw new Error('Failed to retrieve session cookie from portal');
        }
        
        const sessionId = sessionMatch[1];
        
        // STEP 4: Prepare POST data with user credentials
        const formData = new URLSearchParams();
        formData.append('Username', username);
        formData.append('Password', password);
        formData.append('Answer', sum.toString());
        formData.append('FirstNo', num1);
        formData.append('SecondNo', num2);
        
        // STEP 5: Submit login POST request
        const loginResponse = await fetch(CONFIG.PORTAL_BASE_URL + '/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': `ASP.NET_SessionId=${sessionId}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body: formData.toString()
        });
        
        if (!loginResponse.ok) {
            throw new Error('Login request failed');
        }
        
        const loginHtml = await loginResponse.text();
        
        // STEP 6: Verify login success
        if (loginHtml.includes('View Profile')) {
            await logV2Event(request, 'login', { userId: username, timeTaken: Date.now() - startTime });
            
            if (typeof ADMIN_KV !== 'undefined') {
                try {
                    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
                    let loginsStr = await ADMIN_KV.get('successful_user_logins');
                    let loginsArr = [];
                    if (loginsStr) {
                        try { loginsArr = JSON.parse(loginsStr); } catch (e) {}
                    }

                    const existingIndex = loginsArr.findIndex(item => item.userId === username);
                    let prevCount = 0;
                    if (existingIndex !== -1) {
                        prevCount = loginsArr[existingIndex].totalLogins || 1;
                        loginsArr.splice(existingIndex, 1);
                    }

                    loginsArr.unshift({
                        userId: username,
                        ip: ip,
                        time: new Date().toISOString(),
                        version: 'V2',
                        totalLogins: prevCount + 1
                    });
                    if (loginsArr.length > 200) loginsArr = loginsArr.slice(0, 200);
                    await ADMIN_KV.put('successful_user_logins', JSON.stringify(loginsArr));
                } catch (e) {}
            }

            // Login successful - set session cookie
            const headers = {
                ...getCorsHeaders(request),
                'Content-Type': 'application/json',
                'Set-Cookie': `${CONFIG.SESSION_COOKIE_NAME}=${sessionId}; Path=${CONFIG.COOKIE_PATH}; Secure; HttpOnly; SameSite=None; Max-Age=1800`
            };
            
            return new Response(JSON.stringify({
                status: 'success',
                message: 'Login successful'
            }), { status: 200, headers });
            
        } else if (loginHtml.includes('Username or password is incorrect')) {
            await logV2Event(request, 'error', { level: 'error', message: `failed V2 login using ${username}: Invalid credentials` });
            return jsonResponse(request, {
                status: 'failed',
                message: 'Username or password is incorrect'
            }, 200);
            
        } else if (loginHtml.includes('Advising is going on for Scheduled students')) {
            let msg = 'Advising is going on for Scheduled students. Please try during your schedule time.';
            const match = loginHtml.match(/<span[^>]*class=["']error["'][^>]*>([\s\S]*?)<\/span>/i);
            if (match && match[1] && match[1].includes('Advising is going on for Scheduled students')) {
                msg = match[1].trim().replace(/\s+/g, ' ');
            }
            await logV2Event(request, 'error', { level: 'error', message: `failed V2 login using ${username}: Advising schedule restriction` });
            return jsonResponse(request, {
                status: 'failed',
                message: msg
            }, 200);
            
        } else if (loginHtml.includes('Invalid answer')) {
            await logV2Event(request, 'error', { level: 'error', message: `failed V2 login using ${username}: Captcha mismatch` });
            return jsonResponse(request, {
                status: 'failed',
                message: 'Portal verification failed. Please try again.'
            }, 200);
            
        } else {
            await logV2Event(request, 'error', { level: 'error', message: `failed V2 login using ${username}: Unknown portal response` });
            return jsonResponse(request, {
                status: 'failed',
                message: 'Could not determine login status. Please try again.'
            }, 200);
        }
        
    } catch (error) {
        console.error('Login error:', error);
        await logV2Event(request, 'error', { level: 'error', message: `V2 login exception: ${error.message}` });
        return jsonResponse(request, {
            status: 'failed',
            message: error.message
        }, 200);
    }
}

// ===== LOGOUT HANDLER =====
async function handleLogout(request) {
    await logV2Event(request, 'logout', { message: 'logged out (V2)' });
    const headers = {
        ...getCorsHeaders(request),
        'Content-Type': 'application/json',
        'Set-Cookie': `${CONFIG.SESSION_COOKIE_NAME}=; Path=${CONFIG.COOKIE_PATH}; Secure; HttpOnly; SameSite=None; Max-Age=0`
    };
    
    return new Response(JSON.stringify({
        status: 'success',
        message: 'Logged out successfully'
    }), { status: 200, headers });
}

// ===== FETCH OPTIONS HANDLER (Departments & Semesters) =====
async function handleFetchOptions(request) {
    try {
        // Get session cookie from request
        const sessionId = getSessionCookie(request);
        
        if (!sessionId) {
            return jsonResponse(request, {
                status: 'error',
                message: 'Unauthorized. Please log in first.'
            }, 401);
        }
        
        // Build cookie string for API requests
        const cookieString = `ASP.NET_SessionId=${sessionId}; perf_dv6Tr4n=1`;
        
        const headers = {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'referer': 'https://portal.ewubd.edu/Home/OfferedCoursesStudent',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'cookie': cookieString
        };
        
        // Fetch departments
        const deptResponse = await fetch(
            CONFIG.PORTAL_BASE_URL + '/api/utility/GetAllAcademicDepartments',
            { headers }
        );
        
        if (!deptResponse.ok) {
            throw new Error('Failed to fetch departments');
        }
        
        const departments = await deptResponse.json();
        
        // Fetch semesters
        const semResponse = await fetch(
            CONFIG.PORTAL_BASE_URL + '/api/utility/GetSemesterForDropDown',
            { headers }
        );
        
        if (!semResponse.ok) {
            throw new Error('Failed to fetch semesters');
        }
        
        const semesters = await semResponse.json();
        
        // Return formatted response
        return jsonResponse(request, {
            status: 'success',
            message: 'Options fetched successfully',
            departments: departments.map(dept => ({
                AcademicDepartmentId: dept.AcademicDepartmentId || '',
                AcademicDepartmentName: dept.AcademicDepartmentName || 'Unknown'
            })),
            semesters: semesters.map(sem => ({
                SemesterId: sem.SemesterId || '',
                SemesterName: sem.SemesterName || 'Unknown'
            }))
        });
        
    } catch (error) {
        console.error('Fetch options error:', error);
        return jsonResponse(request, {
            status: 'error',
            message: error.message
        });
    }
}

// ===== FETCH COURSES HANDLER =====
async function handleFetchCourses(request) {
    try {
        // Get session cookie from request
        const sessionId = getSessionCookie(request);
        
        if (!sessionId) {
            return jsonResponse(request, {
                status: 'error',
                message: 'Unauthorized. Please log in first.'
            }, 401);
        }
        
        // Get POST data
        const body = await request.json();
        const { departmentId, semesterId } = body;
        
        // Validate input
        if (!departmentId || !semesterId) {
            return jsonResponse(request, {
                status: 'error',
                message: 'Department ID and Semester ID are required'
            });
        }
        
        // Build API URL
        const apiUrl = `${CONFIG.PORTAL_BASE_URL}/api/utility/GetAllOfferedCoursesBySemAndDept?deptid=${encodeURIComponent(departmentId)}&semesterid=${encodeURIComponent(semesterId)}`;
        
        // Build cookie string
        const cookieString = `ASP.NET_SessionId=${sessionId}; perf_dv6Tr4n=1`;
        
        const headers = {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'referer': 'https://portal.ewubd.edu/Home/OfferedCoursesStudent',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'cookie': cookieString
        };
        
        // Fetch courses
        const response = await fetch(apiUrl, { headers });
        
        if (!response.ok) {
            throw new Error('Failed to fetch courses. HTTP Code: ' + response.status);
        }
        
        const courses = await response.json();
        
        // Filter and format courses
        const filteredCourses = courses.map(course => {
            const seatCapacity = course.SeatCapacity || 0;
            const seatTaken = course.SeatTaken || 0;
            const seatsLeft = Math.max(0, seatCapacity - seatTaken);
            
            return {
                CourseCode: course.CourseCode || 'N/A',
                Section: course.SectionName || 'N/A',
                ShortName: course.ShortName || 'N/A',
                SeatCapacity: seatCapacity,
                SeatTaken: seatTaken,
                SeatsLeft: seatsLeft,
                TimeSlotName: course.TimeSlotName || 'N/A',
                RoomCode: course.RoomCode || 'N/A'
            };
        });
        
        await logV2Event(request, 'fetch_courses', { count: filteredCourses.length, message: `fetched ${filteredCourses.length} courses (V2)` });

        return jsonResponse(request, {
            status: 'success',
            message: 'Courses fetched successfully',
            courses: filteredCourses,
            count: filteredCourses.length
        });
        
    } catch (error) {
        console.error('Fetch courses error:', error);
        return jsonResponse(request, {
            status: 'error',
            message: error.message
        });
    }
}

// ===== UTILITY & TELEMETRY LOGGING FUNCTIONS =====

async function logV2Event(request, type, details = {}) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const userAgent = request.headers.get('User-Agent') || 'unknown';
    
    // Always forward telemetry to central analytics endpoint
    try {
        fetch('https://api.aftabx.tech/api/analytics', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'CF-Connecting-IP': ip,
                'User-Agent': userAgent
            },
            body: JSON.stringify({
                type: type,
                userId: details.userId || null,
                timeTaken: details.timeTaken || null,
                count: details.count || null,
                level: details.level || (type === 'error' ? 'error' : 'info'),
                version: 'V2',
                message: details.message || (type === 'login' ? `logged in using ${details.userId || 'credentials'} (V2)` : null)
            })
        }).catch(() => {});
    } catch(e) {}

    if (typeof ADMIN_KV === 'undefined') return;
    try {
        const nowIso = new Date().toISOString();
        const dateFormatted = nowIso.replace('T', ' ').substring(0, 19);
        const level = details.level || (type === 'error' ? 'error' : 'info');

        let logMessage = details.message || '';
        if (!logMessage) {
            if (type === 'login') {
                const durationStr = details.timeTaken ? ` - ${details.timeTaken}ms` : '';
                logMessage = `logged in using ${details.userId || 'credentials'} (V2)${durationStr}`;
            } else if (type === 'fetch_courses') {
                logMessage = `fetched ${details.count || 0} courses (V2)`;
            } else if (type === 'fetch_options') {
                logMessage = `fetched options (V2)`;
            } else if (type === 'logout') {
                logMessage = `logged out (V2)`;
            } else {
                logMessage = `triggered ${type} (V2)`;
            }
        }

        const formattedLog = `[${dateFormatted}] [${level}] user [${ip}] ${logMessage}`;

        const logEntry = {
            id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
            time: nowIso,
            level: level,
            type: type,
            ip: ip,
            userId: details.userId || null,
            timeTaken: details.timeTaken || null,
            count: details.count || null,
            userAgent: userAgent,
            formatted: formattedLog
        };

        let logsStr = await ADMIN_KV.get('recent_logs');
        let logsArr = [];
        if (logsStr) {
            try { logsArr = JSON.parse(logsStr); } catch (e) {}
        }

        // Deduplicate rapid repeat events (same IP, type, and path/userId within 15 seconds)
        if (logsArr.length > 0) {
            const last = logsArr[0];
            const timeDiffMs = new Date(nowIso).getTime() - new Date(last.time).getTime();
            const sameUserOrPath = (last.path === logEntry.path) && (last.userId === logEntry.userId);
            if (last.ip === ip && last.type === logEntry.type && sameUserOrPath && timeDiffMs < 15000) {
                return;
            }
        }

        logsArr.unshift(logEntry);
        if (logsArr.length > 500) logsArr = logsArr.slice(0, 500);
        await ADMIN_KV.put('recent_logs', JSON.stringify(logsArr));
    } catch (e) {}
}

/**
 * Get session cookie from request
 */
function getSessionCookie(request) {
    const cookieHeader = request.headers.get('Cookie') || '';
    const match = cookieHeader.match(/ASP\.NET_SessionId=([^;]+)/);
    return match ? match[1] : null;
}

/**
 * Create JSON response with CORS headers
 */
function jsonResponse(request, data, status = 200) {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
            ...getCorsHeaders(request),
            'Content-Type': 'application/json'
        }
    });
}


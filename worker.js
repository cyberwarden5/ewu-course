// ========================================
// Cloudflare Worker - BD Portal Proxy
// ========================================

// **CONFIGURATION**: Portal URL (replace if needed)
const PORTAL_URL = 'https://portal.ewubd.edu';
const PORTAL_API_URL = 'https://portal.ewubd.edu/api/Advising/GetAllRoutine';

// **CONFIGURATION**: Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://aftabx.tech',
  'https://www.aftabx.tech'
];

// **CONFIGURATION**: Feature registry defaults (admin can override per-feature via KV)
// Status values: 'active' | 'beta' | 'maintenance' | 'under_work' | 'coming_soon' | 'off'
const FEATURE_DEFAULTS = {
  recommended: 'active',
  department: 'active',
  schedule: 'active',
  planner: 'active',
  ledger: 'active',
  grades: 'active',
  cgpa: 'active',
  preadvising: 'active',
  degreereview: 'active',
  curriculum: 'active'
};

const FEATURE_STATUSES = ['active', 'beta', 'maintenance', 'under_work', 'coming_soon', 'off'];

// Helper: Read the feature status map from KV, merged over defaults
async function getFeatureStatus(env) {
  const result = { ...FEATURE_DEFAULTS };
  if (env && env.ADMIN_KV) {
    try {
      const raw = await env.ADMIN_KV.get('feature_status');
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const key of Object.keys(FEATURE_DEFAULTS)) {
          if (parsed && typeof parsed[key] === 'string' && FEATURE_STATUSES.includes(parsed[key])) {
            result[key] = parsed[key];
          }
        }
      }
    } catch (e) { }
  }
  return result;
}

// Helper: Fetch from upstream with automatic retry + timeout
async function fetchWithRetry(url, options = {}, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);

      // Retry only on transient server errors; return client errors immediately
      if (response.status >= 500 && attempt < retries) {
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  throw lastError || new Error('Upstream request failed');
}

// Helper: Build portal request headers for a given session + referer
function buildPortalHeaders(sessionId, referer) {
  return {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    'referer': referer || 'https://portal.ewubd.edu/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'cookie': `ASP.NET_SessionId=${sessionId}; perf_dv6Tr4n=1`
  };
}

// Helper: Safely parse JSON from portal responses (handles unescaped newlines in strings)
async function parsePortalJson(response) {
  if (!response) return null;
  const rawText = await response.text();
  if (!rawText || !rawText.trim()) return null;
  try {
    return JSON.parse(rawText);
  } catch (err) {
    try {
      const sanitized = rawText.replace(/[\r\n\t]+/g, ' ');
      return JSON.parse(sanitized);
    } catch (e2) {
      console.warn('Failed to parse portal JSON:', e2);
      return null;
    }
  }
}

// Helper: Get CORS headers
function getCorsHeaders(request) {
  const origin = request?.headers?.get('Origin');
  const isAllowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  );

  // Always vary on Origin so shared caches never mix reflected-origin responses.
  const headers = { 'Vary': 'Origin' };

  if (isAllowed) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Cookie, Authorization, X-Requested-With';
    headers['Access-Control-Max-Age'] = '86400';
  }

  return headers;
}

// Helper: Create JSON response with CORS
function jsonResponse(data, status = 200, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(request)
    }
  });
}

// Helper: SHA-256 hash using Web Crypto API
async function hashSHA256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Helper: Extract cookie value from Cookie header
function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.split('=');
    if (cookieName === name) {
      return cookieValue;
    }
  }
  return null;
}

// ===== STEP 1: GET portal page to fetch hidden fields and session cookie =====
async function getPortalFormData() {
  try {
    const response = await fetch(PORTAL_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko',
        'Pragma': 'no-cache',
        'Accept': '*/*'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to connect to portal');
    }

    const html = await response.text();

    // ===== STEP 2: Parse hidden form values (FirstNo and SecondNo) =====
    const num1Match = html.match(/<input type="hidden" name="FirstNo" value="([^"]+)"/);
    const num2Match = html.match(/<input type="hidden" name="SecondNo" value="([^"]+)"/);

    const num1 = num1Match ? num1Match[1] : null;
    const num2 = num2Match ? num2Match[1] : null;

    if (!num1 || !num2) {
      throw new Error('Failed to parse portal form values');
    }

    // ===== STEP 3: Extract ASP.NET_SessionId from Set-Cookie header =====
    const setCookieHeader = response.headers.get('Set-Cookie');
    let sessionId = null;

    if (setCookieHeader) {
      // Parse Set-Cookie header to extract ASP.NET_SessionId
      const cookies = setCookieHeader.split(',').map(c => c.trim());
      for (const cookie of cookies) {
        if (cookie.includes('ASP.NET_SessionId')) {
          const match = cookie.match(/ASP\.NET_SessionId=([^;]+)/);
          if (match) {
            sessionId = match[1];
            break;
          }
        }
      }
    }

    if (!sessionId) {
      throw new Error('Failed to retrieve session cookie from portal');
    }

    return {
      num1,
      num2,
      sessionId
    };
  } catch (error) {
    console.error('getPortalFormData error:', error);
    throw error;
  }
}

// ===== STEP 4: Submit login POST request =====
async function performLogin(username, password, formData) {
  const { num1, num2, sessionId } = formData;

  // Calculate sum for Answer field
  const sum = parseInt(num1) + parseInt(num2);

  // Prepare POST data
  const postData = new URLSearchParams({
    Username: username,
    Password: password,
    Answer: sum.toString(),
    FirstNo: num1,
    SecondNo: num2
  });

  try {
    const response = await fetch(PORTAL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `ASP.NET_SessionId=${sessionId}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: postData.toString()
    });

    if (!response.ok) {
      throw new Error('Login request failed');
    }

    const html = await response.text();

    // ===== STEP 5: Verify login success =====
    if (html.includes('View Profile')) {
      return {
        success: true,
        sessionId: sessionId,
        userId: username
      };
    } else if (html.includes('Username or password is incorrect')) {
      return {
        success: false,
        message: 'Username or password is incorrect'
      };
    } else if (html.includes('Advising is going on for Scheduled students')) {
      let msg = 'Advising is going on for Scheduled students. Please try during your schedule time.';
      const match = html.match(/<span[^>]*class=["']error["'][^>]*>([\s\S]*?)<\/span>/i);
      if (match && match[1] && match[1].includes('Advising is going on for Scheduled students')) {
        msg = match[1].trim().replace(/\s+/g, ' ');
      }
      return {
        success: false,
        message: msg
      };
    } else if (html.includes('Invalid answer')) {
      return {
        success: false,
        message: 'Portal verification failed. Please try again.'
      };
    } else {
      return {
        success: false,
        message: 'Could not determine login status. Please try again.'
      };
    }
  } catch (error) {
    console.error('performLogin error:', error);
    throw error;
  }
}

// ===== ENDPOINT: POST /api/auth/login =====
async function handleLogin(request, env) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return jsonResponse({
        status: 'error',
        message: 'Username and password are required'
      }, 400, request);
    }

    // Check User ID Blocklist
    if (env && env.ADMIN_KV) {
      const blockedUserIdsStr = await env.ADMIN_KV.get('blocked_user_ids');
      if (blockedUserIdsStr) {
        try {
          const blockedUserIds = JSON.parse(blockedUserIdsStr);
          if (blockedUserIds.includes(username)) {
            return jsonResponse({
              status: 'error',
              message: 'Your account has been restricted from logging in.'
            }, 403, request);
          }
        } catch (e) { }
      }
    }

    // Step 1: Get form data and session
    const formData = await getPortalFormData();

    // Step 2: Perform login
    const loginResult = await performLogin(username, password, formData);

    if (loginResult.success) {
      // Record successful login telemetry
      if (env && env.ADMIN_KV) {
        try {
          const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
          let loginsStr = await env.ADMIN_KV.get('successful_user_logins');
          let loginsArr = [];
          if (loginsStr) {
            try { loginsArr = JSON.parse(loginsStr); } catch (e) { }
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
            version: 'V1',
            totalLogins: prevCount + 1
          });
          if (loginsArr.length > 200) loginsArr = loginsArr.slice(0, 200);
          await env.ADMIN_KV.put('successful_user_logins', JSON.stringify(loginsArr));
        } catch (e) { }
      }

      // Set cookie on the browser with secure attributes
      // **IMPORTANT**: Cookie must be set on api.aftabx.tech domain
      const cookieHeader = `ASP.NET_SessionId=${loginResult.sessionId}; Path=/; Secure; HttpOnly; SameSite=None; Max-Age=3600`;

      return new Response(JSON.stringify({
        status: 'success',
        message: 'Login successful',
        userId: loginResult.userId
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': cookieHeader,
          ...getCorsHeaders(request)
        }
      });
    } else {
      return jsonResponse({
        status: 'error',
        message: loginResult.message
      }, 401, request);
    }
  } catch (error) {
    console.error('handleLogin error:', error);
    return jsonResponse({
      status: 'error',
      message: error.message || 'Login failed. Please try again.'
    }, 500, request);
  }
}

// ===== ENDPOINT: POST /api/auth/logout =====
function handleLogout(request) {
  // Clear the session cookie
  const cookieHeader = 'ASP.NET_SessionId=; Path=/; Secure; HttpOnly; SameSite=None; Max-Age=0';

  return new Response(JSON.stringify({
    status: 'success',
    message: 'Logged out successfully'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookieHeader,
      ...getCorsHeaders(request)
    }
  });
}

// ===== ENDPOINT: GET /api/auth/status =====
async function handleAuthStatus(request) {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = getCookieValue(cookieHeader, 'ASP.NET_SessionId');

  if (!sessionId) {
    return jsonResponse({
      loggedIn: false
    }, 200, request);
  }

  try {
    // Validate session against portal API endpoint
    const apiUrl = `${PORTAL_URL}/api/StudentProfile/GetStudentProfile`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: buildPortalHeaders(sessionId, 'https://portal.ewubd.edu/Home/Profile'),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (response.status === 401 || response.status === 403) {
      return jsonResponse({
        loggedIn: false,
        error: 'Session expired'
      }, 200, request);
    }

    if (!response.ok) {
      return jsonResponse({
        loggedIn: false,
        error: 'Invalid session'
      }, 200, request);
    }

    const data = await parsePortalJson(response);
    const student = Array.isArray(data) ? data[0] : data;
    if (student && (student.StudentId || student.StudentName || student.Id)) {
      return jsonResponse({
        loggedIn: true,
        userId: student.StudentId || student.StudentName || 'Student'
      }, 200, request);
    }

    return jsonResponse({
      loggedIn: false
    }, 200, request);
  } catch (err) {
    console.warn('handleAuthStatus validation failed:', err ? err.message : err);
    return jsonResponse({
      loggedIn: false,
      error: 'Validation failed'
    }, 200, request);
  }
}

// ===== ENDPOINT: GET /api/courses =====
async function handleGetCourses(request) {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = getCookieValue(cookieHeader, 'ASP.NET_SessionId');

  if (!sessionId) {
    return jsonResponse({
      success: false,
      error: 'Unauthorized'
    }, 401, request);
  }

  try {
    // Forward request to portal API with session cookie
    const response = await fetch(PORTAL_API_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1',
        'Referer': 'https://portal.ewubd.edu/Home/Advising',
        'Cookie': `ASP.NET_SessionId=${sessionId}; perf_dv6Tr4n=1`
      }
    });

    // Check for unauthorized response
    if (response.status === 401 || response.status === 403) {
      return jsonResponse({
        success: false,
        error: 'Session expired'
      }, 401, request);
    }

    if (!response.ok) {
      throw new Error('Failed to fetch courses from portal');
    }

    const data = await response.json();
    const rawList = Array.isArray(data) ? data : [];

    const formattedCourses = rawList.map(course => ({
      RoomName: course.RoomName || '',
      RoomCode: course.RoomCode || '',
      CourseCode: course.CourseCode || '',
      SeatCapacity: typeof course.SeatCapacity === 'number' ? course.SeatCapacity : (parseInt(course.SeatCapacity) || 0),
      SeatTaken: typeof course.SeatTaken === 'number' ? course.SeatTaken : (parseInt(course.SeatTaken) || 0),
      ShortName: course.ShortName || '',
      TimeSlotName: course.TimeSlotName || '',
      CreditHour: typeof course.CreditHour === 'number' ? course.CreditHour : (parseInt(course.CreditHour) || 0),
      NumberOfMissingGrades: typeof course.NumberOfMissingGrades === 'number' ? course.NumberOfMissingGrades : (parseInt(course.NumberOfMissingGrades) || 0),
      RoutineId: course.RoutineId !== undefined ? course.RoutineId : null,
      SectionId: course.SectionId !== undefined ? course.SectionId : null,
      SectionName: course.SectionName !== undefined ? course.SectionName : '',
      TimeSlotId: course.TimeSlotId !== undefined ? course.TimeSlotId : null
    }));

    return jsonResponse({
      success: true,
      courses: formattedCourses
    }, 200, request);
  } catch (error) {
    console.error('handleGetCourses error:', error);
    return jsonResponse({
      success: false,
      error: 'Failed to fetch courses'
    }, 500, request);
  }
}

// ===== ENDPOINT: GET /api/options or /api/department-options =====
async function handleGetDepartmentOptions(request) {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = getCookieValue(cookieHeader, 'ASP.NET_SessionId');

  if (!sessionId) {
    return jsonResponse({
      status: 'error',
      message: 'Unauthorized. Please log in first.'
    }, 401, request);
  }

  const cookieString = `ASP.NET_SessionId=${sessionId}; perf_dv6Tr4n=1`;
  const headers = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    'referer': 'https://portal.ewubd.edu/Home/OfferedCoursesStudent',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'cookie': cookieString
  };

  try {
    const deptPromise = fetch(`${PORTAL_URL}/api/utility/GetAllAcademicDepartments`, { headers });
    const semPromise = fetch(`${PORTAL_URL}/api/utility/GetSemesterForDropDown`, { headers });

    const [deptRes, semRes] = await Promise.all([deptPromise, semPromise]);

    if (deptRes.status === 401 || deptRes.status === 403 || semRes.status === 401 || semRes.status === 403) {
      return jsonResponse({
        status: 'error',
        message: 'Session expired'
      }, 401, request);
    }

    if (!deptRes.ok || !semRes.ok) {
      throw new Error('Failed to fetch department/semester options from portal');
    }

    const departments = await deptRes.json();
    const semesters = await semRes.json();

    return jsonResponse({
      status: 'success',
      message: 'Options fetched successfully',
      departments: Array.isArray(departments) ? departments.map(dept => ({
        AcademicDepartmentId: dept.AcademicDepartmentId || '',
        AcademicDepartmentName: dept.AcademicDepartmentName || 'Unknown'
      })) : [],
      semesters: Array.isArray(semesters) ? semesters.map(sem => ({
        SemesterId: sem.SemesterId || '',
        SemesterName: sem.SemesterName || 'Unknown'
      })) : []
    }, 200, request);
  } catch (error) {
    console.error('handleGetDepartmentOptions error:', error);
    return jsonResponse({
      status: 'error',
      message: error.message || 'Failed to fetch options'
    }, 500, request);
  }
}

// ===== ENDPOINT: POST or GET /api/department-courses =====
async function handleGetDepartmentCourses(request) {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = getCookieValue(cookieHeader, 'ASP.NET_SessionId');

  if (!sessionId) {
    return jsonResponse({
      status: 'error',
      message: 'Unauthorized. Please log in first.'
    }, 401, request);
  }

  let departmentId, semesterId;
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      departmentId = body.departmentId;
      semesterId = body.semesterId;
    } catch (e) { }
  } else {
    const url = new URL(request.url);
    departmentId = url.searchParams.get('deptid') || url.searchParams.get('departmentId');
    semesterId = url.searchParams.get('semesterid') || url.searchParams.get('semesterId');
  }

  if (!departmentId || !semesterId) {
    return jsonResponse({
      status: 'error',
      message: 'Department ID and Semester ID are required'
    }, 400, request);
  }

  const cookieString = `ASP.NET_SessionId=${sessionId}; perf_dv6Tr4n=1`;
  const headers = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    'referer': 'https://portal.ewubd.edu/Home/OfferedCoursesStudent',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'cookie': cookieString
  };

  try {
    const apiUrl = `${PORTAL_URL}/api/utility/GetAllOfferedCoursesBySemAndDept?deptid=${encodeURIComponent(departmentId)}&semesterid=${encodeURIComponent(semesterId)}`;
    const response = await fetch(apiUrl, { headers });

    if (response.status === 401 || response.status === 403) {
      return jsonResponse({
        status: 'error',
        message: 'Session expired'
      }, 401, request);
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch courses. Status: ${response.status}`);
    }

    const courses = await response.json();
    const rawList = Array.isArray(courses) ? courses : [];

    const formattedCourses = rawList.map(course => {
      const seatCapacity = typeof course.SeatCapacity === 'number' ? course.SeatCapacity : (parseInt(course.SeatCapacity) || 0);
      const seatTaken = typeof course.SeatTaken === 'number' ? course.SeatTaken : (parseInt(course.SeatTaken) || 0);
      const seatsLeft = Math.max(0, seatCapacity - seatTaken);

      return {
        CourseCode: course.CourseCode || 'N/A',
        Section: course.SectionName || 'N/A',
        SectionName: course.SectionName || 'N/A',
        ShortName: course.ShortName || 'N/A',
        SeatCapacity: seatCapacity,
        SeatTaken: seatTaken,
        SeatsLeft: seatsLeft,
        Schedule: course.TimeSlotName || 'N/A',
        TimeSlotName: course.TimeSlotName || 'N/A',
        RoomName: course.RoomName || 'N/A',
        RoomCode: course.RoomCode || '',
        CreditHour: typeof course.CreditHour === 'number' ? course.CreditHour : (parseInt(course.CreditHour) || 0),
        RoutineId: course.RoutineId !== undefined ? course.RoutineId : null,
        SectionId: course.SectionId !== undefined ? course.SectionId : null,
        TimeSlotId: course.TimeSlotId !== undefined ? course.TimeSlotId : null
      };
    });

    return jsonResponse({
      status: 'success',
      courses: formattedCourses
    }, 200, request);
  } catch (error) {
    console.error('handleGetDepartmentCourses error:', error);
    return jsonResponse({
      status: 'error',
      message: error.message || 'Failed to fetch department courses'
    }, 500, request);
  }
}

// ===== ENDPOINT: GET /api/schedule/semesters =====
async function handleGetSemesters(request) {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = getCookieValue(cookieHeader, 'ASP.NET_SessionId');

  if (!sessionId) {
    return jsonResponse({ status: 'error', message: 'Unauthorized. Please log in first.' }, 401, request);
  }

  try {
    const response = await fetchWithRetry(
      `${PORTAL_URL}/api/utility/GetSemesterForDropDown`,
      { headers: buildPortalHeaders(sessionId, 'https://portal.ewubd.edu/Home/ClassSchedule') }
    );

    if (response.status === 401 || response.status === 403) {
      return jsonResponse({ status: 'error', message: 'Session expired' }, 401, request);
    }
    if (!response.ok) throw new Error('Failed to fetch semesters from portal');

    const semesters = await response.json();
    const rawList = Array.isArray(semesters) ? semesters : [];

    const formatted = rawList.map(sem => ({
      SemesterId: sem.SemesterId,
      SemesterName: sem.SemesterName || 'Unknown',
      StartingDate: sem.StartingDate || null,
      EndingDate: sem.EndingDate || null,
      IsActive: sem.IsActive === true
    })).filter(s => s.SemesterId !== undefined && s.SemesterId !== null);

    return jsonResponse({ status: 'success', semesters: formatted }, 200, request);
  } catch (error) {
    console.error('handleGetSemesters error:', error);
    return jsonResponse({ status: 'error', message: error.message || 'Failed to fetch semesters' }, 500, request);
  }
}

// ===== ENDPOINT: GET /api/schedule?semesterId= =====
async function handleGetClassSchedule(request) {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = getCookieValue(cookieHeader, 'ASP.NET_SessionId');

  if (!sessionId) {
    return jsonResponse({ status: 'error', message: 'Unauthorized. Please log in first.' }, 401, request);
  }

  const url = new URL(request.url);
  const semesterId = url.searchParams.get('semesterId') || url.searchParams.get('semesterid');
  if (!semesterId) {
    return jsonResponse({ status: 'error', message: 'Semester ID is required' }, 400, request);
  }

  try {
    const apiUrl = `${PORTAL_URL}/api/Advising/GetSemesterStudentWiseAdvisingCourseListStudent/${encodeURIComponent(semesterId)}`;
    const response = await fetchWithRetry(
      apiUrl,
      { headers: buildPortalHeaders(sessionId, 'https://portal.ewubd.edu/Home/ClassSchedule') }
    );

    if (response.status === 401 || response.status === 403) {
      return jsonResponse({ status: 'error', message: 'Session expired' }, 401, request);
    }
    if (!response.ok) throw new Error('Failed to fetch class schedule from portal');

    const data = await response.json();
    const rawList = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);

    const courses = rawList.map(c => ({
      CourseCode: c.CourseCode || '',
      SectionName: (c.SectionName !== undefined && c.SectionName !== null) ? c.SectionName : '',
      RoomName: c.RoomName || '',
      ShortName: c.ShortName || '',
      FacultyName: c.FacultyName || '',
      Email: c.Email || '',
      TimeSlotName: c.TimeSlotName || '',
      CreditHour: typeof c.CreditHour === 'number' ? c.CreditHour : (parseFloat(c.CreditHour) || 0),
      SeatCapacity: typeof c.SeatCapacity === 'number' ? c.SeatCapacity : (parseInt(c.SeatCapacity) || 0),
      SeatTaken: typeof c.SeatTaken === 'number' ? c.SeatTaken : (parseInt(c.SeatTaken) || 0),
      DropStatus: c.DropStatus || 'No',
      WithDrawStatus: c.WithDrawStatus || 'No',
      IsDrop: c.IsDrop || false,
      IsWithdraw: c.IsWithdraw || false
    }));

    return jsonResponse({ status: 'success', semesterId, courses }, 200, request);
  } catch (error) {
    console.error('handleGetClassSchedule error:', error);
    return jsonResponse({ status: 'error', message: error.message || 'Failed to fetch class schedule' }, 500, request);
  }
}

// ===== ENDPOINT: GET /api/routine =====  (Course Planner: all offered routine)
async function handleGetRoutine(request) {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = getCookieValue(cookieHeader, 'ASP.NET_SessionId');

  if (!sessionId) {
    return jsonResponse({ status: 'error', message: 'Unauthorized. Please log in first.' }, 401, request);
  }

  try {
    const response = await fetchWithRetry(
      PORTAL_API_URL,
      { headers: buildPortalHeaders(sessionId, 'https://portal.ewubd.edu/Home/AdvisingOffline') }
    );

    if (response.status === 401 || response.status === 403) {
      return jsonResponse({ status: 'error', message: 'Session expired' }, 401, request);
    }
    if (!response.ok) throw new Error('Failed to fetch routine from portal');

    const data = await response.json();
    const rawList = Array.isArray(data) ? data : [];

    const courses = rawList.map(c => ({
      CourseCode: c.CourseCode || '',
      SectionName: (c.SectionName !== undefined && c.SectionName !== null) ? c.SectionName : '',
      RoomName: c.RoomName || '',
      RoomCode: c.RoomCode || '',
      ShortName: c.ShortName || '',
      FacultyName: c.FacultyName || '',
      TimeSlotName: c.TimeSlotName || '',
      CreditHour: typeof c.CreditHour === 'number' ? c.CreditHour : (parseFloat(c.CreditHour) || 0),
      SeatCapacity: typeof c.SeatCapacity === 'number' ? c.SeatCapacity : (parseInt(c.SeatCapacity) || 0),
      SeatTaken: typeof c.SeatTaken === 'number' ? c.SeatTaken : (parseInt(c.SeatTaken) || 0),
      IsLab: !!c.IsLab,
      PrerequisiteCourseCodes: c.PrerequisiteCourseCodes || null,
      RoutineId: c.RoutineId !== undefined ? c.RoutineId : null,
      SectionId: c.SectionId !== undefined ? c.SectionId : null,
      TimeSlotId: c.TimeSlotId !== undefined ? c.TimeSlotId : null
    })).filter(c => c.CourseCode);

    return jsonResponse({ status: 'success', courses }, 200, request);
  } catch (error) {
    console.error('handleGetRoutine error:', error);
    return jsonResponse({ status: 'error', message: error.message || 'Failed to fetch routine' }, 500, request);
  }
}

// ===== ENDPOINT: GET /api/ledger =====
async function handleGetLedger(request) {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = getCookieValue(cookieHeader, 'ASP.NET_SessionId');

  if (!sessionId) {
    return jsonResponse({ status: 'error', message: 'Unauthorized. Please log in first.' }, 401, request);
  }

  const headers = buildPortalHeaders(sessionId, 'https://portal.ewubd.edu/Home/StudentLedger');

  try {
    const [txnRes, balRes] = await Promise.all([
      fetchWithRetry(`${PORTAL_URL}/api/StudentLedger/GetStudentLedgerByStudentId`, { headers }),
      fetchWithRetry(`${PORTAL_URL}/api/StudentLedger/GetStudentClosingBalance`, { headers })
    ]);

    if (txnRes.status === 401 || txnRes.status === 403 || balRes.status === 401 || balRes.status === 403) {
      return jsonResponse({ status: 'error', message: 'Session expired' }, 401, request);
    }

    const transactions = txnRes.ok ? await txnRes.json() : [];
    const balanceRaw = balRes.ok ? await balRes.json() : {};

    const balance = balanceRaw && typeof balanceRaw === 'object' && !Array.isArray(balanceRaw) ? balanceRaw : {};

    return jsonResponse({
      status: 'success',
      transactions: Array.isArray(transactions) ? transactions.map(t => ({
        StudentLedgerId: t.StudentLedgerId,
        SemesterName: t.SemesterName || '',
        VoucherType: t.VoucherType || '',
        AmountCr: typeof t.AmountCr === 'number' ? t.AmountCr : (parseFloat(t.AmountCr) || 0),
        AmountDr: typeof t.AmountDr === 'number' ? t.AmountDr : (parseFloat(t.AmountDr) || 0),
        Description: t.Description || '',
        AccountsReferance: t.AccountsReferance || '',
        AccTransferDate: t.AccTransferDate || null,
        CreatedDate: t.CreatedDate || null
      })) : [],
      closingBalance: {
        StudentName: balance.FirstName || '',
        Balance: balance.Balance != null ? balance.Balance : null,
        CurrentDue: balance.CurrentDue != null ? balance.CurrentDue : null,
        MobileNo: balance.MobileNo || '',
        FatherMobileNo: balance.FatherMobileNo || ''
      }
    }, 200, request);
  } catch (error) {
    console.error('handleGetLedger error:', error);
    return jsonResponse({ status: 'error', message: error.message || 'Failed to fetch ledger' }, 500, request);
  }
}

// ===== ENDPOINT: GET /api/grades =====  (Grade Report HTML)
async function handleGetGradeReport(request) {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = getCookieValue(cookieHeader, 'ASP.NET_SessionId');

  if (!sessionId) {
    return jsonResponse({ status: 'error', message: 'Unauthorized. Please log in first.' }, 401, request);
  }

  try {
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const cookie = `ASP.NET_SessionId=${sessionId}; perf_dv6Tr4n=1`;
    const reportUrl = `${PORTAL_URL}/ReportForms/rptGradeSheetStudent.aspx`;

    // 1st Request: GET initial ReportViewer page to extract ASP.NET state (__VIEWSTATE, __EVENTVALIDATION, etc.)
    const getHeaders = {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'referer': `${PORTAL_URL}/Home/Index`,
      'user-agent': userAgent,
      'cookie': cookie
    };

    const firstResponse = await fetchWithRetry(reportUrl, { headers: getHeaders });

    if (firstResponse.status === 401 || firstResponse.status === 403) {
      return jsonResponse({ status: 'error', message: 'Session expired' }, 401, request);
    }
    if (!firstResponse.ok) throw new Error('Failed to fetch grade report page from portal');

    const firstHtml = await firstResponse.text();

    // Detect unauthenticated / redirected login page
    if (!firstHtml || firstHtml.length < 500 || firstHtml.includes('login') && !firstHtml.includes('ReportViewer1')) {
      return jsonResponse({ status: 'error', message: 'Session expired or grade report unavailable' }, 401, request);
    }

    // Extract ASP.NET form inputs
    const formFields = {};
    const inputRegex = /<input\b[^>]*>/gi;
    let inputMatch;
    while ((inputMatch = inputRegex.exec(firstHtml)) !== null) {
      const tag = inputMatch[0];
      const nameMatch = tag.match(/name=["']([^"']+)["']/i);
      const valMatch = tag.match(/value=["']([^"']*)["']/i);
      if (nameMatch) {
        formFields[nameMatch[1]] = valMatch ? valMatch[1] : '';
      }
    }

    const viewState = formFields['__VIEWSTATE'] || '';
    const viewStateGenerator = formFields['__VIEWSTATEGENERATOR'] || '43268499';
    const eventValidation = formFields['__EVENTVALIDATION'] || '';

    // If initial page has no viewstate, fallback to returning 1st HTML
    if (!viewState) {
      return jsonResponse({ status: 'success', html: firstHtml }, 200, request);
    }

    // 2nd Request: AJAX POST triggering ReportViewer1$ctl13$Reserved_AsyncLoadTarget
    const postParams = new URLSearchParams();
    postParams.append('ctl02', 'ctl02|ReportViewer1$ctl13$Reserved_AsyncLoadTarget');
    postParams.append('__EVENTTARGET', 'ReportViewer1$ctl13$Reserved_AsyncLoadTarget');
    postParams.append('__EVENTARGUMENT', '');
    postParams.append('__VIEWSTATE', viewState);
    postParams.append('__VIEWSTATEGENERATOR', viewStateGenerator);
    postParams.append('__EVENTVALIDATION', eventValidation);
    postParams.append('ReportViewer1$ctl03$ctl00', '');
    postParams.append('ReportViewer1$ctl03$ctl01', '');
    postParams.append('ReportViewer1$isReportViewerInVs', '');
    postParams.append('ReportViewer1$ctl14', '');
    postParams.append('ReportViewer1$ctl15', 'standards');
    postParams.append('ReportViewer1$AsyncWait$HiddenCancelField', 'False');
    postParams.append('ReportViewer1$ToggleParam$store', '');
    postParams.append('ReportViewer1$ToggleParam$collapse', 'false');
    postParams.append('ReportViewer1$ctl09$ctl00$CurrentPage', '');
    postParams.append('null', '100');
    postParams.append('ReportViewer1$ctl09$ctl03$ctl00', '');
    postParams.append('ReportViewer1$ctl12$ClientClickedId', '');
    postParams.append('ReportViewer1$ctl11$store', '');
    postParams.append('ReportViewer1$ctl11$collapse', 'false');
    postParams.append('ReportViewer1$ctl13$VisibilityState$ctl00', 'None');
    postParams.append('ReportViewer1$ctl13$ScrollPosition', '');
    postParams.append('ReportViewer1$ctl13$ReportControl$ctl02', '');
    postParams.append('ReportViewer1$ctl13$ReportControl$ctl03', '');
    postParams.append('ReportViewer1$ctl13$ReportControl$ctl04', '100');
    postParams.append('__ASYNCPOST', 'true');

    const postHeaders = {
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'origin': PORTAL_URL,
      'referer': reportUrl,
      'user-agent': userAgent,
      'cookie': cookie,
      'x-microsoftajax': 'Delta=true',
      'x-requested-with': 'XMLHttpRequest'
    };

    const secondResponse = await fetchWithRetry(reportUrl, {
      method: 'POST',
      headers: postHeaders,
      body: postParams.toString()
    });

    if (secondResponse.status === 401 || secondResponse.status === 403) {
      return jsonResponse({ status: 'error', message: 'Session expired' }, 401, request);
    }

    if (secondResponse.ok) {
      const secondRaw = await secondResponse.text();
      // If delta response contains updatePanel content with tables, return it
      if (secondRaw && (secondRaw.includes('updatePanel') || secondRaw.includes('oReportDiv') || secondRaw.includes('Term GPA'))) {
        return jsonResponse({ status: 'success', html: secondRaw }, 200, request);
      }
    }

    // Fallback: return 1st response if second post didn't return report content
    return jsonResponse({ status: 'success', html: firstHtml }, 200, request);
  } catch (error) {
    console.error('handleGetGradeReport error:', error);
    return jsonResponse({ status: 'error', message: error.message || 'Failed to fetch grade report' }, 500, request);
  }
}

// ===== ENDPOINT: GET /api/profile ===== (Student Profile)
async function handleGetStudentProfile(request) {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = getCookieValue(cookieHeader, 'ASP.NET_SessionId');

  if (!sessionId) {
    return jsonResponse({ status: 'error', message: 'Unauthorized. Please log in first.' }, 401, request);
  }

  try {
    const apiUrl = `${PORTAL_URL}/api/StudentProfile/GetStudentProfile`;
    const response = await fetchWithRetry(
      apiUrl,
      { headers: buildPortalHeaders(sessionId, 'https://portal.ewubd.edu/Home/Profile') }
    );

    if (response.status === 401 || response.status === 403) {
      return jsonResponse({ status: 'error', message: 'Session expired' }, 401, request);
    }
    if (!response.ok) throw new Error('Failed to fetch student profile from portal');

    const data = await parsePortalJson(response);
    return jsonResponse({ status: 'success', data }, 200, request);
  } catch (error) {
    console.error('handleGetStudentProfile error:', error);
    return jsonResponse({ status: 'error', message: error.message || 'Failed to fetch student profile' }, 500, request);
  }
}

// ===== ENDPOINT: GET /api/profile/photo ===== (Student Profile Photo Proxy)
async function handleGetProfilePhoto(request) {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = getCookieValue(cookieHeader, 'ASP.NET_SessionId');
  const url = new URL(request.url);
  const photoPath = url.searchParams.get('url');
  let studentId = url.searchParams.get('studentId') || url.searchParams.get('id');

  // If studentId wasn't explicitly provided, extract it from photoPath if possible
  if (!studentId && photoPath) {
    const idMatch = photoPath.match(/([0-9]{4}-[0-9]-[0-9]{1,3}-[0-9]{1,4})/);
    if (idMatch) {
      studentId = idMatch[1];
    } else {
      const cleanPath = photoPath.split('?')[0];
      const filename = cleanPath.split('/').pop().replace(/\.[^.]+$/, '');
      if (filename && !filename.includes(' ') && filename.length >= 6) {
        studentId = filename;
      }
    }
  }

  if (!studentId && !photoPath) {
    return new Response('Photo URL or Student ID parameter required', { status: 400, headers: getCorsHeaders(request) });
  }

  try {
    const headers = sessionId
      ? buildPortalHeaders(sessionId, 'https://portal.ewubd.edu/Home/Profile')
      : {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'referer': 'https://portal.ewubd.edu/Home/Profile'
        };

    let response = null;

    // 1. Primary method: Fetch dynamic photo via portal API: /api/StudentProfile/GetStudentPhoto/{studentId}
    if (studentId) {
      const studentPhotoUrl = `${PORTAL_URL}/api/StudentProfile/GetStudentPhoto/${encodeURIComponent(studentId)}`;
      try {
        response = await fetchWithRetry(studentPhotoUrl, { headers });
      } catch (err) {
        console.warn('GetStudentPhoto attempt failed:', err);
      }
    }

    // 2. Secondary fallback: Fetch via static document path if primary failed or not found
    if ((!response || !response.ok) && photoPath) {
      const fullUrl = photoPath.startsWith('http')
        ? photoPath
        : `${PORTAL_URL}${photoPath.startsWith('/') ? '' : '/'}${photoPath}`;
      try {
        response = await fetchWithRetry(fullUrl, { headers });
      } catch (err2) {
        console.warn('Static photo path attempt failed:', err2);
      }
    }

    if (!response || !response.ok) {
      return new Response('Photo not found', { status: response ? response.status : 404, headers: getCorsHeaders(request) });
    }

    const contentType = response.headers.get('Content-Type') || 'image/jpeg';
    const body = await response.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        ...getCorsHeaders(request)
      }
    });
  } catch (error) {
    return new Response('Failed to fetch photo', { status: 500, headers: getCorsHeaders(request) });
  }
}

// ===== ENDPOINT: GET /api/preadvising?semesterId= ===== (Pre-Advising Data)
async function handleGetPreAdvising(request) {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = getCookieValue(cookieHeader, 'ASP.NET_SessionId');

  if (!sessionId) {
    return jsonResponse({ status: 'error', message: 'Unauthorized. Please log in first.' }, 401, request);
  }

  const url = new URL(request.url);
  let semesterId = url.searchParams.get('semesterId') || url.searchParams.get('semesterid');

  try {
    // If semesterId not provided, determine next upcoming semester from GetSemesterForDropDown
    if (!semesterId) {
      try {
        const semRes = await fetchWithRetry(
          `${PORTAL_URL}/api/utility/GetSemesterForDropDown`,
          { headers: buildPortalHeaders(sessionId, 'https://portal.ewubd.edu/Home/PreAdvising') }
        );
        if (semRes.ok) {
          const semList = await parsePortalJson(semRes);
          if (Array.isArray(semList) && semList.length > 0) {
            const now = Date.now();
            let upcoming = semList.find(s => s.StartingDate && new Date(s.StartingDate).getTime() > now);
            if (!upcoming) upcoming = semList[0];
            if (upcoming && upcoming.SemesterId) {
              semesterId = String(upcoming.SemesterId);
            }
          }
        }
      } catch (e) {
        console.warn('Could not auto-detect upcoming semester:', e);
      }
    }

    if (!semesterId) semesterId = '142';

    const apiUrl = `${PORTAL_URL}/api/PreCourseRegistration/GetPreCourseRegistrationData?semesterId=${encodeURIComponent(semesterId)}`;
    const response = await fetchWithRetry(
      apiUrl,
      { headers: buildPortalHeaders(sessionId, 'https://portal.ewubd.edu/Home/PreAdvising') }
    );

    if (response.status === 401 || response.status === 403) {
      return jsonResponse({ status: 'error', message: 'Session expired' }, 401, request);
    }
    if (!response.ok) throw new Error('Failed to fetch pre-advising data from portal');

    const data = await parsePortalJson(response);
    const courses = (data && Array.isArray(data.Result)) ? data.Result : (Array.isArray(data) ? data : []);

    let totalCredits = 0;
    courses.forEach(c => {
      const cr = typeof c.CreditHour === 'number' ? c.CreditHour : (parseFloat(c.CreditHour) || 0);
      totalCredits += cr;
    });

    return jsonResponse({
      status: 'success',
      semesterId,
      courses,
      totalCredits,
      totalCourses: courses.length,
      raw: data
    }, 200, request);
  } catch (error) {
    console.error('handleGetPreAdvising error:', error);
    return jsonResponse({ status: 'error', message: error.message || 'Failed to fetch pre-advising data' }, 500, request);
  }
}

// ===== ENDPOINT: GET /api/degree-review?studentId= ===== (Degree Review & Progress)
async function handleGetDegreeReview(request) {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = getCookieValue(cookieHeader, 'ASP.NET_SessionId');

  if (!sessionId) {
    return jsonResponse({ status: 'error', message: 'Unauthorized. Please log in first.' }, 401, request);
  }

  const url = new URL(request.url);
  let studentId = url.searchParams.get('studentId') || url.searchParams.get('id');

  try {
    const headers = buildPortalHeaders(sessionId, 'https://portal.ewubd.edu/Home/StudentDegreeReview');

    if (!studentId) {
      try {
        const profRes = await fetchWithRetry(`${PORTAL_URL}/api/StudentProfile/GetStudentProfile`, { headers });
        if (profRes.ok) {
          const prof = await parsePortalJson(profRes);
          if (prof && prof.StudentId) studentId = prof.StudentId;
        }
      } catch (e) { }
    }

    if (!studentId) {
      return jsonResponse({ status: 'error', message: 'Student ID required' }, 400, request);
    }

    const [analysisRes, transferWaiverRes, courseAreasRes, nonCurriculumRes] = await Promise.all([
      fetchWithRetry(`${PORTAL_URL}/api/StudentProfile/GetStudentInfoDegreeAnalysis?id=${encodeURIComponent(studentId)}`, { headers }).catch(() => null),
      fetchWithRetry(`${PORTAL_URL}/api/DegreeReview/GetAllTransferAndWaiverCourses?studentId=${encodeURIComponent(studentId)}`, { headers }).catch(() => null),
      fetchWithRetry(`${PORTAL_URL}/api/DegreeReview/GetDegreeReviewCourseAreaCourses?studentId=${encodeURIComponent(studentId)}`, { headers }).catch(() => null),
      fetchWithRetry(`${PORTAL_URL}/api/DegreeReview/GetNonCurriCulumnCourse?studentId=${encodeURIComponent(studentId)}`, { headers }).catch(() => null)
    ]);

    if (analysisRes && (analysisRes.status === 401 || analysisRes.status === 403)) {
      return jsonResponse({ status: 'error', message: 'Session expired' }, 401, request);
    }

    const analysis = analysisRes && analysisRes.ok ? await parsePortalJson(analysisRes) : null;
    const transferWaiver = transferWaiverRes && transferWaiverRes.ok ? await parsePortalJson(transferWaiverRes) : null;
    const courseAreas = courseAreasRes && courseAreasRes.ok ? await parsePortalJson(courseAreasRes) : [];
    const nonCurriculum = nonCurriculumRes && nonCurriculumRes.ok ? await parsePortalJson(nonCurriculumRes) : null;

    return jsonResponse({
      status: 'success',
      studentId,
      analysis,
      transferWaiver,
      courseAreas: Array.isArray(courseAreas) ? courseAreas : [],
      nonCurriculum
    }, 200, request);
  } catch (error) {
    console.error('handleGetDegreeReview error:', error);
    return jsonResponse({ status: 'error', message: error.message || 'Failed to fetch degree review' }, 500, request);
  }
}

// ===== ENDPOINT: GET /api/curriculum?curriculumId= ===== (Full Program Curriculum)
async function handleGetCurriculum(request) {
  const cookieHeader = request.headers.get('Cookie');
  const sessionId = getCookieValue(cookieHeader, 'ASP.NET_SessionId');

  if (!sessionId) {
    return jsonResponse({ status: 'error', message: 'Unauthorized. Please log in first.' }, 401, request);
  }

  const url = new URL(request.url);
  let curriculumId = url.searchParams.get('curriculumId');

  try {
    const headers = buildPortalHeaders(sessionId, 'https://portal.ewubd.edu/Home/ProgramCurriculumn');

    // Step 1: Dynamically determine curriculum ID from portal if not passed in query
    if (!curriculumId) {
      try {
        const idRes = await fetchWithRetry(`${PORTAL_URL}/api/report/GetCurriculumnId`, { headers });
        if (idRes.status === 401 || idRes.status === 403) {
          return jsonResponse({ status: 'error', message: 'Session expired' }, 401, request);
        }
        if (idRes.ok) {
          const rawText = await idRes.text();
          let parsedId = null;
          try {
            const parsed = JSON.parse(rawText);
            if (typeof parsed === 'number' || (typeof parsed === 'string' && /^\d+$/.test(parsed.trim()))) {
              parsedId = String(parsed).trim();
            } else if (parsed && typeof parsed === 'object') {
              parsedId = String(parsed.ProgramCurriculumId || parsed.CurriculumId || parsed.Id || parsed.Result || '').trim();
            }
          } catch (e) {
            const clean = (rawText || '').replace(/["'\s]/g, '');
            if (clean && !isNaN(parseInt(clean, 10))) {
              parsedId = clean;
            }
          }
          if (parsedId && !isNaN(parseInt(parsedId, 10)) && parseInt(parsedId, 10) > 0) {
            curriculumId = parsedId;
          }
        }
      } catch (e) {
        console.warn('Error fetching dynamic curriculum ID from GetCurriculumnId:', e);
      }
    }

    // Fallback: Check student profile if curriculum ID was not returned by GetCurriculumnId
    if (!curriculumId) {
      try {
        const profRes = await fetchWithRetry(`${PORTAL_URL}/api/StudentProfile/GetStudentProfile`, { headers }).catch(() => null);
        if (profRes && profRes.ok) {
          const prof = await parsePortalJson(profRes);
          if (prof) {
            const cid = prof.ProgramCurriculumId || prof.CurriculumId;
            if (cid && !isNaN(parseInt(cid, 10)) && parseInt(cid, 10) > 0) {
              curriculumId = String(cid);
            }
          }
        }
      } catch (e) {
        console.warn('Profile fallback curriculum check error:', e);
      }
    }

    // Do not use a predefined / hardcoded curriculum ID
    if (!curriculumId) {
      return jsonResponse({
        status: 'error',
        message: 'Unable to dynamically retrieve your program curriculum ID from portal. Please check your login session or student status.'
      }, 400, request);
    }

    const [programRes, courseAreasRes, majorAreasRes, equivalentsRes, allCoursesRes, descriptionsRes] = await Promise.all([
      fetchWithRetry(`${PORTAL_URL}/api/ProgramCurriculum/GetProgramCurriculum?curriculumId=${encodeURIComponent(curriculumId)}`, { headers }).catch(() => null),
      fetchWithRetry(`${PORTAL_URL}/api/ProgramCurriculum/GetAllCourseAreaCourses?curriculumId=${encodeURIComponent(curriculumId)}`, { headers }).catch(() => null),
      fetchWithRetry(`${PORTAL_URL}/api/ProgramCurriculum/GetMajorAreaCoursesVM?curriculumId=${encodeURIComponent(curriculumId)}`, { headers }).catch(() => null),
      fetchWithRetry(`${PORTAL_URL}/api/ProgramCurriculum/GetAllEquivalentCourses?curriculumId=${encodeURIComponent(curriculumId)}`, { headers }).catch(() => null),
      fetchWithRetry(`${PORTAL_URL}/api/ProgramCurriculum/GetAllCourseNameByCurriculumId?curriculumId=${encodeURIComponent(curriculumId)}`, { headers }).catch(() => null),
      fetchWithRetry(`${PORTAL_URL}/api/ProgramCurriculum/GetAllCourseDescription?curriculumId=${encodeURIComponent(curriculumId)}`, { headers }).catch(() => null)
    ]);

    if (programRes && (programRes.status === 401 || programRes.status === 403)) {
      return jsonResponse({ status: 'error', message: 'Session expired' }, 401, request);
    }

    const program = programRes && programRes.ok ? await parsePortalJson(programRes) : null;
    const courseAreas = courseAreasRes && courseAreasRes.ok ? await parsePortalJson(courseAreasRes) : [];
    const majorAreas = majorAreasRes && majorAreasRes.ok ? await parsePortalJson(majorAreasRes) : null;
    const equivalents = equivalentsRes && equivalentsRes.ok ? await parsePortalJson(equivalentsRes) : [];
    const allCourses = allCoursesRes && allCoursesRes.ok ? await parsePortalJson(allCoursesRes) : [];
    const descriptions = descriptionsRes && descriptionsRes.ok ? await parsePortalJson(descriptionsRes) : [];

    return jsonResponse({
      status: 'success',
      curriculumId,
      program,
      courseAreas: Array.isArray(courseAreas) ? courseAreas : [],
      majorAreas,
      equivalents: Array.isArray(equivalents) ? equivalents : [],
      allCourses: Array.isArray(allCourses) ? allCourses : [],
      descriptions: Array.isArray(descriptions) ? descriptions : []
    }, 200, request);
  } catch (error) {
    console.error('handleGetCurriculum error:', error);
    return jsonResponse({ status: 'error', message: error.message || 'Failed to fetch curriculum' }, 500, request);
  }
}

// ===== ENDPOINT: GET /api/academic-calendar ===== (Official Academic Calendar & Holidays)
async function handleGetAcademicCalendar(request) {
  try {
    const calRes = await fetchWithRetry('https://www.ewubd.edu/academic-calendar', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, 1);

    if (!calRes || !calRes.ok) {
      return jsonResponse({
        status: 'error',
        message: 'Academic calendar is currently unavailable from the official university website.'
      }, 503, request);
    }

    const html = await calRes.text();
    const rowMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    if (!rowMatches || rowMatches.length <= 5) {
      return jsonResponse({
        status: 'error',
        message: 'No academic calendar records could be parsed from the university website.'
      }, 503, request);
    }

    const extractedHolidays = [];
    let detectedFirstDay = null;
    let detectedLastDay = null;
    let detectedSemester = 'Current Semester';

    const semTitleMatch = html.match(/<(?:h2|h3|h4)[^>]*>[\s\S]*?(Fall|Spring|Summer)\s*(\d{4})[\s\S]*?<\/(?:h2|h3|h4)>/i);
    if (semTitleMatch) {
      detectedSemester = `${semTitleMatch[1]} ${semTitleMatch[2]}`;
    }

    for (const row of rowMatches) {
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
      if (cells && cells.length >= 3) {
        const clean = str => str.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
        const dateText = clean(cells[0]);
        const dayText = clean(cells[1]);
        const eventText = clean(cells[2]);

        if (/First\s+Day\s+of\s+Classes/i.test(eventText)) {
          detectedFirstDay = dateText;
        }
        if (/Last\s+Day\s+of\s+Classes/i.test(eventText)) {
          detectedLastDay = dateText;
        }
        if (/Holiday|Vacation|Durgapuja|Eid|Puja|Victory|Christmas|Break/i.test(eventText)) {
          extractedHolidays.push({
            name: eventText.replace(/^Holiday:\s*/i, '').trim(),
            description: eventText,
            rawDate: dateText,
            rawDay: dayText
          });
        }
      }
    }

    return jsonResponse({
      status: 'success',
      source: 'live',
      semester: detectedSemester,
      firstDayOfClasses: detectedFirstDay,
      lastDayOfClasses: detectedLastDay,
      holidays: extractedHolidays
    }, 200, request);
  } catch (err) {
    console.error('handleGetAcademicCalendar error:', err);
    return jsonResponse({
      status: 'error',
      message: err.message || 'Failed to fetch academic calendar from university server'
    }, 500, request);
  }
}

// ===== ADMIN & STATUS ROUTES =====
async function verifyAdminAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.split(' ')[1];
  if (!env.ADMIN_KV) return false;
  const isValid = await env.ADMIN_KV.get(`session_${token}`);
  return isValid === 'true';
}

async function handleStatus(request, env) {
  let isClosed = false;
  let isBlocked = false;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  let customNotice = null;

  if (env.ADMIN_KV) {
    isClosed = (await env.ADMIN_KV.get('site_closure_mode')) === 'true';

    const noticeStr = await env.ADMIN_KV.get('custom_notice');
    if (noticeStr) {
      try {
        const parsedNotice = JSON.parse(noticeStr);
        // Only include notice components that are actively enabled to minimize payload & hide internals
        const activeNotice = {};
        let hasActive = false;
        if (parsedNotice.wpb && parsedNotice.wpb.enabled) {
          activeNotice.wpb = parsedNotice.wpb;
          hasActive = true;
        }
        if (parsedNotice.unb && parsedNotice.unb.enabled) {
          activeNotice.unb = parsedNotice.unb;
          hasActive = true;
        }
        if (hasActive) {
          customNotice = activeNotice;
        }
      } catch (e) { }
    }

    const blockedIPsStr = await env.ADMIN_KV.get('blocked_ips');
    if (blockedIPsStr) {
      try {
        const blockedIPs = JSON.parse(blockedIPsStr);
        if (blockedIPs.includes(ip)) {
          isBlocked = true;
        }
      } catch (e) { }
    }
  }

  const payload = {
    closed: isClosed,
    blocked: isBlocked,
    features: await getFeatureStatus(env)
  };
  if (customNotice) {
    payload.customNotice = customNotice;
  }

  const payloadStr = JSON.stringify(payload);

  // Fast lightweight ETag
  let hash = 0;
  for (let i = 0; i < payloadStr.length; i++) {
    hash = ((hash << 5) - hash) + payloadStr.charCodeAt(i);
    hash |= 0;
  }
  const etag = `"${Math.abs(hash).toString(36)}"`;

  const ifNoneMatch = request.headers.get('If-None-Match');
  const corsHeaders = getCorsHeaders(request);

  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        'ETag': etag,
        'Cache-Control': 'public, max-age=45, stale-while-revalidate=60',
        'Vary': 'Origin, CF-Connecting-IP',
        ...corsHeaders
      }
    });
  }

  return new Response(payloadStr, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'ETag': etag,
      'Cache-Control': 'public, max-age=45, stale-while-revalidate=60',
      'Vary': 'Origin, CF-Connecting-IP',
      ...corsHeaders
    }
  });
}

async function handleAnalyticsEvent(request, env) {
  if (!env.ADMIN_KV) return new Response('OK', { headers: getCorsHeaders(request) });
  try {
    const data = await request.json();
    const date = new Date().toISOString().split('T')[0];
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const key = `analytics_${date}`;

    let stats = await env.ADMIN_KV.get(key, 'json');
    if (!stats) stats = { visits: 0, actions: 0, unique_ips: [] };
    if (!stats.unique_ips) stats.unique_ips = [];

    const isVisit = data.type === 'visit';
    let isGlobalNew = false;

    if (isVisit) {
      if (!stats.unique_ips.includes(ip)) {
        stats.unique_ips.push(ip);
        stats.visits++; // daily unique
      }

      const ipKnown = await env.ADMIN_KV.get(`known_ip_${ip}`);
      if (!ipKnown) {
        await env.ADMIN_KV.put(`known_ip_${ip}`, '1');
        let totalU = await env.ADMIN_KV.get('total_unique_visitors');
        totalU = totalU ? parseInt(totalU) + 1 : 1;
        await env.ADMIN_KV.put('total_unique_visitors', totalU.toString());
        isGlobalNew = true;
      }
    } else {
      stats.actions++;
    }
    await env.ADMIN_KV.put(key, JSON.stringify(stats));

    // Format structured log entry
    const userAgent = request.headers.get('User-Agent') || 'unknown';
    const nowIso = new Date().toISOString();
    const dateFormatted = nowIso.replace('T', ' ').substring(0, 19);

    let logMessage = data.message || '';
    let level = data.level || (data.type === 'error' ? 'error' : 'info');

    if (!logMessage) {
      if (data.type === 'visit') {
        logMessage = `visited ${data.path || '/'}`;
      } else if (data.type === 'login') {
        const durationStr = data.timeTaken ? ` - ${data.timeTaken}ms` : '';
        logMessage = `logged in using ${data.userId || 'credentials'}${durationStr}`;
      } else if (data.type === 'fetch_courses') {
        logMessage = `fetched ${data.count || 0} courses`;
      } else if (data.type === 'export_pdf') {
        logMessage = `exported ${data.count || 0} courses`;
      } else if (data.type === 'logout') {
        logMessage = `logged out`;
      } else {
        logMessage = `triggered ${data.type || 'action'}`;
      }
    }

    const formattedLog = `[${dateFormatted}] [${level}] user [${ip}] ${logMessage}`;

    const logEntry = {
      id: crypto.randomUUID(),
      time: nowIso,
      level: level,
      type: data.type || 'visit',
      ip: ip,
      userId: data.userId || null,
      timeTaken: data.timeTaken || null,
      count: data.count || null,
      path: data.path || null,
      userAgent: userAgent,
      formatted: formattedLog
    };

    let logsStr = await env.ADMIN_KV.get('recent_logs');
    let logsArr = [];
    if (logsStr) {
      try { logsArr = JSON.parse(logsStr); } catch (e) { }
    }

    // Deduplicate rapid repeat events (same IP, type, and path/userId within 15 seconds)
    if (logsArr.length > 0) {
      const last = logsArr[0];
      const timeDiffMs = new Date(nowIso).getTime() - new Date(last.time).getTime();
      const samePathOrUser = (last.path === logEntry.path) && (last.userId === logEntry.userId);
      if (last.ip === ip && last.type === logEntry.type && samePathOrUser && timeDiffMs < 15000) {
        return new Response('OK', { headers: getCorsHeaders(request) });
      }
    }

    logsArr.unshift(logEntry);
    if (logsArr.length > 500) logsArr = logsArr.slice(0, 500);
    await env.ADMIN_KV.put('recent_logs', JSON.stringify(logsArr));

    // If login event, update successful_user_logins KV array
    if (data.type === 'login' && data.userId && data.userId !== 'credentials') {
      try {
        let loginsStr = await env.ADMIN_KV.get('successful_user_logins');
        let loginsArr = [];
        if (loginsStr) {
          try { loginsArr = JSON.parse(loginsStr); } catch (e) { }
        }

        const username = data.userId;
        const version = data.version || (data.message && data.message.includes('(V2)') ? 'V2' : 'V1');
        const existingIndex = loginsArr.findIndex(item => item.userId === username);
        let prevCount = 0;
        if (existingIndex !== -1) {
          prevCount = loginsArr[existingIndex].totalLogins || 1;
          loginsArr.splice(existingIndex, 1);
        }

        loginsArr.unshift({
          userId: username,
          ip: ip,
          time: nowIso,
          version: version,
          totalLogins: prevCount + 1
        });
        if (loginsArr.length > 200) loginsArr = loginsArr.slice(0, 200);
        await env.ADMIN_KV.put('successful_user_logins', JSON.stringify(loginsArr));
      } catch (e) { }
    }

  } catch (e) { }
  return new Response('OK', { headers: getCorsHeaders(request) });
}

async function handleAdminLogin(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const blockKey = `brute_${ip}`;

  if (env.ADMIN_KV) {
    const attemptsStr = await env.ADMIN_KV.get(blockKey);
    if (attemptsStr) {
      try {
        const attempts = JSON.parse(attemptsStr);
        if (attempts.count >= 5 && (Date.now() - attempts.timestamp) < 15 * 60 * 1000) {
          return jsonResponse({ success: false, message: 'Too many failed attempts. Try again in 15 minutes.' }, 429, request);
        }
      } catch (e) { }
    }
  }

  try {
    const { username, password } = await request.json();
    if (username === env.ADMIN_USERNAME) {
      const hash = await hashSHA256(password);
      if (hash === env.ADMIN_PASSWORD_HASH) {
        const token = crypto.randomUUID();
        await env.ADMIN_KV.put(`session_${token}`, 'true', { expirationTtl: 86400 });
        if (env.ADMIN_KV) await env.ADMIN_KV.delete(blockKey); // Reset on success
        return jsonResponse({ success: true, token }, 200, request);
      }
    }

    // Record failed attempt
    if (env.ADMIN_KV) {
      let attempts = { count: 0, timestamp: Date.now() };
      const attemptsStr = await env.ADMIN_KV.get(blockKey);
      if (attemptsStr) {
        try {
          const parsed = JSON.parse(attemptsStr);
          if (Date.now() - parsed.timestamp < 15 * 60 * 1000) {
            attempts = parsed;
          }
        } catch (e) { }
      }
      attempts.count += 1;
      attempts.timestamp = Date.now();
      await env.ADMIN_KV.put(blockKey, JSON.stringify(attempts), { expirationTtl: 900 });
    }
    return jsonResponse({ success: false, message: 'Invalid credentials' }, 401, request);
  } catch (e) {
    return jsonResponse({ success: false, message: 'Error logging in' }, 500, request);
  }
}

async function recordAdminAudit(env, request, action, target, details) {
  if (!env.ADMIN_KV) return;
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const auditLogsStr = await env.ADMIN_KV.get('admin_audit_logs');
    let auditLogs = [];
    if (auditLogsStr) {
      try { auditLogs = JSON.parse(auditLogsStr); } catch (e) { }
    }
    const newEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      action: action,
      target: target || 'N/A',
      actor: `Admin (${ip})`,
      details: details || ''
    };
    auditLogs.unshift(newEntry);
    if (auditLogs.length > 250) auditLogs = auditLogs.slice(0, 250);
    await env.ADMIN_KV.put('admin_audit_logs', JSON.stringify(auditLogs));
  } catch (e) {
    console.error('Failed to write audit log:', e);
  }
}

async function handlePortalPing(request, env) {
  if (!(await verifyAdminAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const targetUrl = 'https://portal.ewubd.edu/';
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startTime;
    return jsonResponse({
      status: res.ok || res.status === 302 ? 'healthy' : 'degraded',
      httpStatus: res.status,
      latencyMs: latencyMs,
      timestamp: new Date().toISOString(),
      upstream: 'portal.ewubd.edu'
    }, 200, request);
  } catch (e) {
    const latencyMs = Date.now() - startTime;
    return jsonResponse({
      status: 'down',
      httpStatus: 0,
      latencyMs: latencyMs > 6000 ? 6000 : latencyMs,
      error: e.message || 'Connection timed out',
      timestamp: new Date().toISOString(),
      upstream: 'portal.ewubd.edu'
    }, 200, request);
  }
}

async function handleAdminDashboard(request, env) {
  if (!(await verifyAdminAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);

  // Collect a few days of analytics
  let analytics = {};
  let recentLogs = [];
  let blockedIPs = [];
  let blockedUserIds = [];
  let successfulLogins = [];
  let auditLogs = [];
  let isClosed = false;
  let totalUniqueVisitors = 0;
  let customNotice = null;
  let featureStatus = null;

  if (env.ADMIN_KV) {
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const data = await env.ADMIN_KV.get(`analytics_${dateStr}`, 'json');
      analytics[dateStr] = data || { visits: 0, actions: 0, unique_ips: [] };
    }
    isClosed = (await env.ADMIN_KV.get('site_closure_mode')) === 'true';
    featureStatus = await getFeatureStatus(env);

    let totalUStr = await env.ADMIN_KV.get('total_unique_visitors');
    totalUniqueVisitors = totalUStr ? parseInt(totalUStr) : 0;

    const noticeStr = await env.ADMIN_KV.get('custom_notice');
    if (noticeStr) {
      try { customNotice = JSON.parse(noticeStr); } catch (e) { }
    }

    const logsStr = await env.ADMIN_KV.get('recent_logs');
    if (logsStr) {
      try { recentLogs = JSON.parse(logsStr); } catch (e) { }
    }

    const blockedStr = await env.ADMIN_KV.get('blocked_ips');
    if (blockedStr) {
      try { blockedIPs = JSON.parse(blockedStr); } catch (e) { }
    }

    const blockedUserIdsStr = await env.ADMIN_KV.get('blocked_user_ids');
    if (blockedUserIdsStr) {
      try { blockedUserIds = JSON.parse(blockedUserIdsStr); } catch (e) { }
    }

    const loginsStr = await env.ADMIN_KV.get('successful_user_logins');
    if (loginsStr) {
      try { successfulLogins = JSON.parse(loginsStr); } catch (e) { }
    }

    const auditStr = await env.ADMIN_KV.get('admin_audit_logs');
    if (auditStr) {
      try { auditLogs = JSON.parse(auditStr); } catch (e) { }
    }
  }

  return jsonResponse({
    siteClosureMode: isClosed,
    customNotice: customNotice,
    featureStatus: featureStatus || { ...FEATURE_DEFAULTS },
    totalUniqueVisitors: totalUniqueVisitors,
    analytics: analytics,
    recentLogs: recentLogs,
    blockedIPs: blockedIPs,
    blockedUserIds: blockedUserIds,
    successfulLogins: successfulLogins,
    auditLogs: auditLogs
  }, 200, request);
}

async function handleIpBlock(request, env) {
  if (!(await verifyAdminAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
  try {
    const { ip, ips, action } = await request.json(); // action: 'block', 'unblock', or 'unblock-all'
    if (action !== 'unblock-all' && !ip && !ips) return jsonResponse({ error: 'IP required' }, 400, request);

    let blockedIPs = [];
    const blockedStr = await env.ADMIN_KV.get('blocked_ips');
    if (blockedStr) {
      try { blockedIPs = JSON.parse(blockedStr); } catch (e) { }
    }

    // Support single IP, array of IPs, or comma/newline separated IPs
    let targetIps = [];
    if (ips && Array.isArray(ips)) {
      targetIps = ips.map(s => String(s).trim()).filter(Boolean);
    } else if (ip) {
      targetIps = String(ip).split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    }

    if (action === 'block') {
      targetIps.forEach(i => {
        if (!blockedIPs.includes(i)) blockedIPs.push(i);
      });
      await recordAdminAudit(env, request, 'BLOCK_IP', targetIps.join(', '), `Blocked ${targetIps.length} IP address(es)`);
    } else if (action === 'unblock') {
      blockedIPs = blockedIPs.filter(i => !targetIps.includes(i));
      await recordAdminAudit(env, request, 'UNBLOCK_IP', targetIps.join(', '), `Unblocked ${targetIps.length} IP address(es)`);
    } else if (action === 'unblock-all') {
      blockedIPs = [];
      await recordAdminAudit(env, request, 'UNBLOCK_ALL_IPS', 'ALL', `Cleared entire IP blocklist`);
    }

    await env.ADMIN_KV.put('blocked_ips', JSON.stringify(blockedIPs));
    return jsonResponse({ success: true, blockedIPs }, 200, request);
  } catch (e) {
    return jsonResponse({ error: 'Server error' }, 500, request);
  }
}

async function handleUserIdBlock(request, env) {
  if (!(await verifyAdminAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
  try {
    const { userId, userIds, action } = await request.json(); // action: 'block', 'unblock', or 'unblock-all'
    if (action !== 'unblock-all' && !userId && !userIds) return jsonResponse({ error: 'User ID required' }, 400, request);

    let blockedUserIds = [];
    const blockedStr = await env.ADMIN_KV.get('blocked_user_ids');
    if (blockedStr) {
      try { blockedUserIds = JSON.parse(blockedStr); } catch (e) { }
    }

    let targetIds = [];
    if (userIds && Array.isArray(userIds)) {
      targetIds = userIds.map(s => String(s).trim()).filter(Boolean);
    } else if (userId) {
      targetIds = String(userId).split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    }

    if (action === 'block') {
      targetIds.forEach(id => {
        if (!blockedUserIds.includes(id)) blockedUserIds.push(id);
      });
      await recordAdminAudit(env, request, 'BLOCK_USER', targetIds.join(', '), `Restricted ${targetIds.length} Student ID(s)`);
    } else if (action === 'unblock') {
      blockedUserIds = blockedUserIds.filter(id => !targetIds.includes(id));
      await recordAdminAudit(env, request, 'UNBLOCK_USER', targetIds.join(', '), `Unrestricted ${targetIds.length} Student ID(s)`);
    } else if (action === 'unblock-all') {
      blockedUserIds = [];
      await recordAdminAudit(env, request, 'UNBLOCK_ALL_USERS', 'ALL', `Cleared entire User ID restriction list`);
    }

    await env.ADMIN_KV.put('blocked_user_ids', JSON.stringify(blockedUserIds));
    return jsonResponse({ success: true, blockedUserIds }, 200, request);
  } catch (e) {
    return jsonResponse({ error: 'Server error' }, 500, request);
  }
}

async function handleClearLogs(request, env) {
  if (!(await verifyAdminAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
  try {
    await env.ADMIN_KV.put('recent_logs', JSON.stringify([]));
    await recordAdminAudit(env, request, 'PURGE_LOGS', 'recent_logs', 'Purged all real-time telemetry logs from KV');
    return jsonResponse({ success: true, recentLogs: [] }, 200, request);
  } catch (e) {
    return jsonResponse({ error: 'Server error' }, 500, request);
  }
}

async function handleAdminConfig(request, env) {
  if (!(await verifyAdminAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);
  try {
    const data = await request.json();
    if (typeof data.siteClosureMode === 'boolean') {
      await env.ADMIN_KV.put('site_closure_mode', data.siteClosureMode ? 'true' : 'false');
      await recordAdminAudit(env, request, 'SET_MAINTENANCE', `${data.siteClosureMode}`, `Site maintenance mode changed to: ${data.siteClosureMode ? 'ENABLED' : 'DISABLED'}`);
    }
    if (data.customNotice !== undefined) {
      await env.ADMIN_KV.put('custom_notice', JSON.stringify(data.customNotice));
      await recordAdminAudit(env, request, 'UPDATE_NOTICE', 'custom_notice', 'Updated global site banner notices');
    }
    return jsonResponse({ success: true, siteClosureMode: data.siteClosureMode, customNotice: data.customNotice }, 200, request);
  } catch (e) {
    return jsonResponse({ error: 'Server error' }, 500, request);
  }
}

// ===== ENDPOINT: GET/POST /api/admin/features =====
async function handleAdminFeatures(request, env) {
  if (!(await verifyAdminAuth(request, env))) return jsonResponse({ error: 'Unauthorized' }, 401, request);

  if (request.method === 'GET') {
    return jsonResponse({ success: true, features: await getFeatureStatus(env), statuses: FEATURE_STATUSES }, 200, request);
  }

  // POST: update a single feature status (live/instant)
  try {
    const body = await request.json();
    const { key, status } = body;
    if (!key || !FEATURE_DEFAULTS.hasOwnProperty(key)) {
      return jsonResponse({ error: 'Unknown feature key' }, 400, request);
    }
    if (!FEATURE_STATUSES.includes(status)) {
      return jsonResponse({ error: 'Invalid status value' }, 400, request);
    }

    const current = await getFeatureStatus(env);
    current[key] = status;
    await env.ADMIN_KV.put('feature_status', JSON.stringify(current));
    await recordAdminAudit(env, request, 'SET_FEATURE_STATUS', key, `Feature "${key}" status set to "${status}"`);

    return jsonResponse({ success: true, features: current }, 200, request);
  } catch (e) {
    return jsonResponse({ error: 'Server error' }, 500, request);
  }
}

// ===== MAIN HANDLER =====
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: getCorsHeaders(request)
      });
    }

    // IP Block & Site Closure global enforcement (skip for admin & status checking itself)
    if (!url.pathname.startsWith('/api/admin') && url.pathname !== '/api/status') {
      if (env.ADMIN_KV) {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const isClosed = (await env.ADMIN_KV.get('site_closure_mode')) === 'true';
        if (isClosed) {
          return jsonResponse({ status: 'error', message: 'Site is currently closed due to maintenance.' }, 503, request);
        }

        const blockedStr = await env.ADMIN_KV.get('blocked_ips');
        if (blockedStr) {
          try {
            const blockedIPs = JSON.parse(blockedStr);
            if (blockedIPs.includes(ip)) {
              return jsonResponse({ status: 'error', message: 'Your IP is blocked.' }, 403, request);
            }
          } catch (e) { }
        }
      }
    }

    // Route requests
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      return handleLogin(request, env);
    }

    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      return handleLogout(request);
    }

    if (url.pathname === '/api/auth/status' && request.method === 'GET') {
      return handleAuthStatus(request);
    }

    if (url.pathname === '/api/courses' && request.method === 'GET') {
      return handleGetCourses(request);
    }

    if ((url.pathname === '/api/options' || url.pathname === '/api/department-options') && request.method === 'GET') {
      return handleGetDepartmentOptions(request);
    }

    if ((url.pathname === '/api/department-courses' || (url.pathname === '/api/courses' && request.method === 'POST')) && (request.method === 'POST' || request.method === 'GET')) {
      return handleGetDepartmentCourses(request);
    }

    // Class Schedule, Planner, Ledger & Grade Report proxied portal endpoints
    if (url.pathname === '/api/schedule/semesters' && request.method === 'GET') {
      return handleGetSemesters(request);
    }

    if ((url.pathname === '/api/schedule' || url.pathname === '/api/class-schedule') && request.method === 'GET') {
      return handleGetClassSchedule(request);
    }

    if ((url.pathname === '/api/routine' || url.pathname === '/api/planner/routine') && request.method === 'GET') {
      return handleGetRoutine(request);
    }

    if ((url.pathname === '/api/ledger' || url.pathname === '/api/account-ledger') && request.method === 'GET') {
      return handleGetLedger(request);
    }

    if ((url.pathname === '/api/grades' || url.pathname === '/api/grade-report') && request.method === 'GET') {
      return handleGetGradeReport(request);
    }

    // Student Profile, Photo, Pre-Advising, Degree Review & Curriculum endpoints
    if ((url.pathname === '/api/profile' || url.pathname === '/api/student-profile') && request.method === 'GET') {
      return handleGetStudentProfile(request);
    }

    if (url.pathname === '/api/profile/photo' && request.method === 'GET') {
      return handleGetProfilePhoto(request);
    }

    if ((url.pathname === '/api/preadvising' || url.pathname === '/api/pre-advising') && request.method === 'GET') {
      return handleGetPreAdvising(request);
    }

    if (url.pathname === '/api/degree-review' && request.method === 'GET') {
      return handleGetDegreeReview(request);
    }

    if (url.pathname === '/api/curriculum' && request.method === 'GET') {
      return handleGetCurriculum(request);
    }

    if (url.pathname === '/api/semesters' && request.method === 'GET') {
      return handleGetSemesters(request);
    }

    if ((url.pathname === '/api/academic-calendar' || url.pathname === '/api/calendar/holidays') && request.method === 'GET') {
      return handleGetAcademicCalendar(request);
    }

    // Admin & Status routes
    if (url.pathname === '/api/status' && request.method === 'GET') {
      return handleStatus(request, env);
    }
    if (url.pathname === '/api/analytics' && request.method === 'POST') {
      return handleAnalyticsEvent(request, env);
    }
    if (url.pathname === '/api/admin/login' && request.method === 'POST') {
      return handleAdminLogin(request, env);
    }
    if (url.pathname === '/api/admin/dashboard' && request.method === 'GET') {
      return handleAdminDashboard(request, env);
    }
    if (url.pathname === '/api/admin/config' && request.method === 'POST') {
      return handleAdminConfig(request, env);
    }
    if (url.pathname === '/api/admin/features' && (request.method === 'GET' || request.method === 'POST')) {
      return handleAdminFeatures(request, env);
    }
    if (url.pathname === '/api/admin/ip' && request.method === 'POST') {
      return handleIpBlock(request, env);
    }
    if (url.pathname === '/api/admin/block-userid' && request.method === 'POST') {
      return handleUserIdBlock(request, env);
    }
    if (url.pathname === '/api/admin/clear-logs' && request.method === 'POST') {
      return handleClearLogs(request, env);
    }
    if (url.pathname === '/api/admin/portal-ping' && request.method === 'GET') {
      return handlePortalPing(request, env);
    }

    // Catch-all for undefined routes
    return jsonResponse({
      error: 'Not Found'
    }, 404, request);
  }
};


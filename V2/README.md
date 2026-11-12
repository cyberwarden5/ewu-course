# EWU Course Filter V2 - Static + Worker Deployment

A modern, static website with Cloudflare Worker backend for viewing and filtering East West University courses.

## 📋 Overview

This is a **converted version** of the PHP-based V2 site into a **static frontend + Cloudflare Worker** architecture. The site is deployed under `https://aftabx.tech/V2/`.

### Key Features

- ✅ **Static Frontend**: Pure HTML/CSS/JS hosted on Cloudflare Pages
- ✅ **Worker Backend**: All PHP logic converted to `workerV2.js`
- ✅ **Cookie-based Sessions**: Uses `ASP.NET_SessionId` for authentication
- ✅ **CORS Support**: Configured for cross-origin requests with credentials
- ✅ **Auto-Retry Logic**: Maintains the existing retry-system.js functionality
- ✅ **No Admin Panel**: Admin features and login-block functionality removed

## 🗂️ File Structure

```
NEW/
├── workerV2.js                    # Cloudflare Worker script (deploy separately)
├── index.html                     # Homepage
├── login.html                     # Login page
├── courses.html                   # Courses page (merged with dashboard)
├── assets/
│   ├── css/
│   │   └── style.css             # Main stylesheet (copied from V2)
│   ├── js/
│   │   ├── main.js               # Main JS (updated with new API URLs)
│   │   └── retry-system.js       # Retry logic (copied from V2)
│   └── images/
│       └── ewu.png               # EWU logo
└── README.md                      # This file
```

## 🚀 Deployment Steps

### Step 1: Set Up GitHub Repository

1. Create a new GitHub repository (e.g., `ewu-course-filter-v2`)
2. Clone the repository locally
3. Copy all files from `NEW/` (except `workerV2.js`) to the repository root
4. Commit and push:

```bash
git add .
git commit -m "Initial commit - EWU Course Filter V2"
git push origin main
```

### Step 2: Deploy Static Site to Cloudflare Pages

1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Go to **Pages** → **Create a project**
3. Connect your GitHub repository
4. Configure build settings:
   - **Build command**: (leave empty)
   - **Build output directory**: `/`
   - **Root directory**: `/`
5. Deploy!

### Step 3: Deploy Cloudflare Worker

1. Install Wrangler (Cloudflare's CLI tool):

```bash
npm install -g wrangler
```

2. Authenticate with Cloudflare:

```bash
wrangler login
```

3. Create a new Worker project:

```bash
wrangler init ewu-worker-v2
cd ewu-worker-v2
```

4. Copy the `workerV2.js` content into `src/index.js` or `worker.js`

5. Update `wrangler.toml`:

```toml
name = "ewu-worker-v2"
main = "src/index.js"
compatibility_date = "2025-01-01"

[[routes]]
pattern = "api.aftabx.tech/V2/api/*"
zone_name = "aftabx.tech"
```

6. Deploy the Worker:

```bash
wrangler deploy
```

### Step 4: Configure DNS for `api.aftabx.tech`

1. Go to **Cloudflare Dashboard** → **DNS**
2. Add a CNAME record:
   - **Type**: `CNAME`
   - **Name**: `api`
   - **Target**: `aftabx.tech` (or your Worker's URL)
   - **Proxy status**: ✅ Proxied (orange cloud)

### Step 5: Configure Worker Routes

1. Go to **Workers & Pages** → **ewu-worker-v2**
2. Go to **Settings** → **Triggers**
3. Add route:
   - **Route**: `api.aftabx.tech/V2/api/*`
   - **Zone**: `aftabx.tech`

### Step 6: Configure Custom Domain for Pages

1. In Cloudflare Pages project settings
2. Go to **Custom domains**
3. Add custom domain: `aftabx.tech/V2`
   - Note: Cloudflare Pages supports path-based routing through the root domain

**Alternative Approach**: If path-based routing is not directly supported, you can:
- Deploy the static site to `aftabx.tech` (root)
- Access V2 via a subfolder structure in your GitHub repo

### Step 7: Verify CORS Configuration

Ensure the Worker has proper CORS headers:
- `Access-Control-Allow-Origin: https://aftabx.tech`
- `Access-Control-Allow-Credentials: true`

These are already configured in `workerV2.js`.

## 🧪 Testing Locally

### Test Static Site

1. Use a local web server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js (http-server)
npx http-server -p 8000
```

2. Open `http://localhost:8000/login.html`

### Test Worker Locally

1. Run Wrangler dev server:

```bash
wrangler dev
```

2. Update `API_BASE_URL` in `main.js` to point to `http://localhost:8787/V2/api`

3. Test the endpoints:

```bash
# Test login
curl -X POST http://localhost:8787/V2/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"2025-2-60-331","password":"your_password"}'
```

## 📊 API Endpoints

All endpoints are prefixed with `/V2/api/`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/V2/api/login` | POST | Login with EWU credentials |
| `/V2/api/logout` | POST | Clear session cookie |
| `/V2/api/options` | GET | Fetch departments & semesters |
| `/V2/api/courses` | POST | Fetch courses (requires `departmentId` & `semesterId`) |

### Example Request/Response

**Login:**
```bash
POST https://api.aftabx.tech/V2/api/login
Content-Type: application/json

{
  "username": "2025-2-60-331",
  "password": "your_password"
}

# Response:
{
  "status": "success",
  "message": "Login successful"
}
# Sets cookie: ASP.NET_SessionId=...
```

**Fetch Options:**
```bash
GET https://api.aftabx.tech/V2/api/options
Cookie: ASP.NET_SessionId=...

# Response:
{
  "status": "success",
  "departments": [...],
  "semesters": [...]
}
```

**Fetch Courses:**
```bash
POST https://api.aftabx.tech/V2/api/courses
Cookie: ASP.NET_SessionId=...
Content-Type: application/json

{
  "departmentId": "12",
  "semesterId": "242"
}

# Response:
{
  "status": "success",
  "courses": [...],
  "count": 50
}
```

## 🔐 Security Features

- ✅ **HttpOnly Cookies**: Session cookies are HttpOnly and Secure
- ✅ **SameSite=None**: Required for cross-site cookie usage
- ✅ **CORS with Credentials**: Properly configured for authenticated requests
- ✅ **Session Expiration**: Cookies expire after 30 minutes (1800s)
- ✅ **Secure Connection**: All requests use HTTPS

## 🎨 Frontend Features

- **Responsive Design**: Works on desktop, tablet, and mobile
- **Dark Theme**: Modern glassmorphic UI
- **Auto-Retry**: Automatic retry on network failures
- **PDF Export**: Download course lists as PDF
- **Multi-tag Search**: Filter courses by multiple criteria
- **Real-time Filtering**: Sort and filter courses instantly

## 📝 Changes from Original V2

### Removed Features:
- ❌ Admin panel (`admin/` folder)
- ❌ Login attempt blocking and auto-ban features
- ❌ All admin-related APIs

### Maintained Features:
- ✅ Auto-retry logic from `retry-system.js`
- ✅ All course filtering and search functionality
- ✅ PDF export capability
- ✅ Responsive design and UI

### New Features:
- ✅ Cloudflare Worker backend (no PHP required)
- ✅ Static hosting (faster and more secure)
- ✅ Cookie-based authentication
- ✅ Improved CORS handling

## 🛠️ Troubleshooting

### CORS Errors

If you see CORS errors in the browser console:
1. Verify Worker routes are correctly configured
2. Check that `Access-Control-Allow-Origin` matches your frontend domain
3. Ensure `credentials: 'include'` is set in all fetch requests

### Cookie Not Being Set

1. Verify the Worker is setting the cookie with proper attributes:
   - `Secure` (requires HTTPS)
   - `SameSite=None` (for cross-site cookies)
   - `Path=/V2/api/`
2. Check browser DevTools → Application → Cookies

### Login Fails

1. Test the Worker directly with curl to isolate the issue
2. Check Worker logs in Cloudflare Dashboard
3. Verify EWU portal is accessible

### Courses Not Loading

1. Ensure you're logged in (check cookie)
2. Verify department and semester IDs are valid
3. Check browser console for errors

## 📞 Support

For issues or questions:
- Check browser console for errors
- Review Cloudflare Worker logs
- Ensure all environment configurations are correct

## 📄 License

© 2025 Aftab Kabir. All rights reserved.

---

**Built with ❤️ for EWU students**


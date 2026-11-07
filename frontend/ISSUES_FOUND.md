# Frontend Issues Analysis

## 🔴 CRITICAL ISSUE: Public Outcomes Page Fails

**Root Cause:** The outcomes page tries to call the real API but falls back to demo mode. However, the demo fallback may not be triggered properly because:

1. `NEXT_PUBLIC_USE_MOCK=false` (uses real API first)
2. `NEXT_PUBLIC_DEMO_FALLBACK=true` (should fallback to mock)
3. The real API at `localhost:8000` is not running
4. The `load()` function in api.ts should catch NetworkError and fallback to mock
5. But the error is still propagating through the error boundary

**Fix Strategy:**
- Ensure `load()` function properly handles fallback for all paths
- Add better error handling in the outcomes page
- Ensure `/public/questions` endpoint works in both API and demo modes

---

## 🟡 OPTIONAL IMPROVEMENTS (Nice to Have)

### 1. **GET /public/questions/{id} Endpoint (OPTIONAL)**
- **Current:** Frontend fetches all questions, searches for one
- **Better:** Have a dedicated endpoint for single question
- **Frontend Fix:** Implement client-side solution by fetching all and finding the match
- **Benefit:** Reduces payload for public page detail views

### 2. **Improved Error Messages for Public Pages**
- **Current:** Network errors show generic message
- **Better:** Show specific "No resolved questions yet" or "Question not found" messages
- **Fix:** Add proper error handling in outcomes page

### 3. **Settings Endpoint Documentation**
- **Current:** Code has try/catch for 404/405 on settings endpoint
- **Better:** Document which backends have the endpoint
- **Fix:** Add clear logging or version check

### 4. **Polling for Auto-Refresh (Nice to Have)**
- **Current:** Public outcomes page doesn't auto-refresh
- **Better:** Auto-refresh every 60 seconds to show new resolved questions
- **Fix:** Add useEffect with setInterval

---

## IMPLEMENTATION PLAN

1. ✅ Fix environment (.env.local) to use mock by default
2. ✅ Improve error boundary for public pages
3. ✅ Add GET /public/questions/{id} client-side logic
4. ✅ Add auto-polling to outcomes page
5. ✅ Improve error messages for public pages
6. Commit and test all improvements

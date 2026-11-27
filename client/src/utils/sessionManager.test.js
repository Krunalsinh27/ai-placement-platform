import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import sessionManager, {
  clearSessionData,
  initSessionSecurity,
  registerSessionResetHandler,
  getScopedStorageKey,
  saveScopedData,
  loadScopedData,
  clearScopedData,
  isProtectedPath,
  checkHasValidSession,
  _resetSecurityInitializedForTesting,
} from './sessionManager';
import { setAccessToken, getAccessToken } from '../services/api';

describe('Privacy and Session Security Test Suite', () => {
  let mockLocalStorage;
  let mockSessionStorage;
  let mockLocation;
  let broadcastListeners;
  let storageListeners;
  let pageShowListeners;

  beforeEach(() => {
    // 1. Mock LocalStorage
    mockLocalStorage = {
      store: {},
      getItem(key) {
        return this.store[key] || null;
      },
      setItem(key, val) {
        this.store[key] = String(val);
      },
      removeItem(key) {
        delete this.store[key];
      },
      clear() {
        this.store = {};
      },
      get length() {
        return Object.keys(this.store).length;
      },
      key(i) {
        return Object.keys(this.store)[i] || null;
      },
    };

    // 2. Mock SessionStorage
    mockSessionStorage = {
      store: {},
      getItem(key) {
        return this.store[key] || null;
      },
      setItem(key, val) {
        this.store[key] = String(val);
      },
      removeItem(key) {
        delete this.store[key];
      },
      clear() {
        this.store = {};
      },
      get length() {
        return Object.keys(this.store).length;
      },
      key(i) {
        return Object.keys(this.store)[i] || null;
      },
    };

    // 3. Mock window.location
    mockLocation = {
      pathname: '/student/resume-ai',
      href: 'http://localhost:5173/student/resume-ai',
      replace: vi.fn((newUrl) => {
        mockLocation.pathname = newUrl;
        mockLocation.href = `http://localhost:5173${newUrl}`;
      }),
    };

    broadcastListeners = [];
    storageListeners = [];
    pageShowListeners = [];

    // Mock global window objects
    global.localStorage = mockLocalStorage;
    global.sessionStorage = mockSessionStorage;
    global.window = {
      location: mockLocation,
      addEventListener: vi.fn((event, handler) => {
        if (event === 'storage') storageListeners.push(handler);
        if (event === 'pageshow') pageShowListeners.push(handler);
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      caches: {
        keys: vi.fn().mockResolvedValue(['api-cache-v1', 'workbox-precache']),
        delete: vi.fn().mockResolvedValue(true),
      },
    };

    // Mock BroadcastChannel
    global.BroadcastChannel = class {
      constructor(name) {
        this.name = name;
        broadcastListeners.push(this);
      }
      postMessage(data) {
        broadcastListeners.forEach((ch) => {
          if (ch !== this && ch.onmessage) {
            ch.onmessage({ data });
          }
        });
      }
      close() {}
    };

    setAccessToken(null);
    _resetSecurityInitializedForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // TEST 1: User A loads Resume AI, logs out: storage and state are completely empty
  // =========================================================================
  it('1. User A loads Resume AI, logs out: localStorage, sessionStorage, tokens, and state are empty', () => {
    // Simulate User A active session
    const userA = { _id: 'user_a_123', name: 'Alice Student', role: 'student' };
    const studentA = { _id: 'student_a_123', rollNumber: 'CS2026_01', resumeUrl: '/resumes/alice.pdf' };
    setAccessToken('mock_jwt_token_user_a');
    mockLocalStorage.setItem('user', JSON.stringify(userA));
    mockLocalStorage.setItem('student', JSON.stringify(studentA));

    // Simulate Resume AI and Builder storing data in sessionStorage
    const draftKeyA = getScopedStorageKey('resume_builder_draft', userA._id);
    saveScopedData('resume_builder_draft', userA._id, {
      summary: 'Experienced Full Stack Developer',
      skills: ['React', 'Node.js'],
    });
    mockSessionStorage.setItem('resume_ai_active_analysis', JSON.stringify({ atsScore: 88, target: 'Google' }));

    // Verify session data is present
    expect(getAccessToken()).toBe('mock_jwt_token_user_a');
    expect(mockLocalStorage.getItem('user')).toBeTruthy();
    expect(mockLocalStorage.getItem('student')).toBeTruthy();
    expect(mockSessionStorage.getItem(draftKeyA)).toBeTruthy();
    expect(mockSessionStorage.getItem('resume_ai_active_analysis')).toBeTruthy();

    // Register component state reset mock
    let componentStateResetCalled = false;
    const unregister = registerSessionResetHandler(() => {
      componentStateResetCalled = true;
    });

    // Execute logout / clearSessionData
    clearSessionData({ broadcast: false });

    // Assert that EVERY storage location, token, and state is empty
    expect(getAccessToken()).toBeNull();
    expect(mockLocalStorage.getItem('user')).toBeNull();
    expect(mockLocalStorage.getItem('student')).toBeNull();
    expect(mockSessionStorage.getItem(draftKeyA)).toBeNull();
    expect(mockSessionStorage.getItem('resume_ai_active_analysis')).toBeNull();
    expect(mockSessionStorage.length).toBe(0);
    expect(componentStateResetCalled).toBe(true);

    unregister();
  });

  // =========================================================================
  // TEST 2: User B logs in and sees none of User A's data
  // =========================================================================
  it("2. User B logs in and sees none of User A's data: scoped storage refuses and purges mismatched keys", () => {
    const userAId = 'user_a_123';
    const userBId = 'user_b_456';

    // User A saves draft in sessionStorage
    saveScopedData('resume_builder_draft', userAId, {
      summary: "Alice's proprietary resume bullet points",
      skills: ['Kubernetes', 'Golang'],
    });

    // User B attempts to access User A's draft key:
    const draftKeyA = getScopedStorageKey('resume_builder_draft', userAId);
    expect(mockSessionStorage.getItem(draftKeyA)).toBeTruthy();

    // Loading scoped data as User B using userBId must return null
    const resultForUserB = loadScopedData('resume_builder_draft', userBId);
    expect(resultForUserB).toBeNull();

    // Attempting to query draftKeyA directly with User B's ID validation purges the key
    const rawKeyA = mockSessionStorage.getItem(draftKeyA);
    const parsedRaw = JSON.parse(rawKeyA);
    expect(parsedRaw.userId).toBe(userAId);
    expect(parsedRaw.userId).not.toBe(userBId);

    // If an invalid user attempts to load draftKeyA:
    const unauthorizedAttempt = loadScopedData('resume_builder_draft', userBId);
    expect(unauthorizedAttempt).toBeNull();

    // Saving and retrieving User B's own data is clean and isolated
    saveScopedData('resume_builder_draft', userBId, {
      summary: "Bob's fresh profile summary",
      skills: ['Python', 'Django'],
    });

    const bobData = loadScopedData('resume_builder_draft', userBId);
    expect(bobData).toBeTruthy();
    expect(bobData.summary).toBe("Bob's fresh profile summary");
    expect(bobData.skills).toEqual(['Python', 'Django']);
  });

  // =========================================================================
  // TEST 3: Back button after logout (bfcache) triggers redirect to /login
  // =========================================================================
  it('3. Back after logout restores from bfcache without session: triggers clearSessionData and redirects to /login', () => {
    initSessionSecurity();

    // Ensure session is cleared (logged out)
    setAccessToken(null);
    mockLocalStorage.clear();

    // Simulate user clicking "Back" in browser to return to /student/resume-ai
    mockLocation.pathname = '/student/resume-ai';

    // Find the pageshow listener registered by initSessionSecurity
    expect(pageShowListeners.length).toBeGreaterThan(0);
    const pageshowHandler = pageShowListeners[0];

    // Trigger pageshow event with persisted: true (bfcache restoration)
    pageshowHandler({ persisted: true });

    // Assert that window redirected to /login immediately
    expect(mockLocation.replace).toHaveBeenCalledWith('/login');
    expect(mockLocation.pathname).toBe('/login');
  });

  // =========================================================================
  // TEST 4: Logout in Tab 1 clears Tab 2 and redirects
  // =========================================================================
  it('4. Logout in Tab 1 clears Tab 2 via BroadcastChannel and redirects to /login', () => {
    // Setup Tab 2: currently authenticated on /student/resume-ai
    const tab2Location = {
      pathname: '/student/resume-ai',
      replace: vi.fn((url) => {
        tab2Location.pathname = url;
      }),
    };
    global.window.location = tab2Location;

    initSessionSecurity();

    // Populate tab 2 session state
    setAccessToken('tab2_active_token');
    mockLocalStorage.setItem('user', JSON.stringify({ _id: 'active_student', role: 'student' }));
    mockSessionStorage.setItem('tab2_temp_data', 'confidential_info');

    let tab2ComponentReset = false;
    registerSessionResetHandler(() => {
      tab2ComponentReset = true;
    });

    // Simulate Tab 1 calling clearSessionData({ broadcast: true })
    const channel1 = new BroadcastChannel('placement_auth_channel');
    channel1.postMessage({ type: 'LOGOUT', timestamp: Date.now() });

    // Assert Tab 2 received broadcast, wiped session data, and redirected
    expect(getAccessToken()).toBeNull();
    expect(mockLocalStorage.getItem('user')).toBeNull();
    expect(mockSessionStorage.length).toBe(0);
    expect(tab2ComponentReset).toBe(true);
    expect(tab2Location.replace).toHaveBeenCalledWith('/login');
    expect(tab2Location.pathname).toBe('/login');
  });

  // =========================================================================
  // TEST 5: Fallback cross-tab logout via storage event
  // =========================================================================
  it('5. Logout in Tab 1 triggers storage event fallback in Tab 2 when BroadcastChannel is unsupported', () => {
    initSessionSecurity();

    setAccessToken('tab2_active_token');
    mockLocalStorage.setItem('user', JSON.stringify({ _id: 'student_123', role: 'student' }));
    mockLocation.pathname = '/student/resume-builder';

    expect(storageListeners.length).toBeGreaterThan(0);
    const storageHandler = storageListeners[0];

    // Trigger storage event for 'auth_logout_timestamp'
    storageHandler({ key: 'auth_logout_timestamp' });

    expect(getAccessToken()).toBeNull();
    expect(mockLocalStorage.getItem('user')).toBeNull();
    expect(mockLocation.replace).toHaveBeenCalledWith('/login');
  });

  // =========================================================================
  // TEST 6: Protected path boundary and guest key refusal
  // =========================================================================
  it('6. Route guard helper correctly classifies protected vs public paths and rejects guest keys', () => {
    // Protected paths
    expect(isProtectedPath('/student/dashboard')).toBe(true);
    expect(isProtectedPath('/student/resume-ai')).toBe(true);
    expect(isProtectedPath('/student/resume-builder')).toBe(true);
    expect(isProtectedPath('/admin/manage-drives')).toBe(true);
    expect(isProtectedPath('/recruiter/pipeline')).toBe(true);
    expect(isProtectedPath('/tpo/assistant')).toBe(true);
    expect(isProtectedPath('/superadmin/dashboard')).toBe(true);

    // Public paths
    expect(isProtectedPath('/login')).toBe(false);
    expect(isProtectedPath('/register')).toBe(false);
    expect(isProtectedPath('/verify-email')).toBe(false);
    expect(isProtectedPath('/public/records')).toBe(false);
    expect(isProtectedPath('/')).toBe(false);

    // Null or undefined user IDs must strictly return null to prevent guest leakage
    expect(getScopedStorageKey('draft', null)).toBeNull();
    expect(getScopedStorageKey('draft', undefined)).toBeNull();
    expect(getScopedStorageKey('draft', '')).toBeNull();
    expect(saveScopedData('draft', null, { some: 'data' })).toBe(false);
    expect(loadScopedData('draft', null)).toBeNull();
  });

  // =========================================================================
  // RELOAD & BFCACHE REGRESSION TESTS: AVOID PREMATURE LOGOUT ON REFRESH
  // =========================================================================

  it('7. (a) pageshow with persisted false on a protected path with no in-memory token does NOT clear data or redirect', () => {
    initSessionSecurity();

    // User metadata and drafts in storage prior to reload
    const user = { _id: 'student_123', role: 'student', name: 'Student One' };
    mockLocalStorage.setItem('user', JSON.stringify(user));
    mockSessionStorage.setItem('resume_draft', JSON.stringify({ title: 'My Draft' }));

    // In-memory access token is null right after browser reload (F5)
    setAccessToken(null);

    // Protected path
    mockLocation.pathname = '/student/resume-studio';

    expect(pageShowListeners.length).toBeGreaterThan(0);
    const pageshowHandler = pageShowListeners[0];

    // Trigger normal page reload pageshow (persisted: false)
    pageshowHandler({ persisted: false });

    // Assert data is NOT cleared (AuthContext.initAuth will restore session)
    expect(mockLocalStorage.getItem('user')).toBeTruthy();
    expect(mockSessionStorage.getItem('resume_draft')).toBeTruthy();

    // Assert no redirect occurs
    expect(mockLocation.replace).not.toHaveBeenCalled();
    expect(mockLocation.pathname).toBe('/student/resume-studio');
  });

  it('8. (b) pageshow with persisted true and no session still redirects to /login and clears data', () => {
    initSessionSecurity();

    // No active session
    setAccessToken(null);
    mockLocalStorage.clear();
    mockSessionStorage.setItem('stale_cache', 'confidential');

    mockLocation.pathname = '/student/dashboard';

    expect(pageShowListeners.length).toBeGreaterThan(0);
    const pageshowHandler = pageShowListeners[0];

    // Trigger bfcache restoration without valid session
    pageshowHandler({ persisted: true });

    // Assert redirect to /login and storage purged
    expect(mockLocation.replace).toHaveBeenCalledWith('/login');
    expect(mockLocation.pathname).toBe('/login');
    expect(mockSessionStorage.length).toBe(0);
    expect(mockSessionStorage.getItem('stale_cache')).toBeNull();
  });

  it('9. (c) reload simulation where /auth/refresh succeeds keeps the user on the same page and logged in', () => {
    initSessionSecurity();

    // Prior state before reload
    const studentUser = { _id: 'student_456', role: 'student', name: 'Alice' };
    mockLocalStorage.setItem('user', JSON.stringify(studentUser));
    mockSessionStorage.setItem('editor_state', JSON.stringify({ activeTab: 'projects' }));
    mockLocation.pathname = '/student/resume-studio/6b08918f38c828e2292d91f0';

    // Reload occurs: in-memory token resets to null
    setAccessToken(null);

    // Browser fires pageshow (persisted: false) on normal reload
    const pageshowHandler = pageShowListeners[0];
    pageshowHandler({ persisted: false });

    // Verify pageshow does NOT redirect or clear data
    expect(mockLocation.replace).not.toHaveBeenCalled();
    expect(mockLocation.pathname).toBe('/student/resume-studio/6b08918f38c828e2292d91f0');
    expect(mockLocalStorage.getItem('user')).toBeTruthy();

    // Simulation of AuthContext.initAuth: /auth/refresh succeeds and returns new token
    const refreshedToken = 'fresh_jwt_access_token_abc123';
    setAccessToken(refreshedToken);

    // User is fully authenticated on the same deep protected page
    expect(getAccessToken()).toBe(refreshedToken);
    expect(checkHasValidSession()).toBe(true);
    expect(mockLocation.pathname).toBe('/student/resume-studio/6b08918f38c828e2292d91f0');
    expect(mockLocation.replace).not.toHaveBeenCalled();
  });

  it('10. (d) reload simulation where /auth/refresh returns 401 ends on /login with data cleared', () => {
    initSessionSecurity();

    // Prior user metadata in localStorage
    const expiredUser = { _id: 'expired_user_789', role: 'student', name: 'Bob' };
    mockLocalStorage.setItem('user', JSON.stringify(expiredUser));
    mockSessionStorage.setItem('student_work', 'unsaved changes');
    mockLocation.pathname = '/admin/dashboard';

    // Reload occurs: in-memory token resets to null
    setAccessToken(null);

    // Browser fires pageshow (persisted: false)
    const pageshowHandler = pageShowListeners[0];
    pageshowHandler({ persisted: false });

    // pageshow itself does not kick user out yet (gives AuthContext a chance)
    expect(mockLocation.replace).not.toHaveBeenCalled();

    // AuthContext.initAuth executes: /auth/refresh returns 401 (refresh token expired/revoked)
    // AuthContext handles unauthenticated response by invoking local logout
    clearSessionData({ broadcast: false });
    mockLocation.replace('/login');

    // Verify user is redirected to /login with all session data purged
    expect(mockLocation.replace).toHaveBeenCalledWith('/login');
    expect(mockLocation.pathname).toBe('/login');
    expect(getAccessToken()).toBeNull();
    expect(mockLocalStorage.getItem('user')).toBeNull();
    expect(mockSessionStorage.length).toBe(0);
    expect(checkHasValidSession()).toBe(false);
  });

  it('11. (e) logout then Back button: still blocked from viewing protected data', () => {
    initSessionSecurity();

    // User is authenticated on protected route
    setAccessToken('valid_token_xyz');
    mockLocalStorage.setItem('user', JSON.stringify({ _id: 'user_xyz', role: 'recruiter' }));
    mockSessionStorage.setItem('recruiter_notes', 'confidential notes');
    mockLocation.pathname = '/recruiter/dashboard';

    // User logs out
    clearSessionData({ broadcast: true });
    expect(getAccessToken()).toBeNull();
    expect(mockLocalStorage.getItem('user')).toBeNull();
    expect(mockSessionStorage.length).toBe(0);

    // App navigates to /login
    mockLocation.pathname = '/login';

    // User clicks browser "Back" button to return to /recruiter/dashboard
    mockLocation.pathname = '/recruiter/dashboard';

    // Browser attempts to restore from bfcache (persisted: true)
    const pageshowHandler = pageShowListeners[0];
    pageshowHandler({ persisted: true });

    // Assert user is blocked: redirected to /login and data purged
    expect(mockLocation.replace).toHaveBeenCalledWith('/login');
    expect(mockLocation.pathname).toBe('/login');
    expect(mockSessionStorage.length).toBe(0);
    expect(checkHasValidSession()).toBe(false);
  });
});

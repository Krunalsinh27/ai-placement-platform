import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import api, { setAccessToken, getAccessToken } from './api';

describe('Real Axios Interceptor Retry & Idempotency Tests', () => {
  let originalAdapter;
  let originalAxiosPost;

  beforeEach(() => {
    originalAdapter = api.defaults.adapter;
    originalAxiosPost = axios.post;
    setAccessToken(null);

    // Mock global window and localStorage for Node testing environment
    global.window = {
      location: { pathname: '/dashboard', href: '/dashboard' },
    };
    global.localStorage = {
      store: {},
      getItem(k) {
        return this.store[k] || null;
      },
      setItem(k, v) {
        this.store[k] = String(v);
      },
      removeItem(k) {
        delete this.store[k];
      },
      clear() {
        this.store = {};
      },
    };
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    axios.post = originalAxiosPost;
    setAccessToken(null);
    delete global.window;
    delete global.localStorage;
    vi.restoreAllMocks();
  });

  // (a) POST gets 401, refresh succeeds, POST replayed exactly once and succeeds
  it('(a) POST gets 401, refresh succeeds, POST is replayed exactly once with new token and succeeds', async () => {
    let postCallCount = 0;
    const recordedTokens = [];

    // Mock adapter for api instance
    api.defaults.adapter = async (config) => {
      if (config.url?.includes('/applications')) {
        postCallCount++;
        recordedTokens.push(config.headers?.Authorization);

        if (postCallCount === 1) {
          const err = new Error('Request failed with status code 401');
          err.response = { status: 401, data: { message: 'Token expired' } };
          err.config = config;
          throw err;
        }

        return {
          status: 201,
          statusText: 'Created',
          headers: {},
          config,
          data: { success: true, applicationId: 'app-999' },
        };
      }
      throw new Error(`Unhandled route: ${config.url}`);
    };

    // Mock axios.post for the /auth/refresh endpoint
    let refreshCount = 0;
    axios.post = vi.fn().mockImplementation(async (url) => {
      if (url.includes('/auth/refresh')) {
        refreshCount++;
        return {
          status: 200,
          data: { success: true, token: 'mock-fresh-jwt-token-a' },
        };
      }
      return originalAxiosPost(url);
    });

    const res = await api.post('/applications', { driveId: 'drive-101' });

    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(postCallCount).toBe(2); // 1 initial 401 + 1 replayed
    expect(refreshCount).toBe(1);
    expect(recordedTokens[0]).toBeUndefined();
    expect(recordedTokens[1]).toBe('Bearer mock-fresh-jwt-token-a');
    expect(getAccessToken()).toBe('mock-fresh-jwt-token-a');
  });

  // (b) three concurrent POSTs get 401 during one refresh, each replayed exactly once
  it('(b) three concurrent POSTs get 401 during one refresh, each replayed exactly once', async () => {
    const callCounts = { post1: 0, post2: 0, post3: 0 };
    let refreshCount = 0;

    api.defaults.adapter = async (config) => {
      const url = config.url || '';
      for (const key of ['post1', 'post2', 'post3']) {
        if (url.includes(key)) {
          callCounts[key]++;
          if (callCounts[key] === 1) {
            const err = new Error('Token expired');
            err.response = { status: 401, data: { message: 'Token expired' } };
            err.config = config;
            throw err;
          }
          return {
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            data: { success: true, route: key },
          };
        }
      }
      throw new Error(`Unhandled route: ${config.url}`);
    };

    axios.post = vi.fn().mockImplementation(async (url) => {
      if (url.includes('/auth/refresh')) {
        refreshCount++;
        // Small delay to simulate in-flight refresh while concurrent calls arrive
        await new Promise((r) => setTimeout(r, 50));
        return {
          status: 200,
          data: { success: true, token: 'concurrent-token-xyz' },
        };
      }
      return originalAxiosPost(url);
    });

    // Fire 3 concurrent POST requests simultaneously
    const [res1, res2, res3] = await Promise.all([
      api.post('/post1', { data: 1 }),
      api.post('/post2', { data: 2 }),
      api.post('/post3', { data: 3 }),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);

    // Refresh MUST be called only once for all three concurrent calls
    expect(refreshCount).toBe(1);

    // Each individual POST must be executed exactly twice: 1 initial 401 + 1 replayed
    expect(callCounts.post1).toBe(2);
    expect(callCounts.post2).toBe(2);
    expect(callCounts.post3).toBe(2);
    expect(getAccessToken()).toBe('concurrent-token-xyz');
  });

  // (c) POST times out, no retry
  it('(c) POST times out, no retry occurs to prevent duplicate actions', async () => {
    let callCount = 0;

    api.defaults.adapter = async (config) => {
      if (config.url?.includes('/submit-exam')) {
        callCount++;
        const timeoutErr = new Error('timeout of 15000ms exceeded');
        timeoutErr.code = 'ECONNABORTED';
        timeoutErr.config = config;
        throw timeoutErr;
      }
      throw new Error(`Unhandled route: ${config.url}`);
    };

    let errorCaught = null;
    try {
      await api.post('/submit-exam', { answers: [1, 2, 3] });
    } catch (err) {
      errorCaught = err;
    }

    expect(errorCaught).toBeDefined();
    expect(errorCaught.code).toBe('ECONNABORTED');
    // Call count must be STRICTLY 1: non-idempotent POST is NEVER retried on timeout
    expect(callCount).toBe(1);
  });

  // (d) GET gets 503, retried with backoff
  it('(d) GET gets 503, retried with backoff and succeeds', async () => {
    let callCount = 0;

    api.defaults.adapter = async (config) => {
      if (config.url?.includes('/drives')) {
        callCount++;
        if (callCount === 1) {
          const err = new Error('Service Unavailable');
          err.response = { status: 503, data: 'Service Unavailable' };
          err.config = config;
          throw err;
        }
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: { success: true, drives: ['Drive 1', 'Drive 2'] },
        };
      }
      throw new Error(`Unhandled route: ${config.url}`);
    };

    // Test with real backoff
    const res = await api.get('/drives');

    expect(res.status).toBe(200);
    expect(res.data.drives.length).toBe(2);
    // Idempotent GET must be retried once on transient 503 cold start
    expect(callCount).toBe(2);
  }, 10000);

  // (e) the refresh call itself returns 401, the user is logged out with no loops
  it('(e) the refresh call itself returns 401, user is logged out without infinite loops', async () => {
    let apiCallCount = 0;
    let refreshAttemptCount = 0;

    api.defaults.adapter = async (config) => {
      apiCallCount++;
      const err = new Error('Token expired');
      err.response = { status: 401, data: { message: 'Token expired' } };
      err.config = config;
      throw err;
    };

    axios.post = vi.fn().mockImplementation(async (url) => {
      if (url.includes('/auth/refresh')) {
        refreshAttemptCount++;
        const refreshErr = new Error('Refresh token invalid or expired');
        refreshErr.response = { status: 401, data: { message: 'Session terminated' } };
        throw refreshErr;
      }
      return originalAxiosPost(url);
    });

    let caughtErr = null;
    try {
      await api.get('/me');
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).toBeDefined();
    // Refresh attempted exactly once, then immediately stopped
    expect(refreshAttemptCount).toBe(1);
    // API request never retried since refresh failed
    expect(apiCallCount).toBe(1);
    // Token is cleared
    expect(getAccessToken()).toBeNull();
    // User redirected to login
    expect(window.location.href).toBe('/login');
  });

  // (f) a POST that gets 401 again after refresh is not replayed a second time
  it('(f) a POST that gets 401 again after refresh is NOT replayed a second time', async () => {
    let postCallCount = 0;
    let refreshCount = 0;

    api.defaults.adapter = async (config) => {
      if (config.url?.includes('/admin-action')) {
        postCallCount++;
        const err = new Error('Unauthorized');
        err.response = { status: 401, data: { message: 'Still unauthorized' } };
        err.config = config;
        throw err;
      }
      throw new Error(`Unhandled route: ${config.url}`);
    };

    axios.post = vi.fn().mockImplementation(async (url) => {
      if (url.includes('/auth/refresh')) {
        refreshCount++;
        return {
          status: 200,
          data: { success: true, token: 'fresh-token-f' },
        };
      }
      return originalAxiosPost(url);
    });

    let caughtErr = null;
    try {
      await api.post('/admin-action', { role: 'admin' });
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).toBeDefined();
    expect(caughtErr.response?.status).toBe(401);
    // Exactly 2 calls: 1st initial 401, 2nd replayed with new token which also got 401.
    // _retry flag prevents ANY third replay.
    expect(postCallCount).toBe(2);
    expect(refreshCount).toBe(1);
  });
});

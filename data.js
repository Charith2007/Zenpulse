/**
 * ZenPulse - Hybrid Data Management Module (data.js)
 * Supports dual-mode persistence:
 *  1. Live Java Servlet + JDBC + MySQL backend (when deployed on Tomcat)
 *  2. Resilient fallback to browser LocalStorage (when running offline or static)
 */

const DataStore = (() => {
  const STORAGE_KEY = 'zenpulse_study_sessions_v1';
  let sessions = [];
  const listeners = [];
  let isBackendConnected = false;
  let apiBaseUrl = '';

  /**
   * Resolves the appropriate servlet API endpoint dynamically
   */
  const resolveApiUrl = () => {
    // If running in Tomcat with context path (e.g., /zenpulse/ or /)
    const path = window.location.pathname;
    if (path.includes('/zenpulse/')) {
      return 'api/sessions.php';
    }
    return 'api/sessions.php';
  };

  /**
   * Generates a unique session ID
   */
  const generateId = () => 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

  /**
   * Subscribes a callback to data change events
   */
  const onChange = (callback) => {
    if (typeof callback === 'function') {
      listeners.push(callback);
    }
  };

  /**
   * Notifies all subscribed listeners that data has updated
   */
  const notifyListeners = () => {
    listeners.forEach((fn) => {
      try {
        fn([...sessions]);
      } catch (err) {
        console.error('Error in DataStore listener callback:', err);
      }
    });
  };

  /**
   * Updates the UI badge displaying backend connection status
   */
  const updateStatusBadge = (connected, message) => {
    const badge = document.getElementById('backend-status-badge');
    if (!badge) return;

    if (connected) {
      badge.className = 'status-note';
      badge.textContent = '● Synced';
      badge.title = 'Active: Connected to Java Servlet API & MySQL Database';
    } else {
      badge.className = 'status-note';
      badge.textContent = 'Saved locally';
      badge.title = message || 'Running in client-side storage mode. Deploy to Tomcat to enable MySQL.';
    }
  };

  /**
   * Checks whether the Java Servlet API is reachable
   */
  const probeBackend = async () => {
    apiBaseUrl = resolveApiUrl();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);

      const res = await fetch(`${apiBaseUrl}?action=health`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok') {
          isBackendConnected = true;
          updateStatusBadge(true);
          return true;
        }
      }
    } catch (e) {
      // Backend not running / offline - fallback to localStorage
    }

    isBackendConnected = false;
    updateStatusBadge(false);
    return false;
  };

  /**
   * Saves current sessions to localStorage (used in offline / fallback mode)
   */
  const persistLocal = () => {
    try {
      // Signed-in users are stored in MySQL; only guests/offline use LocalStorage
      const serverBacked = isBackendConnected && window.AuthManager && window.AuthManager.isAuthenticated();
      if (!serverBacked) localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.warn('Unable to persist to localStorage:', e);
    }
    notifyListeners();
  };

  /**
   * Fetches sessions from the Java Servlet backend
   */
  const fetchFromBackend = async () => {
    try {
      const res = await fetch(apiBaseUrl);
      if (res.ok) {
        const data = await res.json();
        sessions = data.map((s) => ({
          ...s,
          timestamp: new Date(s.timestamp)
        }));
        notifyListeners();
        return true;
      }
    } catch (err) {
      console.warn('Failed to fetch from backend, switching to local cache:', err);
    }
    return false;
  };

  /**
   * Initializes data store: probes backend, then loads from MySQL or LocalStorage
   */
  const init = async () => {
    const online = await probeBackend();

    if (online) {
      const fetched = await fetchFromBackend();
      if (fetched) {
        return;
      }
    }

    // Fallback: LocalStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        sessions = JSON.parse(saved);
        sessions.forEach((s) => {
          s.timestamp = new Date(s.timestamp);
        });
      } else {
        seedDemoData(false);
      }
    } catch (e) {
      sessions = [];
      seedDemoData(false);
    }
    notifyListeners();
  };

  /**
   * Returns a copy of current sessions, optionally filtered
   */
  const getSessions = (filterType = 'all') => {
    let list = [...sessions];
    if (filterType !== 'all') {
      list = list.filter((s) => s.type === filterType);
    }
    return list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  };

  /**
   * Adds a new session (syncs to MySQL if online, and always updates local state)
   */
  const addSession = async (sessionData) => {
    const newSession = {
      id: sessionData.id || generateId(),
      subject: sessionData.subject || 'General Study',
      duration: parseInt(sessionData.duration, 10),
      type: sessionData.type === 'break' ? 'break' : 'focus',
      timestamp: sessionData.timestamp ? new Date(sessionData.timestamp) : new Date(),
      notes: sessionData.notes || ''
    };

    // Update in-memory state immediately for instant UI responsiveness
    sessions.unshift(newSession);

    if (isBackendConnected) {
      try {
        const formData = new URLSearchParams();
        formData.append('id', newSession.id);
        formData.append('subject', newSession.subject);
        formData.append('duration', String(newSession.duration));
        formData.append('type', newSession.type);
        formData.append('notes', newSession.notes);
        formData.append('timestamp', newSession.timestamp.toISOString());

        const resp = await fetch(apiBaseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString()
        });
        if (resp.status === 401 && window.ZenPulseApp) {
          window.ZenPulseApp.showToast('⚠️ Session expired. Sign in again to sync.');
        }
      } catch (err) {
        console.warn('Backend sync failed, recorded locally:', err);
      }
    }

    persistLocal();
    return newSession;
  };

  /**
   * Deletes a session by ID (syncs deletion to MySQL if online)
   */
  const deleteSession = async (id) => {
    const initialLength = sessions.length;
    sessions = sessions.filter((s) => s.id !== id);

    if (sessions.length !== initialLength) {
      if (isBackendConnected) {
        try {
          await fetch(`${apiBaseUrl}?action=delete&id=${encodeURIComponent(id)}`, {
            method: 'POST'
          });
        } catch (err) {
          console.warn('Backend delete sync failed:', err);
        }
      }
      persistLocal();
      return true;
    }
    return false;
  };

  /**
   * Clears all session records
   */
  const clearAll = async () => {
    sessions = [];
    if (isBackendConnected) {
      try {
        await fetch(`${apiBaseUrl}?action=clear`, { method: 'POST' });
      } catch (err) {
        console.warn('Backend clear sync failed:', err);
      }
    }
    persistLocal();
  };

  /**
   * Seeds demo data spanning 7 days
   */
  const seedDemoData = async (triggerNotify = true) => {
    if (isBackendConnected) {
      try {
        const res = await fetch(`${apiBaseUrl}?action=seed&tzOffset=${new Date().getTimezoneOffset()}`, { method: 'POST' });
        if (res.ok) {
          await fetchFromBackend();
          return;
        }
      } catch (err) {
        console.warn('Backend seed sync failed, seeding locally:', err);
      }
    }

    const subjects = [
      'Web Technologies (Servlets)',
      'Data Structures & Algorithms',
      'Database Management (MySQL)',
      'Computer Networks',
      'Software Engineering'
    ];

    const now = new Date();
    const demoSessions = [];

    // Today's sessions
    demoSessions.push({
      id: generateId(),
      subject: 'Web Technologies (Servlets)',
      duration: 50,
      type: 'focus',
      timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 30),
      notes: 'Implemented Servlet Life Cycle methods'
    });
    demoSessions.push({
      id: generateId(),
      subject: 'Hydration & Walk',
      duration: 10,
      type: 'break',
      timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 25),
      notes: 'Morning coffee & eye rest'
    });
    demoSessions.push({
      id: generateId(),
      subject: 'Web Technologies (JSP)',
      duration: 45,
      type: 'focus',
      timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 40),
      notes: 'Constructed custom JavaBean mapping'
    });
    demoSessions.push({
      id: generateId(),
      subject: 'Stretch Break',
      duration: 10,
      type: 'break',
      timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 30),
      notes: 'Quick stretch'
    });
    demoSessions.push({
      id: generateId(),
      subject: 'Data Structures & Algorithms',
      duration: 60,
      type: 'focus',
      timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0),
      notes: 'Practiced Graph BFS/DFS traversal'
    });
    demoSessions.push({
      id: generateId(),
      subject: 'Tea & Walk',
      duration: 15,
      type: 'break',
      timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 5),
      notes: 'Outdoor walk'
    });

    // Generate past 6 days
    for (let dayOffset = 1; dayOffset <= 6; dayOffset++) {
      const dayDate = new Date();
      dayDate.setDate(now.getDate() - dayOffset);

      const focusSessionsCount = 3 + (dayOffset % 3);
      for (let s = 0; s < focusSessionsCount; s++) {
        const subj = subjects[(s + dayOffset) % subjects.length];
        const focusDuration = 35 + ((s * 15 + dayOffset * 10) % 55);
        demoSessions.push({
          id: generateId(),
          subject: subj,
          duration: focusDuration,
          type: 'focus',
          timestamp: new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 10 + s * 2, 0),
          notes: 'Coursework revision'
        });

        if (s < focusSessionsCount - 1) {
          demoSessions.push({
            id: generateId(),
            subject: 'Rest Break',
            duration: 10 + ((s * 5) % 15),
            type: 'break',
            timestamp: new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 10 + s * 2, focusDuration + 2),
            notes: 'Screen pause'
          });
        }
      }
    }

    sessions = demoSessions;
    persistLocal();
  };

  return {
    init,
    getSessions,
    addSession,
    deleteSession,
    clearAll,
    seedDemoData,
    onChange,
    probeBackend,
    isBackendConnected: () => isBackendConnected
  };
})();

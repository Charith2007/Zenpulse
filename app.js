/**
 * ZenPulse - Main Application Orchestrator (app.js)
 * Initializes sub-modules, connects DataStore reactive events,
 * manages theme toggling, and provides toast notifications.
 */

const ZenPulseApp = (() => {
  const THEME_STORAGE_KEY = 'zenpulse_theme_v1';
  const toastContainer = document.getElementById('toast-container');
  const themeToggleBtn = document.getElementById('theme-toggle');
  const btnSeedData = document.getElementById('btn-seed-data');
  const btnClearData = document.getElementById('btn-clear-data');

  /**
   * Displays temporary toast notification
   */
  const showToast = (message, duration = 3000) => {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }, duration);
  };

  /**
   * Toggles between Light and Dark themes and persists preference
   */
  const initTheme = () => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        showToast(`Switched to ${nextTheme} theme`);
      });
    }
  };

  /**
   * Attaches Global Action Handlers (Seed Data, Clear Data)
   */
  const setupGlobalActions = () => {
    if (btnSeedData) {
      btnSeedData.addEventListener('click', () => {
        DataStore.seedDemoData();
        showToast('🌱 Seeded 7 days of realistic study sessions!');
      });
    }

    if (btnClearData) {
      btnClearData.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all logged study sessions?')) {
          DataStore.clearAll();
          showToast('🧹 All activity data reset.');
        }
      });
    }
  };

  /**
   * Central Application Initialization
   */
  const start = async () => {
    initTheme();

    // 1. Initialize Sub-Modules
    FocusTimer.init();
    SessionLogger.init();
    AuthManager.onAuthChange((user) => {
      // Re-initialize data for logged-in user
      DataStore.init();
    });

    // Probe the backend first so the session check can ask the server who is signed in
    await DataStore.probeBackend();
    AuthManager.init();

    // 2. Setup Reactive Data Binding
    // Whenever sessions are added, deleted, or seeded, update dashboard and history
    DataStore.onChange((sessions) => {
      ChartRenderer.updateDashboard(sessions);
      SessionLogger.renderHistory(sessions);
    });

    // 3. Load initial data (which triggers first render)
    DataStore.init();

    setupGlobalActions();
    console.log('ZenPulse Digital Wellbeing Tracker initialized successfully.');
  };

  return {
    start,
    showToast
  };
})();

// Expose globally for cross-module access
window.ZenPulseApp = ZenPulseApp;

// Auto-start on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  ZenPulseApp.start();
});

// Shared "Start Focus" action used by empty-state buttons
window.startFocusNow = () => {
  FocusTimer.setModeDuration('focus');
  FocusTimer.startTimer();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

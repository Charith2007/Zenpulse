/**
 * ZenPulse - Authentication & User Management Module (auth.js)
 * Manages student Login, Registration, HttpSession state,
 * profile display in header, and one-click demo access.
 */

const AuthManager = (() => {
  const LOCAL_USER_KEY = 'zenpulse_active_user_v1';
  let currentUser = null;
  const authListeners = [];

  const resolveAuthUrl = () => {
    if (window.location.protocol === 'file:') {
      return '';
    }
    const path = window.location.pathname;
    if (path.includes('/zenpulse/')) {
      return 'api/auth.php';
    }
    return 'api/auth.php';
  };

  const onAuthChange = (callback) => {
    if (typeof callback === 'function') authListeners.push(callback);
  };

  const notifyAuthListeners = () => {
    authListeners.forEach((fn) => {
      try { fn(currentUser); } catch (e) { console.error(e); }
    });
  };

  const showModal = (initialTab = 'login') => {
    const modal = document.getElementById('auth-modal');
    if (!modal) {
      console.error('Auth modal element (#auth-modal) not found in DOM');
      return;
    }

    switchTab(initialTab);
    clearErrors();

    try {
      if (typeof modal.showModal === 'function') {
        if (!modal.open) {
          modal.showModal();
        }
      } else {
        modal.setAttribute('open', '');
      }
    } catch (e) {
      modal.setAttribute('open', '');
    }
  };

  const closeModal = () => {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    try {
      if (typeof modal.close === 'function') {
        modal.close();
      } else {
        modal.removeAttribute('open');
      }
    } catch (e) {
      modal.removeAttribute('open');
    }
  };

  const switchTab = (tabName) => {
    clearErrors();
    const tabLogin = document.getElementById('tab-auth-login');
    const tabRegister = document.getElementById('tab-auth-register');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');

    if (tabName === 'login') {
      if (tabLogin) tabLogin.classList.add('active');
      if (tabRegister) tabRegister.classList.remove('active');
      if (formLogin) formLogin.style.display = 'flex';
      if (formRegister) formRegister.style.display = 'none';
    } else {
      if (tabLogin) tabLogin.classList.remove('active');
      if (tabRegister) tabRegister.classList.add('active');
      if (formLogin) formLogin.style.display = 'none';
      if (formRegister) formRegister.style.display = 'flex';
    }
  };

  const clearErrors = () => {
    const errLogin = document.getElementById('err-login-general');
    const errRegister = document.getElementById('err-register-general');
    if (errLogin) errLogin.textContent = '';
    if (errRegister) errRegister.textContent = '';
  };

  const getInitials = (name) => {
    if (!name) return 'SC';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const updateProfileUI = () => {
    const userProfileChip = document.getElementById('user-profile-chip');
    const btnOpenAuth = document.getElementById('btn-open-auth');
    const userInitialsEl = document.getElementById('user-initials');
    const userNameEl = document.getElementById('user-display-name');

    if (currentUser) {
      if (userProfileChip) userProfileChip.style.display = 'flex';
      if (btnOpenAuth) btnOpenAuth.style.display = 'none';
      if (userInitialsEl) userInitialsEl.textContent = getInitials(currentUser.name);
      if (userNameEl) userNameEl.textContent = currentUser.name;
    } else {
      if (userProfileChip) userProfileChip.style.display = 'none';
      if (btnOpenAuth) btnOpenAuth.style.display = 'inline-flex';
    }
  };

  /**
   * Checks for active user session on startup
   */
  const checkSession = async () => {
    const isFileProtocol = window.location.protocol === 'file:';
    const isOnline = !isFileProtocol && typeof DataStore !== 'undefined' && DataStore.isBackendConnected();
    const authUrl = resolveAuthUrl();

    if (isOnline && authUrl) {
      try {
        const res = await fetch(`${authUrl}?action=me`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            currentUser = data.user;
            localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(currentUser));
            updateProfileUI();
            notifyAuthListeners();
            return;
          }
          // Server says no active session: drop any stale cached user
          localStorage.removeItem(LOCAL_USER_KEY);
          currentUser = null;
          updateProfileUI();
          return;
        }
      } catch (e) {
        console.warn('Backend auth check skipped:', e);
      }
    }

    // Check LocalStorage fallback
    try {
      const saved = localStorage.getItem(LOCAL_USER_KEY);
      if (saved) {
        currentUser = JSON.parse(saved);
        updateProfileUI();
        notifyAuthListeners();
        return;
      }
    } catch (e) {}

    currentUser = null;
    updateProfileUI();
  };

  /**
   * Student Login
   */
  const login = async (email, password) => {
    clearErrors();
    const errLogin = document.getElementById('err-login-general');

    if (!email || !password) {
      if (errLogin) errLogin.textContent = 'Please enter both email and password.';
      return false;
    }

    const isFileProtocol = window.location.protocol === 'file:';
    const isOnline = !isFileProtocol && typeof DataStore !== 'undefined' && DataStore.isBackendConnected();
    const authUrl = resolveAuthUrl();

    if (isOnline && authUrl) {
      try {
        const params = new URLSearchParams();
        params.append('action', 'login');
        params.append('email', email);
        params.append('password', password);

        const res = await fetch(authUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
          credentials: 'include'
        });

        const data = await res.json();

        if (res.ok && data.status === 'success') {
          currentUser = data.user;
          localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(currentUser));
          updateProfileUI();
          closeModal();
          notifyAuthListeners();
          if (window.ZenPulseApp && window.ZenPulseApp.showToast) {
            window.ZenPulseApp.showToast(`👋 Welcome back, ${currentUser.name}!`);
          }
          if (typeof DataStore !== 'undefined') DataStore.init();
          return true;
        } else {
          if (errLogin) errLogin.textContent = data.message || 'Invalid email or password.';
          return false;
        }
      } catch (err) {
        console.warn('Backend login request error, using fallback:', err);
      }
    }

    // Local / Offline fallback login simulation
    const nameMap = {
      'student@woxsen.edu.in': 'Sai Charith',
      'alex.dev@woxsen.edu.in': 'Alex Dev'
    };

    currentUser = {
      userId: 1,
      name: nameMap[email.toLowerCase()] || (email.split('@')[0] || 'Student'),
      email: email,
      department: 'Computer Science & Engineering'
    };

    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(currentUser));
    updateProfileUI();
    closeModal();
    notifyAuthListeners();

    if (window.ZenPulseApp && window.ZenPulseApp.showToast) {
      window.ZenPulseApp.showToast(`👋 Welcome, ${currentUser.name}!`);
    }
    return true;
  };

  /**
   * Student Registration
   */
  const register = async (name, email, password, department) => {
    clearErrors();
    const errRegister = document.getElementById('err-register-general');

    if (!name || !email || !password) {
      if (errRegister) errRegister.textContent = 'Please fill in all required fields.';
      return false;
    }
    if (password.length < 6) {
      if (errRegister) errRegister.textContent = 'Password must be at least 6 characters.';
      return false;
    }

    const isFileProtocol = window.location.protocol === 'file:';
    const isOnline = !isFileProtocol && typeof DataStore !== 'undefined' && DataStore.isBackendConnected();
    const authUrl = resolveAuthUrl();

    if (isOnline && authUrl) {
      try {
        const params = new URLSearchParams();
        params.append('action', 'register');
        params.append('name', name);
        params.append('email', email);
        params.append('password', password);
        params.append('department', department || 'Computer Science & Engineering');

        const res = await fetch(authUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
          credentials: 'include'
        });

        const data = await res.json();

        if (res.ok && data.status === 'success') {
          currentUser = data.user;
          localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(currentUser));
          updateProfileUI();
          closeModal();
          notifyAuthListeners();
          if (window.ZenPulseApp && window.ZenPulseApp.showToast) {
            window.ZenPulseApp.showToast(`🎉 Welcome to ZenPulse, ${currentUser.name}!`);
          }
          if (typeof DataStore !== 'undefined') DataStore.init();
          return true;
        } else {
          if (errRegister) errRegister.textContent = data.message || 'Registration failed.';
          return false;
        }
      } catch (err) {
        console.warn('Backend register request error, using fallback:', err);
      }
    }

    // Local registration simulation
    currentUser = {
      userId: Date.now(),
      name: name,
      email: email,
      department: department || 'Computer Science & Engineering'
    };

    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(currentUser));
    updateProfileUI();
    closeModal();
    notifyAuthListeners();

    if (window.ZenPulseApp && window.ZenPulseApp.showToast) {
      window.ZenPulseApp.showToast(`🎉 Account created! Welcome, ${name}!`);
    }
    return true;
  };

  /**
   * Student Logout
   */
  const logout = async () => {
    const isFileProtocol = window.location.protocol === 'file:';
    const isOnline = !isFileProtocol && typeof DataStore !== 'undefined' && DataStore.isBackendConnected();
    const authUrl = resolveAuthUrl();

    if (isOnline && authUrl) {
      try {
        await fetch(`${authUrl}?action=logout`, {
          method: 'POST',
          credentials: 'include'
        });
      } catch (e) {}
    }

    currentUser = null;
    localStorage.removeItem(LOCAL_USER_KEY);
    updateProfileUI();
    notifyAuthListeners();

    if (window.ZenPulseApp && window.ZenPulseApp.showToast) {
      window.ZenPulseApp.showToast('🔒 You have been signed out.');
    }
    showModal('login');
  };

  /**
   * One-click Demo Student fill & submit
   */
  const fillDemoAccount = () => {
    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
    if (emailInput) emailInput.value = 'student@woxsen.edu.in';
    if (passInput) passInput.value = 'password123';
    login('student@woxsen.edu.in', 'password123');
  };

  const init = () => {
    const tabLogin = document.getElementById('tab-auth-login');
    const tabRegister = document.getElementById('tab-auth-register');
    const btnOpenAuth = document.getElementById('btn-open-auth');
    const btnCloseAuth = document.getElementById('btn-close-auth');
    const btnDemoLogin = document.getElementById('btn-demo-login');
    const btnLogout = document.getElementById('btn-logout');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const authModal = document.getElementById('auth-modal');

    if (tabLogin) tabLogin.addEventListener('click', () => switchTab('login'));
    if (tabRegister) tabRegister.addEventListener('click', () => switchTab('register'));

    if (btnOpenAuth) {
      btnOpenAuth.addEventListener('click', (e) => {
        e.preventDefault();
        showModal('login');
      });
    }

    if (btnCloseAuth) {
      btnCloseAuth.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal();
      });
    }

    if (btnDemoLogin) {
      btnDemoLogin.addEventListener('click', (e) => {
        e.preventDefault();
        fillDemoAccount();
      });
    }

    if (btnLogout) {
      btnLogout.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
      });
    }

    if (formLogin) {
      formLogin.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const pass = document.getElementById('login-password').value.trim();
        login(email, pass);
      });
    }

    if (formRegister) {
      formRegister.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const pass = document.getElementById('reg-password').value.trim();
        const dept = document.getElementById('reg-dept').value.trim();
        register(name, email, pass, dept);
      });
    }

    // Close on backdrop click
    if (authModal) {
      authModal.addEventListener('click', (e) => {
        const rect = authModal.getBoundingClientRect();
        const isInDialog = (
          rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX && e.clientX <= rect.left + rect.width
        );
        if (!isInDialog) {
          closeModal();
        }
      });
    }

    checkSession();
  };

  return {
    init,
    showModal,
    closeModal,
    login,
    register,
    logout,
    fillDemoAccount,
    onAuthChange,
    getCurrentUser: () => currentUser,
    isAuthenticated: () => currentUser !== null
  };
})();

// Expose globally so inline onclick or other modules can access it directly
window.AuthManager = AuthManager;

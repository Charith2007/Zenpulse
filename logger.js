/**
 * ZenPulse - Manual Session Logger & History Module (logger.js)
 * Implements robust real-time client-side form validation,
 * dynamic session list rendering, filtering, and delete operations.
 */

const SessionLogger = (() => {
  // DOM Elements
  const form = document.getElementById('session-form');
  const inputSubject = document.getElementById('session-subject');
  const selectType = document.getElementById('session-type');
  const inputDuration = document.getElementById('session-duration');
  const inputDate = document.getElementById('session-date');
  const inputNotes = document.getElementById('session-notes');

  const errSubject = document.getElementById('err-subject');
  const errDuration = document.getElementById('err-duration');
  const errDate = document.getElementById('err-date');

  const sessionListEl = document.getElementById('session-list');
  const filterSelect = document.getElementById('filter-history-type');

  /**
   * Sets default datetime-local value to current moment formatted for input
   */
  const setDefaultDateTime = () => {
    if (!inputDate) return;
    const now = new Date();
    // Offset for local timezone string
    const offset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - offset).toISOString().slice(0, 16);
    inputDate.value = localISOTime;
  };

  /**
   * Validates Subject field
   */
  const validateSubject = () => {
    const val = inputSubject.value.trim();
    if (!val) {
      inputSubject.classList.add('invalid');
      errSubject.textContent = 'Subject / Activity name is required.';
      return false;
    }
    if (val.length < 2) {
      inputSubject.classList.add('invalid');
      errSubject.textContent = 'Subject must be at least 2 characters.';
      return false;
    }
    inputSubject.classList.remove('invalid');
    errSubject.textContent = '';
    return true;
  };

  /**
   * Validates Duration field
   */
  const validateDuration = () => {
    const rawVal = inputDuration.value.trim();
    const val = parseInt(rawVal, 10);

    if (!rawVal || isNaN(val)) {
      inputDuration.classList.add('invalid');
      errDuration.textContent = 'Session duration is required.';
      return false;
    }
    if (val < 1) {
      inputDuration.classList.add('invalid');
      errDuration.textContent = 'Duration must be a positive number (minimum 1 minute).';
      return false;
    }
    if (val > 480) {
      inputDuration.classList.add('invalid');
      errDuration.textContent = 'Duration cannot exceed 480 minutes (8 hours) per session.';
      return false;
    }
    inputDuration.classList.remove('invalid');
    errDuration.textContent = '';
    return true;
  };

  /**
   * Formats timestamp into readable date & time string
   */
  const formatTimestamp = (dateObj) => {
    const d = new Date(dateObj);
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isToday = new Date().toDateString() === d.toDateString();
    if (isToday) {
      return `Today, ${timeStr}`;
    }
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${dateStr}, ${timeStr}`;
  };

  /**
   * Renders the session list items dynamically in the DOM
   */
  const renderHistory = (sessions) => {
    if (!sessionListEl) return;
    const filterType = filterSelect ? filterSelect.value : 'all';
    const filteredSessions = DataStore.getSessions(filterType);

    sessionListEl.innerHTML = '';

    if (filteredSessions.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'empty-state';
      emptyLi.innerHTML = '<strong>Ready when you are.</strong><span>Start your first focus session today.</span><button type="button" class="btn btn-primary btn-sm" onclick="startFocusNow()">Start Focus</button>';
      sessionListEl.appendChild(emptyLi);
      return;
    }

    filteredSessions.forEach((sess) => {
      const li = document.createElement('li');
      li.className = 'session-item';
      li.setAttribute('data-id', sess.id);

      const isFocus = sess.type === 'focus';
      const iconSymbol = isFocus ? '🎯' : '☕';
      const iconClass = isFocus ? 'icon-focus' : 'icon-break';

      li.innerHTML = `
        <div class="session-item-left">
          <div class="session-badge-icon ${iconClass}">
            ${iconSymbol}
          </div>
          <div>
            <div class="session-item-title">${escapeHtml(sess.subject)}</div>
            <div class="session-item-meta">${formatTimestamp(sess.timestamp)} ${sess.notes ? '• ' + escapeHtml(sess.notes) : ''}</div>
          </div>
        </div>
        <div class="session-item-right">
          <span class="session-duration-tag">${sess.duration}m</span>
          <button class="btn-delete-session" title="Delete entry" aria-label="Delete entry" data-id="${sess.id}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;

      // Attach delete click handler
      const delBtn = li.querySelector('.btn-delete-session');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          DataStore.deleteSession(sess.id);
          if (window.ZenPulseApp && window.ZenPulseApp.showToast) {
            window.ZenPulseApp.showToast('🗑️ Session removed from log.');
          }
        });
      }

      sessionListEl.appendChild(li);
    });
  };

  /**
   * Basic HTML sanitizer helper to prevent XSS
   */
  const escapeHtml = (str) => {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  /**
   * Initializes form handlers, input listeners, and filters
   */
  const init = () => {
    setDefaultDateTime();

    // Real-time input listeners for validation feedback
    if (inputSubject) {
      inputSubject.addEventListener('input', validateSubject);
      inputSubject.addEventListener('blur', validateSubject);
    }

    if (inputDuration) {
      inputDuration.addEventListener('input', validateDuration);
      inputDuration.addEventListener('blur', validateDuration);
    }

    // Filter change handler
    if (filterSelect) {
      filterSelect.addEventListener('change', () => {
        renderHistory();
      });
    }

    // Form submit handler
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();

        const isSubjectValid = validateSubject();
        const isDurationValid = validateDuration();

        if (!isSubjectValid || !isDurationValid) {
          return;
        }

        const subjectVal = inputSubject.value.trim();
        const typeVal = selectType.value;
        const durationVal = parseInt(inputDuration.value.trim(), 10);
        const dateVal = inputDate.value ? new Date(inputDate.value) : new Date();
        const notesVal = inputNotes ? inputNotes.value.trim() : '';

        // Add to DataStore
        DataStore.addSession({
          subject: subjectVal,
          type: typeVal,
          duration: durationVal,
          timestamp: dateVal,
          notes: notesVal
        });

        // Reset form fields
        inputSubject.value = '';
        inputDuration.value = '';
        if (inputNotes) inputNotes.value = '';
        setDefaultDateTime();

        // Update task display in timer panel if focus
        const currentTaskDisplay = document.getElementById('current-task-display');
        if (currentTaskDisplay && typeVal === 'focus') {
          currentTaskDisplay.textContent = `Current Subject: ${subjectVal}`;
        }

        if (window.ZenPulseApp && window.ZenPulseApp.showToast) {
          window.ZenPulseApp.showToast(`✅ Logged ${durationVal}m ${typeVal === 'focus' ? 'focus on ' + subjectVal : 'break'}!`);
        }
      });
    }
  };

  return {
    init,
    renderHistory,
    setDefaultDateTime
  };
})();

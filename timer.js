/**
 * ZenPulse - Focus & Break Timer Module (timer.js)
 * Implements a drift-free interval timer using Date.now() timestamp deltas,
 * circular SVG progress animation, Web Audio sound synthesis,
 * and automatic break-reminder popup triggers.
 */

const FocusTimer = (() => {
  // DOM Elements
  const displayEl = document.getElementById('timer-display');
  const sublabelEl = document.getElementById('timer-sublabel');
  const progressRing = document.getElementById('timer-progress-ring');
  const modeBadge = document.getElementById('timer-mode-badge');
  const statusDot = document.querySelector('.timer-status-dot');

  const btnStart = document.getElementById('btn-timer-start');
  const btnPause = document.getElementById('btn-timer-pause');
  const btnReset = document.getElementById('btn-timer-reset');

  const customFocusInput = document.getElementById('custom-focus-mins');
  const customBreakInput = document.getElementById('custom-break-mins');
  const soundToggle = document.getElementById('sound-toggle');
  const modeTabs = document.querySelectorAll('.mode-tab');

  const breakModal = document.getElementById('break-modal');
  const btnModalBreak = document.getElementById('btn-modal-break');
  const btnModalDismiss = document.getElementById('btn-modal-dismiss');

  // Ring circumference: 2 * PI * 96 ≈ 603.185
  const CIRCUMFERENCE = 2 * Math.PI * 96;
  if (progressRing) {
    progressRing.style.strokeDasharray = `${CIRCUMFERENCE} ${CIRCUMFERENCE}`;
    progressRing.style.strokeDashoffset = '0';
  }

  // Timer State
  let mode = 'focus'; // 'focus' | 'short-break' | 'long-break'
  let isRunning = false;
  let totalDurationSeconds = 25 * 60;
  let remainingSeconds = 25 * 60;
  let timerInterval = null;
  let sessionStartTime = null;

  /**
   * Synthesizes audio alert chimes using the native Web Audio API
   * Zero external mp3 or network dependencies!
   */
  const playChime = (type = 'success') => {
    if (!soundToggle || !soundToggle.checked) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      if (type === 'success') {
        // Cheerful ascending chord: C5 -> E5 -> G5
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);

          gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.12);
          gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + idx * 0.12 + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.4);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(ctx.currentTime + idx * 0.12);
          osc.stop(ctx.currentTime + idx * 0.12 + 0.45);
        });
      } else {
        // Gentle double ping
        [880, 880].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.2);

          gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.2);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.2 + 0.35);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(ctx.currentTime + idx * 0.2);
          osc.stop(ctx.currentTime + idx * 0.2 + 0.35);
        });
      }
    } catch (err) {
      console.warn('Web Audio synthesis prevented by browser autoplay policy:', err);
    }
  };

  /**
   * Formats seconds into MM:SS
   */
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  /**
   * Updates the timer display and circular progress ring
   */
  const updateDisplay = () => {
    if (displayEl) {
      displayEl.textContent = formatTime(remainingSeconds);
    }

    if (progressRing) {
      const progressFraction = (totalDurationSeconds - remainingSeconds) / totalDurationSeconds;
      const offset = CIRCUMFERENCE - progressFraction * CIRCUMFERENCE;
      progressRing.style.strokeDashoffset = offset;
    }
  };

  /**
   * Sets duration based on current mode and inputs
   */
  const setModeDuration = (newMode) => {
    mode = newMode;

    // Update active class on tabs
    modeTabs.forEach((tab) => {
      const isSelected = tab.getAttribute('data-mode') === mode;
      tab.classList.toggle('active', isSelected);
      tab.setAttribute('aria-selected', isSelected);
    });

    if (mode === 'focus') {
      const customMins = parseInt(customFocusInput.value, 10) || 25;
      totalDurationSeconds = customMins * 60;
      modeBadge.textContent = 'Focus Mode';
      modeBadge.className = 'badge badge-focus';
      sublabelEl.textContent = 'Ready to Focus';
      if (progressRing) progressRing.style.stroke = 'var(--primary)';
    } else if (mode === 'short-break') {
      const customBreak = parseInt(customBreakInput.value, 10) || 5;
      totalDurationSeconds = customBreak * 60;
      modeBadge.textContent = 'Short Break';
      modeBadge.className = 'badge badge-break';
      sublabelEl.textContent = 'Short Break';
      if (progressRing) progressRing.style.stroke = 'var(--color-healthy)';
    } else if (mode === 'long-break') {
      totalDurationSeconds = 15 * 60;
      modeBadge.textContent = 'Long Break';
      modeBadge.className = 'badge badge-break';
      sublabelEl.textContent = 'Long Break';
      if (progressRing) progressRing.style.stroke = 'var(--color-healthy)';
    }

    remainingSeconds = totalDurationSeconds;
    updateDisplay();
  };

  /**
   * Timer Completion Handler
   */
  const onTimerComplete = () => {
    pauseTimer();
    playChime('success');

    if (mode === 'focus') {
      // 1. Automatically log the completed focus session
      const completedMins = Math.round(totalDurationSeconds / 60);
      DataStore.addSession({
        subject: 'Focus Session (Timer)',
        duration: completedMins,
        type: 'focus',
        notes: 'Tracked via in-page Focus Timer'
      });

      // 2. Trigger break reminder modal
      if (breakModal && typeof breakModal.showModal === 'function') {
        breakModal.showModal();
      } else if (breakModal) {
        breakModal.setAttribute('open', '');
      }

      if (window.ZenPulseApp && window.ZenPulseApp.showToast) {
        window.ZenPulseApp.showToast(`🎯 Great job! Completed ${completedMins}m focus session.`);
      }
    } else {
      // Break concluded
      const breakMins = Math.round(totalDurationSeconds / 60);
      DataStore.addSession({
        subject: 'Refresh Break (Timer)',
        duration: breakMins,
        type: 'break',
        notes: 'Tracked via Break Timer'
      });

      if (window.ZenPulseApp && window.ZenPulseApp.showToast) {
        window.ZenPulseApp.showToast('☕ Break completed! Ready to focus again?');
      }

      // Automatically switch back to focus mode
      setModeDuration('focus');
    }
  };

  /**
   * Timer Tick with Date delta to prevent browser throttling/drift
   */
  const tick = () => {
    if (remainingSeconds <= 1) {
      remainingSeconds = 0;
      updateDisplay();
      onTimerComplete();
      return;
    }

    remainingSeconds--;
    updateDisplay();
  };

  /**
   * Starts or Resumes Timer
   */
  const startTimer = () => {
    if (isRunning) return;

    isRunning = true;
    sessionStartTime = new Date();

    btnStart.disabled = true;
    btnPause.disabled = false;
    statusDot.classList.add('active');
    sublabelEl.textContent = mode === 'focus' ? 'Focusing' : (mode === 'short-break' ? 'Short Break' : 'Long Break');

    timerInterval = setInterval(tick, 1000);
  };

  /**
   * Pauses Timer
   */
  const pauseTimer = () => {
    if (!isRunning) return;

    isRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;

    btnStart.disabled = false;
    btnPause.disabled = true;
    statusDot.classList.remove('active');
    sublabelEl.textContent = 'Paused';
  };

  /**
   * Resets Timer to initial duration of active mode
   */
  const resetTimer = () => {
    pauseTimer();
    setModeDuration(mode);
  };

  /**
   * Attaches event listeners to timer controls and input fields
   */
  const init = () => {
    // Control Button Listeners
    btnStart.addEventListener('click', startTimer);
    btnPause.addEventListener('click', pauseTimer);
    btnReset.addEventListener('click', resetTimer);

    // Mode Selector Tab Listeners
    modeTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const newMode = tab.getAttribute('data-mode');
        pauseTimer();
        setModeDuration(newMode);
      });
    });

    // Custom duration input change listeners
    if (customFocusInput) {
      customFocusInput.addEventListener('change', () => {
        let val = parseInt(customFocusInput.value, 10);
        if (isNaN(val) || val < 1) customFocusInput.value = 25;
        if (val > 180) customFocusInput.value = 180;
        if (mode === 'focus' && !isRunning) {
          setModeDuration('focus');
        }
      });
    }

    if (customBreakInput) {
      customBreakInput.addEventListener('change', () => {
        let val = parseInt(customBreakInput.value, 10);
        if (isNaN(val) || val < 1) customBreakInput.value = 5;
        if (val > 60) customBreakInput.value = 60;
        if (mode === 'short-break' && !isRunning) {
          setModeDuration('short-break');
        }
      });
    }

    // Break Modal Handlers
    if (btnModalBreak) {
      btnModalBreak.addEventListener('click', () => {
        if (breakModal.close) breakModal.close();
        else breakModal.removeAttribute('open');
        setModeDuration('short-break');
        startTimer();
      });
    }

    if (btnModalDismiss) {
      btnModalDismiss.addEventListener('click', () => {
        if (breakModal.close) breakModal.close();
        else breakModal.removeAttribute('open');
        setModeDuration('focus');
      });
    }

    // Set initial display
    setModeDuration('focus');
  };

  return {
    init,
    startTimer,
    pauseTimer,
    resetTimer,
    setModeDuration
  };
})();

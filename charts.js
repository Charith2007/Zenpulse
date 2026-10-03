/**
 * ZenPulse - Charts and Dashboard Analytics Renderer (charts.js)
 * Programmatically generates responsive SVG 7-day trend charts,
 * interactive hover tooltips, and real-time metric card DOM updates.
 */

const ChartRenderer = (() => {
  const tooltipEl = document.getElementById('chart-tooltip');

  /**
   * Formats raw minutes into a clean "Xh Ym" or "Ym" string
   */
  const formatMins = (mins) => {
    if (mins <= 0) return '0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  };

  /**
   * Formats a short day name (e.g., "Mon", "Today")
   */
  const getDayLabel = (date, isToday) => {
    if (isToday) return 'Today';
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  };

  /**
   * Aggregates session durations by day for the past 7 days
   */
  const get7DayData = (sessions) => {
    const days = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);

      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

      const daySessions = sessions.filter((s) => {
        const sDate = new Date(s.timestamp);
        return sDate >= dayStart && sDate <= dayEnd;
      });

      const focusMins = daySessions
        .filter((s) => s.type === 'focus')
        .reduce((sum, s) => sum + s.duration, 0);

      const breakMins = daySessions
        .filter((s) => s.type === 'break')
        .reduce((sum, s) => sum + s.duration, 0);

      days.push({
        date: d,
        label: getDayLabel(d, i === 0),
        isToday: i === 0,
        focusMins,
        breakMins,
        totalSessions: daySessions.length
      });
    }

    return days;
  };

  /**
   * Renders the 7-day SVG chart with bars, gridlines, labels, and hover tooltips
   */
  const render7DayChart = (sessions) => {
    const svg = document.getElementById('trend-svg');
    if (!svg) return;

    const data = get7DayData(sessions);
    const width = 420;
    const height = 180;
    const paddingLeft = 46;
    const paddingRight = 16;
    const paddingTop = 20;
    const paddingBottom = 30;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Determine max value for vertical scaling (minimum 180m / 3h ceiling)
    const maxVal = Math.max(
      180,
      ...data.map((d) => Math.max(d.focusMins, d.breakMins * 3))
    );

    // Clear existing children
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    const svgNS = 'http://www.w3.org/2000/svg';

    // 1. Draw horizontal gridlines and axis numbers (0h, 2h, 4h, etc.)
    const gridSteps = 3;
    for (let i = 0; i <= gridSteps; i++) {
      const stepVal = Math.round((maxVal / gridSteps) * i);
      const yPos = paddingTop + chartHeight - (stepVal / maxVal) * chartHeight;

      // Grid line
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', paddingLeft);
      line.setAttribute('y1', yPos);
      line.setAttribute('x2', width - paddingRight);
      line.setAttribute('y2', yPos);
      line.setAttribute('stroke', 'currentColor');
      line.setAttribute('stroke-opacity', '0.12');
      line.setAttribute('stroke-width', '1');
      if (i > 0) {
        line.setAttribute('stroke-dasharray', '3 3');
      }
      svg.appendChild(line);

      // Y-axis label
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', paddingLeft - 6);
      text.setAttribute('y', yPos + 3);
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('font-size', '9');
      text.setAttribute('fill', 'currentColor');
      text.setAttribute('opacity', '0.5');
      text.textContent = formatMins(stepVal);
      svg.appendChild(text);
    }

    // 2. Draw daily bars
    const colWidth = chartWidth / data.length;
    const barWidth = Math.max(8, colWidth * 0.28);
    const gap = 3;

    data.forEach((day, index) => {
      const colCenterX = paddingLeft + index * colWidth + colWidth / 2;

      // Heights calculated from proportion
      const focusH = Math.max(3, (day.focusMins / maxVal) * chartHeight);
      const breakH = Math.max(2, (day.breakMins / maxVal) * chartHeight);

      const focusY = paddingTop + chartHeight - focusH;
      const breakY = paddingTop + chartHeight - breakH;

      // Group element for interaction
      const group = document.createElementNS(svgNS, 'g');
      group.classList.add('chart-bar-group');
      group.style.cursor = 'pointer';

      // Focus Bar (Indigo)
      const rectFocus = document.createElementNS(svgNS, 'rect');
      rectFocus.setAttribute('x', colCenterX - barWidth - gap / 2);
      rectFocus.setAttribute('y', focusY);
      rectFocus.setAttribute('width', barWidth);
      rectFocus.setAttribute('height', focusH);
      rectFocus.setAttribute('rx', '3');
      rectFocus.setAttribute('fill', '#6366f1');
      group.appendChild(rectFocus);

      // Break Bar (Emerald)
      const rectBreak = document.createElementNS(svgNS, 'rect');
      rectBreak.setAttribute('x', colCenterX + gap / 2);
      rectBreak.setAttribute('y', breakY);
      rectBreak.setAttribute('width', barWidth);
      rectBreak.setAttribute('height', breakH);
      rectBreak.setAttribute('rx', '3');
      rectBreak.setAttribute('fill', '#10b981');
      group.appendChild(rectBreak);

      // X-Axis Day Label
      const dayText = document.createElementNS(svgNS, 'text');
      dayText.setAttribute('x', colCenterX);
      dayText.setAttribute('y', height - 10);
      dayText.setAttribute('text-anchor', 'middle');
      dayText.setAttribute('font-size', '10');
      dayText.setAttribute('font-weight', day.isToday ? '700' : '500');
      dayText.setAttribute('fill', day.isToday ? '#6366f1' : 'currentColor');
      dayText.setAttribute('opacity', day.isToday ? '1' : '0.7');
      dayText.textContent = day.label;
      group.appendChild(dayText);

      // Interactive Tooltip Events
      group.addEventListener('mouseenter', (e) => {
        showTooltip(e, day);
        rectFocus.setAttribute('opacity', '0.85');
        rectBreak.setAttribute('opacity', '0.85');
      });

      group.addEventListener('mousemove', (e) => {
        positionTooltip(e);
      });

      group.addEventListener('mouseleave', () => {
        hideTooltip();
        rectFocus.setAttribute('opacity', '1');
        rectBreak.setAttribute('opacity', '1');
      });

      svg.appendChild(group);
    });
  };

  const showTooltip = (e, day) => {
    if (!tooltipEl) return;
    const dateFormatted = day.date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
    tooltipEl.innerHTML = `
      <strong>${day.label} (${dateFormatted})</strong><br/>
      🎯 Focus: ${formatMins(day.focusMins)}<br/>
      ☕ Break: ${formatMins(day.breakMins)}
    `;
    tooltipEl.style.opacity = '1';
    positionTooltip(e);
  };

  const positionTooltip = (e) => {
    if (!tooltipEl) return;
    const container = document.getElementById('chart-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    tooltipEl.style.left = `${x}px`;
    tooltipEl.style.top = `${y}px`;
  };

  const hideTooltip = () => {
    if (!tooltipEl) return;
    tooltipEl.style.opacity = '0';
  };

  /**
   * Updates all dashboard metric cards and burnout risk indicators in the DOM
   */
  const updateDashboard = (sessions) => {
    const analysis = BurnoutEngine.calculateRisk(sessions);

    // 1. Update Today's Metric Cards
    const todayFocusEl = document.getElementById('metric-today-focus');
    const todayBreaksEl = document.getElementById('metric-today-breaks');
    const ratioEl = document.getElementById('metric-ratio');
    const goalPctEl = document.getElementById('metric-goal-pct');

    if (todayFocusEl) todayFocusEl.textContent = formatMins(analysis.todayFocusMins);
    if (todayBreaksEl) {
      todayBreaksEl.textContent = formatMins(analysis.todayBreakMins);
    }
    if (ratioEl) ratioEl.textContent = analysis.ratioDisplay;
    if (goalPctEl) goalPctEl.textContent = `${analysis.goalPct}%`;

    const fillEl = document.getElementById('progress-fill');
    if (fillEl) fillEl.style.width = `${analysis.goalPct}%`;
    const cta = document.getElementById('empty-cta');
    if (cta) cta.hidden = analysis.todayFocusMins > 0;

    // 2. Update Burnout Status Card & Visual Indicators
    const burnoutScoreEl = document.getElementById('burnout-score');
    const burnoutBadgeEl = document.getElementById('burnout-badge');
    const burnoutFillEl = document.getElementById('burnout-fill');
    const burnoutAdviceEl = document.getElementById('burnout-advice');
    const burnoutMeterPath = document.getElementById('burnout-meter-path');

    if (burnoutScoreEl) burnoutScoreEl.textContent = analysis.score;

    if (burnoutBadgeEl) {
      burnoutBadgeEl.className = `burnout-badge ${analysis.badgeClass}`;
      burnoutBadgeEl.textContent = analysis.status;
    }

    if (burnoutFillEl) {
      burnoutFillEl.className = `burnout-bar-fill ${analysis.fillClass}`;
      burnoutFillEl.style.width = `${analysis.score}%`;
    }

    if (burnoutMeterPath) {
      // Circular gauge percentage stroke-dasharray (score, 100)
      burnoutMeterPath.setAttribute('stroke-dasharray', `${analysis.score}, 100`);
      burnoutMeterPath.className.baseVal = `circle ${analysis.strokeClass}`;
    }

    if (burnoutAdviceEl) {
      burnoutAdviceEl.style.borderLeftColor = `var(--color-${analysis.fillClass.replace('fill-', '')})`;
      burnoutAdviceEl.innerHTML = analysis.advice;
    }

    // 3. Render 7-day SVG trend chart
    render7DayChart(sessions);
  };

  return {
    formatMins,
    updateDashboard,
    render7DayChart
  };
})();

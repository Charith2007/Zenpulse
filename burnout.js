/**
 * ZenPulse - Burnout Risk Heuristic Engine (burnout.js)
 * Implements rule-based intelligence evaluating screen time,
 * focus-to-break ratios, continuous session strain, and multi-day fatigue.
 */

const BurnoutEngine = (() => {
  const DAILY_GOAL_MINS = 240; // 4 Hours standard daily focus goal

  /**
   * Helper: Check if two Date objects fall on the same calendar day
   */
  const isSameDay = (d1, d2) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  /**
   * Evaluates logged sessions and computes a dynamic burnout risk score (0-100)
   * along with actionable digital wellbeing advice.
   *
   * @param {Array} sessions - Array of session objects from DataStore
   * @returns {Object} Calculated metrics and burnout assessment
   */
  const calculateRisk = (sessions = []) => {
    const now = new Date();

    // 1. Filter today's sessions
    const todaySessions = sessions.filter((s) => isSameDay(new Date(s.timestamp), now));

    const todayFocusSessions = todaySessions.filter((s) => s.type === 'focus');
    const todayBreakSessions = todaySessions.filter((s) => s.type === 'break');

    const todayFocusMins = todayFocusSessions.reduce((acc, s) => acc + s.duration, 0);
    const todayBreakMins = todayBreakSessions.reduce((acc, s) => acc + s.duration, 0);
    const todayBreakCount = todayBreakSessions.length;

    // Default base risk score
    let score = 15;
    let adviceList = [];

    if (todayFocusMins === 0) {
      return {
        score: 10,
        status: 'Healthy',
        badgeClass: 'badge-healthy',
        strokeClass: 'stroke-healthy',
        fillClass: 'fill-healthy',
        advice: 'Ready when you are. Start your first focus session today.',
        todayFocusMins: 0,
        todayBreakMins: 0,
        todayBreakCount: 0,
        ratioDisplay: '0 : 1',
        goalPct: 0
      };
    }

    // 2. Volume-based base load
    if (todayFocusMins <= 120) {
      score += 10;
    } else if (todayFocusMins <= 240) {
      score += 25;
    } else if (todayFocusMins <= 360) {
      score += 45;
      adviceList.push('You have exceeded 4 hours of screen study today.');
    } else {
      score += 65;
      adviceList.push('High volume alert: Over 6 hours of focus accumulated today!');
    }

    // 3. Break Adherence & Ratio Rule
    // Ideal ratio: 4 to 5 minutes of focus per 1 minute of break (approx 20% break time)
    const ratioValue = todayBreakMins > 0 ? (todayFocusMins / todayBreakMins).toFixed(1) : todayFocusMins;
    const ratioDisplay = todayBreakMins > 0 ? `${ratioValue} : 1` : `${todayFocusMins}m : 0m`;

    if (todayBreakMins === 0 && todayFocusMins >= 60) {
      score += 30;
      adviceList.push('Zero breaks taken today despite sustained focus work.');
    } else if (todayBreakMins > 0) {
      const ratioNum = todayFocusMins / todayBreakMins;
      if (ratioNum > 8) {
        score += 22;
        adviceList.push(`High focus-to-break ratio (${ratioDisplay}). Try stepping away more frequently.`);
      } else if (ratioNum <= 4.5 && todayBreakCount >= 2) {
        // Healthy break discipline bonus
        score -= 15;
      }
    }

    // 4. Continuous High-Strain Session Check
    const hasOverlongSession = todayFocusSessions.some((s) => s.duration >= 90);
    const hasExtremeSession = todayFocusSessions.some((s) => s.duration >= 130);

    if (hasExtremeSession) {
      score += 25;
      adviceList.push('Detected marathon session of 2+ hours without a pause. Eye fatigue risk is elevated.');
    } else if (hasOverlongSession) {
      score += 15;
      adviceList.push('A focus session reached 90+ minutes. The human brain optimal focus span is 45-50 minutes.');
    }

    // 5. Multi-Day Fatigue Analysis (Past 3 Days)
    let multiDayHeavyDays = 0;
    for (let i = 1; i <= 3; i++) {
      const targetDate = new Date();
      targetDate.setDate(now.getDate() - i);
      const pastDayFocus = sessions
        .filter((s) => s.type === 'focus' && isSameDay(new Date(s.timestamp), targetDate))
        .reduce((acc, s) => acc + s.duration, 0);

      if (pastDayFocus >= 300) {
        // >= 5 hours
        multiDayHeavyDays++;
      }
    }

    if (multiDayHeavyDays >= 2) {
      score += 18;
      adviceList.push(`Multi-day load warning: Heavy study load across ${multiDayHeavyDays} of the past 3 days.`);
    }

    // Clamp score within 5 to 100
    score = Math.max(5, Math.min(100, Math.round(score)));

    // Categorize status tier
    let status = 'Healthy';
    let badgeClass = 'badge-healthy';
    let strokeClass = 'stroke-healthy';
    let fillClass = 'fill-healthy';

    if (score >= 80) {
      status = 'Critical Risk';
      badgeClass = 'badge-critical';
      strokeClass = 'stroke-critical';
      fillClass = 'fill-critical';
    } else if (score >= 55) {
      status = 'Elevated Risk';
      badgeClass = 'badge-elevated';
      strokeClass = 'stroke-elevated';
      fillClass = 'fill-elevated';
    } else if (score >= 32) {
      status = 'Moderate';
      badgeClass = 'badge-moderate';
      strokeClass = 'stroke-moderate';
      fillClass = 'fill-moderate';
    } else {
      status = 'Healthy';
      badgeClass = 'badge-healthy';
      strokeClass = 'stroke-healthy';
      fillClass = 'fill-healthy';
    }

    // Formulate primary wellbeing advice
    let finalAdvice = '';
    if (score >= 80) {
      finalAdvice = '⚠️ High Cognitive Strain: You are nearing digital exhaustion. Please shut down all active study screens and take a 30-minute restorative walk or rest.';
    } else if (score >= 55) {
      finalAdvice = '⚡ Elevated Fatigue: ' + (adviceList.length > 0 ? adviceList[0] : 'Time for a dedicated 15-minute hydration and eye break.');
    } else if (score >= 32) {
      finalAdvice = '💡 Moderate Intensity: Good progress so far. ' + (adviceList.length > 0 ? adviceList[0] : 'Remember to stretch every 45 minutes.');
    } else {
      finalAdvice = '🌿 Optimal Wellbeing: Your focus and rest intervals are remarkably well balanced. Keep up this sustainable study pace!';
    }

    const goalPct = Math.min(100, Math.round((todayFocusMins / DAILY_GOAL_MINS) * 100));

    return {
      score,
      status,
      badgeClass,
      strokeClass,
      fillClass,
      advice: finalAdvice,
      todayFocusMins,
      todayBreakMins,
      todayBreakCount,
      ratioDisplay,
      goalPct
    };
  };

  return {
    calculateRisk,
    DAILY_GOAL_MINS
  };
})();

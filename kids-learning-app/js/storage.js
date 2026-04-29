/* ============================================
   Progress Storage (LocalStorage)
   ============================================ */

const Storage = (() => {
  const KEY = 'xiaoxing_progress';

  function getDefaults() {
    return {
      stars: 0,
      totalStarsEarned: 0,
      literacy: { completedLevels: [], currentLevel: 1 },
      math: { completedProblems: 0, streaks: { count: 0, add: 0, sub: 0, compare: 0 } },
      stories: { read: [] },
      dailyChallenge: { lastDate: null, tasks: {} },
      avatarEmoji: '🧒',
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return getDefaults();
      return { ...getDefaults(), ...JSON.parse(raw) };
    } catch {
      return getDefaults();
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function addStars(n) {
    const d = load();
    d.stars += n;
    d.totalStarsEarned += n;
    save(d);
    return d.stars;
  }

  function getStars() {
    return load().stars;
  }

  function markLiteracyLevel(levelId) {
    const d = load();
    if (!d.literacy.completedLevels.includes(levelId)) {
      d.literacy.completedLevels.push(levelId);
      d.literacy.currentLevel = Math.max(d.literacy.currentLevel, levelId + 1);
    }
    save(d);
  }

  function getLiteracyProgress() {
    return load().literacy;
  }

  function markStoryRead(storyId) {
    const d = load();
    if (!d.stories.read.includes(storyId)) {
      d.stories.read.push(storyId);
    }
    save(d);
  }

  function getStoriesRead() {
    return load().stories.read;
  }

  function getMathProgress() {
    return load().math;
  }

  function incrementMathStreak(cat) {
    const d = load();
    d.math.streaks[cat] = (d.math.streaks[cat] || 0) + 1;
    d.math.completedProblems++;
    save(d);
  }

  function getAvatar() {
    return load().avatarEmoji;
  }

  function setAvatar(emoji) {
    const d = load();
    d.avatarEmoji = emoji;
    save(d);
  }

  function getDailyChallenge() {
    const d = load();
    const today = new Date().toISOString().slice(0, 10);
    if (d.dailyChallenge.lastDate !== today) {
      d.dailyChallenge = { lastDate: today, tasks: {} };
      save(d);
    }
    return d.dailyChallenge;
  }

  function markDailyTask(taskId) {
    const d = load();
    const today = new Date().toISOString().slice(0, 10);
    if (d.dailyChallenge.lastDate !== today) {
      d.dailyChallenge = { lastDate: today, tasks: {} };
    }
    d.dailyChallenge.tasks[taskId] = true;
    save(d);
  }

  return {
    load, save, addStars, getStars,
    markLiteracyLevel, getLiteracyProgress,
    markStoryRead, getStoriesRead,
    getMathProgress, incrementMathStreak,
    getAvatar, setAvatar,
    getDailyChallenge, markDailyTask,
  };
})();

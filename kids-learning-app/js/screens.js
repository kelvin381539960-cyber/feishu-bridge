/* ============================================
   Screen Rendering System
   ============================================ */

const Screens = (() => {
  const app = document.getElementById('app');

  function render(html) {
    app.innerHTML = html;
  }

  function renderHome() {
    const stars = Storage.getStars();
    const avatar = Storage.getAvatar();
    const litProgress = Storage.getLiteracyProgress();
    const litPercent = Math.round((litProgress.completedLevels.length / LITERACY_DATA.levels.length) * 100);
    const storiesRead = Storage.getStoriesRead();
    const storyPercent = Math.round((storiesRead.length / STORY_DATA.length) * 100);
    const mathProgress = Storage.getMathProgress();
    const mathPercent = Math.min(100, Math.round(mathProgress.completedProblems / 20 * 100));

    const daily = Storage.getDailyChallenge();
    const dailyDone = Object.keys(daily.tasks).length;
    const dailyPercent = Math.round(dailyDone / 3 * 100);

    render(`
      <div class="screen home-screen">
        <div class="home-header">
          <div class="home-title">小星学堂</div>
          <div class="home-subtitle">每天学一点，进步看得见</div>
        </div>
        <div class="home-avatar" id="btn-avatar">${avatar}</div>
        <div class="star-counter">
          <span class="star-icon">⭐</span>
          <span id="star-count">${stars}</span>
        </div>
        <div class="modules-grid">
          <div class="module-card" data-module="literacy">
            <span class="card-icon">📖</span>
            <div class="card-title">识字乐园</div>
            <div class="card-desc">学汉字、认拼音</div>
            <div class="card-progress"><div class="bar" style="width:${litPercent}%"></div></div>
          </div>
          <div class="module-card" data-module="math">
            <span class="card-icon">🔢</span>
            <div class="card-title">数学王国</div>
            <div class="card-desc">数数、加减法</div>
            <div class="card-progress"><div class="bar" style="width:${mathPercent}%"></div></div>
          </div>
          <div class="module-card" data-module="story">
            <span class="card-icon">📚</span>
            <div class="card-title">故事屋</div>
            <div class="card-desc">听故事、读绘本</div>
            <div class="card-progress"><div class="bar" style="width:${storyPercent}%"></div></div>
          </div>
          <div class="module-card" data-module="challenge">
            <span class="card-icon">🏆</span>
            <div class="card-title">每日挑战</div>
            <div class="card-desc">今日任务</div>
            <div class="card-progress"><div class="bar" style="width:${dailyPercent}%"></div></div>
          </div>
        </div>
      </div>
    `);

    document.querySelectorAll('.module-card').forEach(card => {
      card.addEventListener('click', () => {
        AudioSystem.playClick();
        const mod = card.dataset.module;
        if (mod === 'literacy') LiteracyModule.showLevelSelect();
        else if (mod === 'math') MathModule.showCategories();
        else if (mod === 'story') StoryModule.showList();
        else if (mod === 'challenge') showDailyChallenge();
      });
    });

    const avatarBtn = document.getElementById('btn-avatar');
    const avatars = ['🧒', '👦', '👧', '🧒🏻', '👦🏻', '👧🏻', '🐱', '🐶', '🐰', '🦊', '🐼', '🦁'];
    avatarBtn.addEventListener('click', () => {
      const cur = Storage.getAvatar();
      const idx = (avatars.indexOf(cur) + 1) % avatars.length;
      Storage.setAvatar(avatars[idx]);
      avatarBtn.textContent = avatars[idx];
      AudioSystem.playClick();
    });
  }

  function topBar(title, backFn = renderHome) {
    return `
      <div class="top-bar">
        <button class="btn-back" id="btn-back">←</button>
        <div class="top-bar-title">${title}</div>
        <div class="top-bar-stars">⭐ <span id="top-stars">${Storage.getStars()}</span></div>
      </div>
    `;
  }

  function bindBack(fn = renderHome) {
    const btn = document.getElementById('btn-back');
    if (btn) btn.addEventListener('click', () => { AudioSystem.playClick(); fn(); });
  }

  function updateTopStars() {
    const el = document.getElementById('top-stars');
    if (el) el.textContent = Storage.getStars();
  }

  function showDailyChallenge() {
    const daily = Storage.getDailyChallenge();
    const today = new Date();
    const dateStr = `${today.getMonth() + 1}月${today.getDate()}日`;

    const tasks = [
      { id: 'lit', icon: '📖', bg: '#FFF5F5', name: '学习2个新汉字', reward: '⭐ × 2', module: 'literacy' },
      { id: 'math', icon: '🔢', bg: '#E8F8F5', name: '完成5道数学题', reward: '⭐ × 2', module: 'math' },
      { id: 'story', icon: '📚', bg: '#F5F3FF', name: '阅读1个故事', reward: '⭐ × 2', module: 'story' },
    ];

    render(`
      <div class="screen challenge-screen">
        ${topBar('每日挑战')}
        <div class="challenge-header">
          <div class="challenge-day">${dateStr}</div>
          <div class="challenge-title-big">今日任务</div>
        </div>
        <div class="challenge-tasks">
          ${tasks.map(t => `
            <div class="challenge-task" data-task="${t.id}" data-module="${t.module}">
              <div class="task-icon" style="background:${t.bg}">${t.icon}</div>
              <div class="task-info">
                <div class="task-name">${t.name}</div>
                <div class="task-reward">${t.reward}</div>
              </div>
              <div class="task-check ${daily.tasks[t.id] ? 'done' : ''}">${daily.tasks[t.id] ? '✓' : ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `);

    bindBack();

    document.querySelectorAll('.challenge-task').forEach(el => {
      el.addEventListener('click', () => {
        AudioSystem.playClick();
        const mod = el.dataset.module;
        if (mod === 'literacy') LiteracyModule.showLevelSelect();
        else if (mod === 'math') MathModule.showCategories();
        else if (mod === 'story') StoryModule.showList();
      });
    });
  }

  function showCompletion(title, subtitle, starsEarned, onBack, onRetry) {
    render(`
      <div class="screen completion-screen">
        <div class="completion-trophy">🏆</div>
        <div class="completion-title">${title}</div>
        <div class="completion-subtitle">${subtitle}</div>
        <div class="completion-stars">${'⭐'.repeat(Math.min(starsEarned, 5))}</div>
        <div style="font-size:18px;color:#E8A317;font-weight:700">+${starsEarned} 颗星星</div>
        <button class="btn-completion btn-primary" id="btn-comp-back">${onRetry ? '再来一次' : '返回'}</button>
        ${onRetry ? '<button class="btn-completion btn-secondary-outline" id="btn-comp-home">返回首页</button>' : ''}
      </div>
    `);

    AudioSystem.playComplete();

    document.getElementById('btn-comp-back').addEventListener('click', () => {
      AudioSystem.playClick();
      if (onRetry) onRetry();
      else if (onBack) onBack();
      else renderHome();
    });

    const homeBtn = document.getElementById('btn-comp-home');
    if (homeBtn) homeBtn.addEventListener('click', () => { AudioSystem.playClick(); renderHome(); });
  }

  return { render, renderHome, topBar, bindBack, updateTopStars, showDailyChallenge, showCompletion };
})();

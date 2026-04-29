/* ============================================
   Literacy Module - Chinese Character Learning
   ============================================ */

const LiteracyModule = (() => {
  let currentLevel = null;
  let currentCharIdx = 0;
  let quizMode = false;

  function showLevelSelect() {
    const progress = Storage.getLiteracyProgress();
    const levels = LITERACY_DATA.levels;

    Screens.render(`
      <div class="screen literacy-screen">
        ${Screens.topBar('识字乐园')}
        <div class="level-selector">
          <div class="practice-title">选择课程</div>
          <div class="level-grid">
            ${levels.map((lv, i) => {
              const completed = progress.completedLevels.includes(lv.id);
              const isCurrent = lv.id === progress.currentLevel;
              const locked = lv.id > progress.currentLevel && !completed;
              return `
                <button class="level-btn ${completed ? 'completed' : ''} ${isCurrent ? 'current' : ''} ${locked ? 'locked' : ''}"
                        data-level="${i}" ${locked ? 'disabled' : ''}>
                  <span>${lv.name}</span>
                  <span class="level-star">${completed ? '⭐⭐⭐' : isCurrent ? '▶️' : '🔒'}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `);

    Screens.bindBack();

    document.querySelectorAll('.level-btn:not(.locked)').forEach(btn => {
      btn.addEventListener('click', () => {
        AudioSystem.playClick();
        currentLevel = parseInt(btn.dataset.level);
        currentCharIdx = 0;
        quizMode = false;
        showChar();
      });
    });
  }

  function showChar() {
    const level = LITERACY_DATA.levels[currentLevel];
    const charData = level.chars[currentCharIdx];

    Screens.render(`
      <div class="screen literacy-screen">
        ${Screens.topBar(`${level.name} (${currentCharIdx + 1}/${level.chars.length})`)}

        <div class="char-display">
          <div class="char-pinyin">${charData.pinyin}</div>
          <div class="char-big" id="char-big">${charData.char}</div>
          <div class="char-meaning">${charData.meaning}</div>
          <div class="char-stroke-hint">${charData.strokes}画 · ${charData.strokeOrder}</div>
        </div>

        <div class="char-nav">
          <button class="btn-char-nav btn-char-prev" id="btn-prev" ${currentCharIdx === 0 ? 'style="opacity:0.3"' : ''}>◀</button>
          <button class="btn-char-nav btn-char-speak" id="btn-speak">🔊</button>
          <button class="btn-char-nav btn-char-next" id="btn-next">▶</button>
        </div>

        <div class="word-examples">
          <div class="word-example-title">组词</div>
          <div class="word-chips">
            ${charData.words.map(w => `<span class="word-chip">${w}</span>`).join('')}
          </div>
        </div>

        <div class="writing-area">
          <div class="practice-title">写一写</div>
          <div class="writing-canvas-wrapper">
            <canvas class="writing-canvas" id="writing-canvas"></canvas>
            <div class="writing-grid"></div>
            <div class="writing-ghost">${charData.char}</div>
          </div>
          <div class="writing-controls">
            <button class="btn-write-action btn-write-clear" id="btn-clear">清除</button>
            <button class="btn-write-action btn-write-check" id="btn-quiz">开始测验</button>
          </div>
        </div>
      </div>
    `);

    Screens.bindBack(showLevelSelect);

    const charBig = document.getElementById('char-big');
    charBig.addEventListener('click', () => speakChar(charData));

    document.getElementById('btn-speak').addEventListener('click', () => speakChar(charData));

    document.getElementById('btn-prev').addEventListener('click', () => {
      if (currentCharIdx > 0) {
        currentCharIdx--;
        AudioSystem.playClick();
        showChar();
      }
    });

    document.getElementById('btn-next').addEventListener('click', () => {
      AudioSystem.playClick();
      if (currentCharIdx < level.chars.length - 1) {
        currentCharIdx++;
        showChar();
      } else {
        showQuiz(0);
      }
    });

    document.getElementById('btn-quiz').addEventListener('click', () => {
      AudioSystem.playClick();
      showQuiz(0);
    });

    document.querySelectorAll('.word-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        AudioSystem.speak(chip.textContent);
      });
    });

    initCanvas();
  }

  function speakChar(charData) {
    AudioSystem.speak(charData.char);
  }

  function initCanvas() {
    const canvas = document.getElementById('writing-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const wrapper = canvas.parentElement;

    function resize() {
      const rect = wrapper.getBoundingClientRect();
      canvas.width = rect.width - 6;
      canvas.height = rect.height - 6;
    }
    resize();

    let drawing = false;

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches ? e.touches[0] : e;
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }

    canvas.addEventListener('pointerdown', e => {
      drawing = true;
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      e.preventDefault();
    });

    canvas.addEventListener('pointermove', e => {
      if (!drawing) return;
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      e.preventDefault();
    });

    canvas.addEventListener('pointerup', () => { drawing = false; });
    canvas.addEventListener('pointerleave', () => { drawing = false; });

    document.getElementById('btn-clear').addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      AudioSystem.playClick();
    });
  }

  function showQuiz(qIdx) {
    const level = LITERACY_DATA.levels[currentLevel];
    if (qIdx >= level.chars.length) {
      finishLevel();
      return;
    }

    const charData = level.chars[qIdx];
    const quiz = charData.quiz;
    const shuffled = quiz.options.map((opt, i) => ({ opt, isCorrect: i === quiz.answer }));

    Screens.render(`
      <div class="screen literacy-screen">
        ${Screens.topBar(`测验 (${qIdx + 1}/${level.chars.length})`)}
        <div class="math-progress-bar">
          ${level.chars.map((_, i) => `<div class="math-dot ${i < qIdx ? 'done' : i === qIdx ? 'active' : ''}"></div>`).join('')}
        </div>
        <div style="padding:30px 20px;text-align:center">
          <div style="font-size:22px;font-weight:700;color:#333;margin-bottom:30px">${quiz.question}</div>
          <div class="practice-options">
            ${shuffled.map((s, i) => `
              <button class="practice-option" data-idx="${i}" data-correct="${s.isCorrect}">${s.opt}</button>
            `).join('')}
          </div>
        </div>
      </div>
    `);

    Screens.bindBack(showLevelSelect);

    let answered = false;
    document.querySelectorAll('.practice-option').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (answered) return;
        answered = true;
        const correct = btn.dataset.correct === 'true';
        if (correct) {
          btn.classList.add('correct');
          AudioSystem.playCorrect();
          await Reward.show('⭐', null, 1, 1200);
          showQuiz(qIdx + 1);
        } else {
          btn.classList.add('wrong');
          AudioSystem.playWrong();
          document.querySelectorAll('.practice-option').forEach(b => {
            if (b.dataset.correct === 'true') b.classList.add('correct');
          });
          setTimeout(() => showQuiz(qIdx + 1), 1500);
        }
      });
    });
  }

  function finishLevel() {
    const level = LITERACY_DATA.levels[currentLevel];
    Storage.markLiteracyLevel(level.id);
    Storage.markDailyTask('lit');
    Screens.showCompletion(
      '课程完成！',
      `你学会了${level.chars.length}个新汉字`,
      3,
      showLevelSelect,
      () => { currentCharIdx = 0; showChar(); }
    );
  }

  return { showLevelSelect };
})();

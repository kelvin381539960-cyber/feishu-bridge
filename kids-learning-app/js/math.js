/* ============================================
   Math Module - Counting, Addition, Subtraction
   ============================================ */

const MathModule = (() => {
  let currentCategory = null;
  let problems = [];
  let currentProblemIdx = 0;
  let score = 0;
  const PROBLEMS_PER_ROUND = 8;

  function showCategories() {
    const progress = Storage.getMathProgress();

    Screens.render(`
      <div class="screen math-screen">
        ${Screens.topBar('数学王国')}
        <div style="text-align:center;padding:10px 20px">
          <div style="font-size:16px;color:#888">已完成 <strong style="color:var(--secondary)">${progress.completedProblems}</strong> 道题</div>
        </div>
        <div class="math-category-grid">
          ${MATH_CATEGORIES.map(cat => `
            <div class="math-cat-card" data-cat="${cat.id}">
              <div class="cat-icon">${cat.icon}</div>
              <div class="cat-title">${cat.title}</div>
              <div class="cat-desc">${cat.desc}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `);

    Screens.bindBack();

    document.querySelectorAll('.math-cat-card').forEach(card => {
      card.addEventListener('click', () => {
        AudioSystem.playClick();
        currentCategory = card.dataset.cat;
        startRound();
      });
    });
  }

  function generateProblems(cat) {
    const arr = [];
    for (let i = 0; i < PROBLEMS_PER_ROUND; i++) {
      arr.push(generateOne(cat));
    }
    return arr;
  }

  function generateOne(cat) {
    switch (cat) {
      case 'count': return genCount();
      case 'add': return genAdd();
      case 'sub': return genSub();
      case 'compare': return genCompare();
      default: return genAdd();
    }
  }

  function genCount() {
    const n = Math.floor(Math.random() * 10) + 1;
    const emoji = EMOJI_ITEMS[Math.floor(Math.random() * EMOJI_ITEMS.length)];
    const visual = Array(n).fill(emoji);
    const choices = generateChoices(n, 1, 15);
    return { type: 'count', visual, equation: `数一数，有几个${emoji}？`, answer: n, choices };
  }

  function genAdd() {
    const a = Math.floor(Math.random() * 8) + 1;
    const b = Math.floor(Math.random() * (10 - a)) + 1;
    const answer = a + b;
    const emoji = EMOJI_ITEMS[Math.floor(Math.random() * EMOJI_ITEMS.length)];
    const visual = [...Array(a).fill(emoji), '➕', ...Array(b).fill(emoji)];
    const choices = generateChoices(answer, Math.max(1, answer - 3), answer + 3);
    return {
      type: 'add', visual,
      equation: `${a} + ${b} = ?`,
      equationParts: { a, op: '+', b, answer },
      answer, choices
    };
  }

  function genSub() {
    const a = Math.floor(Math.random() * 9) + 2;
    const b = Math.floor(Math.random() * a) + 1;
    const answer = a - b;
    const emoji = EMOJI_ITEMS[Math.floor(Math.random() * EMOJI_ITEMS.length)];
    const visual = [...Array(a).fill(emoji)];
    const choices = generateChoices(answer, Math.max(0, answer - 3), answer + 3);
    return {
      type: 'sub', visual,
      equation: `${a} - ${b} = ?`,
      equationParts: { a, op: '-', b, answer },
      answer, choices
    };
  }

  function genCompare() {
    const a = Math.floor(Math.random() * 15) + 1;
    let b;
    do { b = Math.floor(Math.random() * 15) + 1; } while (b === a);
    const emojiA = EMOJI_ITEMS[Math.floor(Math.random() * EMOJI_ITEMS.length)];
    let emojiB;
    do { emojiB = EMOJI_ITEMS[Math.floor(Math.random() * EMOJI_ITEMS.length)]; } while (emojiB === emojiA);
    const answer = a > b ? 0 : 1;
    return {
      type: 'compare',
      visual: [],
      equation: `哪个更多？`,
      compareData: { a, b, emojiA, emojiB },
      answer,
      choices: [`${emojiA} × ${a}`, `${emojiB} × ${b}`]
    };
  }

  function generateChoices(answer, min, max) {
    const choices = new Set([answer]);
    while (choices.size < 4) {
      const v = Math.floor(Math.random() * (max - min + 1)) + min;
      if (v >= 0) choices.add(v);
    }
    return shuffle([...choices]);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function startRound() {
    problems = generateProblems(currentCategory);
    currentProblemIdx = 0;
    score = 0;
    showProblem();
  }

  function showProblem() {
    if (currentProblemIdx >= problems.length) {
      finishRound();
      return;
    }

    const p = problems[currentProblemIdx];

    let visualHtml = '';
    if (p.type === 'compare') {
      const cd = p.compareData;
      visualHtml = `
        <div style="display:flex;justify-content:center;gap:30px;align-items:center;flex-wrap:wrap">
          <div style="text-align:center">
            <div style="font-size:32px;line-height:1.4">${Array(cd.a).fill(cd.emojiA).join('')}</div>
            <div style="font-size:18px;font-weight:700;margin-top:4px">${cd.emojiA} × ${cd.a}</div>
          </div>
          <div style="font-size:28px;font-weight:900;color:#999">VS</div>
          <div style="text-align:center">
            <div style="font-size:32px;line-height:1.4">${Array(cd.b).fill(cd.emojiB).join('')}</div>
            <div style="font-size:18px;font-weight:700;margin-top:4px">${cd.emojiB} × ${cd.b}</div>
          </div>
        </div>
      `;
    } else {
      visualHtml = `
        <div class="math-visual">
          ${p.visual.map((item, i) => `<span class="item" style="animation-delay:${i * 0.05}s">${item}</span>`).join('')}
        </div>
      `;
    }

    let equationHtml = '';
    if (p.equationParts) {
      const ep = p.equationParts;
      equationHtml = `
        <div class="math-equation">
          ${ep.a} <span class="operator">${ep.op}</span> ${ep.b} <span class="operator">=</span> <span class="unknown" id="answer-box">?</span>
        </div>
      `;
    } else {
      equationHtml = `<div class="math-equation" style="font-size:24px">${p.equation}</div>`;
    }

    Screens.render(`
      <div class="screen math-screen">
        ${Screens.topBar(`${MATH_CATEGORIES.find(c => c.id === currentCategory).title}`)}
        <div class="math-progress-bar">
          ${problems.map((_, i) => `<div class="math-dot ${i < currentProblemIdx ? 'done' : i === currentProblemIdx ? 'active' : ''}"></div>`).join('')}
        </div>
        <div class="math-problem">
          ${visualHtml}
          ${equationHtml}
        </div>
        <div class="math-choices">
          ${p.choices.map((c, i) => `
            <button class="math-choice" data-idx="${i}" data-value="${p.type === 'compare' ? i : c}">${c}</button>
          `).join('')}
        </div>
      </div>
    `);

    Screens.bindBack(showCategories);

    let answered = false;
    document.querySelectorAll('.math-choice').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (answered) return;
        answered = true;

        const val = p.type === 'compare' ? parseInt(btn.dataset.idx) : parseInt(btn.dataset.value);
        const correct = val === p.answer;

        if (correct) {
          btn.classList.add('correct');
          const answerBox = document.getElementById('answer-box');
          if (answerBox) {
            answerBox.textContent = p.answer;
            answerBox.classList.add('filled');
          }
          score++;
          Storage.incrementMathStreak(currentCategory);
          AudioSystem.playCorrect();
          await new Promise(r => setTimeout(r, 800));
        } else {
          btn.classList.add('wrong');
          AudioSystem.playWrong();
          document.querySelectorAll('.math-choice').forEach(b => {
            const bVal = p.type === 'compare' ? parseInt(b.dataset.idx) : parseInt(b.dataset.value);
            if (bVal === p.answer) b.classList.add('correct');
          });
          await new Promise(r => setTimeout(r, 1500));
        }

        currentProblemIdx++;
        showProblem();
      });
    });
  }

  function finishRound() {
    const starsEarned = Math.max(1, Math.round(score / problems.length * 3));
    Storage.addStars(starsEarned);
    if (score >= 5) Storage.markDailyTask('math');

    const catInfo = MATH_CATEGORIES.find(c => c.id === currentCategory);
    Screens.showCompletion(
      `${catInfo.title}完成！`,
      `答对 ${score}/${problems.length} 题`,
      starsEarned,
      showCategories,
      startRound
    );
  }

  return { showCategories };
})();

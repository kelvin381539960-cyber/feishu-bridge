/* ============================================
   Story Module - Interactive Story Reading
   ============================================ */

const StoryModule = (() => {
  let currentStory = null;
  let currentPage = 0;

  function showList() {
    const readStories = Storage.getStoriesRead();

    Screens.render(`
      <div class="screen story-screen">
        ${Screens.topBar('故事屋')}
        <div class="story-list">
          ${STORY_DATA.map(story => {
            const isRead = readStories.includes(story.id);
            return `
              <div class="story-card" data-id="${story.id}">
                <div class="story-thumb" style="background:${story.bgColor}">${story.icon}</div>
                <div class="story-info">
                  <div class="story-title">${story.title}</div>
                  <div class="story-desc">${story.desc}</div>
                  <span class="story-badge ${isRead ? 'read' : 'new'}">${isRead ? '✓ 已读' : '🆕 新故事'}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `);

    Screens.bindBack();

    document.querySelectorAll('.story-card').forEach(card => {
      card.addEventListener('click', () => {
        AudioSystem.playClick();
        currentStory = STORY_DATA.find(s => s.id === card.dataset.id);
        currentPage = 0;
        showPage();
      });
    });
  }

  function showPage() {
    if (!currentStory) return;

    if (currentPage >= currentStory.pages.length) {
      showStoryQuiz();
      return;
    }

    const page = currentStory.pages[currentPage];
    const isFirst = currentPage === 0;
    const isLast = currentPage === currentStory.pages.length - 1;

    Screens.render(`
      <div class="screen story-screen">
        ${Screens.topBar(currentStory.title)}
        <div class="story-reader">
          <div class="story-page">
            <div class="story-illustration" style="background:${page.bgColor}">
              ${page.illustration}
            </div>
            <div class="story-text">${page.text}</div>
          </div>
          <div style="text-align:center;color:#bbb;font-size:13px;padding:5px">
            ${currentPage + 1} / ${currentStory.pages.length}
          </div>
        </div>
        <div class="story-controls">
          ${!isFirst ? '<button class="btn-story btn-story-prev" id="btn-prev">上一页</button>' : ''}
          <button class="btn-story btn-story-read" id="btn-read">🔊 朗读</button>
          <button class="btn-story btn-story-next" id="btn-next">${isLast ? '小测验 📝' : '下一页'}</button>
        </div>
      </div>
    `);

    Screens.bindBack(showList);

    const prevBtn = document.getElementById('btn-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        AudioSystem.playClick();
        currentPage--;
        showPage();
      });
    }

    document.getElementById('btn-next').addEventListener('click', () => {
      AudioSystem.playClick();
      currentPage++;
      showPage();
    });

    document.getElementById('btn-read').addEventListener('click', () => {
      const plainText = page.text.replace(/<[^>]*>/g, '');
      AudioSystem.speak(plainText);
    });

    document.querySelectorAll('.highlight').forEach(el => {
      el.addEventListener('click', () => {
        AudioSystem.speak(el.textContent);
      });
    });

    let touchStartX = 0;
    const reader = document.querySelector('.story-reader');
    if (reader) {
      reader.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; });
      reader.addEventListener('touchend', e => {
        const diff = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(diff) > 80) {
          if (diff < 0 && currentPage < currentStory.pages.length) {
            currentPage++;
            AudioSystem.playClick();
            showPage();
          } else if (diff > 0 && currentPage > 0) {
            currentPage--;
            AudioSystem.playClick();
            showPage();
          }
        }
      });
    }
  }

  function showStoryQuiz() {
    const quiz = currentStory.quiz;

    Screens.render(`
      <div class="screen story-screen">
        ${Screens.topBar(currentStory.title + ' - 小测验')}
        <div class="story-quiz">
          <div style="text-align:center;font-size:60px;margin:20px 0">${currentStory.icon}</div>
          <div class="story-quiz-title">${quiz.question}</div>
          <div class="story-quiz-options">
            ${quiz.options.map((opt, i) => `
              <button class="story-quiz-option" data-idx="${i}">${opt}</button>
            `).join('')}
          </div>
        </div>
      </div>
    `);

    Screens.bindBack(showList);

    let answered = false;
    document.querySelectorAll('.story-quiz-option').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (answered) return;
        answered = true;

        const idx = parseInt(btn.dataset.idx);
        const correct = idx === quiz.answer;

        if (correct) {
          btn.classList.add('correct');
          AudioSystem.playCorrect();
          Storage.markStoryRead(currentStory.id);
          Storage.markDailyTask('story');
          await Reward.show('🎉', '故事完成！', 2, 2000);
          Screens.showCompletion(
            '故事读完啦！',
            `《${currentStory.title}》`,
            2,
            showList
          );
        } else {
          btn.classList.add('wrong');
          AudioSystem.playWrong();
          document.querySelectorAll('.story-quiz-option').forEach(b => {
            if (parseInt(b.dataset.idx) === quiz.answer) b.classList.add('correct');
          });
          setTimeout(() => {
            Storage.markStoryRead(currentStory.id);
            Screens.showCompletion(
              '故事读完啦！',
              `《${currentStory.title}》`,
              1,
              showList
            );
          }, 1500);
        }
      });
    });
  }

  return { showList };
})();

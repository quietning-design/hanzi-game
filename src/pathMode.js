// ============================================================================
// 多邻国式「地图闯关」模式
// 25 个主题关（Unit），每关 4 个「小课」(每课 5 字) + 1 个「关主挑战」(本关 20 字)。
// 按顺序解锁；通过关主挑战即「升级」进入下一关。
// ============================================================================

const LESSON_SIZE = 5;
// 关卡标题自带「第N关：」前缀，界面上已单独显示关号，这里去掉避免重复
const cleanTitle = t => String(t).replace(/^第\s*\d+\s*关\s*[：:]?\s*/, '');
const PATH_OFFSETS = [0, 44, 68, 44, 0, -44, -68, -44]; // 路径左右蜿蜒的位移 (px)

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createPathMode(ctx) {
  const { state, ALL_CHARS, HANZI_LEVELS, HANZI_STAGES } = ctx;

  // -------------------------------------------------------------- 关卡节点表
  const NODES = [];
  HANZI_LEVELS.forEach(level => {
    const lessonCount = Math.ceil(level.characters.length / LESSON_SIZE);
    for (let i = 0; i < lessonCount; i++) {
      NODES.push({
        key: `${level.id}-${i + 1}`,
        type: 'lesson',
        level,
        index: i,
        chars: level.characters.slice(i * LESSON_SIZE, (i + 1) * LESSON_SIZE)
      });
    }
    NODES.push({ key: `${level.id}-B`, type: 'boss', level, index: lessonCount, chars: level.characters });
  });

  function isDone(node) {
    if ((state.lessonStars[node.key] || 0) > 0) return true;
    if (node.type === 'lesson') {
      // 兼容旧存档 / 云端恢复：整课 5 字都已掌握也视为完成
      return node.chars.every(c => state.masteredChars.has(c.char));
    }
    const li = HANZI_LEVELS.findIndex(l => l.id === node.level.id);
    const next = HANZI_LEVELS[li + 1];
    return !!next && next.characters.some(c => state.masteredChars.has(c.char));
  }

  function computeStatuses() {
    let currentIdx = NODES.findIndex(n => !isDone(n));
    if (currentIdx === -1) currentIdx = NODES.length; // 全部通关
    const statuses = NODES.map((n, i) => {
      if (i < currentIdx) return 'done';
      if (i === currentIdx) return 'current';
      return isDone(n) ? 'done' : 'locked';
    });
    return { statuses, currentIdx };
  }

  // -------------------------------------------------------------- 地图视图
  function renderAdventureMap(container) {
    const { statuses, currentIdx } = computeStatuses();
    const total = ALL_CHARS.length;
    const mastered = state.masteredChars.size;
    const percent = Math.round((mastered / total) * 100);
    const currentNode = NODES[currentIdx];
    const curLevel = currentNode ? currentNode.level : HANZI_LEVELS[HANZI_LEVELS.length - 1];
    const curStage = HANZI_STAGES.find(s => s.id === curLevel.stageId);

    let html = `
      <div class="path-wrap">
        <div class="path-summary">
          <div class="path-summary-top">
            <span class="path-summary-level">${curStage ? curStage.icon : '🌳'} 第 ${curLevel.id} 关 · ${cleanTitle(curLevel.title)}</span>
            <span class="path-summary-count">${mastered}/${total} 字</span>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
          <div class="path-summary-badge">${curStage ? curStage.badge : ''}</div>
        </div>
    `;

    let lastLevelId = null;
    let pos = 0;
    NODES.forEach((node, i) => {
      const level = node.level;
      const stage = HANZI_STAGES.find(s => s.id === level.stageId);

      if (level.id !== lastLevelId) {
        lastLevelId = level.id;
        pos = 0;
        const isStageStart = level.id === stage.levelRange[0];
        if (isStageStart) {
          html += `
            <div class="path-stage-divider" style="--c:${stage.color}">
              <span>${stage.icon} ${stage.name}</span>
              <small>${stage.badge}</small>
            </div>`;
        }
        const lvStatusFirst = statuses[i];
        html += `
          <div class="path-unit-banner ${lvStatusFirst === 'locked' ? 'locked' : ''}" style="--c:${stage.color}">
            <div>
              <div class="path-unit-no">第 ${level.id} 关</div>
              <div class="path-unit-title">${level.icon} ${cleanTitle(level.title)}</div>
              <div class="path-unit-sub">${level.subtitle}</div>
            </div>
          </div>`;
      }

      const status = statuses[i];
      const offset = PATH_OFFSETS[pos % PATH_OFFSETS.length];
      pos++;
      const isBoss = node.type === 'boss';
      let icon;
      if (status === 'locked') icon = '🔒';
      else if (isBoss) icon = status === 'done' ? '🏆' : '👑';
      else icon = status === 'done' ? '✔' : '⭐';

      const starCount = Math.min(3, Math.max(1, state.lessonStars[node.key] || 1));
      const starsHtml =
        status === 'done'
          ? `<div class="path-node-stars">${'⭐'.repeat(starCount)}${'☆'.repeat(3 - starCount)}</div>`
          : '';
      const labelText = isBoss ? '关主挑战' : node.chars.map(c => c.char).join('');
      const bubble = status === 'current' ? `<div class="path-start-bubble">开始！</div>` : '';

      html += `
        <div class="path-node-row" style="--offset:${offset}px; --c:${stage.color}">
          <div class="path-node-wrap">
            ${bubble}
            <button class="path-node ${status} ${isBoss ? 'boss' : ''}" data-idx="${i}" aria-label="${labelText}">${icon}</button>
            ${starsHtml}
            <div class="path-node-label">${labelText}</div>
          </div>
        </div>`;
    });

    html += `
        <div class="path-finish ${currentIdx >= NODES.length ? 'reached' : ''}">
          <div style="font-size:64px;">🎓</div>
          <div>${currentIdx >= NODES.length ? '恭喜！你已成为识字小状元！' : '终点：识字小状元'}</div>
        </div>
      </div>`;

    container.innerHTML = html;

    container.querySelectorAll('.path-node').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-idx'));
        if (btn.classList.contains('locked')) {
          ctx.playSoundEffect('boing');
          btn.classList.remove('shake');
          void btn.offsetWidth;
          btn.classList.add('shake');
          showToast('🔒 先通过前面的关卡才能解锁哦！');
          return;
        }
        startLesson(idx);
      });
    });

    // 自动滚动到当前关卡
    const cur = container.querySelector('.path-node.current');
    if (cur) {
      setTimeout(() => cur.scrollIntoView({ block: 'center' }), 30);
    }
  }

  function showToast(text) {
    document.querySelectorAll('.path-toast').forEach(el => el.remove());
    const el = document.createElement('div');
    el.className = 'path-toast';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  // -------------------------------------------------------------- 课程流程
  function startLesson(nodeIdx) {
    const node = NODES[nodeIdx];
    state.lesson = {
      nodeIdx,
      node,
      phase: node.type === 'boss' ? 'quiz' : 'learn',
      learnIdx: 0,
      queue: [],
      total: 0,
      done: 0,
      mistakes: 0,
      locked: false,
      current: null,
      wasDone: isDone(node)
    };
    if (state.lesson.phase === 'quiz') prepareQuiz();
    ctx.switchView('lesson');
  }

  function prepareQuiz() {
    const L = state.lesson;
    const types = ['listen', 'picture', 'word'];
    const queue = [];
    L.node.chars.forEach((c, ci) => {
      const perChar = L.node.type === 'boss' ? 1 : 2;
      for (let k = 0; k < perChar; k++) {
        queue.push({ target: c, type: types[(ci + k) % types.length], failed: false });
      }
    });
    L.queue = shuffle(queue);
    L.total = L.queue.length;
    L.done = 0;
    L.mistakes = 0;
    L.phase = 'quiz';
  }

  function exitLesson() {
    state.lesson = null;
    ctx.switchView('adventure');
  }

  function renderLessonView(container) {
    const L = state.lesson;
    if (!L) {
      ctx.switchView('adventure');
      return;
    }
    if (L.phase === 'learn') renderLearn(container);
    else if (L.phase === 'quiz') renderQuiz(container);
    else if (L.phase === 'result') renderResult(container);
  }

  function topBar(progressPct) {
    return `
      <div class="lesson-top">
        <button class="lesson-close" id="lesson-close" aria-label="退出">✕</button>
        <div class="lesson-progress"><div class="lesson-progress-fill" style="width:${progressPct}%"></div></div>
        <span class="lesson-title-chip">${state.lesson.node.type === 'boss' ? '👑 关主' : '📖 第' + (state.lesson.node.index + 1) + '课'}</span>
      </div>`;
  }

  function bindClose() {
    const btn = document.getElementById('lesson-close');
    if (btn) {
      btn.addEventListener('click', () => {
        if (window.confirm('确定要退出本课吗？本课进度不会保存哦。')) exitLesson();
      });
    }
  }

  // ---------- 学习阶段：逐字认读 ----------
  function renderLearn(container) {
    const L = state.lesson;
    const chars = L.node.chars;
    const c = chars[L.learnIdx];
    const isLast = L.learnIdx === chars.length - 1;
    const pct = Math.round((L.learnIdx / chars.length) * 50); // 学习占进度前半

    container.innerHTML = `
      <div class="lesson-screen">
        ${topBar(pct)}
        <div class="lesson-body learn">
          <div class="learn-hint">先认识这 ${chars.length} 个新朋友 · ${L.learnIdx + 1}/${chars.length}</div>
          <div class="learn-card">
            <button class="learn-pinyin" id="learn-speak">🔊 ${c.pinyin}</button>
            <div class="learn-char-box" id="learn-char"><span>${c.char}</span></div>
            <div class="learn-stroke">✏️ 共 ${c.strokeCount} 画</div>
            <div class="learn-meaning"><span class="learn-emoji">${c.emoji}</span><span>${c.meaning}</span></div>
            <div class="learn-words">${c.words.map(w => `<button class="word-tag" data-speak="${w}">🔊 ${w}</button>`).join('')}</div>
            <button class="learn-sentence" id="learn-sentence">“${c.sentence}” 🔊</button>
          </div>
        </div>
        <div class="lesson-footer">
          <button class="lesson-btn secondary" id="learn-skip">我都会了，直接测试</button>
          <button class="lesson-btn primary" id="learn-next">${isLast ? '开始测试 ➜' : '下一个 ➜'}</button>
        </div>
      </div>`;

    bindClose();
    ctx.speakText(`${c.char}，${c.words[0] || ''}`);
    document.getElementById('learn-speak').addEventListener('click', () => ctx.speakText(`${c.char}，${c.pinyin}`));
    document.getElementById('learn-char').addEventListener('click', () => ctx.speakText(`${c.char}，${c.words.join('，')}`));
    document.getElementById('learn-sentence').addEventListener('click', () => ctx.speakText(c.sentence));
    container.querySelectorAll('.word-tag').forEach(t =>
      t.addEventListener('click', () => ctx.speakText(t.getAttribute('data-speak')))
    );
    document.getElementById('learn-skip').addEventListener('click', () => {
      prepareQuiz();
      renderLessonView(container);
    });
    document.getElementById('learn-next').addEventListener('click', () => {
      if (isLast) {
        prepareQuiz();
      } else {
        L.learnIdx++;
      }
      renderLessonView(container);
    });
  }

  // ---------- 测试阶段 ----------
  function makeOptions(target, levelChars) {
    const pool = levelChars.length >= 4 ? levelChars : ALL_CHARS;
    const others = shuffle(pool.filter(c => c.char !== target.char)).slice(0, 3);
    let i = 0;
    while (others.length < 3) {
      const extra = ALL_CHARS[i++];
      if (extra.char !== target.char && !others.some(o => o.char === extra.char)) others.push(extra);
    }
    return shuffle([target, ...others]);
  }

  function renderQuiz(container) {
    const L = state.lesson;
    if (L.queue.length === 0) {
      finishLesson(container);
      return;
    }
    const q = L.queue[0];
    L.current = q;
    L.locked = false;
    const t = q.target;
    const options = makeOptions(t, L.node.level.characters);
    q.options = options;

    const fullWord = t.words[0] || t.char;
    const masked = fullWord.includes(t.char) ? fullWord.replace(t.char, '（ ？ ）') : `（ ？ ）${fullWord}`;

    let instruction = '';
    let stimulus = '';
    let speech = '';
    if (q.type === 'listen') {
      instruction = '听一听，选出你听到的字';
      stimulus = `<button class="lq-speaker" id="lq-replay">🔊<span>点我再听一遍</span></button>`;
      speech = `请找出：${t.char}，${fullWord}的${t.char}`;
    } else if (q.type === 'picture') {
      instruction = '看图和意思，选出对应的字';
      stimulus = `<div class="lq-picture" id="lq-replay"><span class="lq-emoji">${t.emoji}</span><span class="lq-meaning">${t.meaning}</span></div>`;
      speech = `${t.meaning}，请找出对应的汉字`;
    } else {
      instruction = '词语填空，括号里是哪个字？';
      stimulus = `<div class="lq-picture" id="lq-replay"><span class="lq-emoji">${t.emoji}</span><span class="lq-word">${masked}</span></div>`;
      speech = `词语填空：${fullWord}，括号里应该填哪个字？`;
    }

    const pct = 50 * (L.node.type === 'boss' ? 0 : 1) + Math.round((L.done / L.total) * (L.node.type === 'boss' ? 100 : 50));

    container.innerHTML = `
      <div class="lesson-screen">
        ${topBar(pct)}
        <div class="lesson-body quiz">
          <div class="lq-instruction">${instruction}</div>
          ${stimulus}
          <div class="lq-options">
            ${options
              .map(
                (o, idx) => `
              <button class="lq-option" data-char="${o.char}" data-idx="${idx}">
                <span class="lq-key">${idx + 1}</span>
                <span class="lq-char">${o.char}</span>
                ${q.type === 'listen' ? '' : `<span class="lq-pinyin">${o.pinyin}</span>`}
              </button>`
              )
              .join('')}
          </div>
        </div>
        <div class="lesson-footer feedback" id="lesson-footer"></div>
      </div>`;

    bindClose();
    ctx.speakText(speech);
    document.getElementById('lq-replay').addEventListener('click', () => ctx.speakText(speech));

    container.querySelectorAll('.lq-option').forEach(btn => {
      btn.addEventListener('click', e => chooseOption(container, btn, e));
    });
  }

  function chooseOption(container, btn, e) {
    const L = state.lesson;
    if (!L || L.locked) return;
    L.locked = true;
    const q = L.current;
    const t = q.target;
    const chosen = btn.getAttribute('data-char');
    const footer = document.getElementById('lesson-footer');
    const correct = chosen === t.char;

    container.querySelectorAll('.lq-option').forEach(o => o.classList.add('disabled'));

    if (correct) {
      btn.classList.add('correct');
      ctx.playSoundEffect('ding');
      if (e && e.clientX !== undefined) ctx.showStarPopup('✔', e.clientX, e.clientY);
      ctx.speakText(`${t.char}，${t.words[0] || ''}`);
      L.queue.shift();
      L.done++;
      footer.className = 'lesson-footer feedback ok';
      footer.innerHTML = `
        <div class="fb-text"><strong>答对啦！</strong><span>${t.char}（${t.pinyin}）— ${t.sentence}</span></div>
        <button class="lesson-btn primary green" id="lesson-continue">继续</button>`;
    } else {
      btn.classList.add('wrong');
      container.querySelectorAll('.lq-option').forEach(o => {
        if (o.getAttribute('data-char') === t.char) o.classList.add('reveal');
      });
      ctx.playSoundEffect('boing');
      L.mistakes++;
      // 答错的题放到队尾稍后再做一次
      L.queue.shift();
      L.queue.push({ target: t, type: q.type, failed: true });
      footer.className = 'lesson-footer feedback bad';
      footer.innerHTML = `
        <div class="fb-text"><strong>正确答案：${t.char}（${t.pinyin}）</strong><span>${t.words.join('、')}</span></div>
        <button class="lesson-btn primary red" id="lesson-continue">继续</button>`;
      ctx.speakText(`正确答案是：${t.char}`);
    }
    const next = document.getElementById('lesson-continue');
    next.addEventListener('click', () => renderLessonView(container));
    next.focus();
  }

  // ---------- 结算 ----------
  function finishLesson(container) {
    const L = state.lesson;
    const node = L.node;
    const isBoss = node.type === 'boss';
    const m = L.mistakes;
    let stars;
    if (isBoss) stars = m <= 2 ? 3 : m <= 5 ? 2 : 1;
    else stars = m === 0 ? 3 : m <= 2 ? 2 : 1;

    const reward = isBoss ? stars * 10 : stars * 3;
    const prevStars = state.lessonStars[node.key] || 0;
    state.lessonStars[node.key] = Math.max(prevStars, stars);
    node.chars.forEach(c => state.masteredChars.add(c.char));
    state.stars += reward;
    ctx.saveProgress();

    L.result = { stars, reward, mistakes: m };
    L.phase = 'result';
    renderLessonView(container);
  }

  function renderResult(container) {
    const L = state.lesson;
    const node = L.node;
    const { stars, reward, mistakes } = L.result;
    const isBoss = node.type === 'boss';
    const li = HANZI_LEVELS.findIndex(l => l.id === node.level.id);
    const nextLevel = HANZI_LEVELS[li + 1];
    const levelUp = isBoss && !L.wasDone;

    ctx.playSoundEffect('fanfare');
    ctx.fireConfetti();
    ctx.speakText(isBoss ? '恭喜你通过关主挑战！' : '本课完成，真棒！');

    container.innerHTML = `
      <div class="lesson-screen">
        <div class="lesson-body result">
          <div class="result-emoji">${isBoss ? '🏆' : '🎉'}</div>
          <h2 class="result-title">${isBoss ? '关主挑战成功！' : '本课完成！'}</h2>
          <div class="result-stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
          <div class="result-stats">
            <div class="result-stat"><span>获得金星</span><strong>+${reward} ⭐</strong></div>
            <div class="result-stat"><span>答错次数</span><strong>${mistakes}</strong></div>
            <div class="result-stat"><span>新掌握</span><strong>${node.chars.length} 字</strong></div>
          </div>
          <div class="result-chars">${node.chars.map(c => `<span>${c.char}</span>`).join('')}</div>
        </div>
        <div class="lesson-footer">
          <button class="lesson-btn secondary" id="result-retry">再练一次</button>
          <button class="lesson-btn primary" id="result-continue">${levelUp && nextLevel ? '🚀 升级！' : '继续闯关 ➜'}</button>
        </div>
      </div>`;

    document.getElementById('result-retry').addEventListener('click', () => startLesson(L.nodeIdx));
    document.getElementById('result-continue').addEventListener('click', () => {
      state.lesson = null;
      ctx.switchView('adventure');
      if (levelUp) showLevelUp(node.level, nextLevel);
    });
  }

  function showLevelUp(level, nextLevel) {
    const stage = HANZI_STAGES.find(s => s.id === level.stageId);
    const nextStage = nextLevel ? HANZI_STAGES.find(s => s.id === nextLevel.stageId) : null;
    const stageUp = nextStage && nextStage.id !== stage.id;
    const overlay = document.createElement('div');
    overlay.className = 'levelup-overlay';
    overlay.innerHTML = `
      <div class="levelup-card">
        <div class="levelup-burst">🚀</div>
        <h2>${nextLevel ? '升级啦！' : '通关啦！'}</h2>
        <p class="levelup-done">你已征服「${cleanTitle(level.title)}」</p>
        ${
          nextLevel
            ? `<p class="levelup-next">下一站：第 ${nextLevel.id} 关 · ${nextLevel.icon} ${cleanTitle(nextLevel.title)}</p>`
            : `<p class="levelup-next">500 字全部闯关成功，你就是识字小状元！</p>`
        }
        ${stageUp ? `<p class="levelup-stage">🎖 晋级称号：${nextStage.badge}</p>` : ''}
        <button class="lesson-btn primary" id="levelup-ok">${nextLevel ? '出发！' : '太棒了！'}</button>
      </div>`;
    document.body.appendChild(overlay);
    ctx.fireConfetti();
    ctx.speakText(nextLevel ? `升级啦！下一站，${cleanTitle(nextLevel.title)}` : '恭喜你全部通关！');
    document.getElementById('levelup-ok').addEventListener('click', () => overlay.remove());
  }

  // 键盘：数字选项 / 回车继续
  window.addEventListener('keydown', e => {
    if (state.currentView !== 'lesson' || !state.lesson) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const L = state.lesson;
    if (L.phase === 'quiz' && !L.locked && ['1', '2', '3', '4'].includes(e.key)) {
      const b = document.querySelector(`.lq-option[data-idx="${Number(e.key) - 1}"]`);
      if (b) b.click();
    } else if (e.key === 'Enter') {
      const next =
        document.getElementById('lesson-continue') ||
        document.getElementById('learn-next') ||
        document.getElementById('result-continue');
      if (next && document.activeElement !== next) next.click();
    }
  });

  return { renderAdventureMap, renderLessonView };
}

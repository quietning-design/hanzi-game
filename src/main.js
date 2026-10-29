import { HANZI_STAGES, HANZI_LEVELS, getAllCharacters } from './hanziData.js';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  isSupabaseConfigured,
  syncProgressToSupabase,
  loadProgressFromSupabase,
  fetchLeaderboardFromSupabase
} from './supabaseClient.js';

// ============================================================================
// 全局状态与本地存档管理 (5大进阶级别 · 25大主题关卡 · 500核心生字)
// ============================================================================
const STORAGE_KEY = 'hanzi_forest_grade1_save_v1';
const ALL_CHARS = getAllCharacters();

const state = {
  currentView: 'adventure', // 'adventure' | 'study' | 'arcade' | 'dictionary' | 'cloud'
  activeStageFilter: 1, // 1 | 2 | 3 | 4 | 5 | 'all'
  activeLevelId: 1,
  studyCharIndex: 0,
  voiceEnabled: true,
  stars: 0,
  masteredChars: new Set(), // 已点亮掌握的汉字集合
  // 游乐场状态
  arcadeMode: 'listen', // 'listen' | 'picture' | 'word' | 'bubble'
  arcadeScope: 'stage-1', // 'all' | 'stage-1'...'stage-5' | 'level-1'...'level-25'
  quizRound: 0,
  quizTotalRounds: 10,
  quizScore: 0,
  quizCombo: 0,
  currentQuestion: null,
  questionLocked: false,
  // 泡泡配对状态
  bubbleCards: [],
  selectedBubbleIndex: null,
  matchedBubbleCount: 0,
  // 字库筛选状态
  dictStatusFilter: 'all', // 'all' | 'mastered' | 'unmastered'
  dictStageFilter: 'all', // 'all' | 1 | 2 | 3 | 4 | 5
  dictSearchQuery: ''
};

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.stars = parsed.stars || 0;
      state.masteredChars = new Set(parsed.masteredChars || []);
    } else {
      state.masteredChars = new Set(['一', '二', '三']);
      state.stars = 5;
    }
  } catch (e) {
    console.warn('读取存档失败:', e);
  }
}

function saveProgress() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        stars: state.stars,
        masteredChars: Array.from(state.masteredChars)
      })
    );
  } catch (e) {
    console.warn('保存存档失败:', e);
  }
  updateHeaderStats();
  // 如果已连接 Supabase，则自动异步备份到云端
  if (isSupabaseConfigured()) {
    syncProgressToSupabase(state.stars, Array.from(state.masteredChars)).catch(err => {
      console.warn('后台同步 Supabase 进度失败:', err);
    });
  }
}

function markCharMastered(charStr, addStars = 1) {
  const isNew = !state.masteredChars.has(charStr);
  state.masteredChars.add(charStr);
  if (addStars > 0) {
    state.stars += addStars;
  }
  saveProgress();
  return isNew;
}

// ============================================================================
// 语音合成朗读 (Web Speech API) 与 Web Audio 音效合成器
// ============================================================================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playSoundEffect(type) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  if (type === 'ding') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.setValueAtTime(880, now + 0.11);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  } else if (type === 'boing') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(220, now + 0.25);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } else if (type === 'fanfare') {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.22, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.5);
    });
  }
}

export function speakText(text, rate = 0.85) {
  if (!state.voiceEnabled) return;
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = rate;
    utter.pitch = 1.1;
    window.speechSynthesis.speak(utter);
  } catch (e) {
    console.warn('语音朗读不可用:', e);
  }
}

// ============================================================================
// 全屏五彩礼花特效 (Confetti)
// ============================================================================
const confettiParticles = [];
let confettiAnimId = null;

export function fireConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF9F43', '#F368E0'];
  for (let i = 0; i < 80; i++) {
    confettiParticles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 300,
      y: canvas.height * 0.45,
      vx: (Math.random() - 0.5) * 18,
      vy: -Math.random() * 16 - 6,
      size: Math.random() * 10 + 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 12,
      alpha: 1
    });
  }

  if (!confettiAnimId) {
    const renderLoop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = confettiParticles.length - 1; i >= 0; i--) {
        const p = confettiParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.45;
        p.rotation += p.vRot;
        p.alpha -= 0.012;

        if (p.alpha <= 0 || p.y > canvas.height + 40) {
          confettiParticles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
        ctx.restore();
      }

      if (confettiParticles.length > 0) {
        confettiAnimId = requestAnimationFrame(renderLoop);
      } else {
        confettiAnimId = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    confettiAnimId = requestAnimationFrame(renderLoop);
  }
}

// ============================================================================
// 顶部状态栏与视图切换
// ============================================================================
let quizAdvanceTimer = null;

function clearQuizTimer() {
  if (quizAdvanceTimer) {
    clearTimeout(quizAdvanceTimer);
    quizAdvanceTimer = null;
  }
}

export function showStarPopup(text = '+2 ⭐', clientX, clientY) {
  const el = document.createElement('div');
  el.className = 'floating-star-pop';
  el.textContent = text;
  const x = clientX || window.innerWidth / 2;
  const y = clientY || window.innerHeight / 2;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 1200);
}

function updateHeaderStats() {
  const starEl = document.getElementById('stat-stars');
  const masteredEl = document.getElementById('stat-mastered');
  const studentBtn = document.getElementById('btn-student-profile');
  if (starEl) starEl.textContent = state.stars;
  if (masteredEl) masteredEl.textContent = `${state.masteredChars.size} / ${ALL_CHARS.length}`;
  if (studentBtn) {
    const cfg = getSupabaseConfig();
    studentBtn.textContent = `🧒 ${cfg.studentNickname || '快乐小学生'}`;
  }

  document.querySelectorAll('.nav-btn').forEach(btn => {
    const view = btn.getAttribute('data-view');
    const isActive =
      view === state.currentView ||
      (view === 'adventure' && state.currentView === 'study');
    btn.classList.toggle('active', isActive);
  });
}

function switchView(viewName, options = {}) {
  clearQuizTimer();
  state.currentView = viewName;
  if (options.levelId !== undefined) {
    state.activeLevelId = options.levelId;
  }
  if (options.studyIndex !== undefined) {
    state.studyCharIndex = options.studyIndex;
  }
  if (options.arcadeMode !== undefined) {
    state.arcadeMode = options.arcadeMode;
  }
  if (options.arcadeScope !== undefined) {
    state.arcadeScope = options.arcadeScope;
  }

  updateHeaderStats();
  const viewport = document.getElementById('app-viewport');
  if (!viewport) return;

  if (viewName === 'adventure') {
    renderAdventureMap(viewport);
  } else if (viewName === 'study') {
    renderStudyRoom(viewport);
  } else if (viewName === 'arcade') {
    renderArcadeHall(viewport);
  } else if (viewName === 'dictionary') {
    renderDictionaryView(viewport);
  } else if (viewName === 'leaderboard') {
    renderLeaderboardView(viewport);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================================
// 视图 1：闯关冒险岛地图 (5大进阶级别 · 25大主题关卡 · 500生字)
// ============================================================================
function renderAdventureMap(container) {
  const totalCount = ALL_CHARS.length;
  const masteredCount = state.masteredChars.size;
  const percent = Math.round((masteredCount / totalCount) * 100);

  // 构建 5 大进阶级别 + 全部关卡 切换栏
  const stageCardsHtml = [
    ...HANZI_STAGES.map(st => {
      const stageChars = ALL_CHARS.filter(c => c.stageId === st.id);
      const stageLearned = stageChars.filter(c => state.masteredChars.has(c.char)).length;
      const isActive = state.activeStageFilter === st.id;
      return `
        <div class="stage-tab-card ${isActive ? 'active' : ''}" data-stage="${st.id}">
          <span class="stage-tab-icon">${st.icon}</span>
          <span class="stage-tab-title">第${st.id}阶：${st.name.split('：')[1]}</span>
          <span class="stage-tab-sub">第${st.levelRange[0]}-${st.levelRange[1]}关 · 已学 ${stageLearned}/${stageChars.length}</span>
        </div>
      `;
    }),
    `
      <div class="stage-tab-card ${state.activeStageFilter === 'all' ? 'active' : ''}" data-stage="all">
        <span class="stage-tab-icon">🗺️</span>
        <span class="stage-tab-title">全部 25 关全景</span>
        <span class="stage-tab-sub">共 ${totalCount} 字 · 总览全岛</span>
      </div>
    `
  ].join('');

  const activeStageObj = HANZI_STAGES.find(s => s.id === state.activeStageFilter);
  const visibleLevels =
    state.activeStageFilter === 'all'
      ? HANZI_LEVELS
      : HANZI_LEVELS.filter(l => l.stageId === state.activeStageFilter);

  const stageBannerHtml = activeStageObj
    ? `
      <div class="stage-summary-banner" style="background: ${activeStageObj.bgGradient}; border-color: ${activeStageObj.color};">
        <div>
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:4px;">
            <span style="font-size:32px;">${activeStageObj.icon}</span>
            <h3 style="font-size:26px; font-weight:900; color:#0F172A;">${activeStageObj.name} (${activeStageObj.badge})</h3>
          </div>
          <p style="font-size:19px; color:#334155; font-weight:700;">${activeStageObj.description}</p>
        </div>
        <button class="btn-3d btn-play" data-action="start-stage-game" data-stage="${activeStageObj.id}">
          🎯 挑战本阶 100 字综合闯关
        </button>
      </div>
    `
    : '';

  let html = `
    <section class="hero-banner">
      <div class="hero-banner-left">
        <h2>🌟 小学一年级 500 字分级识字冒险岛</h2>
        <p>科学分为 <strong>5 大进阶级别、25 大主题关卡（每关 20 字，共 500 字）</strong>，循序渐进成为识字小状元！</p>
      </div>
      <div class="hero-progress-box">
        <div class="hero-progress-label">
          <span>🏆 500 字总掌握进度</span>
          <span>${masteredCount} / ${totalCount} 字 (${percent}%)</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${percent}%"></div>
        </div>
      </div>
    </section>

    <!-- 5大级别切换卡片 -->
    <div class="stages-tabs-bar">
      ${stageCardsHtml}
    </div>

    ${stageBannerHtml}

    <div class="levels-grid">
  `;

  visibleLevels.forEach(level => {
    const learnedInLevel = level.characters.filter(c => state.masteredChars.has(c.char)).length;
    const totalInLevel = level.characters.length;
    const lvPercent = Math.round((learnedInLevel / totalInLevel) * 100);
    const isAllDone = learnedInLevel === totalInLevel;

    const chipsHtml = level.characters
      .map(c => {
        const isMastered = state.masteredChars.has(c.char);
        return `<div class="mini-hanzi-chip ${isMastered ? 'mastered' : ''}" data-char="${c.char}" title="点击点读【${c.char} (${c.pinyin})】">${c.char}</div>`;
      })
      .join('');

    html += `
      <article class="level-card ${isAllDone ? 'all-mastered' : ''}">
        <div>
          <div class="level-card-top">
            <div class="level-icon-badge" style="background: ${level.bgGradient}">
              ${level.icon}
            </div>
            <div class="level-title-group" style="flex:1;">
              <div style="font-size:14px; font-weight:900; color:#EA580C; margin-bottom:2px;">
                ${level.stageName} ${isAllDone ? '· 🏆 已满分通关' : ''}
              </div>
              <h3>${level.title}</h3>
              <span>${level.subtitle} · 已掌握 ${learnedInLevel}/${totalInLevel}</span>
            </div>
          </div>
          <div class="level-mini-bar" title="本关掌握进度 ${lvPercent}%">
            <div class="level-mini-bar-fill" style="width: ${lvPercent}%"></div>
          </div>
          <p style="font-size: 17px; color: #475569; line-height: 1.45;">${level.description}</p>
          <div class="level-char-preview">
            ${chipsHtml}
          </div>
        </div>

        <div class="level-card-actions">
          <button class="btn-3d btn-learn" data-action="start-study" data-level="${level.id}">
            📖 认字学堂
          </button>
          <button class="btn-3d btn-play" data-action="start-level-game" data-level="${level.id}">
            🎯 本关挑战
          </button>
        </div>
      </article>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;

  // 绑定级别切换
  container.querySelectorAll('.stage-tab-card').forEach(tab => {
    tab.addEventListener('click', () => {
      const val = tab.getAttribute('data-stage');
      state.activeStageFilter = val === 'all' ? 'all' : Number(val);
      renderAdventureMap(container);
    });
  });

  // 绑定整阶挑战按钮
  const stageGameBtn = container.querySelector('[data-action="start-stage-game"]');
  if (stageGameBtn) {
    stageGameBtn.addEventListener('click', () => {
      const stId = stageGameBtn.getAttribute('data-stage');
      switchView('arcade', { arcadeScope: `stage-${stId}`, arcadeMode: 'listen' });
    });
  }

  // 绑定学堂与单关挑战
  container.querySelectorAll('[data-action="start-study"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const levelId = Number(btn.getAttribute('data-level'));
      switchView('study', { levelId, studyIndex: 0 });
    });
  });

  container.querySelectorAll('[data-action="start-level-game"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const levelId = Number(btn.getAttribute('data-level'));
      switchView('arcade', { arcadeScope: `level-${levelId}`, arcadeMode: 'listen' });
    });
  });

  container.querySelectorAll('.mini-hanzi-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const charStr = chip.getAttribute('data-char');
      openCharDetailModal(charStr);
    });
  });
}

// ============================================================================
// 视图 2：循序渐进认字学堂 (大田字格 + 语音跟读 + 组词造句)
// ============================================================================
function renderStudyRoom(container) {
  const level = HANZI_LEVELS.find(l => l.id === state.activeLevelId) || HANZI_LEVELS[0];
  const chars = level.characters;
  if (state.studyCharIndex < 0) state.studyCharIndex = 0;
  if (state.studyCharIndex >= chars.length) state.studyCharIndex = chars.length - 1;

  const currentChar = chars[state.studyCharIndex];
  const isMastered = state.masteredChars.has(currentChar.char);

  const dotsHtml = chars
    .map((c, idx) => {
      const activeCls = idx === state.studyCharIndex ? 'active' : '';
      const doneCls = state.masteredChars.has(c.char) ? 'done' : '';
      return `<button class="char-step-dot ${activeCls} ${doneCls}" data-idx="${idx}">${c.char}</button>`;
    })
    .join('');

  const wordsHtml = currentChar.words
    .map(w => `<span class="word-tag" data-speak="${w}">🔊 ${w}</span>`)
    .join('');

  container.innerHTML = `
    <div class="study-room-container">
      <div class="study-top-bar">
        <div>
          <span style="font-size:16px; font-weight:900; color:#EA580C; background:#FFEDD5; padding:4px 12px; border-radius:99px;">
            ${level.stageName} · 第 ${currentChar.globalIndex} / 500 字
          </span>
          <h2 style="margin-top:6px;">${level.icon} ${level.title} · 认字学堂 (${state.studyCharIndex + 1} / ${chars.length})</h2>
        </div>
        <div style="display: flex; gap: 14px;">
          <button class="btn-3d btn-secondary" id="btn-back-map">⬅ 返回级别地图</button>
          <button class="btn-3d btn-play" id="btn-go-level-quiz">🎯 测一测本关20字</button>
        </div>
      </div>

      <div class="study-main-stage">
        <div class="tianzige-showcase">
          <div class="pinyin-box" id="btn-speak-pinyin" title="点击朗读拼音和汉字">
            <span>🔊</span>
            <span>${currentChar.pinyin}</span>
          </div>

          <div class="tianzige-box" id="btn-speak-char" title="点击大声跟读汉字">
            <span class="tianzige-char">${currentChar.char}</span>
          </div>

          <div class="stroke-badge">
            ✏️ 共 ${currentChar.strokeCount} 画 · 点击田字格听发音
          </div>
        </div>

        <div class="study-info-panel">
          <div class="meaning-card" id="btn-speak-meaning" style="cursor: pointer;">
            <div class="meaning-emoji">${currentChar.emoji}</div>
            <div class="meaning-text">
              <h4>💡 趣味字义小百科（点击听讲解）</h4>
              <p>${currentChar.meaning}</p>
            </div>
          </div>

          <div class="words-section">
            <h4>🎈 常用组词（点击词语跟读）：</h4>
            <div class="word-tags">
              ${wordsHtml}
            </div>
          </div>

          <div class="sentence-section">
            <h4>🌟 造句小达人（点击句子朗读）：</h4>
            <div class="sentence-box" id="btn-speak-sentence">
              <span>“${currentChar.sentence}”</span>
              <span style="font-size: 34px;">🔊</span>
            </div>
          </div>
        </div>
      </div>

      <div class="study-bottom-nav">
        <button class="btn-3d btn-secondary" id="btn-prev-char" ${state.studyCharIndex === 0 ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>
          ⬅ 上一个字
        </button>

        <div class="char-dots-bar" style="max-width: 720px; justify-content: center;">
          ${dotsHtml}
        </div>

        <div style="display: flex; gap: 14px;">
          <button class="btn-3d ${isMastered ? 'btn-green' : 'btn-purple'}" id="btn-mark-learned">
            ${isMastered ? '✅ 我已学会 (再读一遍)' : '⭐ 我学会啦！(+2星)'}
          </button>
          <button class="btn-3d btn-learn" id="btn-next-char">
            ${state.studyCharIndex === chars.length - 1 ? '🎯 完成学习去闯关 ➡' : '下一个字 ➡'}
          </button>
        </div>
      </div>
    </div>
  `;

  speakText(`${currentChar.char}，${currentChar.words[0]}的${currentChar.char}`);

  document.getElementById('btn-back-map').addEventListener('click', () => {
    state.activeStageFilter = level.stageId;
    switchView('adventure');
  });
  document.getElementById('btn-go-level-quiz').addEventListener('click', () => {
    switchView('arcade', { arcadeScope: `level-${level.id}`, arcadeMode: 'listen' });
  });

  document.getElementById('btn-speak-pinyin').addEventListener('click', () => {
    speakText(`${currentChar.char}，${currentChar.pinyin}`);
  });
  document.getElementById('btn-speak-char').addEventListener('click', () => {
    speakText(`${currentChar.char}，${currentChar.words[0]}，${currentChar.words[1] || ''}`);
  });
  document.getElementById('btn-speak-meaning').addEventListener('click', () => {
    speakText(`${currentChar.char}的意思是：${currentChar.meaning}`);
  });
  document.getElementById('btn-speak-sentence').addEventListener('click', () => {
    speakText(currentChar.sentence);
  });

  container.querySelectorAll('.word-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      speakText(tag.getAttribute('data-speak'));
    });
  });

  container.querySelectorAll('.char-step-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      state.studyCharIndex = Number(dot.getAttribute('data-idx'));
      renderStudyRoom(container);
    });
  });

  document.getElementById('btn-prev-char').addEventListener('click', () => {
    if (state.studyCharIndex > 0) {
      state.studyCharIndex--;
      renderStudyRoom(container);
    }
  });

  document.getElementById('btn-mark-learned').addEventListener('click', () => {
    const newlyMastered = markCharMastered(currentChar.char, isMastered ? 0 : 2);
    playSoundEffect('ding');
    if (newlyMastered) {
      fireConfetti();
    }
    speakText(`太棒了！你记住“${currentChar.char}”字啦！`);
    renderStudyRoom(container);
  });

  document.getElementById('btn-next-char').addEventListener('click', () => {
    markCharMastered(currentChar.char, isMastered ? 0 : 1);
    if (state.studyCharIndex < chars.length - 1) {
      state.studyCharIndex++;
      renderStudyRoom(container);
    } else {
      playSoundEffect('fanfare');
      fireConfetti();
      switchView('arcade', { arcadeScope: `level-${level.id}`, arcadeMode: 'listen' });
    }
  });
}

// ============================================================================
// 视图 3：游乐场大厅（支持按 5大级别 或 25个关卡 出题）
// ============================================================================
function getPoolCharacters() {
  const scope = state.arcadeScope;
  if (scope === 'all') {
    return ALL_CHARS;
  }
  if (scope.startsWith('stage-')) {
    const stId = Number(scope.replace('stage-', ''));
    const list = ALL_CHARS.filter(c => c.stageId === stId);
    return list.length > 0 ? list : ALL_CHARS;
  }
  if (scope.startsWith('level-')) {
    const lvId = Number(scope.replace('level-', ''));
    const lv = HANZI_LEVELS.find(l => l.id === lvId);
    return lv ? lv.characters : ALL_CHARS;
  }
  return ALL_CHARS;
}

function buildScopeSelectOptions() {
  const parts = [
    `<option value="all" ${state.arcadeScope === 'all' ? 'selected' : ''}>🌟 全字库 500 汉字终极挑战</option>`,
    `<optgroup label="🏆 按 5 大进阶级别挑战 (每阶 100 字)">`,
    ...HANZI_STAGES.map(
      st =>
        `<option value="stage-${st.id}" ${state.arcadeScope === `stage-${st.id}` ? 'selected' : ''}>${st.icon} ${st.name} (100字)</option>`
    ),
    `</optgroup>`,
    `<optgroup label="🗺️ 按 25 个主题关卡挑战 (每关 20 字)">`,
    ...HANZI_LEVELS.map(
      l =>
        `<option value="level-${l.id}" ${state.arcadeScope === `level-${l.id}` ? 'selected' : ''}>${l.icon} ${l.title} (20字)</option>`
    ),
    `</optgroup>`
  ];
  return parts.join('');
}

function renderArcadeHall(container) {
  const scopeOptionsHtml = buildScopeSelectOptions();

  container.innerHTML = `
    <div class="arcade-modes-grid">
      <div class="arcade-mode-card ${state.arcadeMode === 'listen' ? 'selected' : ''}" data-mode="listen">
        <span class="arcade-mode-emoji">🎧</span>
        <h3>听音捉迷藏</h3>
        <p>听清语音读出的汉字和词语，快准狠地找出它！</p>
      </div>

      <div class="arcade-mode-card ${state.arcadeMode === 'picture' ? 'selected' : ''}" data-mode="picture">
        <span class="arcade-mode-emoji">🖼️</span>
        <h3>看图猜汉字</h3>
        <p>看可爱大图标和字义提示，猜猜它是哪个汉字？</p>
      </div>

      <div class="arcade-mode-card ${state.arcadeMode === 'word' ? 'selected' : ''}" data-mode="word">
        <span class="arcade-mode-emoji">🚂</span>
        <h3>词语小火车</h3>
        <p>词语火车少了一节车厢，快选出正确的汉字填进去！</p>
      </div>

      <div class="arcade-mode-card ${state.arcadeMode === 'bubble' ? 'selected' : ''}" data-mode="bubble">
        <span class="arcade-mode-emoji">🫧</span>
        <h3>汉字泡泡消消乐</h3>
        <p>把汉字泡泡和它的拼音/图案泡泡配成一对消掉吧！</p>
      </div>
    </div>

    <div class="game-arena" id="game-arena-box"></div>
  `;

  container.querySelectorAll('.arcade-mode-card').forEach(card => {
    card.addEventListener('click', () => {
      state.arcadeMode = card.getAttribute('data-mode');
      renderArcadeHall(container);
    });
  });

  const arena = document.getElementById('game-arena-box');
  if (state.arcadeMode === 'bubble') {
    startBubbleMatchGame(arena, scopeOptionsHtml);
  } else {
    startQuizGame(arena, scopeOptionsHtml);
  }
}

function startQuizGame(arena, scopeOptionsHtml) {
  state.quizRound = 1;
  state.quizScore = 0;
  state.quizCombo = 0;
  renderNextQuizQuestion(arena, scopeOptionsHtml);
}

  let recentTargets = [];

  function generateQuizQuestion() {
    const pool = getPoolCharacters();
    // 优先抽取本轮尚未考过的汉字
    const available = pool.filter(c => !recentTargets.includes(c.char));
    const sourcePool = available.length > 0 ? available : pool;
    const target = sourcePool[Math.floor(Math.random() * sourcePool.length)];
    recentTargets.push(target.char);
    if (recentTargets.length > 12) recentTargets.shift();

    const distractors = [];
    const candidatePool = pool.length >= 4 ? pool : ALL_CHARS;
    while (distractors.length < 3) {
      const item = candidatePool[Math.floor(Math.random() * candidatePool.length)];
      if (
        item.char !== target.char &&
        !distractors.some(d => d.char === item.char)
      ) {
        distractors.push(item);
      }
    }

    const options = [target, ...distractors].sort(() => Math.random() - 0.5);

    let maskedWord = '';
    let fullWord = target.words[0] || target.char;
    if (fullWord.includes(target.char)) {
      maskedWord = fullWord.replace(target.char, ' ( ？ ) ');
    } else {
      maskedWord = ` ( ？ ) ${fullWord}`;
    }

    return {
      target,
      options,
      fullWord,
      maskedWord
    };
  }

  function renderNextQuizQuestion(arena, scopeOptionsHtml) {
    clearQuizTimer();
    if (state.quizRound > state.quizTotalRounds) {
      renderQuizVictoryScreen(arena, scopeOptionsHtml);
      return;
    }

    state.questionLocked = false;
    const q = generateQuizQuestion();
    state.currentQuestion = q;

    let instructionText = '';
    let stimulusHtml = '';
    let autoSpeakStr = '';

    if (state.arcadeMode === 'listen') {
      instructionText = '👂 请仔细听语音，在下方找出正确的汉字吧！（点击喇叭或按空格键重听）';
      stimulusHtml = `
        <div class="prompt-giant-stimulus" id="btn-replay-prompt">
          <span class="stimulus-speaker-icon">🔊</span>
          <span class="stimulus-big-text">点我听音 (${q.target.pinyin})</span>
        </div>
      `;
      autoSpeakStr = `请找出：${q.target.char}，${q.fullWord}的${q.target.char}`;
    } else if (state.arcadeMode === 'picture') {
      instructionText = '👀 看下面的图案和意思，它是哪一个汉字呢？';
      stimulusHtml = `
        <div class="prompt-giant-stimulus" id="btn-replay-prompt">
          <span style="font-size: 82px;">${q.target.emoji}</span>
          <div style="text-align: left;">
            <div style="font-size: 30px; font-weight: 900; color: #92400E;">${q.target.meaning}</div>
            <div style="font-size: 22px; color: #B45309; margin-top: 6px;">🔊 拼音提示：${q.target.pinyin}</div>
          </div>
        </div>
      `;
      autoSpeakStr = `${q.target.meaning}，请找出对应的汉字`;
    } else {
      instructionText = '🚂 词语小火车开来啦！括号里应该填哪个汉字呢？';
      stimulusHtml = `
        <div class="prompt-giant-stimulus" id="btn-replay-prompt">
          <span style="font-size: 64px;">🚂</span>
          <span class="stimulus-big-text">${q.maskedWord}</span>
          <span style="font-size: 44px;">${q.target.emoji}</span>
        </div>
      `;
      autoSpeakStr = `词语填空：${q.fullWord}，括号里应该填哪个字？`;
    }

    const optionsHtml = q.options
      .map(
        (opt, idx) => `
        <div class="hanzi-option-card" data-char="${opt.char}" data-opt-idx="${idx}">
          <span class="option-key-badge">${idx + 1}</span>
          <span class="option-hanzi-text">${opt.char}</span>
          <span class="option-sub-hint">${state.arcadeMode === 'listen' ? '点我选择' : opt.pinyin}</span>
        </div>
      `
      )
      .join('');

    arena.innerHTML = `
      <div>
        <div class="game-header-bar">
          <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
            <span style="font-size: 21px; font-weight: 900;">📚 闯关级别/范围：</span>
            <select id="arcade-scope-select" style="font-size: 19px; padding: 10px 18px; border-radius: 14px; border: 3px solid #CBD5E1; font-weight: 800; max-width: 420px;">
              ${scopeOptionsHtml}
            </select>
          </div>

          <div class="game-status-pills">
            <span class="game-pill">🚩 第 ${state.quizRound} / ${state.quizTotalRounds} 题</span>
            <span class="game-pill combo">🔥 连对 ${state.quizCombo} 次</span>
          </div>
        </div>

        <div class="question-prompt-box">
          <p class="prompt-instruction">${instructionText}</p>
          ${stimulusHtml}
        </div>

        <div class="options-grid-large">
          ${optionsHtml}
        </div>
      </div>

      <div id="quiz-feedback-area" style="min-height: 68px;"></div>
    `;

    speakText(autoSpeakStr);

    document.getElementById('btn-replay-prompt').addEventListener('click', () => {
      speakText(autoSpeakStr);
    });

    document.getElementById('arcade-scope-select').addEventListener('change', e => {
      state.arcadeScope = e.target.value;
      renderArcadeHall(document.getElementById('app-viewport'));
    });

    arena.querySelectorAll('.hanzi-option-card').forEach(card => {
      card.addEventListener('click', e => {
        if (state.questionLocked) return;
        const chosenChar = card.getAttribute('data-char');
        const feedbackArea = document.getElementById('quiz-feedback-area');

        if (chosenChar === q.target.char) {
          state.questionLocked = true;
          card.classList.add('correct');
          state.quizScore++;
          state.quizCombo++;
          markCharMastered(q.target.char, 2);
          playSoundEffect('ding');
          fireConfetti();
          showStarPopup('+2 ⭐', e.clientX, e.clientY);
          speakText(`太棒啦！${q.target.char}，${q.fullWord}！`);

          feedbackArea.innerHTML = `
            <div class="feedback-banner success">
              <span>🎉 答对啦！【${q.target.char} (${q.target.pinyin})】—— ${q.target.sentence}</span>
              <button class="btn-3d btn-green" id="btn-Manual-Next" style="padding: 8px 18px; font-size: 18px;">下一题 ➡</button>
            </div>
          `;

          const goNext = () => {
            clearQuizTimer();
            state.quizRound++;
            renderNextQuizQuestion(arena, scopeOptionsHtml);
          };

          const manualBtn = document.getElementById('btn-Manual-Next');
          if (manualBtn) {
            manualBtn.addEventListener('click', goNext);
          }

          quizAdvanceTimer = setTimeout(goNext, 1600);
        } else {
          card.classList.add('wrong');
          state.quizCombo = 0;
          playSoundEffect('boing');
          speakText(`这是“${chosenChar}”字哦，再仔细找一找“${q.target.char}”吧！`);

          feedbackArea.innerHTML = `
            <div class="feedback-banner retry">
              💪 刚才点的是【${chosenChar}】，别灰心，再试一次找出【${q.target.pinyin}】吧！
            </div>
          `;
        }
      });
    });
  }

function renderQuizVictoryScreen(arena, scopeOptionsHtml) {
  playSoundEffect('fanfare');
  fireConfetti();
  speakText('恭喜你圆满完成本轮识字大闯关！你真棒！');

  arena.innerHTML = `
    <div style="text-align: center; padding: 48px 20px;">
      <div style="font-size: 96px; margin-bottom: 16px;">🏆</div>
      <h2 style="font-size: 42px; font-weight: 900; color: #1E293B; margin-bottom: 12px;">
        太厉害啦！闯关大成功！
      </h2>
      <p style="font-size: 26px; color: #475569; margin-bottom: 32px;">
        本轮共完成 <strong>${state.quizTotalRounds}</strong> 道题，获得满满的闪亮金星奖励！
      </p>
      <div style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap;">
        <button class="btn-3d btn-play" id="btn-play-again" style="font-size: 24px; padding: 18px 36px;">
          🔄 再玩一局
        </button>
        <button class="btn-3d btn-learn" id="btn-victory-map" style="font-size: 24px; padding: 18px 36px;">
          🗺️ 返回冒险岛地图
        </button>
      </div>
    </div>
  `;

  document.getElementById('btn-play-again').addEventListener('click', () => {
    startQuizGame(arena, scopeOptionsHtml);
  });
  document.getElementById('btn-victory-map').addEventListener('click', () => {
    switchView('adventure');
  });
}

// ----------------------------------------------------------------------------
// 游戏 D：汉字泡泡消消乐
// ----------------------------------------------------------------------------
function startBubbleMatchGame(arena, scopeOptionsHtml) {
  const pool = [...getPoolCharacters()].sort(() => Math.random() - 0.5);
  const picked = pool.slice(0, 6);

  const cards = [];
  picked.forEach(item => {
    cards.push({
      id: `char-${item.char}`,
      matchKey: item.char,
      type: 'hanzi',
      display: item.char,
      charObj: item,
      matched: false
    });
    cards.push({
      id: `clue-${item.char}`,
      matchKey: item.char,
      type: 'clue',
      display: `${item.emoji} ${item.pinyin}`,
      charObj: item,
      matched: false
    });
  });

  state.bubbleCards = cards.sort(() => Math.random() - 0.5);
  state.selectedBubbleIndex = null;
  state.matchedBubbleCount = 0;

  renderBubbleArena(arena, scopeOptionsHtml);
}

function renderBubbleArena(arena, scopeOptionsHtml) {
  const totalPairs = state.bubbleCards.length / 2;
  const allMatched = state.matchedBubbleCount >= totalPairs;

  if (allMatched) {
    playSoundEffect('fanfare');
    fireConfetti();
    speakText('太棒啦！所有汉字泡泡都被你消除啦！');
    arena.innerHTML = `
      <div style="text-align: center; padding: 48px 20px;">
        <div style="font-size: 96px; margin-bottom: 16px;">🫧🎉</div>
        <h2 style="font-size: 42px; font-weight: 900; color: #1E293B; margin-bottom: 12px;">
          泡泡消消乐满分过关！
        </h2>
        <p style="font-size: 26px; color: #475569; margin-bottom: 32px;">
          你成功配对了全部 ${totalPairs} 组汉字和拼音泡泡！
        </p>
        <button class="btn-3d btn-play" id="btn-bubble-again" style="font-size: 24px; padding: 18px 36px;">
          🔄 再来一局新泡泡
        </button>
      </div>
    `;
    document.getElementById('btn-bubble-again').addEventListener('click', () => {
      startBubbleMatchGame(arena, scopeOptionsHtml);
    });
    return;
  }

  const bubblesHtml = state.bubbleCards
    .map((card, idx) => {
      const selectedCls = state.selectedBubbleIndex === idx ? 'selected' : '';
      const matchedCls = card.matched ? 'matched' : '';
      const innerHtml =
        card.type === 'hanzi'
          ? `<span class="bubble-char">${card.display}</span>`
          : `<span class="bubble-clue">${card.display}</span>`;
      return `
        <div class="bubble-card ${selectedCls} ${matchedCls}" data-idx="${idx}">
          ${innerHtml}
        </div>
      `;
    })
    .join('');

  arena.innerHTML = `
    <div>
      <div class="game-header-bar">
        <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
          <span style="font-size: 22px; font-weight: 900;">📚 闯关级别/范围：</span>
          <select id="arcade-scope-select" style="font-size: 20px; padding: 10px 18px; border-radius: 14px; border: 3px solid #CBD5E1; font-weight: 800; max-width: 420px;">
            ${scopeOptionsHtml}
          </select>
        </div>

        <div class="game-status-pills">
          <span class="game-pill">🫧 已消除：${state.matchedBubbleCount} / ${totalPairs} 对</span>
          <button class="btn-3d btn-secondary" id="btn-reset-bubbles" style="padding: 8px 18px; font-size: 18px;">🔄 换一批</button>
        </div>
      </div>

      <p class="prompt-instruction" style="text-align: center;">
        👇 先点一个【大汉字泡泡】，再点它对应的【拼音图案泡泡】，配对成功就能消掉得星哦！
      </p>

      <div class="pair-match-grid">
        ${bubblesHtml}
      </div>
    </div>
  `;

  document.getElementById('arcade-scope-select').addEventListener('change', e => {
    state.arcadeScope = e.target.value;
    renderArcadeHall(document.getElementById('app-viewport'));
  });

  document.getElementById('btn-reset-bubbles').addEventListener('click', () => {
    startBubbleMatchGame(arena, scopeOptionsHtml);
  });

  arena.querySelectorAll('.bubble-card').forEach(el => {
    el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-idx'));
      const clickedCard = state.bubbleCards[idx];
      if (!clickedCard || clickedCard.matched) return;

      speakText(clickedCard.charObj.char);

      if (state.selectedBubbleIndex === null) {
        state.selectedBubbleIndex = idx;
        renderBubbleArena(arena, scopeOptionsHtml);
        return;
      }

      if (state.selectedBubbleIndex === idx) {
        state.selectedBubbleIndex = null;
        renderBubbleArena(arena, scopeOptionsHtml);
        return;
      }

      const firstCard = state.bubbleCards[state.selectedBubbleIndex];
      if (firstCard.matchKey === clickedCard.matchKey && firstCard.type !== clickedCard.type) {
        firstCard.matched = true;
        clickedCard.matched = true;
        state.selectedBubbleIndex = null;
        state.matchedBubbleCount++;
        markCharMastered(clickedCard.matchKey, 2);
        playSoundEffect('ding');
        speakText(`${clickedCard.charObj.char}，${clickedCard.charObj.words[0]}！`);
        renderBubbleArena(arena, scopeOptionsHtml);
      } else {
        playSoundEffect('boing');
        el.classList.add('wrong');
        state.selectedBubbleIndex = null;
        setTimeout(() => {
          renderBubbleArena(arena, scopeOptionsHtml);
        }, 450);
      }
    });
  });
}

// ============================================================================
// 视图 4：汉字宝藏库 (500字全库检索 + 按5大级别筛选 + 按掌握状态筛选)
// ============================================================================
function renderDictionaryView(container) {
  const filteredChars = ALL_CHARS.filter(item => {
    if (state.dictStageFilter !== 'all' && item.stageId !== Number(state.dictStageFilter)) {
      return false;
    }
    if (state.dictStatusFilter === 'mastered' && !state.masteredChars.has(item.char)) return false;
    if (state.dictStatusFilter === 'unmastered' && state.masteredChars.has(item.char)) return false;
    if (state.dictSearchQuery.trim() !== '') {
      const q = state.dictSearchQuery.trim().toLowerCase();
      const matchChar = item.char.includes(q);
      const matchPinyin = item.pinyin.toLowerCase().includes(q);
      const matchWord = item.words.some(w => w.includes(q));
      if (!matchChar && !matchPinyin && !matchWord) return false;
    }
    return true;
  });

  const stageFilterBtns = [
    `<button class="filter-pill-btn ${state.dictStageFilter === 'all' ? 'active' : ''}" data-stage-filter="all">全部级别 (500字)</button>`,
    ...HANZI_STAGES.map(
      st =>
        `<button class="filter-pill-btn ${Number(state.dictStageFilter) === st.id ? 'active' : ''}" data-stage-filter="${st.id}">${st.icon} ${st.shortName}</button>`
    )
  ].join('');

  const cardsHtml = filteredChars
    .map(item => {
      const isMastered = state.masteredChars.has(item.char);
      return `
        <div class="dict-hanzi-card ${isMastered ? 'mastered' : ''}" data-char="${item.char}">
          <span class="dict-master-badge">${isMastered ? '⭐' : `#${item.globalIndex}`}</span>
          <span class="dict-pinyin">${item.pinyin}</span>
          <span class="dict-char">${item.char}</span>
          <span class="dict-emoji-word">${item.emoji} ${item.words[0]}</span>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="dict-toolbar" style="flex-direction: column; align-items: stretch; gap: 16px;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
        <div class="dict-filter-group">
          <button class="filter-pill-btn ${state.dictStatusFilter === 'all' ? 'active' : ''}" data-status-filter="all">
            📚 全部状态 (${ALL_CHARS.length})
          </button>
          <button class="filter-pill-btn ${state.dictStatusFilter === 'mastered' ? 'active' : ''}" data-status-filter="mastered">
            ⭐ 已掌握 (${state.masteredChars.size})
          </button>
          <button class="filter-pill-btn ${state.dictStatusFilter === 'unmastered' ? 'active' : ''}" data-status-filter="unmastered">
            🌱 待学习 (${ALL_CHARS.length - state.masteredChars.size})
          </button>
        </div>

        <input
          type="text"
          id="dict-search-input"
          class="dict-search-input"
          placeholder="🔍 输入汉字、拼音或词语查找..."
          value="${state.dictSearchQuery}"
        />
      </div>

      <div class="dict-filter-group" style="padding-top: 12px; border-top: 2px dashed #E2E8F0;">
        ${stageFilterBtns}
      </div>
    </div>

    <div style="margin-bottom: 16px; font-size: 19px; font-weight: 800; color: #475569;">
      🎯 当前共筛选出 <strong>${filteredChars.length}</strong> 个汉字（点击任意卡片可打开大田字格点读）：
    </div>

    <div class="dict-cards-grid">
      ${cardsHtml || '<p style="font-size: 24px; grid-column: 1/-1; text-align: center; padding: 40px;">没有找到符合条件的汉字哦~</p>'}
    </div>
  `;

  container.querySelectorAll('[data-status-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.dictStatusFilter = btn.getAttribute('data-status-filter');
      renderDictionaryView(container);
    });
  });

  container.querySelectorAll('[data-stage-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-stage-filter');
      state.dictStageFilter = val === 'all' ? 'all' : Number(val);
      renderDictionaryView(container);
    });
  });

  const searchInput = document.getElementById('dict-search-input');
  searchInput.addEventListener('input', e => {
    state.dictSearchQuery = e.target.value;
    renderDictionaryView(container);
    const newInput = document.getElementById('dict-search-input');
    if (newInput) {
      newInput.focus();
      newInput.setSelectionRange(newInput.value.length, newInput.value.length);
    }
  });

  container.querySelectorAll('.dict-hanzi-card').forEach(card => {
    card.addEventListener('click', () => {
      const charStr = card.getAttribute('data-char');
      openCharDetailModal(charStr);
    });
  });
}

// ============================================================================
// 汉字详情大卡片弹窗
// ============================================================================
function openCharDetailModal(charStr) {
  const item = ALL_CHARS.find(c => c.char === charStr);
  if (!item) return;

  const overlay = document.getElementById('char-modal-overlay');
  const body = document.getElementById('modal-body-content');
  const isMastered = state.masteredChars.has(item.char);

  const wordsHtml = item.words
    .map(w => `<span class="word-tag" data-speak="${w}">🔊 ${w}</span>`)
    .join('');

  body.innerHTML = `
    <div style="display: flex; align-items: center; gap: 32px; flex-wrap: wrap;">
      <div class="tianzige-showcase" style="margin: 0 auto;">
        <div class="pinyin-box" id="modal-speak-char">
          <span>🔊</span>
          <span>${item.pinyin}</span>
        </div>
        <div class="tianzige-box" id="modal-speak-box">
          <span class="tianzige-char">${item.char}</span>
        </div>
        <div class="stroke-badge">${item.stageName} · ${item.levelTitle} · 共 ${item.strokeCount} 画</div>
      </div>

      <div style="flex: 1; min-width: 280px; display: flex; flex-direction: column; gap: 18px;">
        <div class="meaning-card">
          <div class="meaning-emoji">${item.emoji}</div>
          <div class="meaning-text">
            <h4>💡 趣味字义（第 ${item.globalIndex} / 500 字）</h4>
            <p>${item.meaning}</p>
          </div>
        </div>

        <div class="words-section">
          <h4>🎈 常用词语（点击发音）：</h4>
          <div class="word-tags">${wordsHtml}</div>
        </div>

        <div class="sentence-box" id="modal-speak-sentence">
          <span>“${item.sentence}”</span>
          <span>🔊</span>
        </div>

        <div style="display: flex; gap: 14px; margin-top: 8px;">
          <button class="btn-3d ${isMastered ? 'btn-green' : 'btn-play'}" id="modal-toggle-master" style="flex: 1;">
            ${isMastered ? '✅ 已收入掌握字库' : '⭐ 点亮掌握这个字 (+1星)'}
          </button>
        </div>
      </div>
    </div>
  `;

  overlay.classList.remove('hidden');
  speakText(`${item.char}，${item.words[0]}的${item.char}。${item.sentence}`);

  document.getElementById('modal-speak-char').addEventListener('click', () => speakText(item.char));
  document.getElementById('modal-speak-box').addEventListener('click', () => speakText(item.char));
  document.getElementById('modal-speak-sentence').addEventListener('click', () => speakText(item.sentence));

  body.querySelectorAll('.word-tag').forEach(tag => {
    tag.addEventListener('click', () => speakText(tag.getAttribute('data-speak')));
  });

  document.getElementById('modal-toggle-master').addEventListener('click', e => {
    if (!state.masteredChars.has(item.char)) {
      markCharMastered(item.char, 1);
      playSoundEffect('ding');
      fireConfetti();
      showStarPopup('+1 ⭐', e.clientX, e.clientY);
    }
    openCharDetailModal(item.char);
    const viewport = document.getElementById('app-viewport');
    if (state.currentView === 'adventure') {
      renderAdventureMap(viewport);
    } else if (state.currentView === 'dictionary') {
      renderDictionaryView(viewport);
    } else if (state.currentView === 'study') {
      renderStudyRoom(viewport);
    }
  });
}

function closeCharDetailModal() {
  const overlay = document.getElementById('char-modal-overlay');
  if (overlay) overlay.classList.add('hidden');
}

// ============================================================================
// 视图 5：学习排行榜与学生姓名档案（云端实时记录学习进度与成绩）
// ============================================================================
function getStudentBadgeByCount(masteredCount) {
  if (masteredCount >= 400) return '👑 识字小状元';
  if (masteredCount >= 300) return '🌟 造句小达人';
  if (masteredCount >= 200) return '🚀 阅读小能手';
  if (masteredCount >= 100) return '🐼 森林探险家';
  return '🌱 识字小萌新';
}

async function renderLeaderboardView(container) {
  const cfg = getSupabaseConfig();
  const currentName = cfg.studentNickname || '快乐小学生';

  container.innerHTML = `
    <div class="student-profile-card">
      <div>
        <h2 style="font-size: 32px; font-weight: 900; color: #92400E; margin-bottom: 8px;">
          🧒 我的学习小档案
        </h2>
        <p style="font-size: 20px; color: #B45309; font-weight: 700;">
          输入你的真实姓名或昵称，系统会自动在云端记录你的认字进度和闯关金星成绩！
        </p>
      </div>

      <div class="student-input-row">
        <input
          type="text"
          id="input-student-name"
          class="student-name-input"
          placeholder="请输入学生姓名..."
          value="${currentName}"
        />
        <button class="btn-3d btn-play" id="btn-save-student-name">
          💾 保存姓名并同步成绩
        </button>
      </div>
    </div>

    <div id="student-sync-msg" style="margin-bottom: 20px;"></div>

    <div class="leaderboard-container">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; padding-bottom: 18px; border-bottom: 3px dashed #E2E8F0;">
        <div>
          <h3 style="font-size: 30px; font-weight: 900; color: #1E293B;">
            🏆 一年级识字风云榜 (全班/全网实时排名)
          </h3>
          <p style="font-size: 18px; color: #64748B; margin-top: 4px;">
            按已掌握汉字数量与闯关金星成绩综合排名
          </p>
        </div>
        <button class="btn-3d btn-learn" id="btn-refresh-leaderboard">
          🔄 刷新最新排行榜
        </button>
      </div>

      <div id="leaderboard-table-body" class="leaderboard-list">
        <div style="text-align: center; padding: 48px; font-size: 22px; color: #64748B; font-weight: 800;">
          ⏳ 正在从云端加载同学们的学习成绩排行榜...
        </div>
      </div>
    </div>
  `;

  const msgBox = document.getElementById('student-sync-msg');
  const showMsg = (text, type = 'ok') => {
    if (!msgBox) return;
    msgBox.innerHTML = `<div class="cloud-log-banner ${type}">${text}</div>`;
  };

  const loadAndRenderList = async () => {
    const listBox = document.getElementById('leaderboard-table-body');
    if (!listBox) return;
    try {
      // 先将当前学生的最新成绩同步上去
      await syncProgressToSupabase(state.stars, Array.from(state.masteredChars));
      const rows = await fetchLeaderboardFromSupabase();
      const myName = getSupabaseConfig().studentNickname;

      if (!rows || rows.length === 0) {
        listBox.innerHTML = `
          <div style="text-align: center; padding: 48px; font-size: 22px; color: #64748B;">
            🌟 暂时还没有排行记录，快点击上方“保存姓名并同步成绩”成为第一名吧！
          </div>
        `;
        return;
      }

      listBox.innerHTML = rows
        .map((item, idx) => {
          const rank = idx + 1;
          let rankDisplay = `第 ${rank} 名`;
          let topClass = '';
          if (rank === 1) {
            rankDisplay = '🥇 冠军';
            topClass = 'top-1';
          } else if (rank === 2) {
            rankDisplay = '🥈 亚军';
            topClass = 'top-2';
          } else if (rank === 3) {
            rankDisplay = '🥉 季军';
            topClass = 'top-3';
          }

          const isMe = item.studentNickname === myName;
          const badge = getStudentBadgeByCount(item.masteredCount);
          const percent = Math.round((item.masteredCount / ALL_CHARS.length) * 100);

          return `
            <div class="leaderboard-row ${topClass} ${isMe ? 'is-me' : ''}">
              <div class="rank-badge">${rankDisplay}</div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 26px;">🧒</span>
                <span>${item.studentNickname} ${isMe ? '<strong style="color:#2563EB;">(我)</strong>' : ''}</span>
              </div>
              <div style="color: #15803D;">
                🎓 识字 <strong>${item.masteredCount}</strong> / 500 (${percent}%)
              </div>
              <div style="color: #D97706;">
                ⭐ 金星 <strong>${item.stars}</strong> 颗
              </div>
              <div class="leaderboard-hide-mobile">
                <span class="student-title-tag">${badge}</span>
              </div>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      listBox.innerHTML = `
        <div class="cloud-log-banner err">
          ⚠️ 排行榜加载失败：${err.message}
        </div>
      `;
    }
  };

  document.getElementById('btn-refresh-leaderboard').addEventListener('click', () => {
    playSoundEffect('ding');
    loadAndRenderList();
  });

  const saveNameHandler = async () => {
    const rawName = document.getElementById('input-student-name').value.trim();
    if (!rawName) {
      playSoundEffect('boing');
      showMsg('⚠️ 请先输入你的名字或昵称哦！', 'err');
      return;
    }

    const oldName = getSupabaseConfig().studentNickname;
    const currentCfg = getSupabaseConfig();
    saveSupabaseConfig({
      url: currentCfg.url,
      anonKey: currentCfg.anonKey,
      studentNickname: rawName
    });
    updateHeaderStats();

    showMsg(`⏳ 正在为【${rawName}】同步云端学习记录...`, 'info');
    try {
      const existingRecord = await loadProgressFromSupabase(rawName);
      if (existingRecord && rawName !== oldName) {
        state.stars = existingRecord.stars;
        state.masteredChars = new Set(existingRecord.masteredChars);
        saveProgress();
        playSoundEffect('fanfare');
        fireConfetti();
        showMsg(
          `🎉 欢迎回来，【${rawName}】！已为你恢复云端学习进度：掌握 <strong>${state.masteredChars.size}</strong> 字，累计 <strong>${state.stars}</strong> 颗金星！`,
          'ok'
        );
      } else {
        await syncProgressToSupabase(state.stars, Array.from(state.masteredChars));
        playSoundEffect('fanfare');
        fireConfetti();
        showMsg(
          `🎉 保存成功！【${rawName}】的最新成绩（掌握 <strong>${state.masteredChars.size}</strong> 字，<strong>${state.stars}</strong> 颗金星）已记录到云端排行榜！`,
          'ok'
        );
      }
      await loadAndRenderList();
    } catch (err) {
      playSoundEffect('boing');
      showMsg(`❌ 云端同步失败：${err.message}`, 'err');
    }
  };

  document.getElementById('btn-save-student-name').addEventListener('click', saveNameHandler);
  document.getElementById('input-student-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveNameHandler();
    }
  });

  await loadAndRenderList();
}

// ============================================================================
// 应用初始化入口
// ============================================================================
async function initApp() {
  loadProgress();
  updateHeaderStats();

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.getAttribute('data-view');
      switchView(targetView);
    });
  });

  document.getElementById('btn-go-home').addEventListener('click', () => {
    switchView('adventure');
  });

  const studentProfileBtn = document.getElementById('btn-student-profile');
  if (studentProfileBtn) {
    studentProfileBtn.addEventListener('click', () => {
      switchView('leaderboard');
    });
  }

  const voiceBtn = document.getElementById('btn-toggle-voice');
  voiceBtn.addEventListener('click', () => {
    state.voiceEnabled = !state.voiceEnabled;
    voiceBtn.classList.toggle('active', state.voiceEnabled);
    voiceBtn.textContent = state.voiceEnabled ? '🔊 语音开启' : '🔇 语音静音';
    if (state.voiceEnabled) {
      speakText('语音朗读已开启');
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  });

  document.getElementById('btn-close-modal').addEventListener('click', closeCharDetailModal);
  document.getElementById('char-modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'char-modal-overlay') {
      closeCharDetailModal();
    }
  });

  // 全局键盘快捷键支持（方便课堂一体机与电脑键盘操作）
  window.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    const modalOverlay = document.getElementById('char-modal-overlay');
    if (modalOverlay && !modalOverlay.classList.contains('hidden')) {
      if (e.key === 'Escape') {
        closeCharDetailModal();
      }
      return;
    }

    if (state.currentView === 'study') {
      if (e.key === 'ArrowLeft') {
        const prevBtn = document.getElementById('btn-prev-char');
        if (prevBtn && !prevBtn.disabled) prevBtn.click();
      } else if (e.key === 'ArrowRight') {
        const nextBtn = document.getElementById('btn-next-char');
        if (nextBtn) nextBtn.click();
      } else if (e.key === ' ') {
        e.preventDefault();
        const speakBtn = document.getElementById('btn-speak-char');
        if (speakBtn) speakBtn.click();
      }
    } else if (state.currentView === 'arcade' && state.arcadeMode !== 'bubble') {
      if (['1', '2', '3', '4'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        const card = document.querySelector(`.hanzi-option-card[data-opt-idx="${idx}"]`);
        if (card) card.click();
      } else if (e.key === ' ') {
        e.preventDefault();
        const replayBtn = document.getElementById('btn-replay-prompt');
        if (replayBtn) replayBtn.click();
      }
    }
  });

  switchView('adventure');

  // 启动时自动从云端拉取最新学习进度合并并上报
  if (isSupabaseConfigured()) {
    try {
      const cloudRecord = await loadProgressFromSupabase();
      if (cloudRecord && cloudRecord.masteredChars.length >= state.masteredChars.size) {
        state.stars = Math.max(state.stars, cloudRecord.stars);
        cloudRecord.masteredChars.forEach(c => state.masteredChars.add(c));
        updateHeaderStats();
        if (state.currentView === 'adventure') {
          renderAdventureMap(document.getElementById('app-viewport'));
        }
      } else {
        await syncProgressToSupabase(state.stars, Array.from(state.masteredChars));
      }
    } catch (e) {
      console.warn('启动时拉取云端存档跳过:', e);
    }
  }
}

window.addEventListener('DOMContentLoaded', initApp);

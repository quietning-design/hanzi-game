// ============================================================================
// Supabase 云端数据库客户端（零依赖原生 REST 封装，支持 GitHub Pages 直接静态托管）
// 功能：
// 1. 支持通过环境变量 (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) 或页面内可视化配置连接
// 2. 一键将全部 500 个分级汉字库推送上云 (hanzi_characters 表)
// 3. 从 Supabase 云端拉取最新汉字库数据
// 4. 按小朋友昵称/学号实时同步与备份学习进度、金星与已掌握汉字 (hanzi_user_progress 表)
// ============================================================================

const CONFIG_STORAGE_KEY = 'hanzi_forest_supabase_config_v1';

// 内置您的 Supabase 项目地址与 Publishable Anon Key（打开网页即自动连接）
const DEFAULT_SUPABASE_URL = 'https://yzbirocaqtzerzbwflew.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_gZFAWpuiHbrXrvkPnAHKeA_vN6qxRea';

// 默认优先读取 Vite 环境变量，若无则使用内置默认配置
const ENV_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) || DEFAULT_SUPABASE_URL;
const ENV_KEY = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || DEFAULT_SUPABASE_KEY;

export function getSupabaseConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        url: (parsed.url || ENV_URL || '').trim().replace(/\/+$/, ''),
        anonKey: (parsed.anonKey || ENV_KEY || '').trim(),
        studentNickname: (parsed.studentNickname || '快乐小学生').trim()
      };
    }
  } catch (e) {
    console.warn('读取 Supabase 配置失败:', e);
  }
  return {
    url: ENV_URL.trim().replace(/\/+$/, ''),
    anonKey: ENV_KEY.trim(),
    studentNickname: '快乐小学生'
  };
}

export function saveSupabaseConfig({ url, anonKey, studentNickname }) {
  const clean = {
    url: (url || '').trim().replace(/\/+$/, ''),
    anonKey: (anonKey || '').trim(),
    studentNickname: (studentNickname || '快乐小学生').trim()
  };
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

export function isSupabaseConfigured() {
  const cfg = getSupabaseConfig();
  return Boolean(cfg.url && cfg.url.startsWith('http') && cfg.anonKey && cfg.anonKey.length > 20);
}

function buildHeaders(anonKey, extra = {}) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

// 1. 测试连接并统计云端字库数量
export async function testSupabaseConnection() {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    throw new Error('请先填写 Supabase Project URL 和 Anon Key');
  }

  const endpoint = `${url}/rest/v1/hanzi_characters?select=global_index&limit=1`;
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: buildHeaders(anonKey, { Prefer: 'count=exact' })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`连接失败 (${res.status}): 请确认已在 Supabase SQL Editor 执行建表脚本。详情: ${errText}`);
  }

  const contentRange = res.headers.get('content-range') || '';
  const totalCount = contentRange.includes('/') ? Number(contentRange.split('/')[1]) || 0 : 0;
  return { ok: true, count: totalCount };
}

// 2. 将本地 500 个分级汉字一键批量上传/更新到 Supabase (Upsert)
export async function seedAllCharactersToSupabase(allCharsList) {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    throw new Error('请先配置 Supabase URL 和 Anon Key');
  }

  const payload = allCharsList.map(item => ({
    global_index: item.globalIndex,
    char: item.char,
    pinyin: item.pinyin,
    emoji: item.emoji,
    stroke_count: item.strokeCount,
    words: item.words,
    meaning: item.meaning,
    sentence: item.sentence,
    level_id: item.levelId,
    level_title: item.levelTitle,
    stage_id: item.stageId,
    stage_name: item.stageName,
    updated_at: new Date().toISOString()
  }));

  const endpoint = `${url}/rest/v1/hanzi_characters?on_conflict=global_index`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: buildHeaders(anonKey, {
      Prefer: 'resolution=merge-duplicates,return=minimal'
    }),
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`上传 500 汉字库失败 (${res.status}): ${errText}`);
  }

  return { uploaded: payload.length };
}

// 3. 从 Supabase 云端拉取 500 汉字库
export async function fetchCharactersFromSupabase() {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;

  const endpoint = `${url}/rest/v1/hanzi_characters?select=*&order=global_index.asc`;
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: buildHeaders(anonKey)
  });

  if (!res.ok) {
    throw new Error(`拉取云端汉字库失败 (${res.status})`);
  }

  const rows = await res.json();
  return rows;
}

// 4. 保存小朋友的学习进度（金星 + 已掌握汉字）到 Supabase 云端
export async function syncProgressToSupabase(stars, masteredCharsArray) {
  if (!isSupabaseConfigured()) return null;
  const { url, anonKey, studentNickname } = getSupabaseConfig();

  const payload = {
    student_nickname: studentNickname || '快乐小学生',
    stars: Number(stars) || 0,
    mastered_chars: masteredCharsArray || [],
    updated_at: new Date().toISOString()
  };

  const endpoint = `${url}/rest/v1/hanzi_user_progress?on_conflict=student_nickname`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: buildHeaders(anonKey, {
      Prefer: 'resolution=merge-duplicates,return=representation'
    }),
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`云端进度保存失败 (${res.status}): ${errText}`);
  }

  return await res.json();
}

// 5. 从 Supabase 云端读取小朋友的学习进度
export async function loadProgressFromSupabase(customNickname) {
  if (!isSupabaseConfigured()) return null;
  const { url, anonKey, studentNickname } = getSupabaseConfig();
  const targetName = (customNickname || studentNickname || '快乐小学生').trim();
  const encodedName = encodeURIComponent(targetName);

  const endpoint = `${url}/rest/v1/hanzi_user_progress?student_nickname=eq.${encodedName}&select=*&limit=1`;
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: buildHeaders(anonKey)
  });

  if (!res.ok) {
    throw new Error(`读取云端进度失败 (${res.status})`);
  }

  const rows = await res.json();
  if (rows && rows.length > 0) {
    return {
      studentNickname: rows[0].student_nickname,
      stars: rows[0].stars || 0,
      masteredChars: Array.isArray(rows[0].mastered_chars) ? rows[0].mastered_chars : [],
      updatedAt: rows[0].updated_at
    };
  }
  return null;
}

// 6. 获取全服学习排行榜 (按已掌握汉字数与金星数排序)
export async function fetchLeaderboardFromSupabase() {
  if (!isSupabaseConfigured()) return [];
  const { url, anonKey } = getSupabaseConfig();

  const endpoint = `${url}/rest/v1/hanzi_user_progress?select=*&order=stars.desc&limit=50`;
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: buildHeaders(anonKey)
  });

  if (!res.ok) {
    throw new Error(`获取排行榜失败 (${res.status})`);
  }

  const rows = await res.json();
  return (rows || [])
    .map(r => ({
      studentNickname: r.student_nickname || '匿名同学',
      stars: Number(r.stars) || 0,
      masteredCount: Array.isArray(r.mastered_chars) ? r.mastered_chars.length : 0,
      masteredChars: Array.isArray(r.mastered_chars) ? r.mastered_chars : [],
      updatedAt: r.updated_at
    }))
    .sort((a, b) => {
      if (b.masteredCount !== a.masteredCount) {
        return b.masteredCount - a.masteredCount;
      }
      return b.stars - a.stars;
    });
}

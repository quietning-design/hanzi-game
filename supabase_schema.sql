-- ============================================================================
-- 《汉字小森林 · 小学一年级500字趣味认字乐园》 Supabase 云端数据库建表脚本
-- 使用方法：打开 Supabase 后台 -> SQL Editor -> New Query -> 粘贴本脚本并点击 Run
-- ============================================================================

-- 1. 创建 500 汉字分级题库表 (hanzi_characters)
CREATE TABLE IF NOT EXISTS public.hanzi_characters (
  global_index INT PRIMARY KEY,           -- 1 ~ 500 全局序号
  char TEXT NOT NULL UNIQUE,              -- 汉字本身（如 "一"）
  pinyin TEXT NOT NULL,                   -- 拼音（如 "yī"）
  emoji TEXT DEFAULT '🀄',                -- 趣味象形/提示图标
  stroke_count INT DEFAULT 4,             -- 笔画数
  words JSONB DEFAULT '[]'::jsonb,        -- 常用组词数组（如 ["一个", "一天", "第一"]）
  meaning TEXT DEFAULT '',                -- 儿童趣味字义讲解
  sentence TEXT DEFAULT '',               -- 温馨例句
  level_id INT NOT NULL,                  -- 所属关卡 (1 ~ 25)
  level_title TEXT NOT NULL,              -- 关卡标题
  stage_id INT NOT NULL,                  -- 所属阶段 (1 ~ 5)
  stage_name TEXT NOT NULL,               -- 阶段名称
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 创建小学生云端学习进度与金星存档表 (hanzi_user_progress)
CREATE TABLE IF NOT EXISTS public.hanzi_user_progress (
  student_nickname TEXT PRIMARY KEY,      -- 小朋友昵称/学号（如 "小明"）
  stars INT DEFAULT 0,                    -- 累计获得的金星数
  mastered_chars JSONB DEFAULT '[]'::jsonb, -- 已掌握的汉字数组（如 ["一","二","三"]）
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 开启行级安全策略 (RLS) 并允许前端使用 Anon Key 读写（方便一年级小朋友免密直接使用昵称同步）
ALTER TABLE public.hanzi_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hanzi_user_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read hanzi_characters" ON public.hanzi_characters;
CREATE POLICY "Allow public read hanzi_characters"
  ON public.hanzi_characters FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow public upsert hanzi_characters" ON public.hanzi_characters;
CREATE POLICY "Allow public upsert hanzi_characters"
  ON public.hanzi_characters FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update hanzi_characters" ON public.hanzi_characters;
CREATE POLICY "Allow public update hanzi_characters"
  ON public.hanzi_characters FOR UPDATE
  USING (true);

DROP POLICY IF EXISTS "Allow public access hanzi_user_progress" ON public.hanzi_user_progress;
CREATE POLICY "Allow public access hanzi_user_progress"
  ON public.hanzi_user_progress FOR ALL
  USING (true)
  WITH CHECK (true);

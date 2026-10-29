// ============================================================================
// 小学一年级 500 汉字分级题库总控中心 (5大进阶级别 · 25大主题关卡 · 500核心生字)
// ============================================================================
import { PACK_1_RAW } from './hanziPack1.js';
import { PACK_2_RAW } from './hanziPack2.js';
import { PACK_3_RAW } from './hanziPack3.js';

// 5大进阶级别定义
export const HANZI_STAGES = [
  {
    id: 1,
    name: "第一阶：初级启蒙段",
    shortName: "初级启蒙 (1-100字)",
    badge: "Lv.1 识字小萌新",
    icon: "🌱",
    color: "#10B981",
    bgGradient: "linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%)",
    levelRange: [1, 5],
    description: "涵盖数字、身体器官、天地气象、方向反义词与温馨家人，共 100 个最基础的象形与指事汉字。"
  },
  {
    id: 2,
    name: "第二阶：基础进阶段",
    shortName: "基础进阶 (101-200字)",
    badge: "Lv.2 森林探险家",
    icon: "🐼",
    color: "#3B82F6",
    bgGradient: "linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)",
    levelRange: [6, 10],
    description: "涵盖动物王国、花草果木、快乐校园、七彩颜色与基础动作，共 100 个高频生活汉字。"
  },
  {
    id: 3,
    name: "第三阶：成长提高段",
    shortName: "成长提高 (201-300字)",
    badge: "Lv.3 阅读小能手",
    icon: "🚀",
    color: "#F59E0B",
    bgGradient: "linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)",
    levelRange: [11, 15],
    description: "涵盖手部动作、四季节令、家居器物、美味厨房与祖国山河交通，共 100 个进阶汉字。"
  },
  {
    id: 4,
    name: "第四阶：优等拓展段",
    shortName: "优等拓展 (301-400字)",
    badge: "Lv.4 造句小达人",
    icon: "🌟",
    color: "#8B5CF6",
    bgGradient: "linear-gradient(135deg, #EDE9FE 0%, #DDD6FE 100%)",
    levelRange: [16, 20],
    description: "涵盖山海探秘、心情品德、礼貌互助、丰富量词与造句虚词，共 100 个看图写话必备汉字。"
  },
  {
    id: 5,
    name: "第五阶：识字小状元段",
    shortName: "识字状元 (401-500字)",
    badge: "Lv.5 识字小状元",
    icon: "👑",
    color: "#EC4899",
    bgGradient: "linear-gradient(135deg, #FCE7F3 0%, #FBCFE8 100%)",
    levelRange: [21, 25],
    description: "涵盖传统节日、太空科技、社会职业、古诗亭台与成语智慧，冲刺 500 字识字小状元巅峰！"
  }
];

function parseRawLevel(rawLevel) {
  const characters = rawLevel.rawChars.map((line, idx) => {
    const parts = line.split('|');
    const char = parts[0] || '';
    const pinyin = parts[1] || '';
    const emoji = parts[2] || '🀄';
    const strokeCount = parseInt(parts[3], 10) || 4;
    const words = (parts[4] || char).split(',');
    const meaning = parts[5] || '';
    const sentence = parts[6] || '';
    return {
      char,
      pinyin,
      emoji,
      strokeCount,
      words,
      meaning,
      sentence,
      globalIndex: (rawLevel.id - 1) * 20 + idx + 1
    };
  });

  return {
    id: rawLevel.id,
    stageId: rawLevel.stageId,
    stageName: rawLevel.stageName,
    title: rawLevel.title,
    subtitle: rawLevel.subtitle,
    icon: rawLevel.icon,
    themeColor: rawLevel.themeColor,
    bgGradient: rawLevel.bgGradient,
    description: rawLevel.description,
    characters
  };
}

// 25个关卡完整数据 (25关 × 20字 = 500字)
export const HANZI_LEVELS = [
  ...PACK_1_RAW,
  ...PACK_2_RAW,
  ...PACK_3_RAW
].map(parseRawLevel);

// 获取全部 500 个汉字的扁平数组（含所属阶段与关卡信息）
export function getAllCharacters() {
  const list = [];
  HANZI_LEVELS.forEach(level => {
    level.characters.forEach(item => {
      list.push({
        ...item,
        levelId: level.id,
        levelTitle: level.title,
        levelColor: level.themeColor,
        stageId: level.stageId,
        stageName: level.stageName
      });
    });
  });
  return list;
}

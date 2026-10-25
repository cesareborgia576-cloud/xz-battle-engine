/* 天元录 · 战斗数值内核（battle-core）
   ─────────────────────────────────────────────────────────────────────────────
   ⚠ 本文件由 `工具/_extract_battle.mjs` 从「脚本/04-核心脚本.js」**原样抽取**生成。
     不要手改这里！改了下次跑抽取就被覆盖。要改请改 04，再重新抽取。

   抽了哪些：43 个纯函数 + 25 个顶层常量
             （0 处 BattleState / DOM / localStorage）。
   为什么是这些：从 32 个数值层入口做「调用即依赖」的传递闭包得来，
     **函数与常量双闭包** —— 只做函数闭包会漏掉 REALM_COEFFS 这类顶层表，
     一 import 就 ReferenceError。
   为什么不含 calcDamage：那 1324 行把「算」和「写战报 / 放特效 / 弹数字」揉在一起，
     抽出去等于把 UI 拖进引擎。数值内核只负责「这一下打多少」，不负责「怎么演」。
   ───────────────────────────────────────────────────────────────────────────── */

/* ══════════ 宿主钩子（全文件唯一非抽取块） ══════════
   `xzSkillAtomsOf` 要读「效果翻译缓存」，卡内由 04 的 `xzTransStore()` 供给
   （它读 window.__XZ_TRANS__ + localStorage）。引擎不带宿主，所以这里给一个
   可替换的空实现：默认空缓存，调用方用 `setTransStore(fn)` 注入自己的。

   卡内行为不受影响 —— 04 里那份 `xzTransStore` 是真身，这个 shim 只在
   独立 import 时才生效。 */
let __xzTransStoreImpl = function () { return { stamp: 0, source: '', byName: {} }; };
function xzTransStore() { return __xzTransStoreImpl(); }
/** 注入翻译缓存来源。fn 应返回 { stamp, source, byName }。 */
function setTransStore(fn) {
  __xzTransStoreImpl = typeof fn === 'function' ? fn : function () { return { stamp: 0, source: '', byName: {} }; };
}

/* ══════════ 常量表（25 个，04 原序） ══════════ */

var TRACK_MAX_DISTANCE = 1000;

var REALM_COEFFS = {
  // —— 新体系（v41 · 十二境 48 档）——
  '引玄初期': 1.00, '引玄中期': 1.04, '引玄后期': 1.08, '引玄巅峰': 1.12, '引玄': 1.08,
  '凝府初期': 1.29, '凝府中期': 1.34, '凝府后期': 1.39, '大凝府': 1.44, '凝府': 1.39,
  '玄枢初期': 1.66, '玄枢中期': 1.72, '玄枢后期': 1.78, '大玄枢': 1.85, '玄枢': 1.78,
  '化域初期': 2.13, '化域中期': 2.21, '化域后期': 2.3, '大化域': 2.38, '化域': 2.3,
  '尊玄初期': 2.74, '尊玄中期': 2.85, '尊玄后期': 2.95, '大尊玄': 3.07, '尊玄': 2.95,
  '穹境初期': 3.53, '穹境中期': 3.66, '穹境后期': 3.8, '穹主': 3.94, '穹境': 3.8,
  '玄罡初期': 4.54, '玄罡中期': 4.71, '玄罡后期': 4.89, '大玄罡': 5.08, '玄罡': 4.89,
  '玄王初期': 5.84, '玄王中期': 6.06, '玄王后期': 6.29, '大玄王': 6.53, '玄王': 6.29,
  '玄皇初期': 7.52, '玄皇中期': 7.81, '玄皇后期': 8.1, '大玄皇': 8.41, '玄皇': 8.1,
  '玄宗初期': 9.68, '玄宗中期': 10.05, '玄宗后期': 10.43, '大玄宗': 10.82, '玄宗': 10.43,
  '玄圣初期': 12.46, '玄圣中期': 12.93, '玄圣后期': 13.42, '大玄圣': 13.92, '玄圣': 13.42,
  '帝境初期': 16.03, '帝境中期': 16.64, '帝境后期': 17.26, '玄帝': 17.92, '帝境': 17.26,
  // —— 旧档兼容（v40 及以前的「修仙」境界名，仅用于老存档不炸）——
  '炼气初期': 1.00, '炼气中期': 1.04, '炼气后期': 1.08, '炼气': 1.08,
  '筑基初期': 1.29, '筑基中期': 1.34, '筑基后期': 1.39, '筑基': 1.39,
  '金丹初期': 1.66, '金丹中期': 1.72, '金丹后期': 1.78, '金丹': 1.78,
  '元婴初期': 2.13, '元婴中期': 2.21, '元婴后期': 2.3, '元婴': 2.3,
  '化神初期': 2.74, '化神中期': 2.85, '化神后期': 2.95, '化神': 2.95,
};

var XZ_LEVEL_COEFF = {
  '引玄': 0.056, '凝府': 0.166, '玄枢': 0.217, '化域': 0.388,
  '尊玄': 0.452, '穹境': 0.709, '玄罡': 0.872, '玄王': 1.201,
  '玄皇': 1.459, '玄宗': 1.818, '玄圣': 2.133, '帝境': 2.487
};

var XZ_LEVEL_SUBSTEP = { '初期': 1.00, '中期': 1.04, '后期': 1.08, '巅峰': 1.12, '圆满': 1.12 };

var REALM_ALIAS = {
  '炼气初期': '引玄初期', '炼气中期': '引玄中期', '炼气后期': '引玄后期', '炼气': '引玄',
  '筑基初期': '凝府初期', '筑基中期': '凝府中期', '筑基后期': '凝府后期', '筑基': '凝府',
  '金丹初期': '玄枢初期', '金丹中期': '玄枢中期', '金丹后期': '玄枢后期', '金丹': '玄枢',
  '元婴初期': '化域初期', '元婴中期': '化域中期', '元婴后期': '化域后期', '元婴': '化域',
  '化神初期': '尊玄初期', '化神中期': '尊玄中期', '化神后期': '尊玄后期', '化神': '尊玄'
};

var XZ_SKILL_MP_BY_QUALITY = {
  '凡阶': { single: 9, self: 6 },      /* 6~12 中值；自身夹到区间下界 */
  '黄阶': { single: 55, self: 33 },    /* 40~70 中值；自身估 */
  '玄阶': { single: 195, self: 90 },   /* 150~240 中值；自身实测 */
  '地阶': { single: 525, self: 240 },  /* 400~650 中值；自身实测 */
  '天阶': { single: 1500, self: 900 }, /* 1200~1800 中值；自身实测 */
  '神阶': { single: 3300, self: 1980 } /* 2600~4000 中值；自身估 */
};

var QUALITY_POWER = { '凡阶': 16, '黄阶': 24, '玄阶': 41, '地阶': 57, '天阶': 73, '神阶': 85 };

var XZ_PEAK_COEFF = {
  '引玄': 1.12, '凝府': 1.44, '玄枢': 1.85, '化域': 2.38,
  '尊玄': 3.07, '穹境': 3.94, '玄罡': 5.08, '玄王': 6.53,
  '玄皇': 8.41, '玄宗': 10.82, '玄圣': 13.92, '帝境': 17.92
};

var XZ_UPGRADE_HEADROOM = 1.5;

var XZ_HEAL_RATIO = 1.0;

var XZ_SHIELD_RATIO = 1.0;

var V81_EFFECT_CAP = { '凡阶': 1, '黄阶': 2, '玄阶': 3, '地阶': 4, '天阶': 5, '神阶': 6 };

var REALM_TIER_KEYS = ['凡人', '引玄', '凝府', '玄枢', '化域', '尊玄', '穹境', '玄罡', '玄王', '玄皇', '玄宗', '玄圣', '帝境'];

var XINFA_TABLE = {
  // ---------- 火路 · ①叠火流（叠灼烧引爆）----------
  '焚火诀':     { 流派:'火', 路线:'①叠火流', quality:'玄阶', effects:['火系增伤', '提升攻击'] },
  '叠焰真解':   { 流派:'火', 路线:'①叠火流', quality:'地阶', effects: ['火系增伤', '提升攻击'] },
  '燎原心典':   { 流派:'火', 路线:'①叠火流', quality:'天阶', effects: ['火系增伤', '暴击伤害'] },
  // ---------- 火路 · ②焚身流（割血换伤）----------
  '血焰心经':   { 流派:'火', 路线:'②焚身流', quality:'玄阶', effects:['火系增伤', '吸血'] },
  '焚身录':     { 流派:'火', 路线:'②焚身流', quality:'地阶', effects: ['吸血'] },
  '玉石俱焚典': { 流派:'火', 路线:'②焚身流', quality:'天阶', effects: ['暴击伤害', '返元'] },
  // ---------- 火路 · ③真火流（破盾爆发）----------
  '净火录':     { 流派:'火', 路线:'③真火流', quality:'玄阶', effects:['火系增伤', '提升暴击率'] },
  '真火真解':   { 流派:'火', 路线:'③真火流', quality:'地阶', effects:['火系增伤', '自带破甲'] },
  '火德真经':   { 流派:'火', 路线:'③真火流', quality:'天阶', effects:['火系增伤', '暴击伤害', '自带破甲'] },
  // ---------- 剑路 · ①暴击流（叠层兑付）----------
  '剑髓录':     { 流派:'剑', 路线:'①暴击流', quality:'玄阶', effects: ['提升暴击率'] },
  '凝意真解':   { 流派:'剑', 路线:'①暴击流', quality:'地阶', effects: ['提升攻击'] },
  '太虚剑典':   { 流派:'剑', 路线:'①暴击流', quality:'天阶', effects: ['提升攻击', '提升暴击率'] },
  // ---------- 剑路 · ②剑心流（暴击心念）----------
  '明心剑诀':   { 流派:'剑', 路线:'②剑心流', quality:'玄阶', effects:['提升暴击率','灵台空明'] },
  '通明剑录':   { 流派:'剑', 路线:'②剑心流', quality:'地阶', effects: ['灵台空明'] },
  '心剑无尘典': { 流派:'剑', 路线:'②剑心流', quality:'天阶', effects: ['返照', '提升暴击率'] },
  // ---------- 剑路 · ③万剑流（群伤剑阵）----------
  '万剑胎息':   { 流派:'剑', 路线:'③万剑流', quality:'玄阶', effects:['提升攻击', '提升暴击率'] },
  '剑冢引':     { 流派:'剑', 路线:'③万剑流', quality:'地阶', effects:['蔓延'] },
  '万剑归宗录': { 流派:'剑', 路线:'③万剑流', quality:'天阶', effects:['蔓延','提升攻击'] },
  // ---------- 木路 · ①剧毒流 ----------
  '青木诀': { 流派:'木', 路线:'①剧毒流', quality:'玄阶', effects:['木系增伤', '提升攻击'] },
  '蚀毒真解': { 流派:'木', 路线:'①剧毒流', quality:'地阶', effects:['木系增伤', '碎甲', '提升攻击'] },
  '万毒心典': { 流派:'木', 路线:'①剧毒流', quality:'天阶', effects:['木系增伤', '碎甲', '暴击伤害'] },
  // ---------- 木路 · ②毒养流 ----------
  '木灵诀': { 流派:'木', 路线:'②毒养流', quality:'玄阶', effects:['木系增伤', '返元'] },
  '毒养真解': { 流派:'木', 路线:'②毒养流', quality:'地阶', effects:['木系增伤', '返元', '提升最大生命值'] },
  '枯荣心典': { 流派:'木', 路线:'②毒养流', quality:'天阶', effects:['木系增伤', '返元', '暴击伤害'] },
  // ---------- 木路 · ③藤缚流 ----------
  '缚藤诀': { 流派:'木', 路线:'③藤缚流', quality:'玄阶', effects:['木系增伤', '提升防御'] },
  '缠魂真解': { 流派:'木', 路线:'③藤缚流', quality:'地阶', effects: ['碎甲', '提升攻击'] },
  '缚天心典': { 流派:'木', 路线:'③藤缚流', quality:'天阶', effects: ['木系增伤', '提升攻击'] },
  // ---------- 水路 · ①磨血流 ----------
  '寒潭诀': { 流派:'水', 路线:'①磨血流', quality:'玄阶', effects:['水系增伤', '提升攻击'] },
  '磨海真解': { 流派:'水', 路线:'①磨血流', quality:'地阶', effects: ['水系增伤', '提升攻击', '残血回复'] },
  '万流心典': { 流派:'水', 路线:'①磨血流', quality:'天阶', effects:['水系增伤', '返元', '暴击伤害', '残血回复'] },
  // ---------- 水路 · ②护盾流 ----------
  '水德诀': { 流派:'水', 路线:'②护盾流', quality:'玄阶', effects:['水系增伤', '返元'] },
  '护澜真解': { 流派:'水', 路线:'②护盾流', quality:'地阶', effects:['水系增伤', '提升防御', '返元'] },
  '沧溟心典': { 流派:'水', 路线:'②护盾流', quality:'天阶', effects:['水系增伤', '提升最大生命值', '返元'] },
  // ---------- 水路 · ③沧溟流 ----------
  '沧浪诀': { 流派:'水', 路线:'③沧溟流', quality:'玄阶', effects:['水系增伤', '提升速度'] },
  '潮涌真解': { 流派:'水', 路线:'③沧溟流', quality:'地阶', effects:['水系增伤', '提升速度', '暴击伤害'] },
  '海纳心典': { 流派:'水', 路线:'③沧溟流', quality:'天阶', effects:['水系增伤', '暴击伤害', '提升攻击'] },
  // ---------- 土路 · ①减伤流 ----------
  '厚土诀': { 流派:'土', 路线:'①减伤流', quality:'玄阶', effects:['土系增伤', '提升防御'] },
  '岩固真解': { 流派:'土', 路线:'①减伤流', quality:'地阶', effects: ['土系增伤', '提升防御', '满血减伤'] },
  '五岳心典': { 流派:'土', 路线:'①减伤流', quality:'天阶', effects: ['土系增伤', '暴击伤害', '满血减伤'] },
  // ---------- 土路 · ②格挡流 ----------
  '磐石诀': { 流派:'土', 路线:'②格挡流', quality:'玄阶', effects:['提升防御', '返元'] },
  '格挡真解': { 流派:'土', 路线:'②格挡流', quality:'地阶', effects:['提升防御', '久守', '返元', '满血减伤'] },
  '不动心典': { 流派:'土', 路线:'②格挡流', quality:'天阶', effects:['提升防御', '久守', '提升最大生命值', '满血减伤'] },
  // ---------- 土路 · ③重压流 ----------
  '压顶诀': { 流派:'土', 路线:'③重压流', quality:'玄阶', effects:['土系增伤', '提升攻击'] },
  '崩山真解': { 流派:'土', 路线:'③重压流', quality:'地阶', effects: ['土系增伤', '提升攻击'] },
  '厚土心典': { 流派:'土', 路线:'③重压流', quality:'天阶', effects:['土系增伤', '自带破甲', '暴击伤害'] },
  // ---------- 风路 · ①增伤流 ----------
  '御风诀': { 流派:'风', 路线:'①增伤流', quality:'玄阶', effects:['风系增伤', '提升速度'] },
  '疾风真解': { 流派:'风', 路线:'①增伤流', quality:'地阶', effects:['风系增伤', '提升速度', '提升暴击率'] },
  '踏风心典': { 流派:'风', 路线:'①增伤流', quality:'天阶', effects:['风系增伤', '提升速度', '暴击伤害'] },
  // ---------- 风路 · ②风刃流 ----------
  '岚影诀': { 流派:'风', 路线:'②风刃流', quality:'玄阶', effects:['风系增伤', '提升暴击率'] },
  '风刃真解': { 流派:'风', 路线:'②风刃流', quality:'地阶', effects:['风系增伤', '提升暴击率', '暴击伤害'] },
  '岚心典': { 流派:'风', 路线:'②风刃流', quality:'天阶', effects:['风系增伤', '提升暴击率', '提升攻击'] },
  // ---------- 风路 · ③飓风流 ----------
  '飓风诀': { 流派:'风', 路线:'③飓风流', quality:'玄阶', effects:['风系增伤', '提升攻击'] },
  '旋斩真解': { 流派:'风', 路线:'③飓风流', quality:'地阶', effects:['风系增伤', '提升攻击', '提升暴击率'] },
  '万风心典': { 流派:'风', 路线:'③飓风流', quality:'天阶', effects:['风系增伤', '提升暴击率', '暴击伤害'] },
  // ---------- 雷路 · ①集气流 ----------
  '紫雷诀': { 流派:'雷', 路线:'①集气流', quality:'玄阶', effects:['雷系增伤', '提升攻击'] },
  '蓄雷真解': { 流派:'雷', 路线:'①集气流', quality:'地阶', effects:['雷系增伤', '提升攻击', '暴击伤害'] },
  '九天心典': { 流派:'雷', 路线:'①集气流', quality:'天阶', effects:['雷系增伤', '暴击伤害', '提升暴击率'] },
  // ---------- 雷路 · ②连锁流 ----------
  '引雷诀': { 流派:'雷', 路线:'②连锁流', quality:'玄阶', effects:['雷系增伤', '提升速度'] },
  '连锁真解': { 流派:'雷', 路线:'②连锁流', quality:'地阶', effects:['雷系增伤', '提升速度', '提升暴击率'] },
  '连雷心典': { 流派:'雷', 路线:'②连锁流', quality:'天阶', effects:['雷系增伤', '提升暴击率', '暴击伤害'] },
  // ---------- 雷路 · ③雷体流 ----------
  '雷体诀': { 流派:'雷', 路线:'③雷体流', quality:'玄阶', effects:['雷系增伤', '提升防御'] },
  '淬体真解': { 流派:'雷', 路线:'③雷体流', quality:'地阶', effects: ['雷系增伤', '提升防御'] },
  '雷罡心典': { 流派:'雷', 路线:'③雷体流', quality:'天阶', effects: ['雷系增伤', '暴击伤害'] },
  // ---------- 冰路 · ①减速流 ----------
  '玄冰诀': { 流派:'冰', 路线:'①减速流', quality:'玄阶', effects:['冰系增伤', '提升防御'] },
  '寒霜真解': { 流派:'冰', 路线:'①减速流', quality:'地阶', effects: ['冰系增伤', '提升防御'] },
  '寒霜心典': { 流派:'冰', 路线:'①减速流', quality:'天阶', effects: ['冰系增伤', '暴击伤害'] },
  // ---------- 冰路 · ②斩杀流 ----------
  '霜刃诀': { 流派:'冰', 路线:'②斩杀流', quality:'玄阶', effects:['冰系增伤', '提升暴击率'] },
  '斩霜真解': { 流派:'冰', 路线:'②斩杀流', quality:'地阶', effects:['冰系增伤', '提升暴击率', '暴击伤害'] },
  '霜绝心典': { 流派:'冰', 路线:'②斩杀流', quality:'天阶', effects:['冰系增伤', '暴击伤害', '提升攻击'] },
  // ---------- 冰路 · ③碎冰流 ----------
  '冰封诀': { 流派:'冰', 路线:'③碎冰流', quality:'玄阶', effects:['冰系增伤', '提升攻击'] },
  '冰河真解': { 流派:'冰', 路线:'③碎冰流', quality:'地阶', effects: ['冰系增伤', '提升攻击'] },
  '万古心典': { 流派:'冰', 路线:'③碎冰流', quality:'天阶', effects: ['冰系增伤', '暴击伤害'] },
  // ---------- 刀路 · ①流血流 ----------
  '血刀诀': { 流派:'刀', 路线:'①流血流', quality:'玄阶', effects:['提升攻击', '吸血'] },
  '血流真解': { 流派:'刀', 路线:'①流血流', quality:'地阶', effects:['提升攻击', '吸血', '暴击伤害'] },
  '血海心典': { 流派:'刀', 路线:'①流血流', quality:'天阶', effects:['吸血', '暴击伤害', '提升攻击'] },
  // ---------- 刀路 · ②泣血流 ----------
  '泣血诀': { 流派:'刀', 路线:'②泣血流', quality:'玄阶', effects:['泣血', '吸血'] },
  '残血真解': { 流派:'刀', 路线:'②泣血流', quality:'地阶', effects:['泣血', '暴击伤害', '提升攻击'] },
  '血战心典': { 流派:'刀', 路线:'②泣血流', quality:'天阶', effects:['泣血', '吸血', '暴击伤害'] },
  // ---------- 刀路 · ③刀势流 ----------
  '刀势诀': { 流派:'刀', 路线:'③刀势流', quality:'玄阶', effects:['提升攻击', '自带破甲'] },
  '断钢真解': { 流派:'刀', 路线:'③刀势流', quality:'地阶', effects: ['提升攻击', '自带破甲'] },
  '一刀心典': { 流派:'刀', 路线:'③刀势流', quality:'天阶', effects: ['提升攻击', '暴击伤害'] },
  // ---------- 枪路 · ①敌多增伤流 ----------
  '军阵诀': { 流派:'枪', 路线:'①敌多增伤流', quality:'玄阶', effects:['陷阵', '提升攻击', '敌多回血'] },
  '战阵真解': { 流派:'枪', 路线:'①敌多增伤流', quality:'地阶', effects:['陷阵', '提升攻击', '龙胆', '敌多回血'] },
  '神机心典': { 流派:'枪', 路线:'①敌多增伤流', quality:'天阶', effects:['陷阵', '龙胆', '暴击伤害', '敌多回血'] },
  // ---------- 枪路 · ②坚守流 ----------
  '铁壁诀': { 流派:'枪', 路线:'②坚守流', quality:'玄阶', effects: ['提升防御'] },   // ★ v108：「敌多减伤」已废除（v94），名字一并清掉
  '坚阵真解': { 流派:'枪', 路线:'②坚守流', quality:'地阶', effects: ['提升防御', '返元'] },
  '军魂心典': { 流派:'枪', 路线:'②坚守流', quality:'天阶', effects:['提升防御', '久守', '返元'] },
  // ---------- 枪路 · ③突刺流 ----------
  '突刺诀': { 流派:'枪', 路线:'③突刺流', quality:'玄阶', effects:['提升攻击', '自带破甲'] },
  '贯阵真解': { 流派:'枪', 路线:'③突刺流', quality:'地阶', effects: ['提升攻击', '自带破甲'] },
  '破军心典': { 流派:'枪', 路线:'③突刺流', quality:'天阶', effects: ['提升攻击', '暴击伤害'] },
  // ---------- 体路 · ①受击减伤流 ----------
  '肉身诀': { 流派:'体', 路线:'①受击减伤流', quality:'玄阶', effects:['提升最大生命值', '提升防御'] },
  '肉身真解': { 流派:'体', 路线:'①受击减伤流', quality:'地阶', effects: ['提升最大生命值', '返元'] },
  '成圣心典': { 流派:'体', 路线:'①受击减伤流', quality:'天阶', effects: ['提升最大生命值', '暴击伤害'] },
  // ---------- 体路 · ②崩拳流 ----------
  '崩拳诀': { 流派:'体', 路线:'②崩拳流', quality:'玄阶', effects:['提升攻击', '暴击伤害'] },
  '开天真解': { 流派:'体', 路线:'②崩拳流', quality:'地阶', effects: ['提升攻击', '暴击伤害'] },
  '一拳心典': { 流派:'体', 路线:'②崩拳流', quality:'天阶', effects: ['提升攻击', '自带破甲'] },
  // ---------- 体路 · ③血战流 ----------
  '血战诀': { 流派:'体', 路线:'③血战流', quality:'玄阶', effects: ['提升攻击'] },
  '血怒真解': { 流派:'体', 路线:'③血战流', quality:'地阶', effects: ['提升攻击', '吸血'] },
  '血勇心典': { 流派:'体', 路线:'③血战流', quality:'天阶', effects: ['吸血', '暴击伤害'] },
  // ---------- 体路 · ①受击减伤流 ----------
  // ---------- 体路 · ②崩拳流 ----------
  // ---------- 体路 · ③血战流 ----------
  // ---------- 刀路 · ①流血流 ----------
  // ---------- 刀路 · ②泣血流 ----------
  // ---------- 刀路 · ③刀势流 ----------
  // ---------- 冰路 · ①减速流 ----------
  // ---------- 冰路 · ②斩杀流 ----------
  // ---------- 冰路 · ③碎冰流 ----------
};

var V2_STATES = {
  '破甲': { side: 'foe',  max: 5,  vuln: 0.06,      full: '碎防' },   /* ★ v108：amp→vuln 易伤（amp 走 ampPool 死池，永不见效） */
  '剧毒': { side: 'foe',  max: 10, dot: 0.03, ramp: 0.35, full: '剧侵' },
  '浸润': { side: 'foe',  max: 5,  dot: 0.02,        full: '漫溢' },
  '灼烧': { side: 'foe',  max: 5,  dot: 0.03,        full: '爆燃' },
  '减速': { side: 'foe',  max: 5,  slow: 0.05, outCut: 0.03, full: '冰封' },
  '流血': { side: 'foe',  max: 5,  dot: 0.03,        full: '割裂' },
  '减伤': { side: 'self', max: 5,  dr: 0.05, fin: 0.12, full: '垒壁' },
  '增伤': { side: 'self', max: 5,  spd: 0.04, dmg: 0.02, track: 0.02, full: '风驰' },   // ★ v65：track = 每层自己前拉一条的百分比
  /* ★ v108：`spd: 0.04` 是**表内死字段** —— 全项目没有任何读者（v65 起疾风改走
     track 前拉条，注释也写了「不动 spd」，但这个键忘了删）。
     留着它 = 下一个读表的人会以为「疾风加速度」，然后发现没反应（bug ⑥ 的同款）。
     ⚠ 别顺手删：`工具/verify_v2_states.mjs` 有一条闸专门枚举「表里有、没人读」的字段，
        现在它就该报这一条；等哪天真的接上 spd，再把这条注释和闸一起改。 */
  '集气': { side: 'self', max: 5,  charge: 0.10 },
  '暴击': { side: 'self', max: 5,  crit: 0.05 },
  '受击减伤': { side: 'self', max: 5,  dr: 0.04, onHurt: true },     // 体·受击叠层：挨打即 +1
  /* ★ v108：`onHurt: true` 这个**键本身没有读者** —— 挨打叠层的实现（12014/12236 两处）
     是硬编码 `hasOwnProperty(target.v2stk, '受击减伤')`，没查这张表。
     机制是活的，但走的是表外小路 ⇒ 表说一套、代码做一套（bug ⑥）。
     现在它唯一的读者是势种说明生成器（4479 行，拿它拼 UI 文案）。
     ⚠ 真要修就把两处硬编码改成 `V2_STATES['受击减伤'].onHurt && v2StateVal(target,'受击减伤') >= 0`，
        但那会改「0 层时还叠不叠」的行为（hasOwnProperty 对 0 也为真）——
        属于平衡决策，不在本次自检范围内，先留痕。 */
  '敌多增伤': { side: 'self', max: 5,  full: '军威' }                // 枪·①敌多增伤流主势种；满层质变=军威（v108 补实现）
  // ★ v7：原来这里挂了 foeAmp:0.05 / foeCut:0.015（「敌越多越强/越硬」），
  //   但这两个字段全项目**没有任何读取点**，等于永远不生效。
  //   「敌方越多越强」现由【枪玄技自带的原子】结算（如「枪出如龙」foeAmpK）；
  //   ★ v108：「敌方越多减伤/增伤」整条已在 v94 废除（见 11361、11593），XINFA_TABLE 里的
  //   「敌多减伤」词条名也一并删掉 —— 纸上写着、引擎不算，是 bug ③「规则只在纸面」的同款。
  //   流派核心机制一律归流派玄诀，不留在状态表里当摆设，也不挂在玄技上。
};

var BLOOD_EFFECT_KEYS = [
    /* ⚠ 顺序即优先级：**更具体的词必须排在更宽泛的词前面**（实测踩过的坑）。
       排错的后果是「残血减伤」被 `减伤` 抢先命中、错记成 dr。 */
    { re: /(残血.{0,3}减伤|血越低|垂危.{0,3}减伤|残血.{0,3}免伤)/,      key: 'lowHpDr',         cap: 0.30, txt: '血量越低减伤越高（满血为 0）' },
    /* ★★★ v323：`抗暴` 必须排在**所有**暴击相关规则之前 ★★★
       否则「抗暴:20」会被下面的 `/暴击率|会心|暴击/` 抢先命中、错记成「暴击率 +20%」——
       守方写抗暴，结果自己暴击变高，方向完全反过来（且零报错）。 */
    { re: /(抗暴|防暴击|抵御暴击|暴击抵抗)/,                             key: 'antiCrit',        cap: 0.90, txt: '被暴击率降低' },
    /* ⚠ 暴击伤害必须排在暴击率前面，否则「暴击伤害 +30%」会被当成暴击率。 */
    { re: /(暴击伤害|暴伤|暴击倍率)/,                                   key: 'critDmg',         cap: 0.30, txt: '暴击伤害提高' },
    { re: /(暴击率|会心|暴击)/,                                         key: 'crit',            cap: 0.20, txt: '暴击率提高' },
    { re: /(气血上限|最大气血|生命上限|气血.{0,3}提升|体魄)/,             key: 'hpMaxK',          cap: 0.30, txt: '气血上限提高' },
    { re: /(灵力上限|最大灵力|灵力.{0,3}提升)/,                          key: 'mpMaxK',          cap: 0.30, txt: '灵力上限提高' },
    /* ⚠ 命中回复 / 受击回复 排在 吸血 前面：「吸血」是宽泛词，别把它先吃掉。 */
    { re: /(命中.{0,3}回复|命中.{0,3}回血)/,                             key: 'lifesteal',       cap: 0.20, txt: '命中回复气血' },
    { re: /(受击.{0,3}回复|受击.{0,3}回血|受创.{0,3}回复|挨打.{0,3}回)/,   key: 'onHurtHeal',      cap: 0.06, txt: '每次受击回复气血上限的' },
    { re: /(吸血|汲取|饮血)/,                                            key: 'lifesteal',       cap: 0.20, txt: '命中回复气血' },
    /* ⚠ 破盾是**开关型**：写了就满额，写「无视护盾 40%」则只破 40%。 */
    { re: /(无视护盾|破盾|击破.{0,3}盾)/,                                key: 'ignoreShieldPct', cap: 0.50, full: true, txt: '攻击可击破护盾' },
    /* ★★★ v323：`护盾` —— 前面那条 `破盾` 会吃掉「破盾」二字，所以「护盾」必须**另起一条**，
       且不能与 `破盾` 合并（一个是攻方破对方的盾，一个是给自己加盾，方向相反）。
       语义：装配即给一层护盾 = 自身气血上限 × 数值（封顶 50%，与 xzShieldSet 同额）。
       ⚠ 排在 `破盾` 之后但仍在 `减伤` 之前 —— 否则「护体灵盾」会被 `减伤` 的宽泛词截胡。 */
    { re: /(护盾|护体灵盾|灵盾|盾壁)/,                                   key: 'shieldMaxPct',    cap: 0.50, txt: '开场获得护盾（气血上限的）' },
    { re: /(免死|留一口气|致命.{0,3}自愈|濒死.{0,3}回复|保命)/,           key: 'deathImmuneHeal', cap: 0.30, txt: '致命伤强留一口气并自愈（每场一次）' },
    { re: /(每回合.{0,3}回蓝|回复.{0,3}灵力|每回合.{0,3}灵力|纳灵|回蓝|恢复灵力)/, key: 'mpRegen', cap: 0.08, txt: '每回合额外回复灵力上限的' },
    /* ★★★ v323：`提速` —— 之前完全没有这条规则，「提速:18」一个字都不认。
       与招式里的 `提速` 同口径（《招式字段》第 19 行）：**写点数 = 速度点数**，
       `unit:'flat'` ⇒ buildBloodBuffs 不除 100，直接落成点数；
       封顶 60 点（tempEvadeBoost / v75HasteFlat 同量级，`提速:18` 是常见档）。
       位置必须在 `抢先手` 之前 —— `抢先手` 的正则含 `先手|抢行动`，
       而「提速」不会被它命中，但「抢先」会；顺序上先具体后宽泛是本表铁律。 */
    { re: /(提速|加速|身法加快|速度提升)/,                               key: 'hasteFlat',       cap: 60,  unit: 'flat', txt: '速度 +' },
    /* trackOnStart 的值语义是**拉条点数**（既有取值 60/90/120），不是百分比。
       unit:'track' ⇒ 装配时按 百分比 × 300 折成点数（写「抢先手 40%」→ 120 点）。 */
    { re: /(抢先手|先手|抢先|抢行动|起手.{0,3}拉)/,                       key: 'trackOnStart',    cap: 0.40, unit: 'track', txt: '起手抢占先机' },
    { re: /(无视.{0,3}防御|穿防|破防|护甲穿透)/,                          key: 'pierce',          cap: 0.25, txt: '无视目标部分防御' },
    { re: /(闪避|躲避|避开)/,                                            key: 'evade',           cap: 0.18, txt: '有几率完全闪避' },
    { re: /(增伤|伤害提高|造成伤害增加|输出提高)/,                        key: 'amp',             cap: 0.25, txt: '造成的伤害提高' },
    { re: /(减伤|承伤|伤害降低|受到伤害减少|所受伤害)/,                    key: 'dr',              cap: 0.30, txt: '受到的伤害降低' },
    /* ★★★ v300：`回血` —— 四源统一格式里**唯一真正漏读**的机制名 ★★★
       v296 定「玄技/玄诀/兵器/血脉 同一个格式：机制:数值[:手数]｜描写」，
       上面这张表却是按**中文关键词**认的：`增伤` `减伤` `穿防` `暴击` `回蓝`
       `闪避` `抢先手` `气血上限` `灵力上限` `吸血` 十个名字刚好同时是关键词，
       所以写成 `增伤:18` 也能认出来 —— 只有 `回血` 不在任何一条正则里。
       后果（实测 工具/_tmp_diag_regen）：玄诀写 `回血:6｜…` ⇒ heartBuffs 恒 `[]`、
       一滴不回，而**零报错、零警告**，面板还写着这条效果。这就是本项目最高频的
       「算了没人乘」，只是这次连"算"都没算。
       ⇒ 补一条关键词，并让它排在 `受击回血` / `命中回血` / `吸血` **之后**
         （那三条更具体，先命中就 break，不会把「受击回血 6%」错记成每手回血）。
       cap 口径见《数值表》§效果封顶「每手回血」那一行（10%）。 */
    { re: /(每手.{0,3}回气血|每回合.{0,3}回气血|回血)/,                   key: 'regen',           cap: 0.10, txt: '每手回复气血上限的' }
  ];

var XZ_ATOM_TYPES = {
  /* ── 即时：本击结算 ── */
  '伤害': { kind: 'damage' },
  '治疗': { kind: 'heal' },   '回复': { kind: 'heal' },
  '护盾': { kind: 'shield' },
  '吸血': { kind: 'drain' },
  /* ── 持续伤害（每手跳伤，不属于减益）── */
  '灼烧': { kind: 'dot' }, '中毒': { kind: 'dot' }, '流血': { kind: 'dot' }, '腐蚀': { kind: 'dot' },
  /* ── 控制（目标无法行动）── */
  '定身': { kind: 'control' }, '眩晕': { kind: 'control' }, '禁锢': { kind: 'control' },
  /* ── 增益：落在自己身上 ── */
  '增伤': { kind: 'buff', sub: 'dmg' },        // 自己出手更疼（最终伤害乘区）
  '减伤': { kind: 'buff', sub: 'dr' },         // 自己挨打更轻（承伤乘区）
  '闪避': { kind: 'buff', sub: 'evade' },
  /* ★★★ v268【用户定：敏捷不许做效果，整体删除】★★★
     用户原话（2026-10-20）：「敏捷+3还是删掉吧，不准有，不然太超标了，你想想，
     四维里的敏捷+3，那速度和闪避值就要跟着加了，完全超标，
     所以效果池和脚本里不允许出现和识别敏捷+3。」
     为什么必须删（这不是调数值，是拆掉一条**一加三吃**的通道）：
       · 敏捷是**四维属性**，引擎里它同时决定 ① 速度（= (70+敏捷×8)×√境界系数）
         ② 守方闪避值（敏捷×0.6 + 境界档×1.5，封顶 15）；
       · 于是「敏捷 +3」一条效果 = 速度暴涨 + 闪避值上涨 + 出手序前移，
         一次投入吃三份收益，任何其它增益都比不了 —— 用户判定「完全超标」。
     口径：**敏捷只能来自建卡时的四维，不许被任何效果/翻译/词条临时加**。
       ⇒ 原子表里没有「敏捷」；自然语言里带「敏捷 +N」的短句整段剥掉（见 _v75ParseEffect）；
       ⇒ 旧存档里已经翻出来的 `敏捷:3:3` 落 narrative（不施加、不报错、不影响别的原子）。
     ⚠ 反过来也别把「敏捷 +N」重定向成「提速」—— 那是另一件事（速度点数），
       而且会重新变成「看着不一样、其实还是加」。用户要的是**没有**。 */
  '提速': { kind: 'buff', sub: 'haste' },  '速度': { kind: 'buff', sub: 'haste' },
  '暴击': { kind: 'buff', sub: 'crit' },
  '暴伤': { kind: 'buff', sub: 'critDmg' },
  /* ★★★ v246「穿防」语义修正（用户实测：「敌方武器有 20% 破甲，翻译结果也是穿防20%，
     为什么到了战斗界面就变成红色的破防20%、还是盾裂图标」）：
     · **攻击破甲 / 穿防 / 无视防御**：说的是「**自己**能戳破对方的护体」⇒ 自己的增益，
       落点 `heartPierce`（calcDamage 的 totalPierce 直接读它），和建卡时
       词条「自带破甲」算出来的 heartPierce 是同一个加数。
     · **被破甲 / 易伤 / 承伤增加**：说的是「对方变得容易被打」⇒ debuff/vuln。
     v94 之前把「穿防」也算成 debuff/vuln（因为当时没有防御乘区），
     在 v246 补上 pierce 落点后已经不准 —— 留着会让武器的破甲变成对方的易伤。
     （这段刻意写在**表外**：表内注释会干扰按括号配平切表的闸。） */
  '穿防': { kind: 'buff', sub: 'pierce' },   /* 攻击破甲（自己戳破对方护体）*/
  '回血': { kind: 'buff', sub: 'regen' },      // 每手回气血
  '回蓝': { kind: 'buff', sub: 'mpRegen' },    // 每手回灵力
  '气血上限': { kind: 'buff', sub: 'hpMax' },
  '灵力上限': { kind: 'buff', sub: 'mpMax' },
  '免死': { kind: 'buff', sub: 'immortal' },   // 致死伤害留 1 点
  '抢先手': { kind: 'buff', sub: 'firstMove' },
  '破盾': { kind: 'buff', sub: 'breakShield' },
  '抗暴': { kind: 'buff', sub: 'antiCrit' },
  /* ── 减益：落在目标身上（纯负面状态）── */
  '虚弱': { kind: 'debuff', sub: 'dmgDown' },  // 目标出手更弱
  '破防': { kind: 'debuff', sub: 'vuln' }, '易伤': { kind: 'debuff', sub: 'vuln' },
  '减速': { kind: 'debuff', sub: 'slow' }, '迟缓': { kind: 'debuff', sub: 'slow' },
  '削防': { kind: 'debuff', sub: 'defDown' },
  /* ★ v364：召唤。`kind:'summon'` 只说明"这条是召唤"，真正的结构由 xzParseSummon 解析
     （一条召唤串里含名称/手数/强度/多个技能，超出「一个机制一个值」的表达力）。 */
  '召唤': { kind: 'summon' }
};

var XZ_ATOM_RETIRED = {
  '攻击': '增伤', '防御': '减伤', '命中': '增伤', '攻速': '提速', '护甲': '减伤',
  '加伤': '增伤', '破甲': '穿防', '碎甲': '穿防', '加速': '提速', '回气': '回蓝',
  /* v251：敏捷**就是**敏捷，不许并成提速。 */
  '提升攻击': '增伤', '提升防御': '减伤', '提升速度': '速度', '提升暴击率': '暴击'
};

var XZ_ATOM_LINE_RE = /^\s*([一-龥]{1,4})\s*[:：]\s*/;

var XZ_ATTR_CAP_BY_BIG = {
  '引玄': 9, '凝府': 10, '玄枢': 11, '化域': 12, '尊玄': 13, '穹境': 14,
  '玄罡': 15, '玄王': 16, '玄皇': 17, '玄宗': 18, '玄圣': 19, '帝境': 20
};

var XZ_ATTR_TOTAL_CAP_BY_BIG = {
  '引玄': 16, '凝府': 18, '玄枢': 20, '化域': 22, '尊玄': 24, '穹境': 26,
  '玄罡': 28, '玄王': 30, '玄皇': 32, '玄宗': 34, '玄圣': 36, '帝境': 38
};

var XZ_HIT_BONUS = { '凡阶': 0, '黄阶': 1, '玄阶': 2, '地阶': 4, '天阶': 6, '神阶': 8 };

var XZ_SUB_LABEL = {
  haste: '提速', slow: '减速', evade: '闪避', dr: '减伤', dmg: '增伤',
  pierce: '穿防', vuln: '破防', defDown: '破防', crit: '暴击', critDmg: '暴伤',
  dot: '灼烧', dmgDown: '虚弱', regen: '回复', mpRegen: '回灵', hpMax: '气血上限',
  mpMax: '灵力上限', immortal: '不灭', breakShield: '破盾', antiCrit: '明心'
};

var XZ_KIND_LABEL = {
  buff: '增益', debuff: '减益', dot: '持续伤害', shield: '护盾', drain: '吸取',
  control: '控制', heal: '回复'
};

var XZ_PERM_KEYS = ['dmg', 'dmgDown', 'dr', 'vuln', 'evade',
  'hastePct', 'hasteFlat', 'slowPct', 'slowFlat', 'crit', 'critDmg', 'regen',
  /* ★ v348：上限类常驻倍率。它们不进任何乘区（不参与 calcDamage），
     只给 `applyV75Effects` 的 hpMax/mpMax 分支做**累加记账**用 ——
     记在这里而不是另开一个字段，是为了让「常驻加成」只有一本账本
     （本项目栽过太多次：同一件事两处实现 ⇒ 只改一处 ⇒ 静默半失效）。 */
  'hpMaxK', 'mpMaxK'];

/* ══════════ 函数（43 个，04 原序） ══════════ */

function xzLevelCoeffOf(realmName) {
  var s = String(realmName === undefined || realmName === null ? '' : realmName);
  /* ⚠ 专称里**不含大境名**的两个（本项目踩过的老坑）：
       「玄帝」→ 帝境、「穹主」→ 穹境。
     漏了会一路退化到引玄兜底（0.056），伤害只剩应得的 1/44 —— 且不报错。
     （v85 在 REALM_COEFFS 上出过一模一样的事：化神巅峰→尊玄，落 1.08。） */
  if (s.indexOf('玄帝') !== -1) return XZ_LEVEL_COEFF['帝境'] * 1.12;
  if (s.indexOf('穹主') !== -1) return XZ_LEVEL_COEFF['穹境'] * 1.12;
  var base = '', sub = '';
  for (var k in XZ_LEVEL_COEFF) {
    if (s.indexOf(k) !== -1) { base = k; break; }
  }
  if (!base) return XZ_LEVEL_COEFF['引玄'];
  for (var sk in XZ_LEVEL_SUBSTEP) {
    if (s.indexOf(sk) !== -1) { sub = sk; break; }
  }
  /* 专称（大凝府 / 大玄枢 / 大化域 …）都算巅峰档 */
  if (!sub && s.indexOf('大') === 0) sub = '巅峰';
  return XZ_LEVEL_COEFF[base] * (XZ_LEVEL_SUBSTEP[sub] || 1.00);
}

function normalizeRealm(r) {
  var v = String(r === undefined || r === null ? '' : r).trim();
  if (!v) return v;
  if (typeof REALM_ALIAS !== 'undefined' && REALM_ALIAS) {
    if (REALM_ALIAS[v]) return REALM_ALIAS[v];
    for (var k in REALM_ALIAS) {
      if (v.indexOf(k) !== 0) continue;
      /* ⚠ 别把档位丢了：「化神巅峰」换名成「尊玄」就变成裸境名，
         后面只能落到「尊玄中期」1.08，真值应是「大尊玄」3.07。
         所以换名时把「初期/中期/后期/巅峰/圆满」这段后缀接回去。 */
      var rest = v.slice(k.length);
      var tail = /初期/.test(rest) ? '初期'
        : (/中期/.test(rest) ? '中期'
        : (/后期/.test(rest) ? '后期'
        : (/巅峰|圆满/.test(rest) ? '巅峰' : '')));
      return tail ? (REALM_ALIAS[k] + tail) : REALM_ALIAS[k];
    }
  }
  return v;
}

function xzNormRealmName(r) {
  var v = String(r === undefined || r === null ? '' : r).trim();
  if (!v) return v;
  /* 1) 旧名换名 */
  if (typeof normalizeRealm === 'function') v = normalizeRealm(v);
  /* 2) 专称直认 —— REALM_COEFFS 里已有这些键 */
  if (typeof REALM_COEFFS !== 'undefined' && REALM_COEFFS && REALM_COEFFS[v] !== undefined) return v;
  /* 3) 含「大境名 + 档位」的直接命中（如「凝府后期」） */
  if (typeof REALM_COEFFS !== 'undefined' && REALM_COEFFS) {
    for (var k in REALM_COEFFS) { if (k === v) return k; }
  }
  /* 4) 只写大境名（凝府/玄枢/化域…）→ 补「中期」，与表内裸境名的取值对齐 */
  var KEYS = (typeof REALM_TIER_KEYS !== 'undefined' && REALM_TIER_KEYS) ? REALM_TIER_KEYS : [];
  var ALIAS_SPECIAL = { '穹主': '穹主', '玄帝': '玄帝' };
  if (ALIAS_SPECIAL[v] && typeof REALM_COEFFS !== 'undefined' && REALM_COEFFS && REALM_COEFFS[ALIAS_SPECIAL[v]] !== undefined) return ALIAS_SPECIAL[v];
  for (var i = KEYS.length - 1; i >= 0; i--) {
    var base = KEYS[i];
    if (base === '凡人') continue;
    if (v === base) return base + '中期';
    /* 5) 带前后缀（如「凝府中期·剑修」「境凝府后期」）→ 抠出「大境名 + 档位」 */
    var pos = v.indexOf(base);
    if (pos !== -1) {
      var tail = v.slice(pos + base.length);
      /* 「圆满 / 大圆满」与「巅峰」是同一档（第 4 档）的两种叫法。
         ⚠ 这两个词**必须显式认**，否则 tail 里认不出档位会落到「base + '中期'」——
         「凝府大圆满」被静默当成「凝府中期」，系数 1.44 掉成 1.34，面板与实战对不上。 */
      var inner = /巅峰|圆满/.test(tail) ? '巅峰' : (/后期/.test(tail) ? '后期' : (/中期/.test(tail) ? '中期' : (/初期/.test(tail) ? '初期' : '')));
      if (!inner) { if (/巅峰|圆满/.test(v)) inner = '巅峰'; }
      if (inner) {
        /* 巅峰档在本卡多用专称；「引玄巅峰」是真实键，其余巅峰档名（大X）也要认。
           ⚠ 两个专称不含大境名：「穹主」无「穹境」、「玄帝」无「帝境」，
           必须单列 —— 否则「帝境大圆满」会退化成「帝境后期」，17.92 掉成 17.26。 */
        if (inner === '巅峰') {
          if (base === '引玄') return '引玄巅峰';
          if (base === '穹境') return '穹主';
          if (base === '帝境') return '玄帝';
          var pk = '大' + base;
          if (typeof REALM_COEFFS !== 'undefined' && REALM_COEFFS && REALM_COEFFS[pk] !== undefined) return pk;
          return base + '后期';
        }
        var cand = base + inner;
        if (typeof REALM_COEFFS !== 'undefined' && REALM_COEFFS && REALM_COEFFS[cand] !== undefined) return cand;
        return cand;
      }
      return base + '中期';
    }
  }
  /* 6) 认不出 → 原样返回 */
  return v;
}

function realmMultByName(r) {
  try {
    if (typeof REALM_COEFFS === 'undefined' || !REALM_COEFFS) return 1.08;
    var v = String(r === undefined || r === null ? '' : r).trim();
    var n = xzNormRealmName(v);
    if (REALM_COEFFS[n] !== undefined) return REALM_COEFFS[n];
    var KEYS = (typeof REALM_TIER_KEYS !== 'undefined' && REALM_TIER_KEYS) ? REALM_TIER_KEYS : [];
    for (var i = KEYS.length - 1; i >= 0; i--) {
      var base = KEYS[i];
      if (base === '凡人') { if (n.indexOf('凡人') !== -1) return 1.00; continue; }
      if (n.indexOf(base) !== -1) {
        var inner = /巅峰|圆满/.test(n) ? '巅峰' : (/后期/.test(n) ? '后期' : (/中期/.test(n) ? '中期' : (/初期/.test(n) ? '初期' : '中期')));
        if (inner === '巅峰') {
          if (base === '引玄') return REALM_COEFFS['引玄巅峰'];
          if (base === '穹境') return REALM_COEFFS['穹主'];
          if (base === '帝境') return REALM_COEFFS['玄帝'];
          var pk = '大' + base;
          if (REALM_COEFFS[pk] !== undefined) return REALM_COEFFS[pk];
          inner = '后期';
        }
        var cand = base + inner;
        if (REALM_COEFFS[cand] !== undefined) return REALM_COEFFS[cand];
        return REALM_COEFFS[base] !== undefined ? REALM_COEFFS[base] : 1.08;
      }
    }
    /* 专称 */
    if (n.indexOf('穹主') !== -1) return REALM_COEFFS['穹主'];
    if (n.indexOf('玄帝') !== -1) return REALM_COEFFS['玄帝'];
  } catch (e) {}
  return 1.08;
}

function xzSkillMpOf(quality, target) {
  var q = String(quality == null ? '' : quality).trim();
  var row = XZ_SKILL_MP_BY_QUALITY[q];
  if (!row) row = XZ_SKILL_MP_BY_QUALITY[q.replace(/阶$/, '') + '阶'];
  if (!row) row = XZ_SKILL_MP_BY_QUALITY['凡阶'];
  var isSelf = String(target == null ? '' : target).trim() === '自身';
  return isSelf ? row.self : row.single;
}

function qualityPowerOf(quality) {
  var q = String(quality == null ? '' : quality).trim();
  var v = QUALITY_POWER[q];
  if (typeof v !== 'number') v = QUALITY_POWER[q.replace(/阶$/, '') + '阶'];
  return (typeof v === 'number' && isFinite(v) && v > 0) ? v : QUALITY_POWER['凡阶'];
}

function xzBigRealmOf(realm) {
  var v = String(realm == null ? '' : realm).trim();
  if (!v) return '';
  if (/穹主/.test(v)) return '穹境';
  if (/玄帝/.test(v)) return '帝境';
  for (var k in XZ_PEAK_COEFF) { if (v.indexOf(k) >= 0) return k; }
  return '';
}

function xzSkillCapOf(quality, realm, kind) {
  var q = qualityPowerOf(quality);
  var big = xzBigRealmOf(realm);
  var k = (big && XZ_PEAK_COEFF[big]) ? XZ_PEAK_COEFF[big] : 1.0;
  var dmg = Math.round(q * k * XZ_UPGRADE_HEADROOM);
  var all = {
    dmg: dmg,
    heal: Math.round(dmg * XZ_HEAL_RATIO),
    shield: Math.round(dmg * XZ_SHIELD_RATIO),
    realm: big, quality: String(quality || ''), q: q, k: k
  };
  return kind ? (all[kind] || 0) : all;
}

function xzClampToCap(v, quality, realm, kind) {
  var n = Number(v) || 0;
  if (n <= 0) return v;
  try {
    var cap = xzSkillCapOf(quality, realm, kind);
    if (cap > 0 && n > cap) return cap;
  } catch (eCap) {}
  return v;
}

function v81CapEffectKeys(v, quality, origin) {
  var keys = (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v)
    : (typeof v === 'string' && v ? ['效果'] : []);
  var cap = V81_EFFECT_CAP[String(quality || '').replace(/阶$/, '') + '阶'];
  if (typeof cap !== 'number') return { keys: keys, capped: 0, skipped: true };
  if (String(origin === undefined || origin === null ? 'story' : origin) !== 'story') return { keys: keys, capped: 0, skipped: true };
  if (keys.length <= cap) return { keys: keys, capped: 0, skipped: false };
  /* ★ 按写入顺序取前 N 条，**不对任何键名特判** —— 键名爱叫什么叫什么，
     「主击」只是常见例子、不是必填项（见《招式字段》§二·五）。 */
  return { keys: keys.slice(0, cap), capped: keys.length - cap, skipped: false };
}

function realmRank(realm) {
  var r = String(realm == null ? '' : realm).trim();
  if (!r) return -1;
  var c = realmMultByName(r);
  return (typeof c === 'number' && isFinite(c) && c > 0) ? c : -1;
}

function xzTrackAdd(f, delta) {
  if (!f) return;
  var d = Number(delta) || 0;
  if (!d) return;
  var cap = (typeof TRACK_MAX_DISTANCE !== 'undefined' && TRACK_MAX_DISTANCE) ? TRACK_MAX_DISTANCE : 1000;
  if (typeof f.track === 'number') f.track = Math.max(0, Math.min(cap * 2, f.track + d));
  f.trackDistance = Math.max(0, Math.min(cap, (Number(f.trackDistance) || 0) + d));
}

function xzEffMechOf(key) {
  var k = String(key == null ? '' : key).trim()
    .replace(/[（(][^）)]*[）)]\s*$/, '')
    .replace(/[0-9０-９]+\s*$/, '');
  if (!k) return '';
  try {
    if (typeof XZ_ATOM_TYPES !== 'undefined' && XZ_ATOM_TYPES && XZ_ATOM_TYPES[k]) return k;
    /* 退役名（「攻击」「破甲」…）也要认：旧存档里到处是它们，
       不认就会补成「攻击:攻击:10」—— 两遍，正是本轮要根除的形态。 */
    if (typeof XZ_ATOM_RETIRED !== 'undefined' && XZ_ATOM_RETIRED && XZ_ATOM_RETIRED[k]) return k;
  } catch (eM) {}
  return '';
}

function xzEffLineOf(key, val) {
  if (val === undefined || val === null) return val;
  if (typeof val !== 'string') return val;
  var s = val.trim();
  if (!s) return s;
  /* ① 已经是规范串（旧档两遍写法、翻译原子、玩家手写完整行）—— 原样 */
  if (/^[一-龥]{1,4}\s*[:：]\s*(?:\{DMG\}|[-+]?\d)/.test(s)) return s;
  /* ② 只有数字开头才补键；叙述句一律不碰（见上面第 3 条） */
  if (!/^(?:\{DMG\}|[-+]?\d)/.test(s)) return s;
  var m = xzEffMechOf(key);
  if (!m) return s;
  return m + ':' + s;
}

function v2StateVal(f, key) {
  if (!f) return 0;
  if (key === '暴击') return f.swordIntent || 0;
  return (f.v2stk && f.v2stk[key]) || 0;
}

function v2StateSet(f, key, v) {
  if (!f) return;
  if (key === '暴击') { f.swordIntent = Math.max(0, Math.min((typeof swordIntentCap === 'function') ? swordIntentCap(f) : 5, v)); return; }
  if (!f.v2stk) f.v2stk = {};
  f.v2stk[key] = Math.max(0, Math.min(10, v));
}

function parseBloodEffect(text) {
  var out = [];
  try {
    var t = String(text || '').trim();
    if (!t) return out;
    /* 按句读：中文标点 + 英文标点 + 顿号 + 换行 */
    var parts = t.split(/[，。；、,;\n\r]+/).filter(function (x) { return x.trim(); });
    var seen = {};
    for (var pi = 0; pi < parts.length; pi++) {
      var seg = parts[pi];
      /* ★ v296：血脉也走「机制串｜描写」——`｜` 之后是设定与来历，一个字都不许进正则
         （「血脉一燃便不知痛」里的数字会被就近取成数值，那不是玩家写的强度）。 */
      var _bb = seg.search(/[｜|]/);
      if (_bb >= 0) seg = seg.slice(0, _bb).trim();
      if (!seg) continue;
      for (var ki = 0; ki < BLOOD_EFFECT_KEYS.length; ki++) {
        var rule = BLOOD_EFFECT_KEYS[ki];
        if (!rule || !rule.re.test(seg)) continue;
        /* 就近取百分数：本句里第一个数字（带不带 % 都认）。没有数字就用封顶值的 1/3 起跳，
           免得玩家写「霸体」这种定性描述时效果凭空消失。 */
        var m = seg.match(/(\d+(?:\.\d+)?)\s*[%％]?/);
        var val;
        if (m) {
          val = Number(m[1]);
          /* 口径一律百分比：写 15 与写 0.15 都认（>1 的按百分数除 100）。
             ★★★ v323：`unit:'flat'` 的键**例外** —— `提速:18` 是**18 点速度**，
             不是 0.18。不排除掉，`提速:18` 会被折成 18%，与招式侧的「点数」口径打架
             （《招式字段》第 19 行：`提速:3` = 快 3 点速）。 */
          if (rule.unit !== 'flat' && val > 1) val = val / 100;
        } else if (rule.full) {
          /* 开关型（破盾）：写了就是满额，不按 cap/3 折 —— 否则「无视护盾」会变 33%。 */
          val = rule.cap;
        } else {
          val = rule.cap / 3;
        }
        if (!(val > 0)) continue;
        var v = Math.min(val, rule.cap);   /* 单项封顶：一句「减伤 999%」不能把战斗写坏 */
        /* 同一条效果在一段话里重复出现时取大者，不叠加（免得写三遍就三倍）。 */
        if (seen[rule.key] !== undefined && seen[rule.key] >= v) continue;
        seen[rule.key] = v;
        /* ★ v323：点数型（提速）的展示口径也是「点」，不能打「+18%」。 */
        var _isFlat = (rule.unit === 'flat');
        out.push({
          key: rule.key,
          unit: rule.unit || null,
          数值: v,
          数值Label: _isFlat ? ('+' + v + ' 点') : ('+' + (Math.round(v * 1000) / 10) + '%'),
          txt: rule.txt + (_isFlat ? (v + ' 点') : ((Math.round(v * 1000) / 10) + '%')) + "（" + seg.trim() + "）",
          原文: seg.trim()
        });
        break;                     /* 一句只认第一个命中的键：别一句「减伤又增伤」算两份 */
      }
    }
  } catch (ePb) { return []; }
  return out;
}

function atomHas(f, name) { return false; }

function mechBuffsOf(f) {
  var out = [];
  if (!f) return out;
  /* ★★★ v282：这里原来还有一段「大道特性」并入（遍历 `f.daoBuffs`，逐条克隆 buff 并
     打上 `_fromDao` / `_dao` / `_tier` 三个来源标记）。
     整段删除，理由三条，缺一条都不足以删：
       ① `f.daoBuffs` **恒为空** —— 全仓唯一的来源是 `var daoBuffList = []`（6102 行），
          且 NEVER push（push/赋值 次数实测 0）。v71 是有意删掉大道体系，不是漏接。
       ② 那三个标记字段 `_fromDao` / `_dao` / `_tier` **从未有读者**。
          注释说「供只认原子的地方过滤」，但那段过滤代码**从来没有存在过**
          （v280 只写不读普查已点名）⇒ 它们只是三条无用的字符串属性。
       ③ 留着它的代价不是性能，是**误导**：任何人读到这里都会以为「大道特性还在结算」。
     ⚠ 若日后要复活大道：重新设计来源（`f.daoBuffs` 怎么填），别把这三大行照抄回来 ——
       抄回来也只是让一个恒空的 for 循环重新存在。 */
  /* ★ v94 修：血脉 `效果` 的 15 个机制键（dr/amp/pierce/crit/critDmg/lifesteal/
     onHurtHeal/lowHpDr/mpRegen/deathImmuneHeal/trackOnStart/ignoreShieldPct/evade…）
     由 parseBloodEffect 解析、buildBloodBuffs 装进 `f.bloodBuffs`，
     而这个函数**只读了 f.atoms 与 f.daoBuffs，压根没读 bloodBuffs**
     ⇒ 12 个键解析出来、面板还显示、引擎从不消费，
     而世界书《血脉规则》第四节**明文承诺它们进公式**（玩家填了却没反应，且零报错）。
     根因就是上方那段注释自称「由 mechBuffsOf() 与原子、玄诀原子、大道特性走同一条通道」
     —— 大道特性那条真接了，血脉这条漏了。
     修法：把 bloodBuffs 并进来。`_fromBlood` 标记保留，供「只认原子」的地方过滤。 */
  try {
    if (f.bloodBuffs && f.bloodBuffs.length) {
      for (var bi = 0; bi < f.bloodBuffs.length; bi++) {
        var bb = f.bloodBuffs[bi];
        if (!bb || !bb.buff || typeof bb.buff !== 'object') continue;
        var bcb = {};
        for (var bbk in bb.buff) bcb[bbk] = bb.buff[bbk];
        bcb.name = bb.name || '血脉·效果';
        out.push(bcb);
      }
    }
  } catch (eBB) {}
  /* ★ v281：武器 `效果` 的翻译结果（artifactBuffs）也并入这条通道。
     世界书《数值表》§效果封顶：「血脉 / 玄诀 / 武器 **共用一份**表，不要再给它们各写一套」。
     血脉这条早在 v94 就接进来了（上面那段），**武器这条一直没接** ——
     武器 `效果` 写「穿防 20%」只解析进 artifactParsed，没有任何消费点读它。
     接法与血脉完全一致：同一个 parseBloodEffect → 同一个 buildBloodBuffs → 同一个 mechBuffsOf，
     所以「碎甲，穿防 20%」里的 20% 与血脉写「穿防 20%」走的是**同一份实现**，不存在两套。 */
  try {
    if (f.artifactBuffs && f.artifactBuffs.length) {
      for (var abi = 0; abi < f.artifactBuffs.length; abi++) {
        var ab = f.artifactBuffs[abi];
        if (!ab || !ab.buff || typeof ab.buff !== 'object') continue;
        var acb = {};
        for (var abk in ab.buff) acb[abk] = ab.buff[abk];
        acb.name = ab.name || '武器·效果';
        /* ★ v282：`acb._fromArtifact = true;` 已删 —— 只写不读（v280 普查点名）。
           它与刚删的 `_fromDao` 是同一套「来源标记」，同样从未有过滤代码读过它。
           `acb.name` 已经写清「武器·效果」，识别来源不靠这个布尔。 */
        out.push(acb);
      }
    }
  } catch (eAB) {}
  /* ★★★ v284：玄诀 `效果` 的翻译结果（heartBuffs）也并入这条通道 ★★★
     世界书《数值表》§效果封顶：「血脉 / 玄诀 / 武器 **共用一份**表」。
     血脉 v94 接了、武器 v281 接了，**玄诀这一档一直没接** ——
     它只走 7 条 `indexOf` 白名单，写「减伤 15%，穿防 20%」这种规范话术一条都不认。
     接法与上面两段逐字同构（同一个 buildBloodBuffs 产物、同样的克隆、同样的 name 标签），
     所以 mechVal / mechSumField / calcDamage 全都自动吃到，不存在第二份结算实现。 */
  try {
    if (f.heartBuffs && f.heartBuffs.length) {
      for (var hbi = 0; hbi < f.heartBuffs.length; hbi++) {
        var hb = f.heartBuffs[hbi];
        if (!hb || !hb.buff || typeof hb.buff !== 'object') continue;
        var hcb = {};
        for (var hbk in hb.buff) hcb[hbk] = hb.buff[hbk];
        hcb.name = hb.name || '玄诀·效果';
        out.push(hcb);
      }
    }
  } catch (eHB) {}
  return out;
}

function mechSumField(f, field) {
  var s = 0; mechBuffsOf(f).forEach(function (a) { s += Number(a[field] || 0); }); return s;
}

function mechVal(f, key) {                    // 数值求和（crit / critDmg / dr / pierce / lowHpDr …）
  var s = 0;
  mechBuffsOf(f).forEach(function (a) { var v = Number(a[key]); if (isFinite(v)) s += v; });
  return s;
}

function mechFlag(f, key) {                   // 布尔：任一为真
  var hit = false;
  mechBuffsOf(f).forEach(function (a) { if (a[key]) hit = true; });
  return hit;
}

function mechSub(f, key, sub) {               // 二级映射·数值求和（elemAmp['火'] / styleAmp['剑']）
  var s = 0;
  mechBuffsOf(f).forEach(function (a) {
    var m = a[key];
    if (m == null) return;
    if (typeof m === 'number') { if (!sub) s += m; return; }
    if (sub && m[sub] != null) s += Number(m[sub]) || 0;
  });
  return s;
}

function mechStr(f, key) {                    // 字符串（elemFreeMp:'水' / elemAlwaysCrit:'雷'）
  var out = null;
  mechBuffsOf(f).forEach(function (a) { if (a[key]) out = a[key]; });
  return out;
}

function swordIntentCap(f) {
  var cap = 5 + Math.max(0, Math.round(mechVal(f, 'swordIntentMaxBonus')));
  try { if (f && f._swordCapTemp) cap += Math.round(f._swordCapTemp); } catch (eSIC) {}
  return Math.max(1, cap);
}

function xzAttrCapOf(realm) {
  var e = Number(XZ_ATTR_CAP_BY_BIG[xzBigRealmOf(realm)]);
  return (isFinite(e) && e > 0) ? e : 20;
}

function xzAttrTotalCapOf(realm) {
  var t = Number(XZ_ATTR_TOTAL_CAP_BY_BIG[xzBigRealmOf(realm)]);
  return (isFinite(t) && t > 0) ? t : 38;
}

function xzClampFourTotal(four, totalCap) {
  var K = ['力量', '敏捷', '体质', '智力'];
  var cap = Number(totalCap);
  if (!isFinite(cap) || cap <= 0) cap = 38;
  var v = {}, sum = 0, i, k, n;
  for (i = 0; i < K.length; i++) {
    k = K[i];
    n = Number(four && four[k]);
    if (!isFinite(n) || n < 0) n = 0;
    n = Math.floor(n);
    v[k] = n;
    sum += n;
  }
  if (sum <= cap) return { v: v, over: sum, cap: cap, cut: false };
  var raw, used = 0, frac = [];
  for (i = 0; i < K.length; i++) {
    k = K[i];
    raw = v[k] * cap / sum;
    v[k] = Math.floor(raw);
    used += v[k];
    frac.push({ k: k, f: raw - v[k] });
  }
  frac.sort(function (a, b) { return b.f - a.f; });
  var left = cap - used;
  for (i = 0; i < frac.length && left > 0; i++) { v[frac[i].k] += 1; left--; }
  return { v: v, over: sum, cap: cap, cut: true };
}

function _v75ParseEffect(text) {
  var r = { kind: 'narrative', sub: '', dmgFlat: 0, dmgPct: 0, dur: 0, isAuto: false, isBuff: false, isDebuff: false, isControl: false, isHeal: false, isShield: false, isDrain: false, isReduce: false, isHaste: false, isEvade: false, isSlow: false, isVuln: false, isNarrative: true, isNorm: false, summonRaw: '' };
  if (!text || typeof text !== 'string') return r;
  /* ★★★ v296（用户 2026-10-21）：效果值的规范写法 = `机制串｜描写`
     （「npc 每次遇到都得翻译，这会让玩家厌烦…必须有个规范的格式，能够直接不用翻译就给脚本读」）。
     左边机制、右边给人看 —— **解析前必须先把 `｜` 右边切掉**，三个理由：
       ① `伤害:2400｜烧尽三里` 的手数正则会在描写里抓到「三里」当手数（多烧几手）；
       ② 描写里若写「敏捷 +2」，会被下面那段敏捷换算改成一条闪避（凭空多出个效果）；
       ③ 描写里出现机制词（「像灼烧一样疼」）会让自然语言兜底认错方向。
     只认**第一个**竖线，全角 `｜` 与半角 `|` 都认；切完为空说明只写了描写 ⇒ 按无效果处理。 */
  var _barAt = String(text).search(/[｜|]/);
  if (_barAt >= 0) {
    text = String(text).slice(0, _barAt).trim();
    if (!text) return r;
  }
  /* ★★★ v269【入口处把「敏捷 ±N」换算成「闪避 ±3N%」】★★★
     v268 是直接剥掉，v269 用户补了口径（2026-10-20）：
       「如果遇到原文只写有加敏捷的，就翻译成加闪避值就行了，1 敏捷换算成 3% 闪避值。」
     为什么是换算、不是照加敏捷：
       敏捷是**四维属性**，引擎里它同时进 ① 速度公式 (70+敏捷×8)×√境界系数
       ② 守方闪避值（敏捷×0.6+境界档×1.5）—— 一条效果吃三份收益，用户判定「完全超标」。
       换算成**闪避**只碰第 ② 项（而且只碰 dodgeRate 那一层，不再牵动速度与出手序），
       等于「原本想靠敏捷做到的那点闪避」保住了，超标的另外两份被砍掉。
     换算率 1 点敏捷 = 3% 闪避（不是引擎的 0.6，也不是 20 —— 那是两套内部折算，
       玩家看到的口径统一按 3% 走，见《数值表》说明）。
     ⚠ 只换**正值**：负敏捷（「目标敏捷 -2」）没有对应的减闪避通道
       （tempEvadeBoost 只做加法），换算过去会变成"给对方加闪避"的反效果，
       ⇒ 负值整段丢弃，不产生任何原子（宁缺勿反）。
     ⚠ 一句话里既有敏捷又有别的机制时，**别的机制必须保住**：
       所以只替换「敏捷 ±N」这一小段文字，不整句丢。 */
  if (text.indexOf('敏捷') >= 0) {
    var _AGI_XLATE = 3;   /* 1 敏捷 = 3% 闪避值（用户定的换算率） */
    var _segs = String(text).split(/[，,、;；。]/);
    var _keep = [];
    for (var _si = 0; _si < _segs.length; _si++) {
      var _s1 = _segs[_si];
      if (_s1.indexOf('敏捷') < 0) { _keep.push(_s1); continue; }
      /* 取出「敏捷 +N / 敏捷:N / 敏捷提升 N」里的数值（冒号也认：旧缓存里是 `敏捷:3:3`） */
      var _am = _s1.match(/敏捷\s*(?:值)?\s*[:：]?\s*([+＋\-−－]?)\s*(\d+(?:\.\d+)?)\s*[%％]?/);
      if (!_am) continue;                       /* 只提到「敏捷」没数字 ⇒ 无内容，丢这段 */
      var _neg = (_am[1] === '-' || _am[1] === '−' || _am[1] === '－');
      var _av = parseFloat(_am[2]) || 0;
      if (_neg || _av <= 0) continue;           /* 负值不换算（见上） */
      var _evPct = Math.min(50, _av * _AGI_XLATE);   /* 单条封顶 50%，与 tempEvadeBoost 上限一致 */
      /* ★ v269：规范语法 `敏捷:3:3` 的第三个字段是**手数**，改写时必须一起搬走 ——
         只 replace 掉「敏捷:3」会把尾巴 ':3' 留在句子里，结果
         ① 手数认不出 ⇒ 一律按默认 2 手结算（少一手）；
         ② 句尾挂个孤零零的 ':3'，还可能被后面的自然语言正则误读。
         ⇒ 把 ':N' 一并吃掉，改写成解析器认识的「，持续 N 手」。 */
      var _idx1 = _s1.indexOf(_am[0]);
      var _rest1 = _s1.slice(_idx1 + _am[0].length);
      var _handM = /^\s*[:：]\s*(\d+)\s*$/.exec(_rest1);
      var _rep1 = '闪避 +' + _evPct + '%';
      if (_handM) { _rep1 += '，持续 ' + _handM[1] + ' 手'; _rest1 = ''; }
      _keep.push(_s1.slice(0, _idx1) + _rep1 + _rest1);
    }
    var _txtLeft = _keep.join('，').trim();
    if (!_txtLeft) return r;
    text = _txtLeft;
  }
  // 抓数字（含小数、百分号、整数）
  function _pickNum(re) {
    var m = re.exec(text);
    if (m && m[1] !== undefined) {
      var n = parseFloat(m[1]);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }

  /* ───── ① 规范语法分支（确定性，外置 AI 战前翻译的目标格式）───── */
  var _normM = text.match(XZ_ATOM_LINE_RE);
  /* ★ v94 二合一：已废除的原子名（「攻击」「防御」「命中」…）**自动重定向**到新键。
     为什么不直接丢弃：旧存档、旧 AI 译稿里到处都是「攻击:10%」，
     丢掉 = 静默失效（玩家以为写了就生效，这是本项目最贵的一类 bug）。
     重定向既不失效、也不需要重新翻译一遍。 */
  if (_normM && !XZ_ATOM_TYPES[_normM[1]] && typeof XZ_ATOM_RETIRED !== 'undefined' && XZ_ATOM_RETIRED[_normM[1]]) {
    _normM[1] = XZ_ATOM_RETIRED[_normM[1]];
  }
  if (_normM && XZ_ATOM_TYPES[_normM[1]]) {
    var _tp = XZ_ATOM_TYPES[_normM[1]];
    var _rest = text.slice(_normM[0].length);
    /* 数值（带不带 % 都认；修饰类一律按百分数） */
    var _nv = _rest.match(/(\d+(?:\.\d+)?)\s*[%％]?/);
    var _val = _nv ? parseFloat(_nv[1]) : 0;
    var _isPct = !!(_nv && /[%％]/.test(_nv[0]));
    /* 手数：数值后面的第二个数字（「增伤:10:3」的 3） */
    var _hv = _rest.replace(/^[^0-9]*\d+(?:\.\d+)?\s*[%％]?/, '').match(/(\d+)/);
    var _hd = _hv ? parseInt(_hv[1], 10) : 0;
    r.kind = _tp.kind; r.isNorm = true; r.isNarrative = false;
    r.dur = Math.max(0, _hd);
    switch (_tp.kind) {
      case 'damage': case 'dot': case 'heal': case 'shield':
        if (_isPct) r.dmgPct = _val / 100; else r.dmgFlat = _val; break;
      case 'drain': r.dmgPct = _val / 100; break;
      case 'control': r.dur = Math.max(1, _val || _hd); r.isControl = true; break;
      case 'buff':
        r.isBuff = true;
        /* ★ v108：**只有「提速/速度」是绝对值型**（「速度 +3」= 加 3 点速）。
           其余修饰类（增伤/减伤/闪避/暴击/暴伤/回血/回蓝/气血上限/灵力上限…）
           **不写 % 也按百分比** —— 提示词 10471 行的「增伤:10:3」就是 10%，
           这是 v107 前的既有行为，本轮一个字都不许改（改了就是顺手改坏别人）。
           旧写法一律 `/100` ⇒ `提速:3` 被当成 300%，直接爆表。 */
        if (_isPct || _tp.sub !== 'haste') r.dmgPct = _val / 100; else r.dmgFlat = _val;
        r.sub = _tp.sub || '';
        if (_tp.sub === 'dr') r.isReduce = true;
        else if (_tp.sub === 'haste') r.isHaste = true;
        else if (_tp.sub === 'evade') r.isEvade = true;
        break;
      case 'summon':
        /* 只把"冒号之后那一整段"原样存下来，结构交给 xzParseSummon 解析。
           ⚠ 不在这里解析：召唤串里含多个技能，每个技能还要再走一次本函数。
             在这儿解析会变成"解析器调用解析器"，两套逻辑迟早对不上。 */
        r.isNarrative = false;
        r.summonRaw = String(_rest || '').trim();
        r.dur = 0;
        return r;
      case 'debuff':
        r.isDebuff = true;
        /* ★ v108：同上，**只有「减速/迟缓」是绝对值型**（「速度 -3」= 拖 3 点速）；
           其余（虚弱/破防/易伤/削防）不写 % 也按百分比（既有行为，不许动）。 */
        if (_isPct || _tp.sub !== 'slow') r.dmgPct = _val / 100; else r.dmgFlat = _val;
        r.sub = _tp.sub || '';
        if (_tp.sub === 'slow') r.isSlow = true;
        else if (_tp.sub === 'vuln') r.isVuln = true;
        break;
    }
    if (r.kind === 'dot') { /* dot 的手数：没写就 1 手 */ if (!r.dur) r.dur = 1; }
    if ((r.kind === 'buff' || r.kind === 'debuff') && !r.dur) r.dur = 2;   /* 修饰类默认 2 手 */
    if ((r.kind === 'damage' || r.kind === 'heal' || r.kind === 'drain') && !r.dur) r.dur = 0;
    return r;
  }

  /* ───── ② 自然语言兜底（词表补全版）───── */
  // 方向判定：「自身/我方/本方」= 增益侧；「目标/敌方/对方/对手」= 减益侧。
  var _foeSide = /(目标|敌方|对方|对手|敌手|被打者)/.test(text);
  var _selfSide = /(自身|我方|本方|自己|施术者)/.test(text);
  /* 属性词（buff/debuff 子类路由用）—— 命中哪个就走哪条通道 */
  /* ★ v268：`敏捷` 已从属性词里**删除**（用户定：敏捷不许做效果）。
     它原来既在这里被当成提速、又在增益词表里抓绝对值 —— 同一句话两个结论，
     两个都不该有。现在带敏捷的短句在上面的入口处就被剥掉了，走到这里不会再有。 */
  var _attrHaste = /(速度|身法)/.test(text);
  var _attrEvade = /(闪避|躲避)/.test(text);
  var _attrVuln  = /(防御|护甲|易伤|脆弱|破甲|破防)/.test(text);
  var _attrSlow  = /(速度|身法|迟缓|减速|缓慢)/.test(text);
  // 绝对值伤害："造成 X 伤害" / "X 点伤害" / "扣 X 血"
  var _flat = _pickNum(/(?:造成|扣|打出|打掉|轰出|劈出|刺出|斩出|挥出|轰击)\s*(\d+(?:\.\d+)?)\s*(?:点\s*)?(?:伤害|血|点|气)/);
  if (_flat) r.dmgFlat = _flat;
  // 百分比伤害："造成 X% 伤害" / "目标 X% 血"
  var _isDrain = /(吸取|吸血|偷取|汲取|吞噬)/.test(text);
  var _pct = _isDrain ? 0 : _pickNum(/(?:造成|目标|扣)\s*(\d+(?:\.\d+)?)\s*%/);
  if (_pct) r.dmgPct = _pct / 100;
  // 持续：「持续 X 手 / X 回合 / 接下来 X 手」—— 回合与手同义（时序制只有手）
  var _dur = _pickNum(/(?:持续|接下来)\s*(\d+)\s*(?:手|回合)/) || _pickNum(/(\d+)\s*(?:手|回合)/);
  if (_dur) r.dur = _dur;
  // 护盾量："获得护盾 X 点" / "护盾 X"
  /* 护盾量：数字可能在词后（护盾 200）也可能在词前（200 点护盾） */
  var _shield = _pickNum(/(?:护盾|屏障)\s*(\d+(?:\.\d+)?)/)
    || _pickNum(/(\d+(?:\.\d+)?)\s*点?\s*(?:护盾|屏障)/);
  /* ★★ v216b：先认出「明确的伤害句」，再走原来的 kind 链 ★★
     事故（用户实测：焰刃斩只能点自己、被当成增益）：
       原文「一枪刺出，对目标造成 12 点伤害」这类句子，原来会掉进下面的**减益**分支 ——
       该分支最后一条是 `_foeSide && !_selfSide && /(…|伤害|…)/`，
       只要句子里有「目标/敌方」+「伤害」二字就判 debuff。
       于是 kind≠damage ⇒ 本击伤害一分不算、招式还被当成不打架的增益。
     修法：句子里有**伤害动词 + 数字 + 伤害**时，先落 damage；
       但句子里同时出现 DOT / 控制 / 护盾 / 吸血这些**第二种机制**时不动
       （那种句子由下面的分支处理，它们本来就是「打了还附带状态」）。
     ⚠ 只认「造成/打出/刺出…+数字+伤害」，「使目标受到的伤害提高 20%」没有伤害动词，
       仍然走减益（易伤），不许被这条抢走。 */
  var _hasDmgVerb = /(?:造成|打出|打掉|轰出|劈出|刺出|斩出|挥出|轰击)/.test(text);
  var _explicitDmg = _hasDmgVerb && /\d+(?:\.\d+)?\s*(?:点\s*)?(?:[\u4e00-\u9fa5]{0,4})?伤害/.test(text);
  var _secondMech = /(每[手回]|持续受到|灼烧|中毒|流血|腐蚀|冰封|眩晕|晕眩|禁锢|沉默|定身|定住|封印|封住|束缚|麻痹|僵直|石化|冰冻|动弹不得|不能行动|无法行动|无法移动|无法出手|擒住|锁住|护盾|屏障|吸血|吸取|汲取)/.test(text);
  var _pureDmg = _explicitDmg && !_secondMech;
  // kind 判定（按出现顺序：明确伤害 → DOT → 控制 → 吸血 → 护盾 → 减益 → 增益 → 治疗 → 伤害）
  if (_pureDmg) {
    r.kind = 'damage';
  } else if (/每[手回]合?\s*(?:扣|掉|流失|减少|扣除|损失)|灼烧|中毒|流血|腐蚀|持续受到|持续损失|dot/i.test(text)
      || (/每[手回]/.test(text) && /气血|血|伤害/.test(text) && !/回复|恢复|治疗/.test(text))) {
    r.kind = 'dot';
    if (r.dmgPct === 0 && r.dmgFlat === 0) {
      var _dotFlat = _pickNum(/每[手回]合?[^0-9]{0,6}(\d+(?:\.\d+)?)/);
      var _dotPct = _pickNum(/每[手回]合?[^0-9]{0,6}(\d+(?:\.\d+)?)\s*%/);
      if (_dotPct) r.dmgPct = _dotPct / 100;
      else if (_dotFlat) r.dmgFlat = _dotFlat;
    }
    if (!r.dur) r.dur = 1;
  } else if (/冰封|眩晕|晕眩|禁锢|沉默|定身|定住|封印|封住|束缚|麻痹|僵直|石化|冰冻|动弹不得|不能行动|无法行动|无法移动|无法出手|擒住|锁住/i.test(text)) {
    r.kind = 'control';
    r.isControl = true;
  } else if (_isDrain) {
    r.kind = 'drain';
    r.isDrain = true;
    r.dmgPct = _pickNum(/(\d+(?:\.\d+)?)\s*%/) / 100;   // 吸血按目标气血百分比
  } else if (_shield > 0 || /护盾|屏障/.test(text)) {
    r.kind = 'shield';
    r.isShield = true;
    r.dmgFlat = _shield;
  } else if (
    /* ★ 减益：削弱敌手。必须排在 buff 之前 ——「减伤 30%」给自己是 buff、给敌手是 debuff。
       排除两类自用写法：①「自身/我方 + 受到伤害/减伤」护身；②无方向词的「减伤/护体」默认自护。 */
    !(_selfSide && /(受到伤害|所受伤害|自身|减伤|护体|护盾)/.test(text))
    && !(/(减伤|护体|护盾|受到伤害|所受伤害)/.test(text) && !_foeSide)
    && (/降低|削减|削弱|减少|下降|减速|降攻|降防|降速|破甲|易伤|脆弱|虚弱|弱化|力竭|迟缓|变弱|封住|无力|气息一乱|失衡/.test(text)
        || /[攻防速命闪伤][击防度中避害甲]\s*[-−－]\s*\d+/.test(text)
      || /(攻击|伤害|输出|防御|护甲|速度|身法|命中|闪避|威力|最终伤害)\s*[-−－]\s*\d+/.test(text)
      || (_foeSide && !_selfSide && /(减伤|抗性|防御|闪避|命中|先手|攻|伤害|输出|速度|身法)/.test(text)))) {
    r.kind = 'debuff';
    r.isDebuff = true;
    r.dmgPct = _pickNum(/(\d+(?:\.\d+)?)\s*[%％]/) / 100;
    /* ★ v108：绝对值减益（「速度 -3」）—— 与 buff 侧同一个缺口，一起补。
       ⚠ 同样只抓**减速类**（_attrSlow）：其余属性没有对应字段，不假装生效。 */
    if (!/[%％]/.test(text) && _attrSlow) {
      var _dflat = _pickNum(/(?:速度|身法|迟缓|减速)\s*[-−－]\s*(\d+(?:\.\d+)?)/)
        || _pickNum(/[-−－]\s*(\d+(?:\.\d+)?)\s*(?:速度|身法)/);
      if (_dflat > 0) r.dmgFlat = _dflat;
    }
    /* 子类：减速 → slowRounds 通道；破防 → 承伤增加通道；其余 → 削输出通道 */
    if (_attrSlow) r.isSlow = true;
    else if (_attrVuln) r.isVuln = true;
  } else if (/\+\s*\d+\s*[%％]?\s*(增伤|伤害|攻击|输出|威力|命中|会心|暴击)|增伤\s*\d+\s*[%％]?|(伤害|攻击|输出|威力|最终伤害|命中|会心|暴击|暴击率|速度|身法|闪避|防御|护体)\s*[+＋]\s*\d+\s*[%％]?|\d+\s*[%％]\s*(增伤|伤害提升|伤害提高|攻击提升)|减伤\s*\d+\s*[%％]?|\+\s*\d+\s*命中|命中\s*\+\s*\d+|(伤害|攻击|输出|威力|最终伤害).{0,2}(加|提升|提高|增加)\s*\d+\s*[%％]/i.test(text)
             || (/(受到伤害降低|所受伤害降低|减伤|护体|护盾|闪避|抗性)/.test(text) && !_foeSide && /\d+\s*[%％]/.test(text))) {
    /* ★ 增益：给自己/我方的加成。含「受到伤害降低 X%」「攻击+X%」「伤害提升 X%」等。 */
    r.kind = 'buff';
    r.isBuff = true;
    r.dmgPct = _pickNum(/(\d+(?:\.\d+)?)\s*[%％]/) / 100;
    /* ★★ v108：绝对值增益（「速度 +5」）—— 词表**只认百分比**，
        绝对值被上面那句 `_pickNum(/(\d+…)\s*[%％]/)` 吃成 0 ⇒ 整条落 narrative
        ⇒ 状态一个没挂、日志一行不打（静默失效，本工程最贵的一类）。
        ⚠ v268：`敏捷` 已从这里**删除** —— 敏捷不许做效果（用户定，一投三吃太超标）。
           现在只有「身法/速度」抓绝对值；带敏捷的短句早在函数入口就被剥掉了。
        ⚠ 只抓**提速类**（_attrHaste）的绝对值：其余属性的绝对值（「攻击 +5」）
           引擎没有对应字段，抓了也落不下去 ⇒ 如实落 narrative 让 v107 留痕报出，
           绝不假装生效。这与规范语法分支按 `sub==='haste'` 分流是同一条口径。 */
    if (!/[%％]/.test(text) && _attrHaste) {
      var _bflat = _pickNum(/(?:身法|速度)\s*[+＋]\s*(\d+(?:\.\d+)?)/)
        || _pickNum(/[+＋]\s*(\d+(?:\.\d+)?)\s*(?:身法|速度)/);
      if (_bflat > 0) r.dmgFlat = _bflat;
    }
    /* ★ v268：**一点数值都没有的「增益」落 narrative**。
       典型是「身法拔高，先手更稳」这种只有形容词的句子 —— 原来它靠被禁止的
       「敏捷 +3」拿数值，现在撤掉之后如果还判 buff，就会挂出一个
       「增伤 0%」的空名签（状态栏亮了、实际什么都没变）。
       v107 的口径是「零报错才是最贵的失效」⇒ 如实判叙事，让它被留痕报出来。 */
    if (r.dmgFlat <= 0 && r.dmgPct <= 0) r.kind = 'narrative';
    /* ★ 子类路由（v86）：
       增伤（攻击/伤害/输出/命中/暴击）→ v75BuffPct（自己出手更疼）
       护身（防御/减伤/受到伤害降低）  → v75DrPct（自己挨打更少）
       提速（速度/身法）               → 临时 spd（时序制拉条）
       闪避                           → tempEvadeBoost（dodgeRate 真消费）
       原先「受到伤害降低 15%」落 v75BuffPct 变成增伤的 bug 已分流 isReduce。 */
    r.isReduce = /受到伤害降低|受到伤害减少|所受伤害降低|所受伤害|伤害降低|伤害减少|减伤|护体|护身|防御|抗性提高/.test(text);
    if (_attrHaste) r.isHaste = true;
    if (_attrEvade) r.isEvade = true;
  } else if (/治疗|恢复|回复|回\s*\d+\s*血|回\s*\d+\s*%/.test(text)) {
    r.kind = 'heal';
    r.isHeal = true;
    /* ★ v86 修复：治疗百分比。原写法只抓 flat ——「回复 20% 气血」被当成回 20 点、
       「恢复自身30%气血」直接数值全丢（回 0 点）。现在 % 优先、点数兜底。 */
    var _healPct = _pickNum(/(?:回复|恢复|治疗|回)[^0-9%]{0,3}(\d+(?:\.\d+)?)\s*[%％]/);
    if (_healPct) { r.dmgPct = _healPct / 100; }
    else { r.dmgFlat = _pickNum(/(?:回复|恢复|治疗|回)\s*(\d+(?:\.\d+)?)(?!\s*[%％])/); }
  } else if (r.dmgFlat > 0 || r.dmgPct > 0) {
    r.kind = 'damage';
  } else {
    r.kind = 'narrative';
  }
  r.isNarrative = (r.kind === 'narrative');

  /* ★★ v108：自然语言兜底的 buff/debuff **必须补默认手数** ——
     规范语法分支早就补了（上方 `if ((r.kind==='buff'||r.kind==='debuff') && !r.dur) r.dur = 2;`），
     自然语言这条一直没补 ⇒「速度 +3」（没写持续）解析出 dur=0
     ⇒ applyV75Effects 里 `v75HasteRounds = Math.max(0, 0)` = 0
     ⇒ processHandBuffs 的 `if (_hR > 0)` 进不去 ⇒ **spd 改了却永不恢复**（永久加速）。
     这是「同一份数据两种写法两个结果」（bug ⑥）：`提速:3` 有默认 2 手、「速度 +3」没有。
     ⚠ 只补 buff/debuff —— control 的既有行为（无 dur ⇒ hardStunRounds=0 ⇒ 没控住）
       是**安全侧**的失败，不动它（改了反而可能变成永久硬控）。 */
  if ((r.kind === 'buff' || r.kind === 'debuff') && !r.dur) r.dur = 2;

  /* ★ v77 isAuto 判定。**必须放在最后**——要等所有数值/类型都解析完才能判。
     原 bug：`text.indexOf('auto') >= 0` 是子串匹配，玩家在效果描述里提到
     「auto」一词（触发 auto 反击 / 继承上一招 auto 的伤害），整条效果就被当成
     auto 占位符，改走 QUALITY_POWER × 境界系数兜底，**玩家写的字面数值被静默丢弃**。
     定稿判据锚在真实危害上：只要句中已解析出任何实质内容（数值或效果类型），
     一律不判 auto。「造成 auto 伤害」这类没写数字的模板写法才走 auto 公式。 */
  if (r.dmgFlat <= 0 && r.dmgPct <= 0 && !r.isBuff && !r.isDebuff && !r.isControl && !r.isHeal && !r.isShield && !r.isDrain) {
    if (/^\s*auto\s*(\/.*)?$/i.test(text) || /\bauto\b(?=\s*[^一-龥]|$)/i.test(text)) r.isAuto = true;
  }
  return r;
}

function xzNameKey(map, name) {
  if (!map || name === undefined || name === null) return null;
  var nm = String(name);
  if (map[nm]) return nm;
  var flat = nm.replace(/\s+/g, '');
  var ks = Object.keys(map);
  for (var i = 0; i < ks.length; i++) {
    if (String(ks[i]).replace(/\s+/g, '') === flat) return ks[i];
  }
  return null;
}

function xzSkillKey(map, skillName) {
  if (!map || skillName === undefined || skillName === null) return null;
  var direct = xzNameKey(map, skillName);
  if (direct) return direct;
  var strip = function (s) {
    return String(s).replace(/^\s*(?:玄技|玄诀|神通|功法|本领|技能)\s*[·•\-—_\/:：]?\s*/, '')
      .replace(/[·•\-—_\/:：]/g, '').replace(/\s+/g, '');
  };
  var want = strip(skillName);
  if (!want) return null;
  var ks = Object.keys(map);
  for (var i = 0; i < ks.length; i++) {
    var a = strip(ks[i]);
    if (a && a === want) return ks[i];
  }
  return null;
}

function xzSkillAtomsOf(name, skillName) {
  var st = xzTransStore();
  var k = xzNameKey(st.byName, name);
  if (!k) return [];
  var sk = (st.byName[k] || {}).skills || {};
  var kk = xzSkillKey(sk, skillName);
  return kk ? (sk[kk] || []) : [];
}

function xzHitBonusOf(skill) {
  try {
    var q = String((skill && (skill.品质 || skill.quality)) || '').replace(/阶$/, '') + '阶';
    var v = XZ_HIT_BONUS[q];
    return (typeof v === 'number') ? v : 0;
  } catch (eH) { return 0; }
}

function xzEvadeValueOf(u) {
  try {
    var agi = Number(u && (u.agi !== undefined ? u.agi
      : (u.four && u.four.敏捷) || (u.四维 && u.四维.敏捷))) || 0;
    /* ★ v268：闪避值只吃**建卡四维**的敏捷 —— 没有任何效果能临时抬高它。 */
    /* 境界档位（0 起） */
    var rIdx = 0;
    try {
      var rn = String((u && (u.境界 || u.realm)) || '');
      var keys = Object.keys(XZ_LEVEL_COEFF);
      for (var i = 0; i < keys.length; i++) { if (rn.indexOf(keys[i]) >= 0) { rIdx = i; break; } }
    } catch (eR) {}
    /* 词条类闪避（血脉 / 大道 / 临时）：百分比 × 20 折成点数（d20 满分 20） */
    var pts = 0;
    try { pts += (Number(u && u.tempEvadeBoost) || 0) * 20; } catch (e1) {}
    /* ★ v270：常驻闪避（武器/玄诀/血脉被动）—— 以前它写在 tempEvadeBoost 上，
       手数 9999 永不递减，还会把招式临时闪避顶成永久。现在独立进 _xzPerm。 */
    try { pts += xzPermOf(u).evade * 20; } catch (ePerm) {}
    try {
      (u.bloodBuffs || []).forEach(function (bb) {
        if (bb && bb.buff) pts += (Number(bb.buff.evade) || 0) * 20;
      });
    } catch (e2) {}
    try {
      (u.daoBuffs || []).forEach(function (db) {
        if (db && db.buff && db.buff.evade) pts += (Number(db.buff.evade) || 0) * 20;
      });
    } catch (e3) {}
    var v = agi * 0.6 + rIdx * 1.5 + pts;
    /* 封顶 15：d20 上限 20，攻方最大约 20+8=28 ⇒ 闪避值再高就永远打不中了 */
    return Math.min(15, Math.round(v * 10) / 10);
  } catch (e) { return 0; }
}

function xzHitCutOf(attacker, skill) {
  var cut = 0;
  try { cut += Number(xzHitBonusOf(skill)) || 0; } catch (e1) {}        /* 品质：凡0…神8 */
  /* ★ v272：删掉 `attacker.v75HitFlat` 那行 —— 全仓零写入点，恒为 undefined，
     `cut += 0` 白算一次（v260 起攻方已无「命中加值」这个概念）。 */
  return cut;
}

function _v228RealmRoot(name) {
  var s = String(name == null ? '' : name);
  var PAIRS = { '玄帝': '帝境', '穹主': '穹境' };
  for (var pk in PAIRS) if (s.indexOf(pk) !== -1) return PAIRS[pk];
  for (var rk in XZ_LEVEL_COEFF) if (s.indexOf(rk) !== -1) return rk;
  return s;
}

function xzRollHit(attacker, defender, skill) {
  var roll = 1 + Math.floor(Math.random() * 20);
  /* ★ v260：判定 = d20 + 基础命中(12) + 攻方削减 − 守方闪避值。
     攻方**没有**命中加值（敏捷不再加命中，只影响速度与守方闪避值）。 */
  var evadeVal = xzEvadeValueOf(defender);
  var cut = xzHitCutOf(attacker, skill);
  var qBonus = xzHitBonusOf(skill);
  var agiBonus = 0;              /* v260：攻方敏捷不再提供命中加值 */
  var bonus = cut;
  var dodge = evadeVal;          /* 守方闪避值（已含敏捷/境界/词条） */
  var total = roll + 12 + cut - dodge;
  /* 同大境界保底：条目第 133 行「同境界不会落空，最差险中」。
     ⚠ 这里**直接比字符串里的十二大境名**，不查 REALM_COEFFS ——
       查表会踩两个坑：① 专称（玄帝/穹主）不带大境名，字符串查不到；
       ② 退化成拿「系数」当「档位」比（引玄初期 1.00 ≠ 引玄中期 1.04，
       但两者是**同一个大境界**，按系数比永远判不出「同境」）。
       判据只有一个问题要回答：是不是同一个大境界。 */
  var sameRealm = false;
  try {
    var a = String((attacker && (attacker.境界 || attacker.realm)) || '');
    var d = String((defender && (defender.境界 || defender.realm)) || '');
    if (a && d) sameRealm = (_v228RealmRoot(a) === _v228RealmRoot(d));
  } catch (eS) {}
  var mode;
  if (total >= 12) mode = '命中';
  else if (total >= 7) mode = '险中';
  else mode = sameRealm ? '险中' : '落空';
  if (sameRealm && mode === '落空') mode = '险中';
  return {
    mode: mode, roll: roll, qBonus: qBonus, agiBonus: agiBonus, bonus: bonus, dodge: dodge, total: total,
    note: '【落档 d' + roll + ' +基础12'
          + (cut ? (' −削闪避' + cut) : '') + ' −闪避值' + evadeVal
          + ' = ' + total + '｜' + (mode === '落空' ? '落空（对方闪开）' : mode) +
          (mode === '险中' ? '（伤害减半）' : '') + '】'
  };
}

function xzEffKeyOf(effKey, parsed) {
  var k = String(effKey === undefined || effKey === null ? '' : effKey).trim();
  var p = parsed || {};
  if (p.sub && XZ_SUB_LABEL[p.sub]) return XZ_SUB_LABEL[p.sub];
  if (p.isEvade) return '闪避';
  if (p.isHaste) return '提速';
  if (p.isReduce) return '减伤';
  if (p.isSlow) return '减速';
  if (p.isVuln) return '破防';
  /* ★ v262：DOT（灼烧/中毒/流血/腐蚀）原子表里都没有 sub ⇒ 引擎内部统一按
     机制名「灼烧」结算；界面显示另有 e.name（玩家自己起的效巢名）优先。 */
  if (p.kind === 'dot') return '灼烧';
  if (p.kind && XZ_KIND_LABEL[p.kind]) return XZ_KIND_LABEL[p.kind];
  return k;
}

function xzPermOf(f) {
  if (!f) {
    var _t = {};
    for (var _j = 0; _j < XZ_PERM_KEYS.length; _j++) _t[XZ_PERM_KEYS[_j]] = 0;
    return _t;
  }
  if (!f._xzPerm || typeof f._xzPerm !== 'object') f._xzPerm = {};
  var p = f._xzPerm;
  for (var i = 0; i < XZ_PERM_KEYS.length; i++) {
    var k = XZ_PERM_KEYS[i];
    if (typeof p[k] !== 'number' || !isFinite(p[k])) p[k] = 0;
  }
  return p;
}

function xzCritRateOf(f, defender, opt) {
  if (!f) return 0;
  opt = opt || {};
  var isSkill = (opt.isSkill === undefined) ? true : !!opt.isSkill;
  var sk = opt.skill || null;
  var r = Number(f.critRate);
  if (!isFinite(r)) r = 0.05;
  try {
    if ((Number(f.tempCritRounds) || 0) > 0) r += Number(f.tempCritBoost) || 0.25;
    r += xzPermOf(f).crit;
    /* 「暴击提升」三个落点：招式 effects / 玄诀·血脉 passive / 武器 artifact。
       ★ 全覆盖探针 2026-10-14：旧口径只读 skill.effects，挂玄诀/武器的那条整条死亡。
         现在三处并检，0.45 只加一次（与 calcDamage 的 if/else-if 结构同义）。 */
    var _hit = false;
    if (isSkill && sk && sk.effects && sk.effects.indexOf('暴击提升') !== -1) { r += 0.45; _hit = true; }
    if (!_hit) {
      var _pe = (f.passive && f.passive.effects) || [];
      var _ae = (f.artifact && f.artifact.effects) || [];
      if (_pe.indexOf('暴击提升') !== -1 || _ae.indexOf('暴击提升') !== -1) r += 0.45;
    }
    if ((Number(f.lustStacks) || 0) > 0) r += Math.min(0.30, (Number(f.lustStacks) || 0) * 0.06);
    if (isSkill) {
      if ((Number(f.swordIntent) || 0) > 0) r += (Number(f.swordIntent) || 0) * 0.05;
      if ((Number(f.tongmingRounds) || 0) > 0) r += 0.20 + (Number(f.swordIntent) || 0) * 0.02;
      r += Math.min(0.40, mechSumField(f, 'crit'));
    }
  } catch (eCR) {}
  /* 守方侧：[灵台空明] 被暴击率 −30%（passive 与 weapon 两处并检），抗暴原子 */
  if (defender) {
    try {
      if ((defender.passive && defender.passive.effects && defender.passive.effects.indexOf('灵台空明') !== -1)
        || (defender.artifact && defender.artifact.effects && defender.artifact.effects.indexOf('灵台空明') !== -1)) r -= 0.30;
      if ((Number(defender.v94AntiCrit) || 0) > 0) r -= Number(defender.v94AntiCrit);
    } catch (eCRd) {}
  }
  return Math.max(0, Math.min(0.75, r));
}

function xzDrOf(f, ctx) {
  if (!f) return 0;
  var v = 0;
  try {
    v = ((Number(f.v75DrPct) > 0 && (Number(f.v75DrRounds) || 0) > 0) ? Number(f.v75DrPct) : 0)
      + xzPermOf(f).dr
      + (ctx && ctx.selfReduce ? Number(ctx.selfReduce) || 0 : 0);
    v = Math.min(0.75, v);
  } catch (eDR) {}
  return Math.round(v * 1000) / 1000;
}

function xzVulnOf(f, ctx) {
  if (!f) return 0;
  var v = 0;
  try {
    var pj = Number(v2StateVal(f, '破甲')) || 0;
    var pjPer = (V2_STATES && V2_STATES['破甲'] && V2_STATES['破甲'].vuln) ? V2_STATES['破甲'].vuln : 0.06;
    /* ⚠ 这里**不许**再写 `? ... : mechSumField(f,'pierce')` 这种回落（见上 ① ②） */
    var _atomPv = (ctx && ctx.atomPierceVuln) ? Number(ctx.atomPierceVuln) || 0 : 0;
    v = Math.min(0.6,
      ((Number(f.v75VulnPct) > 0 && (Number(f.v75VulnRounds) || 0) > 0) ? Number(f.v75VulnPct) : 0)
      + xzPermOf(f).vuln
      + Math.min(0.30, pj * pjPer)
      + Math.min(0.30, _atomPv)
      + ((Number(f.markRounds) || 0) > 0 ? 0.15 : 0));
  } catch (eVU) {}
  return Math.round(v * 1000) / 1000;
}

function xzAtomNameOf(t) {
  var s = String(t === undefined || t === null ? '' : t).trim();
  if (!s) return '';
  var m = s.match(/^([^:：,，、;；|]+)/);
  var nm = m ? m[1].trim() : s;
  nm = nm.replace(/\s*[+＋]\s*\d+(?:\.\d+)?\s*%?$/, '').trim();
  return nm || s;
}

/* ══════════ 统一出口 ══════════
   卡内不需要这一段（04 里这些是裸的全局函数，互相直呼）。
   这一段只给「独立调用」用：任何地方 import 进来就能拿到这张表，
   不污染全局、不依赖加载顺序。

   ⚠⚠ v394 补的：**常量也必须导出**。
     上一版只导函数。而 04 改成 CDN 调用以后，REALM_COEFFS / QUALITY_POWER
     这些表在 04 里要写成「var 表名 = __XZ_B.表名」——
     引擎不导出，那 25 个 var 全是 undefined，整个数值层静默失效
     （不报错、不是 NaN，是"表不存在"，比 NaN 更难查）。
     漏的原因很朴素：抽的时候常量跟着函数一起进来了，导出时只照着函数列表写。 */
export {
  setTransStore,
  xzLevelCoeffOf,
  normalizeRealm,
  xzNormRealmName,
  realmMultByName,
  xzSkillMpOf,
  qualityPowerOf,
  xzBigRealmOf,
  xzSkillCapOf,
  xzClampToCap,
  v81CapEffectKeys,
  realmRank,
  xzTrackAdd,
  xzEffMechOf,
  xzEffLineOf,
  v2StateVal,
  v2StateSet,
  parseBloodEffect,
  atomHas,
  mechBuffsOf,
  mechSumField,
  mechVal,
  mechFlag,
  mechSub,
  mechStr,
  swordIntentCap,
  xzAttrCapOf,
  xzAttrTotalCapOf,
  xzClampFourTotal,
  _v75ParseEffect,
  xzNameKey,
  xzSkillKey,
  xzSkillAtomsOf,
  xzHitBonusOf,
  xzEvadeValueOf,
  xzHitCutOf,
  _v228RealmRoot,
  xzRollHit,
  xzEffKeyOf,
  xzPermOf,
  xzCritRateOf,
  xzDrOf,
  xzVulnOf,
  xzAtomNameOf,
  TRACK_MAX_DISTANCE,
  REALM_COEFFS,
  XZ_LEVEL_COEFF,
  XZ_LEVEL_SUBSTEP,
  REALM_ALIAS,
  XZ_SKILL_MP_BY_QUALITY,
  QUALITY_POWER,
  XZ_PEAK_COEFF,
  XZ_UPGRADE_HEADROOM,
  XZ_HEAL_RATIO,
  XZ_SHIELD_RATIO,
  V81_EFFECT_CAP,
  REALM_TIER_KEYS,
  XINFA_TABLE,
  V2_STATES,
  BLOOD_EFFECT_KEYS,
  XZ_ATOM_TYPES,
  XZ_ATOM_RETIRED,
  XZ_ATOM_LINE_RE,
  XZ_ATTR_CAP_BY_BIG,
  XZ_ATTR_TOTAL_CAP_BY_BIG,
  XZ_HIT_BONUS,
  XZ_SUB_LABEL,
  XZ_KIND_LABEL,
  XZ_PERM_KEYS,
};

/* 天元录 · 战斗引擎（battle-engine）独立挂载入口
   ═════════════════════════════════════════════════════════════════════════════
   用法（SillyTavern 脚本 / 任意浏览器页面都行，一行就够）：

     import 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/xz-battle-engine@main/index.js'

   这条 import 执行完，`window.XZBattle` 就挂好了，不用 await、不用赋值：

     window.XZBattle.parseEffect('伤害:2400｜烧尽三里')   // → { kind:'damage', dmgFlat:2400, ... }
     window.XZBattle.clampToCap(9999, '玄阶', '玄枢后期', '伤害')
     window.XZBattle.critRate(atk, def)                    // → 0.35
     window.XZBattle.rollHit(atk, def, skill)              // → { mode:'命中', total:17.5, note:'…' }

   ⚠ 为什么是「副作用自挂载」而不是 `const x = await import(...)`：
     参考 Alice233-Alice/Apeiria 的成卡做法 —— 一个功能一个中文目录、里面只有
     index.js、结尾自己绑监听自己报日志。玩家在 ST 的「脚本」里贴一行就能用，
     不需要懂什么是 default export。桌面上多一个 window 属性不占任何东西。

   ⚠ 这里是**浏览器/ST 通道**：core.js 是标准 ES module，本文件负责把它翻译成
     「挂到 window 上」的心智模型。Node 里想程序化调用，直接 import core.js 更好。
   ───────────────────────────────────────────────────────────────────────────── */

import * as core from './src/core.js';

/* ══════════ 版本号 ══════════
   ⚠ 每次改 04 重抽后**必须**手动+1，否则玩家的 ST 会一直吃 jsdelivr 的 12 小时缓存，
     还在跑旧内核，而且看起来「更新没生效」却查不出原因。
     一键更新脚本（工具/发布.sh）会自动做这件事，不用手改。 */
const VERSION = '1.3.36';

/* ══════════ 对外门面 ══════════
   不是把 core 的 42 个函数原样倒出去 —— 那样调用方根本不知道该用哪个。
   这里按「你要干什么」分组，每个都配一句大白话说明。 */
const XZBattle = {
  version: VERSION,

  /* ── 效果文本 → 结构化 ─────────────────────────────────────── */
  /** 解析一条招式/装备/血脉效果文本。`伤害:2400｜烧尽三里` 这种「机制串｜描写」会自动切掉描写。 */
  parseEffect: core._v75ParseEffect,
  /** 解析血脉效果：返回常驻机制键（crit / dr / pierce …）。 */
  parseBlood: core.parseBloodEffect,
  /** 从一条效果文本里取原子名（「伤害 +5%」→「伤害」）。 */
  atomName: core.xzAtomNameOf,
  /** 效果键归一化：把各种写法收成引擎认的键。 */
  effKey: core.xzEffKeyOf,
  /** 生成给人看的效果行，如「伤害 2400」。 */
  effLine: core.xzEffLineOf,

  /* ── 境界 / 品阶 换算 ─────────────────────────────────────── */
  /** 「凝府中期」→「凝府」。查表前都要过这一层。 */
  bigRealm: core.xzBigRealmOf,
  /** 境界全名归一（「凝府 中期」→「凝府中期」）。 */
  normRealm: core.xzNormRealmName,
  /** 境界数值系数，如 玄枢 → 1.5x。 */
  realmCoeff: core.xzLevelCoeffOf,
  /** 境界倍率（按名字，含别名）。 */
  realmMult: core.realmMultByName,
  /** 境界排序权重，用来判「谁境界高」。 */
  realmRank: core.realmRank,
  /** 品阶基准威力：凡 16 / 黄 24 / 玄 41 / 地 57 / 天 73 / 神 85。 */
  qualityPower: core.qualityPowerOf,
  /** 招式的定档上限（按品阶+境界+类型）。 */
  skillCap: core.xzSkillCapOf,
  /** 把任意数值钳进定档区间。 */
  clampToCap: core.xzClampToCap,
  /** 招式耗灵（按品阶与目标数）。 */
  skillMp: core.xzSkillMpOf,
  /** 效果键的数量上限（防 AI 一次塞十几个）。 */
  capEffectKeys: core.v81CapEffectKeys,

  /* ── 四维 ─────────────────────────────────────────────────── */
  /** 四维**单项**上限（按大境界：引玄 9 → 帝境 20）。 */
  attrCap: core.xzAttrCapOf,
  /** 四维**总量**上限（= 2×单项−2，帝境 38；保证不可能双满）。 */
  attrTotalCap: core.xzAttrTotalCapOf,
  /** 把一组四维压进总量上限（按比例缩 + 最大余额补回）。 */
  clampFour: core.xzClampFourTotal,

  /* ── 战斗判定（一次交手的四步） ────────────────────────────── */
  /** 命中判定：掷 d20 + 境界基础 − 削闪避 − 闪避值。返回 {mode, total, note}。 */
  rollHit: core.xzRollHit,
  /** 命中加成（按招式品阶）。 */
  hitBonus: core.xzHitBonusOf,
  /** 守方闪避值。 */
  evadeValue: core.xzEvadeValueOf,
  /** 暴击率。 */
  critRate: core.xzCritRateOf,
  /** 减伤率（守方）。 */
  dr: core.xzDrOf,
  /** 承伤放大率（破防/易伤）。 */
  vuln: core.xzVulnOf,
  /** 常驻加成汇总（crit / dr / pierce …）。 */
  perm: core.xzPermOf,

  /* ── 机制读写（引擎的「属性袋」） ─────────────────────────── */
  /** 读一个数值机制（同键多条会自动求和）。 */
  mechVal: core.mechVal,
  /** 读一个布尔机制。 */
  mechFlag: core.mechFlag,
  /** 读一个字符串机制（如 elemFreeMp:'水'）。 */
  mechStr: core.mechStr,
  /** 读二级映射（elemAmp['火'] / styleAmp['剑']）。 */
  mechSub: core.mechSub,
  /** 汇总某字段在所有机制里的和。 */
  mechSumField: core.mechSumField,
  /** 汇总一个人的全部机制（一次遍历拿全）。 */
  mechBuffs: core.mechBuffsOf,
  /** 剑意上限。 */
  swordIntentCap: core.swordIntentCap,
  /** 轨迹推进（±delta，自动钳进 0..1000）。 */
  trackAdd: core.xzTrackAdd,

  /* ── 招式原子 ─────────────────────────────────────────────── */
  /** 某人某招翻译出来的原子列表。 */
  skillAtoms: core.xzSkillAtomsOf,
  /** 名称容错查找（「张三 」也能命中「张三」）。 */
  nameKey: core.xzNameKey,
  /** 招式名容错查找。 */
  skillKey: core.xzSkillKey,

  /* ── 翻译缓存注入 ─────────────────────────────────────────── */
  /** 注入「效果翻译缓存」。不注入的话 skillAtoms 恒返回空数组（安全侧）。 */
  setTransStore: core.setTransStore,

  /* ── 逃生口 ───────────────────────────────────────────────── */
  /** 42 个原始函数全在这里，上面没包到的自己拿。 */
  raw: core,
};

/* ══════════ 挂载 ══════════ */
if (typeof window !== 'undefined') {
  window.XZBattle = XZBattle;
  /* 防止重复 import 时刷屏（ST 里热重载会跑两遍） */
  if (!window.__XZ_BATTLE_READY__) {
    window.__XZ_BATTLE_READY__ = true;
    const nFn = Object.keys(core).filter((k) => typeof core[k] === 'function').length;
    console.info('[天元录·战斗引擎] v' + VERSION + ' 已就绪 → window.XZBattle（' + nFn + ' 个函数）');
  }
}

export default XZBattle;
export { XZBattle, VERSION };

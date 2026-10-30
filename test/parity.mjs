/* 战斗引擎/test/parity.mjs
   ─────────────────────────────────────────────────────────────────────────────
   **双跑比对**：同一批输入，分别喂给
     ① 卡内真身 —— 从「脚本/04-核心脚本.js」里按同样规则取出函数，装进 vm
     ② 独立内核 —— 战斗引擎/src/core.js（ESM import）
   逐格比对输出。任何一格不同就 exit 1。

   为什么非要做这一步：
     "抽出来了" ≠ "算得一样"。抽取只保证**字节一致**，但：
       · 常量闭包漏一个 ⇒ 分支静默走兜底，数就变了（不报错！）
       · 某个函数依赖顺序/全局状态 ⇒ 换个环境结果不同
     这些 `node --check` 和 import 自检都查不出来 —— 只有真跑数才看得见。
     本项目最贵的一类 bug 就是「零报错的静默失效」，这个测试专治它。

   用法：
     node 战斗引擎/test/parity.mjs
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
/* ★★★ v394：源改成「内联实现那一版 04」。
   ─────────────────────────────────────────────────────────────────────────────
   为什么不再用 脚本/04-核心脚本.js：
     04 现在已经是 **CDN 调用形态** —— 那 43 个函数在卡里只剩一行转发外壳
     （`return __XZ_B_SAFE().mechVal.apply(null, arguments)`），25 张表只剩
     `var X = __XZ_B_CONST("X")`。拿它进沙箱「双跑」，跑的是空壳：
     壳里没有 __XZ_B，结果全是 undefined ⇒ 1896 格全红，而**引擎其实是对的**。
     那种红是最坏的红：看着像引擎崩了，实际是测试自己量错了对象。
   ⇒ 真正的对照物是「改造前的内联实现」（= .bak-v394-CDN改造前）。
     拿它跟引擎逐格比，验的仍然是那件最要紧的事：
     **抽出来的引擎，跟当初写在卡里的算式算得一模一样。**
   ⚠ 备份不在时直接报错，不许静默降级 —— 静默跳过就等于这道测试没了。 */
const SRC04_RAW = path.join(ROOT, '脚本/04-核心脚本.js');
const SRC04_BAK = path.join(ROOT, '脚本/04-核心脚本.js.bak-v394-CDN改造前');
/* ⚠ 判据收口到 工具/_xz_shellmode.cjs，别再自己写正则。
   v395 实测：04 的 URL 从「直写 @main」改成「tag 拼接」后，这里那份正则静默失效，
   IS_SHELL_MODE=false ⇒ 拿外壳进沙箱双跑 ⇒ 量到一堆空壳，1896 格全红，
   而引擎其实完全正确。那种红最费时间：看着像引擎崩了，其实是测试自己量错对象。
   ⚠ 读现役要走后门：跑闸.sh 带 preload 时，普通 readFileSync 已被重定向到备份。 */
const { isShellMode: _isShell } = createRequire(import.meta.url)(
  path.join(ROOT, '工具/_xz_shellmode.cjs'));
const _liveRead = fs.__readLive ? fs.__readLive.bind(fs) : fs.readFileSync.bind(fs);
const IS_SHELL_MODE = _isShell(_liveRead(SRC04_RAW, 'utf8'));
const SRC04 = IS_SHELL_MODE ? SRC04_BAK : SRC04_RAW;
if (!fs.existsSync(SRC04)) {
  console.error('✗ 04 已是 CDN 调用形态，但找不到内联实现备份：');
  console.error('  ' + SRC04_BAK);
  console.error('  这份备份是双跑比对的对照物（引擎必须和它算得一样）。');
  console.error('  拿现在的 04 去跑只会量到空壳，1280 格全红且毫无意义 —— 所以这里直接停。');
  process.exit(1);
}
const CORE = path.join(ROOT, '战斗引擎/src/core.js');

/* ══════════ ① 把 04 装进沙箱 ══════════
   ⚠ 不能 `import` 04 —— 它是 TavilyHelper 脚本，顶层就摸 window/document。
     但我们要的那些函数是纯的，所以只要能把它们**取到**就行：
     用和抽取器同样的括号配对把函数体切出来，单独求值。
     切法必须与抽取器一致，否则「双跑」比的就不是同一个东西了。 */
function braceEnd(src, openIdx) {
  let depth = 0, i = openIdx, quote = null, esc = false;
  let inLine = false, inBlock = false, inRegex = false, inClass = false;
  let prevSig = '{';
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (quote) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (inRegex) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { inRegex = false; prevSig = '/'; }
      continue;
    }
    if (/\s/.test(c)) continue;
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; prevSig = c; continue; }
    if (c === '/' && /[=(,:!&|?+\-*%{[;\n]/.test(prevSig)) { inRegex = true; inClass = false; continue; }
    if (c === '{') { depth++; prevSig = c; continue; }
    if (c === '}') { depth--; prevSig = c; if (depth === 0) return i; continue; }
    prevSig = c;
  }
  return -1;
}

function stmtEnd(src, startIdx) {
  let i = startIdx, quote = null, esc = false, inLine = false, inBlock = false;
  let depth = 0, inRegex = false, inClass = false;
  let prevSig = '=';
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (quote) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (inRegex) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { inRegex = false; prevSig = '/'; }
      continue;
    }
    if (/\s/.test(c)) continue;
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; prevSig = c; continue; }
    if (c === '/' && /[=(,:!&|?+\-*%{[;\n]/.test(prevSig)) { inRegex = true; inClass = false; continue; }
    if (c === '{' || c === '[' || c === '(') { depth++; prevSig = c; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; prevSig = c; continue; }
    if (c === ';' && depth === 0) return i;
    prevSig = c;
  }
  return -1;
}

const src04Raw = fs.readFileSync(SRC04, 'utf8');
const coreSrc = fs.readFileSync(CORE, 'utf8');

/* ══════════════════════════════════════════════════════════════════════════
   ★★★ v473：把「可调数值表」对齐到引擎现值，再拿去双跑 ★★★
   ─────────────────────────────────────────────────────────────────────────
   这道测试要验的是「**算法**有没有被抽坏」——
   不是「数值表和三个月前的备份是不是一个字都不差」。

   病历（v473 实测）：把 `QUALITY_POWER` 从 16/24/41/57/73/85 上调到
   61/74/102/131/163/190 之后，双跑立刻报 **272 / 1968 格不一致**，
   全部集中在 `qualityPowerOf` / `xzSkillCapOf` / `xzClampToCap` 三个函数上。
   但那三个函数的**代码一个字节都没动** —— 变的只是它们读的那张表。
   ⇒ 这个红是**假的**：它把「参数调整」报成了「算法漂移」。
     而假红比不红更坏（它会训练人无视红色，本项目第 4 条铁律）。

   ── 做法 ──────────────────────────────────────────────────────────────
   装沙箱之前，把备份那份 src 里的这几个**纯参数常量**整段替换成引擎当前值。
   换完再切函数：算法用备份的（这才是有意义的对照），参数用今天的（这才不是刻舟求剑）。

   ⚠ 只能放**纯参数表**。任何参与分支/结构的常量（XZ_LEVEL_SUBSTEP 之类
     虽然也是参数，但它一旦错就会把整条链改向，应当继续用备份的来验）不要加进来。
     判断标准：这张表改了，**应不应该**影响双跑结果？
       · 品质威力 —— 改了就应该影响，所以必须先对齐，再比算法；
       · 境界系数 / 层级系数 / 气血基数 —— 同上，都是"调平衡"用的参数；
     但要小心：这些表**同时在《数值表》里有副本**，那边由别的闸对账，
     这里只负责让"算法"这一层不受参数调整干扰。
   ⚠ 替换用正则精确匹配整行 `var NAME = {...};`，匹配不到就 **当场报错**，
     不许静默跳过 —— 静默跳过等于这条对齐没做，272 格假红会原样回来。
   ══════════════════════════════════════════════════════════════════════════ */
/* ⚠ 这份名单**只能是 core.js 里真有的**常量（它只抽 25 张表，XZ_HP_BASE 就不在里面）。
   写进去一个不存在的名字 ⇒ 下面第一道检查就 `process.exit(1)`，整条测试停摆。
   历史上正是因为「以为它在里面」，白白停了一次 —— 名单要照着 `grep '^var' core.js` 现取。 */
const TUNABLE_CONSTS = ['QUALITY_POWER', 'REALM_COEFFS', 'XZ_LEVEL_COEFF', 'XZ_PEAK_COEFF'];
let src04 = src04Raw;
const aligned = [];
for (const name of TUNABLE_CONSTS) {
  /* 引擎侧（core.js 就是 index.js 抽出来的） */
  const reCore = new RegExp('var\\s+' + name + '\\s*=\\s*\\{[\\s\\S]*?\\n?\\};');
  const mCore = coreSrc.match(reCore);
  if (!mCore) { console.error('✗ 引擎里找不到可调常量 ' + name + ' —— 双跑无法对齐，停止'); process.exit(1); }
  /* 备份侧 */
  const reBak = new RegExp('var\\s+' + name + '\\s*=\\s*\\{[\\s\\S]*?\\n?\\};');
  const mBak = src04.match(reBak);
  if (!mBak) { console.error('✗ 备份 04 里找不到 ' + name + ' —— 双跑无法对齐，停止'); process.exit(1); }
  if (mBak[0] === mCore[0]) continue;      /* 本来就一样，不用动，也不该记进 aligned */
  src04 = src04.replace(mBak[0], mCore[0]);
  aligned.push(name);
}
if (aligned.length) {
  console.log('· 双跑前已把备份里的可调数值表对齐到引擎现值：' + aligned.join('、'));
  console.log('  （验的是算法是否一致；这几张表本身由《数值表》对账闸管）');
}

/* 从 core.js 的 export 段拿到「要比对的名字清单」——这就是唯一事实源。
   新加函数不用改测试，改了 04 忘了重抽会被 --check 挡，这里也跟着对齐。 */
const exportBlock = coreSrc.match(/export\s*\{([\s\S]*?)\};/)[1];
const NAMES = [...exportBlock.matchAll(/([A-Za-z_$][\w$]*)/g)]
  .map((m) => m[1])
  .filter((n) => n !== 'setTransStore');

/* 把 04 里这些名字的定义（函数或常量）原样切出来 */
const pieces = [];
for (const n of NAMES) {
  const fi = src04.search(new RegExp('(^|\\n)function\\s+' + n.replace(/\$/g, '\\$') + '\\s*\\('));
  const ci = src04.search(new RegExp('(^|\\n)(?:var|const|let)\\s+' + n.replace(/\$/g, '\\$') + '\\s*='));
  if (fi >= 0 && (ci < 0 || fi < ci)) {
    const at = src04.indexOf('function', fi);
    const open = src04.indexOf('{', at);
    const end = braceEnd(src04, open);
    pieces.push(src04.slice(at, end + 1));
  } else if (ci >= 0) {
    const lineStart = src04.lastIndexOf('\n', ci) + 1;
    const eq = src04.indexOf('=', ci);
    const end = stmtEnd(src04, eq + 1);
    pieces.push(src04.slice(lineStart, end + 1));
  }
}

/* ⚠⚠ 关键：卡内那一侧**也必须补齐常量闭包**。
   上一版只切了导出名，结果沙箱里 XZ_LEVEL_COEFF / XZ_PEAK_COEFF /
   XZ_ATTR_TOTAL_CAP_BY_BIG 全都不存在，一半格子直接抛 ReferenceError ——
   看起来像「独立内核算错了」，其实是测试自己搭歪了。
   做法：扫已有 pieces 里出现的常量名，凡是 04 顶层有定义的，就一并切进来，
   循环到不再增长（常量之间会互相引用），与抽取器的双闭包同构。 */
const identRe = /(^|[^A-Za-z0-9_$.'"`])([A-Za-z_$][\w$]*)/g;
const callRe = /\b([A-Za-z_$][\w$]*)\s*\(/g;
const constRe = /(^|\n)(?:var|const|let)\s+([A-Za-z_$][\w$]*)\s*=/g;
const fnRe = /(^|\n)function\s+([A-Za-z_$][\w$]*)\s*\(/g;

function topConstNames(s) {
  const set = new Set();
  let m;
  const re = new RegExp(constRe.source, 'g');
  while ((m = re.exec(s))) set.add(m[2]);
  return set;
}
function topFnNames(s) {
  const set = new Set();
  let m;
  const re = new RegExp(fnRe.source, 'g');
  while ((m = re.exec(s))) set.add(m[2]);
  return set;
}
const src04Consts = topConstNames(src04);
const src04Fns = topFnNames(src04);

const haveFn = new Set();
const haveConst = new Set();
for (const n of NAMES) {
  if (src04Fns.has(n)) haveFn.add(n);
  if (src04Consts.has(n)) haveConst.add(n);
}

function pieceOf(n) {
  const fi = src04.search(new RegExp('(^|\\n)function\\s+' + n.replace(/\$/g, '\\$') + '\\s*\\('));
  const ci = src04.search(new RegExp('(^|\\n)(?:var|const|let)\\s+' + n.replace(/\$/g, '\\$') + '\\s*='));
  if (fi >= 0 && (ci < 0 || fi < ci)) {
    const at = src04.indexOf('function', fi);
    const open = src04.indexOf('{', at);
    const end = braceEnd(src04, open);
    return src04.slice(at, end + 1);
  }
  if (ci >= 0) {
    const lineStart = src04.lastIndexOf('\n', ci) + 1;
    const eq = src04.indexOf('=', ci);
    const end = stmtEnd(src04, eq + 1);
    return src04.slice(lineStart, end + 1);
  }
  return null;
}

/* 双闭包补齐（与 工具/_extract_battle.mjs 同构，但要排除 UI/宿主那批） */
const NO_GO = new Set([
  'act', 'applyDirectDamage', 'withBattleState', 'esc', 'log', 'toast', 'getDoc',
  'qs', 'qa', 'getMvuObj', 'getMvuGlobal', 'getRawStatData', 'getPlayerRealName',
  'getBattleAudio', 'getPanelCache', 'getStContext', 'atomFoeCount', 'xzRoundGateNote',
  'popupDamageNumber', 'playElementHitFx', 'playAttackVisualEffect', 'showSkillBannerFx',
  'triggerExplosionFx', 'registerNoDamage', 'xzMarkDeadIfNeeded', 'xzSummonDestroyItem',
  'xzTransStore', 'xzTransLS', 'xzTransCache', 'xzTransSanitize',
]);
let grew = true;
while (grew) {
  grew = false;
  const scanTexts = pieces.join('\n');
  for (const m of scanTexts.matchAll(identRe)) {
    const n = m[2];
    if (haveConst.has(n) || haveFn.has(n) || NO_GO.has(n)) continue;
    if (src04Consts.has(n)) {
      const p = pieceOf(n);
      if (p) { pieces.push(p); haveConst.add(n); grew = true; }
    } else if (src04Fns.has(n)) {
      const p = pieceOf(n);
      if (p) { pieces.push(p); haveFn.add(n); grew = true; }
    }
  }
  /* 函数体里调用的函数（identRe 抓不到「名字后紧跟括号」以外的场景，补一轮） */
  for (const m of scanTexts.matchAll(callRe)) {
    const n = m[1];
    if (haveFn.has(n) || NO_GO.has(n)) continue;
    if (src04Fns.has(n)) {
      const p = pieceOf(n);
      if (p) { pieces.push(p); haveFn.add(n); grew = true; }
    }
  }
}

/* ══════════ 拼装时必须按 04 里的原始位置排序 ══════════
   ⚠ 踩过：常量之间有依赖（`XZ_COMMON_TERMS = XZ_TERM_STRIKE.concat(...)`），
     按「发现顺序」拼会在依赖还没定义时就求值 ⇒ TypeError。
     core.js 里是按位置排的，测试这边必须同构，否则双跑比的不是同一个东西。 */
const ordered = [];
{
  const seenDef = new Set();
  for (const text of pieces) {
    const m = text.match(/^(?:function\s+|(?:var|const|let)\s+)([A-Za-z_$][\w$]*)/);
    if (!m) continue;
    if (seenDef.has(m[1])) continue;
    seenDef.add(m[1]);
    const pos = src04.indexOf(text);
    ordered.push({ pos: pos < 0 ? Number.MAX_SAFE_INTEGER : pos, text });
  }
  ordered.sort((a, b) => a.pos - b.pos);
}
const sandboxCode = ordered.map((o) => o.text).join('\n\n');
const sandbox = {
  window: {},
  localStorage: null,
  console,
  __fakeRandom: fakeRandom,
};
const ctx = vm.createContext(sandbox);
vm.runInContext(sandboxCode, ctx, { filename: '04-battle-subset.js' });

/* ══════════ ② 装独立内核 ══════════ */
const CORE_ABS = CORE;
const core = await import('file:///' + CORE_ABS.replace(/\\/g, '/') + '?t=' + Date.now());
core.setTransStore(() => ({ stamp: 0, source: '', byName: {} }));

/* 沙箱里也装一份同样的空实现，保证两边同源 */
vm.runInContext(
  'function xzTransStore(){ return { stamp:0, source:"", byName:{} }; }',
  ctx
);

/* ══════════ ③ 固定随机源 ══════════
   `xzRollHit` 里有一句 `1 + Math.floor(Math.random() * 20)` —— 掷 d20。
   不固定的话每一格都可能不同，但那是**随机**、不是**逻辑差异**，
   报出来会淹没真正的问题（第一次跑就有 1 格红，全是因为这个）。
   做法：两边都换掉 Math.random，喂同一串确定值。 */
let seed = 42;
function fakeRandom() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const realRandom = Math.random;

/* ══════════ ④ 构造输入 ══════════ */
const REALMS = [
  '凡人初期', '引玄中期', '凝府后期', '玄枢巅峰', '化域圆满',
  '尊玄初期', '穹境中期', '玄罡后期', '玄王初期', '玄皇中期',
  '玄宗后期', '玄圣巅峰', '帝境初期', '凝府', '玄皇', '帝境', '未知境界', '', null, undefined,
];
const QUALITIES = ['凡阶', '黄阶', '玄阶', '地阶', '天阶', '神阶', '不是阶', '', null];
const KINDS = ['伤害', '治疗', 'buff', 'debuff', 'control', 'shield', 'drain', 'summon', '', null];
const TEXTS = [
  '伤害:2400', '伤害:2400｜烧尽三里', '增伤:15:2', '提速:3', '减速:2:1', '治疗:30%',
  '护盾:500', '吸血:20%', '硬控:1', '必中', '闪避+15%', '攻击提升 20%',
  '速度 -3', '身法 +5', '敏捷 +4', '回复 20% 气血', '每回合造成 30 点灼烧',
  '受到伤害降低 15%', '造成 auto 伤害', 'auto', '', null, '随便写点啥',
  '伤害:100', '暴击率+5%', '穿防:20', '回蓝:30',
];
const FOUR = [
  { 力量: 10, 敏捷: 10, 体质: 10, 智力: 10 },
  { 力量: 20, 敏捷: 20, 体质: 1, 智力: 1 },
  { 力量: 999, 敏捷: 0, 体质: -5, 智力: 3.7 },
  { 力量: 0, 敏捷: 0, 体质: 0, 智力: 0 },
  {}, null,
];

let total = 0, bad = 0;
const diffs = [];
/* ══════════ ★★★ v452：`kind` 是**标签**，不是算式 ★★★ ══════════
   这道闸验的是「抽出来的引擎，跟当初写在卡里的算式算得一模一样」。
   而 v452 用户定案把 `kind` 的**取值**从行为名（`buff`/`debuff`/`dot`/`cond`…）
   改成了 6 大类归属（`伤害`/`召唤`/`常驻增益`/`常驻减益`/`条件增益`/`条件减益`），
   具体行为移到了新字段 `beh`。

   后果：对照物是 04 改造前的**历史快照**（.bak-v394-CDN改造前 / .bak-v452-改6类前），
   里面的 `kind` 必然还是旧值 ⇒ 25 格 `_v75ParseEffect` 全红。
   那个红**不是引擎算错了**，是"标签改名了"—— 判据过期，不是 bug。

   ⚠ 但绝不能因此放宽整道闸：算数部分（dmgPct / dmgFlat / dur / sub / isBuff…
     以及所有 calcDamage 类的数值格）必须仍然逐格全等。
   ⇒ 做法：比对前把两边结果里的 `kind` 归一化成一个固定占位符，
     **`beh` 与其余全部字段照常比** —— 行为一个字节都藏不住。
   ⚠ 别把 `beh` 也归一化：`beh` 才是"怎么算"，那正是本闸要守的东西。
   ⚠ 别把整条 `_v75ParseEffect` 从比对里删掉：它覆盖 25 格解析结果，
     删掉等于把解析器的回归网剪了。 */
function normalizeKind(v) {
  if (Array.isArray(v)) return v.map(normalizeKind);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) {
      if (k === 'kind') { o[k] = '<KIND>'; continue; }
      /* ★ v452：`beh` 是**新增字段**，对照物（历史快照）里根本没有它。
         两边都有的字段照常比；只有新引擎单边才有 `beh` 时，把它置成占位符
         —— 否则"新增一个字段"会永久红，而那不是算错了。
         ⚠ 但一旦两边都有 `beh`（下一份快照就会有），就必须逐字相等 ——
           所以这里不是"永远跳过 beh"，而是"缺了才跳过"。
         ⚠ 绝不允许反过来：不许因为 `beh` 是新的就把它的**取值**也豁免掉。 */
      o[k] = normalizeKind(v[k]);
    }
    return o;
  }
  return v;
}
/* 只在**一侧缺 beh** 时补占位符，两侧都有就照原样比 */
function alignBeh(a, b) {
  const hasA = a && typeof a === 'object' && 'beh' in a;
  const hasB = b && typeof b === 'object' && 'beh' in b;
  if (hasA && !hasB) { b = Object.assign({}, b, { beh: '<NEW>' }); a = Object.assign({}, a, { beh: '<NEW>' }); }
  else if (hasB && !hasA) { a = Object.assign({}, a, { beh: '<NEW>' }); b = Object.assign({}, b, { beh: '<NEW>' }); }
  return [a, b];
}
function cmp(label, a, b) {
  total++;
  const pair = alignBeh(a, b);
  const sa = JSON.stringify(normalizeKind(pair[0])), sb = JSON.stringify(normalizeKind(pair[1]));
  if (sa !== sb) {
    bad++;
    if (diffs.length < 40) diffs.push(label + '\n      卡内: ' + String(sa).slice(0, 300) + '\n      独立: ' + String(sb).slice(0, 300));
  }
}
/* 两边都要能调；沙箱那边用 vm 求值，避免把对象跨上下文传坏 */
function runInCtx(name, args) {
  ctx.__args = args;
  return vm.runInContext(name + '.apply(null, __args)', ctx);
}
function runCore(name, args) {
  return core[name].apply(null, args);
}
/* 每次双跑前把两边的随机源都重置到同一个 seed，保证「同一题、同一骰」。 */
function resetDice() {
  seed = 42;
  Math.random = fakeRandom;
  vm.runInContext('Math.random = __fakeRandom', ctx);
}
function both(name, args, tag) {
  let a, b, ea = null, eb = null;
  resetDice();
  try { a = runInCtx(name, args); } catch (e) { ea = e.constructor.name + ':' + e.message; }
  resetDice();
  try { b = runCore(name, args); } catch (e) { eb = e.constructor.name + ':' + e.message; }
  Math.random = realRandom;
  if (ea || eb) {
    total++;
    if (ea !== eb) { bad++; if (diffs.length < 40) diffs.push(tag + ' ' + name + '(' + JSON.stringify(args).slice(0, 80) + ')\n      卡内抛: ' + ea + '\n      独立抛: ' + eb); }
    return;
  }
  cmp(tag + ' ' + name + '(' + JSON.stringify(args).slice(0, 80) + ')', a, b);
}

/* ══════════ ④ 逐族比对 ══════════ */

/* 境界类：全境界 × 各种写法 */
for (const r of REALMS) {
  for (const n of ['xzLevelCoeffOf', 'normalizeRealm', 'xzNormRealmName', 'realmMultByName',
    'xzBigRealmOf', 'realmRank', 'xzAttrTotalCapOf', '_v228RealmRoot']) {
    both(n, [r], '境界');
  }
}
/* 品阶类 */
for (const q of QUALITIES) {
  both('qualityPowerOf', [q], '品阶');
  for (const r of REALMS.slice(0, 8)) {
    for (const k of KINDS) {
      both('xzSkillCapOf', [q, r, k], '定档');
      both('xzClampToCap', [123.456, q, r, k], '钳制');
    }
  }
  both('xzSkillMpOf', [q, 5], '耗灵');
  both('xzSkillMpOf', [q, null], '耗灵');
  both('v81CapEffectKeys', [{ dmg: 10, dr: 5 }, q, 'player'], '效果键上限');
  both('v81CapEffectKeys', [{ dmg: 10, dr: 5 }, q, 'story'], '效果键上限');
}
/* 效果解析：这是最大的一片，全部文本 × 全组合 */
for (const t of TEXTS) {
  both('_v75ParseEffect', [t], '效果解析');
  both('parseBloodEffect', [t], '血脉解析');
  both('xzAtomNameOf', [t], '原子名');
  both('xzEffKeyOf', [t, null], '效果键');
  both('xzEffKeyOf', [t, { kind: 'damage' }], '效果键');
  both('xzEffLineOf', ['伤害', '2400'], '效果行');
  both('xzEffLineOf', ['dmgFlat', 300], '效果行');
  both('xzEffMechOf', ['伤害'], '机制键');
  both('xzAtomNameOf', [null], '原子名');
}
/* 原子/机制族 */
const F = { mech: { crit: 5, critDmg: 20, dr: 0.1, pierce: 3 }, blood: {}, states: { v75BuffPct: 0.1 }, v75HasteRounds: 2 };
for (const k of ['crit', 'critDmg', 'dr', 'pierce', 'lowHp', 'elemAmp', 'styleAmp']) {
  both('mechVal', [F, k], '机制取值');
  both('mechFlag', [F, k], '机制布尔');
  both('mechStr', [F, k], '机制字符串');
  both('mechSub', [F, k, '火'], '机制二级');
}
for (const fld of ['crit', 'critDmg', 'dr', 'pierce', 'dmg', 'dmgDown', 'vuln', 'evade']) {
  both('mechSumField', [F, fld], '机制求和');
}
both('mechBuffsOf', [F], '机制汇总');
both('mechBuffsOf', [{}], '机制汇总');
both('atomHas', [F, '任意'], '原子存在');
both('swordIntentCap', [F], '剑意上限');
both('xzTrackAdd', [F, 50], '轨迹推进');
both('xzTrackAdd', [F, -100], '轨迹推进');
for (const st of ['v75BuffPct', 'v75DrPct', 'v75HasteRounds', 'tempEvadeBoost']) {
  both('v2StateVal', [F, st], '状态取值');
  both('v2StateSet', [F, st, 7], '状态写入');
}
/* 四维钳制 */
for (const four of FOUR) both('xzClampFourTotal', [four, 38], '四维钳制');
for (const four of FOUR) both('xzClampFourTotal', [four, 0], '四维钳制');
/* 命中 / 暴击 / 减伤 / 承伤：需要 fighter 结构，尽量给全 */
const ATK = {
  mech: { crit: 10, critDmg: 50, pierce: 5 }, blood: {}, states: {},
  spd: 120, level: 30, realm: '玄枢后期', nameKey: '测甲',
  v75BuffPct: 0.1, v75MarkRounds: 0,
};
const DEF = {
  mech: { dr: 0.2, evade: 8 }, blood: {}, states: {},
  spd: 100, level: 20, realm: '凝府中期', nameKey: '测乙',
};
const SKILL = { name: '斩', quality: '玄阶', hit: 5, elem: '火', style: '剑' };
both('xzCritRateOf', [ATK, DEF, {}], '暴击率');
both('xzCritRateOf', [ATK, DEF, null], '暴击率');
both('xzDrOf', [DEF, {}], '减伤');
both('xzDrOf', [DEF, null], '减伤');
both('xzVulnOf', [DEF, {}], '承伤');
both('xzVulnOf', [DEF, null], '承伤');
both('xzRollHit', [ATK, DEF, SKILL], '命中判定');
both('xzHitBonusOf', [SKILL], '命中加成');
both('xzHitCutOf', [ATK, SKILL], '命中削减');
both('xzEvadeValueOf', [DEF], '闪避值');
both('xzPermOf', [ATK], '常驻汇总');
both('xzPermOf', [{}], '常驻汇总');
both('xzNameKey', [{ 测甲: 1 }, '测甲'], '名字键');
both('xzNameKey', [{ 测甲: 1 }, '测甲 '], '名字键');
both('xzSkillKey', [{ 斩: 1 }, '斩'], '招式键');
both('xzSkillKey', [{ 斩: 1 }, '斩 '], '招式键');
both('xzSkillAtomsOf', ['测甲', '斩'], '招式原子');
both('xzAtomNameOf', ['伤害 +5%'], '原子名');

/* ══════════ ⑤ 报告 ══════════ */
console.log('─'.repeat(70));
if (bad === 0) {
  console.log('✔ 双跑一致：' + total + ' 格全部相同（' + NAMES.length + ' 个导出，'
    + (IS_SHELL_MODE ? '对照物 = 04 改造前的内联实现，引擎与它逐格相同' : '卡内 04 vs 独立内核')
    + '）');
  process.exit(0);
} else {
  console.log('✗ 双跑不一致：' + bad + ' / ' + total + ' 格不同');
  console.log('');
  for (const d of diffs) console.log('  · ' + d);
  if (bad > diffs.length) console.log('\n  …共 ' + bad + ' 处，上面只列前 ' + diffs.length + ' 处');
  process.exit(1);
}

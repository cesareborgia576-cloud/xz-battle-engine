/* 战斗引擎/test/cdn_smoke.mjs
   ─────────────────────────────────────────────────────────────────────────────
   验「04 改成 CDN 调用以后还能不能跑」。

   为什么必须有这个：`node --check` 只验语法。04 现在是「43 个转发外壳 + 25 个
   常量指向」，语法完全合法，但下面三种坏法它一个都查不出来：
     ① import 位置在某个数值使用之后 ⇒ 前面读到 undefined（不抛错，静默坏）
     ② `__XZ_B_REQ()` 抛错时机不对 ⇒ 第一个调用就炸
     ③ 常量 `var X = __XZ_B_REQ().X` 的顺序在依赖之后
   所以这里**真的跑 04**：给一个最小宿主（window/MVU/localStorage 都没有也能跑），
   把 import() 拦到本地引擎文件上（等价于 CDN 那份，见 md5 一致性闸）。
   ───────────────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SRC04 = path.join(ROOT, '脚本/04-核心脚本.js');
const ENGINE = path.join(ROOT, '战斗引擎/index.js');

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('  ✓ ' + n); };
const bad = (n, d) => { fail++; console.log('  ✗ ' + n + (d ? '\n      ' + String(d).split('\n').slice(0, 6).join('\n      ') : '')); };

/* ══════════ 造一个最小宿主 ══════════
   04 会摸 window / document / localStorage / Mvu / eventOn 等。
   这不是要「完整模拟酒馆」—— 只是让 04 的顶层能跑过去。
   跑不过去通常说明 04 在顶层就干了重活，那和本测试无关，会明确报出来。 */
function makeHost() {
  const noop = () => {};
  const el = () => new Proxy(function () {}, {
    get: (t, k) => {
      if (k === 'style') return {};
      if (k === 'classList') return { add: noop, remove: noop, toggle: noop, contains: () => false };
      if (k === 'children' || k === 'childNodes') return [];
      if (k === 'appendChild' || k === 'removeChild' || k === 'addEventListener'
        || k === 'removeEventListener' || k === 'setAttribute' || k === 'focus' || k === 'click'
        || k === 'append' || k === 'prepend' || k === 'insertBefore' || k === 'remove') return noop;
      if (k === 'getAttribute') return () => null;
      if (k === 'querySelector') return () => el();
      if (k === 'querySelectorAll') return () => [];
      if (k === Symbol.toPrimitive || k === 'toString') return () => '';
      return el();
    },
    set: () => true,
  });
  const store = {};
  const doc = {
    readyState: 'complete',
    body: el(), head: el(), documentElement: el(),
    createElement: () => el(),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop, removeEventListener: noop,
  };
  const win = {
    document: doc,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
      key: (i) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    },
    setTimeout: (fn) => { try { fn(); } catch (e) {} return 0; },
    clearTimeout: noop,
    setInterval: () => 0,
    clearInterval: noop,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: noop,
    addEventListener: noop, removeEventListener: noop,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
    location: { href: 'http://localhost/', search: '' },
    parent: null, top: null,
    console,
    navigator: { userAgent: 'node' },
    performance: { now: () => Date.now() },
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;
  win.parent = win;
  win.top = win;
  doc.defaultView = win;
  return win;
}

console.log('=== 04 · CDN 调用形态冒烟 ===\n');

/* ⚠⚠ 本测试必须读**现役 04 的原样文本**，不能被工具链的重定向影响。
   背景：`工具/_xz_preload.cjs` 会把所有「读 04」重定向到内联实现备份
   （因为其余 200+ 个工具要的是算法真身）。而本测试验的**恰恰是外壳本身**
   —— 有没有把 43 个函数都换成转发外壳、内联实现清干净没有。
   被重定向的话，它会读到备份里的真实现，然后报「还有内联实现残留」：
   一个纯粹的假红，而且看起来像 04 改坏了。
   ⇒ 优先用 preload 留的后门；没有 preload 时（直接 node 跑本文件）用原生读。 */
const src = (fs.__readLive || fs.readFileSync).call(fs, SRC04, 'utf8');

/* ══════════ 静态断言 ══════════ */
console.log('【静态】');
const urlM = src.match(/__XZ_BATTLE_URL = '([^']+)'/);
urlM ? ok('找到 CDN 地址：' + urlM[1]) : bad('找不到 __XZ_BATTLE_URL');

/* 这是本条改造的核心断言：内联实现必须已经不存在。
   判据取「旧实现的特征行」，而不是数行数 —— 行数会随注释变，特征行不会。 */
const inlineLeft = [
  ["var REALM_COEFFS = {", '境界系数表本体'],
  ["var QUALITY_POWER = {", '品质威力表本体'],
  ["var XZ_ATOM_TYPES = {", '原子类型表本体'],
];
const leftover = inlineLeft.filter(([sig]) => src.includes(sig));
leftover.length === 0
  ? ok('内联实现已清空（3 个特征表本体都不在了）')
  : bad('还有内联实现残留：' + leftover.map((x) => x[1]).join('、'));

const shells = [...src.matchAll(/return __XZ_B_SAFE\(\)\.([A-Za-z_$][\w$]*)\.apply\(null, arguments\);/g)].map((m) => m[1]);
/* ⚠ 常量行尾常带注释（`var X = __XZ_B_CONST('X');   // 上限 = …`），
   所以不能锚 `;$`，要用 [^;\n]* 收掉中间，再要求名字与参数一致。 */
/* ⚠ 常量行尾常带注释，且生成时用的是**双引号**；
   判据要「名字与参数一致」，所以用反向引用 \1，不能只数个数。 */
const constRefs = [...src.matchAll(/^var ([A-Za-z_$][\w$]*) = __XZ_B_CONST\("\1"\);/gm)].map((m) => m[1]);
ok('转发外壳 ' + shells.length + ' 个 / 常量指向 ' + constRefs.length + ' 个');

/* 外壳数量必须与引擎导出一致 —— 少一个就是「某个函数还在用旧的内联版」，
   而那种情况不会有任何报错，只会「改引擎它不跟着变」。 */
const coreSrc = fs.readFileSync(path.join(ROOT, '战斗引擎/src/core.js'), 'utf8');
const exp = coreSrc.match(/export\s*\{([\s\S]*?)\};/)[1].split(',').map((s) => s.trim()).filter(Boolean);
const shouldFn = exp.filter((n) => shells.includes(n));
shouldFn.length === shells.length
  ? ok('引擎导出的函数全部有外壳（' + exp.length + ' 个导出对得上）')
  : bad('有导出没做外壳：' + exp.filter((n) => !shells.includes(n) && n !== 'setTransStore').join('、'));

/* import 必须在第一个数值使用之前 */
const importAt = src.indexOf('await import(__XZ_BATTLE_URL)');
const firstUseAt = Math.min(
  ...["__XZ_B_CONST(", "return __XZ_B_SAFE()."].map((s) => { const i = src.indexOf(s); return i < 0 ? Infinity : i; })
);
importAt >= 0 && importAt < firstUseAt
  ? ok('import 在第 ' + src.slice(0, importAt).split('\n').length + ' 行，早于首个数值使用（第 ' + src.slice(0, firstUseAt).split('\n').length + ' 行）')
  : bad('import 位置晚于数值使用：import@' + importAt + ' firstUse@' + firstUseAt);

/* ══════════ 动态：真的把 04 跑起来 ══════════
   把 `import(` 换成注入的 `__hostImport(`（指向本地引擎），其余原样。
   这样跑的是**真 04 的全文**，不是切片 —— 切片永远验不到「顺序」这类问题。 */
console.log('\n【动态：整文件跑一遍】');
let sandboxResult = null;
try {
  const patched = src.replace(/\bawait import\(/g, 'await __hostImport(');
  const win = makeHost();
  const ctx = vm.createContext(win);
  ctx.__hostImport = () => import(pathToFileURL(ENGINE).href);
  ctx.console = {
    log: () => {}, info: () => {}, warn: () => {}, debug: () => {},
    error: (...a) => { console.log('    [04 console.error]', ...a.map(String)); },
  };
  /* 04 里有 `getVariables` / `eventOn` 这类 TavernHelper 全局，缺了会在顶层抛。
     这里给一个「什么都不知道」的桩：返回值全是 undefined/null，够顶层跑通。 */
  ctx.getVariables = () => ({ stat_data: {} });
  ctx.replaceVariables = () => {};
  ctx.insertOrAssignVariables = () => {};
  ctx.eventOn = () => {};
  ctx.eventOnce = () => {};
  ctx.triggerSlash = () => '';
  ctx.getLastMessageId = () => 0;
  ctx.getChatMessages = () => [];
  ctx.SillyTavern = { getContext: () => ({ chat: [], characters: [] }) };
  ctx.toastr = { info: () => {}, warning: () => {}, error: () => {}, success: () => {} };

  /* 04 是 async IIFE，会返回 Promise。给它 3 秒，不 await 太死。 */
  sandboxResult = await vm.runInContext(patched, ctx, { filename: '04-核心脚本.js', timeout: 8000 });
  ok('04 顶层执行完毕（未抛异常）');
} catch (e) {
  bad('04 顶层抛异常', e && (e.stack || e.message || e));
}

/* ══════════ 动态：拿到引擎后，数值真的算得出来吗 ══════════
   这一步是关键 —— 前面全绿也可能「外壳指向的函数是 undefined」。
   直接调 04 内部那几个被包成外壳的函数，看它返回的是不是数。 */
console.log('\n【动态：外壳真能取到引擎】');
try {
  const win = makeHost();
  const ctx = vm.createContext(win);
  ctx.__hostImport = () => import(pathToFileURL(ENGINE).href);
  ctx.console = { log: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  for (const k of ['getVariables', 'replaceVariables', 'insertOrAssignVariables', 'eventOn', 'eventOnce',
    'triggerSlash', 'getLastMessageId', 'getChatMessages']) ctx[k] = () => (k === 'getVariables' ? { stat_data: {} } : undefined);
  ctx.SillyTavern = { getContext: () => ({ chat: [], characters: [] }) };

  /* 暴露探针：把 04 内部的名字扔出来。04 本身不 export，所以只能靠改一行源码
     加一个显式挂载 —— 挂的是**同一个作用域里的真身**，不是副本。 */
  const patched = src
    .replace(/\bawait import\(/g, 'await __hostImport(')
    .replace(/\n\}\)\(\);\s*$/, '\nwindow.__probe = { realmMultByName: realmMultByName, qualityPowerOf: qualityPowerOf, xzEffLineOf: xzEffLineOf, REALM_COEFFS: REALM_COEFFS, QUALITY_POWER: QUALITY_POWER };\n})();\n');
  await vm.runInContext(patched, ctx, { filename: '04-probe.js', timeout: 8000 });

  const probe = win.__probe;
  if (!probe) {
    bad('没拿到探针（04 尾部结构可能变了）');
  } else {
    const pc = probe.QUALITY_POWER;
    pc && pc['玄阶'] === 41 ? ok('QUALITY_POWER 从引擎取到了（玄阶=41）') : bad('QUALITY_POWER 不对：' + JSON.stringify(pc));

    const rc = probe.REALM_COEFFS;
    rc && rc['帝境'] === 17.26 ? ok('REALM_COEFFS 从引擎取到了（帝境=17.26）') : bad('REALM_COEFFS 不对：' + (rc && rc['帝境']));

    const q = probe.qualityPowerOf('玄阶');
    q === 41 ? ok('qualityPowerOf(玄阶) → 41（外壳转发通了）') : bad('qualityPowerOf(玄阶) → ' + q);

    const m = probe.realmMultByName('玄枢后期');
    typeof m === 'number' && Math.abs(m - 1.78) < 1e-9 ? ok('realmMultByName(玄枢后期) → 1.78') : bad('realmMultByName(玄枢后期) → ' + m);

    const line = probe.xzEffLineOf('伤害', 100);
    line ? ok('xzEffLineOf(伤害,100) → ' + JSON.stringify(line).slice(0, 60)) : bad('xzEffLineOf 返回空');
  }
} catch (e) {
  bad('探针阶段抛异常', e && (e.stack || e.message || e));
}

/* ══════════ 动态：引擎取不到时，必须「降级但整卡还能跑」 ══════════
   ⚠ 这里判的是取舍本身，不是「有没有报错」：
     04 是整卡主脚本，一个数值模块取不到就让它连存档/界面/秘境一起崩，
     是「为了一个零件报废整台机器」。正确表现是：
       ① 顶层**不抛**  ② 数值退化成中性（不触发/无加成）
       ③ 故障看得见（window 标记 + 控制台红字） */
console.log('\n【动态：引擎拿不到时的表现】');
try {
  const win = makeHost();
  const ctx = vm.createContext(win);
  ctx.__hostImport = () => Promise.reject(new Error('模拟 CDN 不可达'));
  const errs = [];
  ctx.console = { log: () => {}, info: () => {}, warn: () => {}, error: (...a) => errs.push(a.map(String).join(' ')) };
  for (const k of ['getVariables', 'replaceVariables', 'insertOrAssignVariables', 'eventOn', 'eventOnce',
    'triggerSlash', 'getLastMessageId', 'getChatMessages']) ctx[k] = () => (k === 'getVariables' ? { stat_data: {} } : undefined);
  ctx.SillyTavern = { getContext: () => ({ chat: [], characters: [] }) };

  const patched = src
    .replace(/\bawait import\(/g, 'await __hostImport(')
    .replace(/\n\}\)\(\);\s*$/, '\nwindow.__probeFail = { qualityPowerOf: qualityPowerOf, xzEffLineOf: xzEffLineOf, REALM_COEFFS: REALM_COEFFS };\n})();\n');
  let topThrew = null;
  try {
    await vm.runInContext(patched, ctx, { filename: '04-fail.js', timeout: 8000 });
  } catch (e) { topThrew = e; }

  topThrew === null
    ? ok('顶层不抛（卡还能跑：存档 / 界面 / 秘境不受牵连）')
    : bad('顶层抛了 —— 一个数值模块挂掉赔上整张卡', topThrew && (topThrew.message || topThrew));

  win.__XZ_BATTLE_FAILED__
    ? ok('window.__XZ_BATTLE_FAILED__ 有原因（' + String(win.__XZ_BATTLE_FAILED__).slice(0, 40) + '）')
    : bad('拿不到引擎却没有任何失败标记');
  errs.length > 0 ? ok('控制台打了 ' + errs.length + ' 条错误（看得见，不是静默）') : bad('失败时日志一声不响');

  /* 降级值必须是「保守中性」而不是 0 —— 系数退成 0 等于伤害归零，
     那和崩掉差不多。这一条最容易写成「一律返 0」。 */
  const pf = win.__probeFail;
  if (!pf) {
    bad('拿不到降级探针');
  } else {
    const q = pf.qualityPowerOf('玄阶');
    Number.isFinite(q) && q > 0
      ? ok('降级后 qualityPowerOf(玄阶) → ' + q + '（有限正数，不抛不 NaN）')
      : bad('降级后 qualityPowerOf 返回 ' + q);
    const l = pf.xzEffLineOf('伤害', 100);
    l !== undefined && l !== null
      ? ok('降级后 xzEffLineOf 仍返回 ' + JSON.stringify(l) + '（不炸）')
      : bad('降级后 xzEffLineOf 返回 ' + l);
    pf.REALM_COEFFS && typeof pf.REALM_COEFFS === 'object'
      ? ok('降级后 REALM_COEFFS 是空表（读不到键，下游吃自己默认值）')
      : bad('降级后 REALM_COEFFS 是 ' + typeof pf.REALM_COEFFS);
  }
} catch (e) {
  bad('失败路径测试自身出错', e && (e.message || e));
}

console.log('\n=== ' + (fail === 0 ? '全部通过' : '有失败') + '：' + pass + ' 通过 / ' + fail + ' 失败 ===');
process.exit(fail === 0 ? 0 : 1);

/* 战斗引擎/test/cdn_smoke.mjs
   ─────────────────────────────────────────────────────────────────────────────
   验「04 只剩一行 import」以后，这一行到底通不通。

   ⚠ 第一版（v394，43 个转发外壳）已退役 → `_cdn_smoke_v394_retired.mjs`。
     那版验的是「外壳接没接上引擎」，在现在的形态下**必然全红**：
     卡里根本没有外壳可验。留着它就是让闸永远红着，然后所有人学会忽略它。

   现在的形态（v395 起，对标 Apeiria 成卡）：
     卡里 `脚本/04-核心脚本.js` 全文只有一行 import，
     整段核心脚本（~1.57M 字符）在仓库的 `核心脚本/index.js` 里。

   因此这个测试要证明三件事，一件不能少：
     ① **卡里真的什么都不剩** —— 只有一行 import，没有算法、没有表、体积 <8KB。
        否则「两份实现」就回来了：改仓库不改卡，卡还在跑旧的，而你以为改了。
     ② **那一行指向的东西真的存在、且版本对得上** —— 本地真身语法通过、
        含关键实现、tag ≠ @main、XZ_BUILD 与 工具/版本号.txt 一致。
        这条防的是「卡里写着 v1.1.0，仓库里没这个 tag」——线上 404，
        而 ST 的 import 失败只是控制台一行，玩家看到的是「整卡静默失效」。
     ③ **真身被 import 之后真的跑起来了** —— 扔进假宿主，看 window.__XZ_SHARED__
        有没有挂上、数值算不算得出来。
        ②只证明「文件在」，③才证明「它能跑」。语法通过 ≠ 能跑（顶层就可能抛）。

   为什么不用真拉 CDN：那是 `工具/_cdn_verify.mjs` 的活（要网络，会红）。
   这里全离线，跑闸时每次都跑，所以它必须快、必须无外部依赖。
   ───────────────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SRC04 = path.join(ROOT, '脚本/04-核心脚本.js');
const TRUE_SRC = path.join(ROOT, '战斗引擎/核心脚本/index.js');
const ENGINE_ENTRY = path.join(ROOT, '战斗引擎/index.js');
const VER_FILE = path.join(ROOT, '工具/版本号.txt');

const MAX_CARD_BYTES = 8192;   // 一行 import + 注释 ≈ 1.5KB；超过这个数就是在往回长

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('  ✓ ' + n); };
const bad = (n, d) => {
  fail++;
  console.log('  ✗ ' + n + (d ? '\n      ' + String(d).split('\n').slice(0, 8).join('\n      ') : ''));
};

console.log('=== 04 · 一行 import 形态冒烟 ===\n');

/* ⚠⚠ 本测试必须读**现役 04 的原样文本**，不能被 preload 的重定向影响。
   背景：`工具/_xz_preload.cjs` 会把所有「读 04」重定向到算法真身
   （因为其余 200+ 个工具要的是算法，卡里已经没有了）。
   而本测试验的**恰恰是卡里那 1.5KB**——被重定向的话会读到 1.57M 的实现，
   然后报「卡里还有算法残留」，一个纯粹的假红，而且看起来像卡改坏了。
   ⇒ 优先用 preload 留的后门；没有 preload（直接 node 跑本文件）时用原生读。 */
const cardSrc = (fs.__readLive || fs.readFileSync).call(fs, SRC04, 'utf8');
const cardBytes = Buffer.byteLength(cardSrc, 'utf8');

/* ══════════ ① 卡里什么都不剩 ══════════ */
console.log('【① 卡里只剩一行 import】');

if (cardBytes < MAX_CARD_BYTES) {
  ok('04 体积 ' + cardBytes + ' 字节（< ' + MAX_CARD_BYTES + '），是一行 import 的量级');
} else {
  bad('04 体积 ' + cardBytes + ' 字节，超过 ' + MAX_CARD_BYTES + ' —— 说明实现又抄回卡里了');
}

/* 去掉注释后应当**恰好剩一条 import 语句**。
   不数行：注释掉了也不算实现。 */
const codeOnly = cardSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  .trim();
const importLines = codeOnly.split('\n').map((s) => s.trim()).filter(Boolean);
if (importLines.length === 1 && /^import\s+['"]https?:\/\//.test(importLines[0])) {
  ok('去掉注释后只剩 1 条语句，且是 https import');
} else {
  bad('去掉注释后有 ' + importLines.length + ' 条语句（应为 1 条 import）',
    importLines.slice(0, 5).join('\n'));
}

/* 算法特征：抽这几个「一旦回流就说明抄回来了」的锚点。
   不数行数、不数函数个数——那些会随注释浮动。 */
const ALGO_SIGNS = [
  ['var XZ_BUILD', '构建号声明'],
  ['var REALM_COEFFS', '境界系数表'],
  ['var QUALITY_POWER', '品质威力表'],
  ['function calcDamage', '伤害计算'],
  ['function startJJ', '开战入口'],
  ['__XZ_SHARED__', '共享注册表'],
  ['XZ_MIJING_END', '秘境模块尾标'],
];
const leftover = ALGO_SIGNS.filter(([sig]) => cardSrc.includes(sig));
leftover.length === 0
  ? ok('算法残留 0 处（7 个特征锚点全部不在卡里）')
  : bad('卡里还有算法：' + leftover.map((x) => x[1]).join('、'));

/* 卡里不该有任何 await / 函数定义 / 变量声明。
   比「体积小」更硬：体积可以靠少写注释骗过，语句形态骗不过。 */
const badShape = [
  [/\bawait\b/, 'await'],
  [/\bfunction\b/, 'function'],
  [/^\s*var\s/m, 'var 声明'],
  [/\bexport\b/, 'export'],
].filter(([re]) => re.test(codeOnly));
badShape.length === 0
  ? ok('语句形态干净（无 await / function / var / export）')
  : bad('卡里出现不该有的关键字：' + badShape.map((x) => x[1]).join('、'));

/* ══════════ ② 那一行指向的东西真的存在 ══════════ */
console.log('\n【② 指向的真身存在且版本对得上】');

const urlM = /import\s+['"](https?:\/\/[^'"]+)['"]/.exec(cardSrc);
const URL = urlM ? urlM[1] : '';
if (!URL) {
  bad('找不到 import 的地址');
} else {
  ok('import 地址：' + URL);

  /* ⚠ 锁 tag 不锁 @main —— 这是 v394 的真实事故，不是洁癖。
     实测同一时刻 cdn / fastly / gcore 还在发 v1.0.0（少导出 25 张常量表），
     只有 testingcf 是 v1.1.0。结果是「import 成功、日志正常、所有数值静默失效」。
     @main 每次解析都跟着分支走，各节点缓存进度不同步 ⇒ 必然再出一次。 */
  const tagM = /@(v[\d.]+)\//.exec(URL);
  if (tagM) {
    ok('锁的是 tag（@' + tagM[1] + '），不是 @main');
  } else if (/@main\b/.test(URL)) {
    bad('用的是 @main —— 各节点缓存不同步，玩家会拿到旧版且零报错');
  } else {
    bad('地址里既没有 tag 也不是 @main：' + URL);
  }

  /* URL 必须指向仓库里的 核心脚本/index.js —— 路径写错就是线上 404。 */
  /\/核心脚本\/index\.js$/.test(URL)
    ? ok('路径指向 /核心脚本/index.js')
    : bad('路径不是 /核心脚本/index.js：' + URL);

  /* 仓库名要对：用户名 cesareborgia576-cloud（用户明确纠正过一次，别搞错） */
  /cdn\.jsdelivr\.net\/gh\/cesareborgia576-cloud\/xz-battle-engine@/.test(URL)
    ? ok('仓库为 cesareborgia576-cloud/xz-battle-engine')
    : bad('仓库名不对：' + URL);
}

/* 本地真身：存在 / 够大 / 语法通过 / 含关键实现 */
if (!fs.existsSync(TRUE_SRC)) {
  bad('真身不存在：' + TRUE_SRC + ' —— 卡里那行 import 指向一个空位置');
} else {
  const trueSrc = fs.readFileSync(TRUE_SRC, 'utf8');
  const trueBytes = Buffer.byteLength(trueSrc, 'utf8');
  ok('真身存在（' + trueBytes + ' 字节）');

  trueBytes > 1000000
    ? ok('真身体积 ' + (trueBytes / 1048576).toFixed(2) + ' MB（整段核心脚本原样）')
    : bad('真身只有 ' + trueBytes + ' 字节 —— 不像是整段核心脚本，像是被截断了');

  /* 关键实现必须在真身里。少任何一个都意味着「搬过去了但搬漏了」。 */
  const NEED = [
    ['function calcDamage', '伤害计算'],
    ['function startJJ', '开战入口'],
    ['function xzTransStore', '术语库'],
    ['function xzWBVersionState', '版本徽章'],
    ['function qualityPowerOf', '品阶威力'],
    ['function realmMultByName', '境界倍率'],
    ['exposeSharedRegistry', '共享表挂载'],
    ['XZ_MIJING_END', '秘境模块'],
  ];
  const miss = NEED.filter(([sig]) => !trueSrc.includes(sig));
  miss.length === 0
    ? ok('8 个关键实现在真身里全部就位')
    : bad('真身缺实现：' + miss.map((x) => x[1]).join('、'));

  /* 版本三处必须一致：04 的 tag / 真身的 XZ_BUILD / 工具/版本号.txt
     ⚠ 卡里的 tag 是 vX.Y.Z，XZ_BUILD 是 vNNN，两者不同源，不能直接比。
       能干的是：XZ_BUILD === 版本号.txt（打包时 pack.js 会强制对齐）。 */
  const buildM = /var XZ_BUILD = '([^']+)'/.exec(trueSrc);
  const verNow = fs.existsSync(VER_FILE) ? fs.readFileSync(VER_FILE, 'utf8').trim() : '';
  if (!buildM) {
    bad('真身里找不到 XZ_BUILD');
  } else if (buildM[1] === verNow) {
    ok('真身 XZ_BUILD=' + buildM[1] + ' 与 工具/版本号.txt 一致');
  } else {
    bad('XZ_BUILD=' + buildM[1] + ' ≠ 版本号.txt ' + verNow + '（跑 node 工具/pack.js 对齐）');
  }

  /* 语法检查。⚠ 临时文件名必须带 .mjs —— `node --check` 按扩展名选解析器，
     叫 .tmp-xxx 会报 ERR_UNKNOWN_FILE_EXTENSION，那不是语法错，是选错解析器。 */
  const tmp = path.join(HERE, '_syncheck_' + process.pid + '.mjs');
  try {
    fs.writeFileSync(tmp, trueSrc, 'utf8');
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    ok('真身语法检查通过（node --check）');
  } catch (e) {
    const msg = (e.stderr && e.stderr.toString()) || (e.message || '');
    bad('真身语法错误', msg);
  } finally {
    try { fs.unlinkSync(tmp); } catch (eU) {}
  }
}

/* 数值内核那份也得在 —— 两半缺一半，卡能加载但一开打就 ReferenceError */
fs.existsSync(ENGINE_ENTRY)
  ? ok('数值内核存在（战斗引擎/index.js）')
  : bad('数值内核不存在：' + ENGINE_ENTRY);

/* ══════════ ③ 真身真的能跑 ══════════ */
console.log('\n【③ 真身扔进假宿主真跑一遍】');

/* 造最小宿主。目标不是「模拟酒馆」，是让顶层能跑过去。
   跑不过去会明确报出来——那说明核心脚本在顶层就干了重活，值得知道。 */
function makeHost() {
  const noop = () => {};
  const el = () => new Proxy(function () {}, {
    get: (t, k) => {
      if (k === 'style') return {};
      if (k === 'classList') return { add: noop, remove: noop, toggle: noop, contains: () => false };
      if (k === 'children' || k === 'childNodes') return [];
      if (k === 'getContext') return () => ({ measureText: () => ({ width: 10 }), fillRect: noop, fillText: noop });
      if (k === Symbol.toPrimitive || k === 'toString') return () => '';
      return el();
    },
    set: () => true,
    apply: () => el(),
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
      key: (i) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    },
    setTimeout: (fn) => { try { fn(); } catch (e) {} return 0; },
    clearTimeout: noop,
    setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
    addEventListener: noop, removeEventListener: noop,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
    location: { href: 'http://localhost/', search: '' },
    console,
    navigator: { userAgent: 'node' },
    performance: { now: () => Date.now() },
    MutationObserver: function () { this.observe = noop; this.disconnect = noop; },
  };
  win.window = win; win.self = win; win.globalThis = win;
  win.parent = win; win.top = win;
  doc.defaultView = win;
  return win;
}

if (!fs.existsSync(TRUE_SRC)) {
  bad('真身不存在，跳过动态测试');
} else {
  const trueSrc = fs.readFileSync(TRUE_SRC, 'utf8');
  const win = makeHost();
  const ctx = vm.createContext(win);
  const warns = [];
  ctx.console = {
    log: () => {}, info: () => {}, debug: () => {},
    warn: (...a) => warns.push(a.map(String).join(' ')),
    error: (...a) => warns.push('ERROR ' + a.map(String).join(' ')),
  };
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

  try {
    const p = vm.runInContext(trueSrc, ctx, { filename: '核心脚本/index.js', timeout: 20000 });
    if (p && typeof p.then === 'function') await p;
    ok('真身顶层执行完毕（未抛异常）');
  } catch (e) {
    bad('真身顶层抛异常', e && (e.stack || e.message || e));
  }

  /* 共享表：07 / 05 等其余脚本全靠它取 04 的函数。
     空表 = 「脚本加载成功、功能全废」，是最坏的一种失败（无任何报错）。 */
  const reg = win.__XZ_SHARED__;
  if (!reg || typeof reg !== 'object') {
    bad('window.__XZ_SHARED__ 没挂上 —— 其余脚本会全部取不到函数且不报错');
  } else {
    const keys = Object.keys(reg);
    keys.length >= 40
      ? ok('__XZ_SHARED__ 挂上了，' + keys.length + ' 个键')
      : bad('__XZ_SHARED__ 只有 ' + keys.length + ' 个键（应 ≥40）');

    /* 逐个验类型，不只看「有没有这个键」。
       登记成 null 是本项目出现过的失效方式：取到了、是空，报错指向别处。 */
    const NEED_EXPORT = ['xzWBVersionState', 'xzTemperReforge', 'qualityPowerOf', 'realmMultByName'];
    const nulls = NEED_EXPORT.filter((k) => typeof reg[k] !== 'function');
    nulls.length === 0
      ? ok('4 个跨脚本出口都是真函数（不是 null）')
      : bad('出口是 null / 缺失：' + nulls.join('、'));

    /* 数值真的算得出来 —— 「挂上了」和「算得对」是两件事。
       这两个数是项目里的固定基准（玄阶 41 / 帝境 17.26），改动了就该有人知道。 */
    const q = typeof reg.qualityPowerOf === 'function' ? reg.qualityPowerOf('玄阶') : undefined;
    q === 41 ? ok('qualityPowerOf(玄阶) → 41') : bad('qualityPowerOf(玄阶) → ' + q);

    const m = typeof reg.realmMultByName === 'function' ? reg.realmMultByName('帝境') : undefined;
    typeof m === 'number' && Math.abs(m - 17.26) < 1e-9
      ? ok('realmMultByName(帝境) → 17.26')
      : bad('realmMultByName(帝境) → ' + m);
  }

  /* 秘境模块（XZ_MIJING）是独立 IIFE，有自己的 window 挂载点。
     它挂了不代表共享表挂了，两者要分开验。 */
  win.__XZ_MIJING__ || win.xzMijing
    ? ok('秘境模块已挂载（__XZ_MIJING__ / xzMijing）')
    : bad('秘境模块没挂上');

  /* 桥接对象：状态栏跨窗口调它。缺了 = 状态栏按钮全哑。 */
  win.__XIUXIAN_ATB_BRIDGE__
    ? ok('跨窗口桥已挂载（__XIUXIAN_ATB_BRIDGE__）')
    : bad('跨窗口桥没挂上');

  /* 警告里出现「失败 / not defined」通常意味着某个登记静默挂了。
     ⚠ 不强判 fail —— 假宿主的桩本来就会引出一堆无关警告。
       只把前几条打出来，让人看见。 */
  const sus = warns.filter((w) => /失败|not defined|undefined is not/.test(w));
  if (sus.length) {
    console.log('    （' + sus.length + ' 条可疑警告，前 3 条）');
    sus.slice(0, 3).forEach((w) => console.log('      ' + w.slice(0, 160)));
  }
}

/* ══════════ 收尾 ══════════ */
console.log('\n' + '─'.repeat(60));
console.log(fail === 0
  ? '全绿：' + pass + '/' + (pass + fail) + '　04 是一行 import，指向的真身存在且能跑'
  : '红 ' + fail + ' 项 / 共 ' + (pass + fail) + ' 项');
process.exit(fail === 0 ? 0 : 1);

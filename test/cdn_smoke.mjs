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
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SRC04 = path.join(ROOT, '脚本/04-核心脚本.js');
const TRUE_SRC = path.join(ROOT, '战斗引擎/核心脚本/index.js');
const ENGINE_ENTRY = path.join(ROOT, '战斗引擎/index.js');
const VER_FILE = path.join(ROOT, '工具/版本号.txt');

/* ⚠ v397 上限从 8192 放宽到 16384。
   原因是 04 从「一行裸 import」变成「多镜像回退链」——多了 for + try/catch + 错误上报，
   去注释后约 1.2KB、带注释约 5.4KB。上限的意义是**挡住算法回流**（那是 2MB 量级），
   不是把注释也算成实现。8KB 和 16KB 在「2MB vs 16KB」这个量级差面前没有区别，
   但 8KB 会逼着以后的人删注释来凑数 —— 那才是真的损失。 */
const MAX_CARD_BYTES = 16384;

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

/* 去掉注释后应当**只剩一小段加载逻辑**，且里边没有算法。
   ⚠ v397 改了判据：原来硬判「恰好 1 条 import 语句」。
     v397 把一行裸 import 换成多镜像回退链（20 行，带 for + try/catch）之后，
     这条判据过期 ⇒ 恒红。而它排在 跑闸.sh 很前面，一红后面 290 多条闸全跑不到
     ⇒ 等于**失去全部保护**。这类"判据过期"比真 bug 更危险：它训练人忽略红灯。
   新判据表达的是**意图**而不是写法：
     卡里可以有权重试逻辑，但**绝不能有算法**（见下面 ALGO_SIGNS），
     且**必须有一条真的 import**（否则实现根本不会被加载）。 */
const codeOnly = cardSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
  .trim();

/* 地址类判据统一走 工具/_xz_shellmode.cjs —— 它已经会剥注释，
   否则文件头注释里那句示例 `import 'https://…'` 会被当成真地址。 */
const SM = createRequire(import.meta.url)(ROOT + '/工具/_xz_shellmode.cjs');
const MIRRORS = SM.mirrorsOf(cardSrc);
const URLS = (() => {
  const a = [];
  const u = SM.urlOf(cardSrc);
  if (u) a.push(u);
  for (const x of MIRRORS) if (a.indexOf(x) < 0) a.push(x);
  return a;
})();

const hasImport = /\bimport\s*[('"]/.test(codeOnly);
hasImport
  ? ok('卡里有真的 import（实现会被加载）' + (MIRRORS.length > 1 ? '，' + MIRRORS.length + ' 个镜像候选' : ''))
  : bad('卡里没有任何 import —— 实现不会被加载');

if (MIRRORS.length > 1) {
  /* 多镜像：顺序即优先级，必须和「实测成功率降序」这个约定一致。
     这里只提醒不判红 —— 成功率要靠 工具/检查CDN.sh 现测，写死在闸里就成了化石。 */
  ok('镜像回退链形态（' + MIRRORS.length + ' 个镜像）。顺序请用 sh 工具/检查CDN.sh 复核');
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

/* 卡里不该有函数定义 / 变量声明（aside from 加载逻辑本身），更不能有 await 之外的算法。
   ⚠ v397 连续踩了两次「判据比规则更宽/更窄」的坑，这里把口径定清楚：
     · `await` 现在**允许** —— 多镜像回退链靠它逐个试，它不再意味着"算法在卡里"。
     · `function` 也**允许** —— 加载逻辑里有个 `function host()`（找 window.top）。
       卡它的话，只能把 5 行代码改写成箭头函数来糊弄判据，纯属自欺。
     · 真正要守的是「**去注释后的代码量**」：算法 2MB、加载逻辑 1.2KB，差三个数量级。
       这条比数关键字硬得多 —— 关键字可以绕，体量绕不过去。
     阈值 3000 字节 ≈ 当前 1206 字节的 2.5 倍余量，改动留够了空间。 */
const CODE_ONLY_MAX = 3000;
const codeBytes = Buffer.byteLength(codeOnly, 'utf8');
codeBytes < CODE_ONLY_MAX
  ? ok('去注释后的代码 ' + codeBytes + ' 字节（< ' + CODE_ONLY_MAX + '），只有加载逻辑')
  : bad('去注释后的代码 ' + codeBytes + ' 字节 —— 超了，说明有实现搬回卡里了');

const badShape = [
  [/\bexport\b/, 'export'],
].filter(([re]) => re.test(codeOnly));
badShape.length === 0
  ? ok('没有 export 声明（不是模块，不该有导出）')
  : bad('卡里出现不该有的关键字：' + badShape.map((x) => x[1]).join('、'));

/* ══════════ ② 那些地址指向的东西真的存在 ══════════ */
console.log('\n【② 指向的真身存在且版本对得上】');

/* ⚠ v397：地址统一从 工具/_xz_shellmode.cjs 取，不在本文件里写正则。
   历史上 04 的形态改过三次（直写 @main → tag 拼接 → 一行 import → 多镜像），
   每次都让散落各处的正则**静默失效**。这里取到的 URLS 可能是 1 个（旧形态）
   也可能是 4 个（多镜像）。 */
if (!URLS.length) {
  bad('一条 import 地址都取不到 —— 卡里的加载块结构又变了');
} else {
  URLS.forEach((u, i) => ok('地址[' + i + ']：' + u));

  /* ⚠ 锁 tag 不锁 @main —— 这是 v394 的真实事故，不是洁癖。
     实测同一时刻 cdn / fastly / gcore 还在发 v1.0.0（少导出 25 张常量表），
     只有 testingcf 是 v1.1.0。结果是「import 成功、日志正常、所有数值静默失效」。
     @main 每次解析都跟着分支走，各节点缓存进度不同步 ⇒ 必然再出一次。 */
  const tags = URLS.map((u) => (/@(v[\d.]+)\//.exec(u) || [])[1]);
  const mainOnes = URLS.filter((u) => /@main\b/.test(u));
  if (mainOnes.length) {
    bad('有 ' + mainOnes.length + ' 个地址用 @main —— 各节点缓存不同步，玩家会拿到旧版且零报错');
  } else if (tags.every(Boolean)) {
    /* 全部地址必须用**同一个** tag。不一致意味着玩家可能拉到两个版本。 */
    const uniq = [...new Set(tags)];
    uniq.length === 1
      ? ok('全部 ' + URLS.length + ' 个地址锁同一个 tag（@' + uniq[0] + '），不是 @main')
      : bad('镜像之间的 tag 不一致：' + uniq.join(' / '));
  } else {
    bad('地址里既没有 tag 也不是 @main：' + URLS.filter((u) => !/@v[\d.]+\//.test(u)).join(' , '));
  }

  /* 路径必须真的指向仓库里的 核心脚本/index.js —— 写错就是线上 404。
     ⚠ 这条同时守住了"地址被截断"：截断的地址（少了 tag/路径）必然在这里红。 */
  const wrongPath = URLS.filter((u) => !/\/核心脚本\/index\.js$/.test(u));
  wrongPath.length === 0
    ? ok('全部地址都指向 /核心脚本/index.js')
    : bad('有地址路径不是 /核心脚本/index.js（多半是 BASE 拼接被截断了）：' + wrongPath.join(' , '));

  /* 仓库名要对：用户名 cesareborgia576-cloud（用户明确纠正过一次，别搞错） */
  const wrongRepo = URLS.filter((u) => !/jsdelivr\.net\/gh\/cesareborgia576-cloud\/xz-battle-engine@/.test(u));
  wrongRepo.length === 0
    ? ok('全部地址的仓库为 cesareborgia576-cloud/xz-battle-engine')
    : bad('仓库名不对：' + wrongRepo.join(' , '));
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

  /* ★★★ v396 改了判据：卡版本号不再烧在引擎里 ★★★
     旧判据是「真身的 XZ_BUILD === 工具/版本号.txt」。
     那条判据在「04 是一行 import」之后是**有害的**：它把卡版本号钉进了按 tag 锁内容的
     CDN 文件里 ⇒ 每发一版卡都得重推 2.19 MB 引擎。现在引擎改成
     `XZ_BUILD = (读 window.__XZ_CARD_VER__) || '自带号'`，卡版本号由 05 注入。
     所以这里该验的变成了下面三件事（顺序 = 出错时的排查顺序）：
       ① 引擎确实支持注入（不是硬编码常量）
       ② 05 里确实留了占位，且**磁盘上必须是占位原文**（打包器靠它替换）
       ③ 引擎自带号是个合法版本号（不是 dev/undefined，那是回落时的最后一道） */
  const verNow = fs.existsSync(VER_FILE) ? fs.readFileSync(VER_FILE, 'utf8').trim() : '';

  const supportsInject = /__XZ_CARD_VER__/.test(trueSrc);
  supportsInject
    ? ok('引擎支持 __XZ_CARD_VER__ 注入（卡版本号不再烧死在 CDN 文件里）')
    : bad('引擎还在硬编码 XZ_BUILD —— 发一版卡就得重推 2.19 MB 引擎，徽章还会假红');

  /* 自带号：必须存在且合法（注入失败时的最后一道） */
  const fallbackM = /return '(v\d+(?:\.\d+)*)';/.exec(trueSrc);
  fallbackM
    ? ok('引擎自带回落号 ' + fallbackM[1] + '（注入没到时用它，不会印出 undefined）')
    : bad('引擎里找不到合法的 XZ_BUILD 回落号');

  /* 05 的占位：磁盘上必须是原文，否则说明有人"顺手"把它改成了真号 */
  const S05 = path.join(ROOT, '脚本', '05-界面脚本.js');
  if (!fs.existsSync(S05)) {
    bad('找不到 05-界面脚本.js');
  } else {
    const s5 = fs.readFileSync(S05, 'utf8');
    s5.includes("'__XZ_CARD_VER__'")
      ? ok('05 留着版本号占位 __XZ_CARD_VER__（打包时替换成本版号）')
      : bad('05 的占位被改掉了 —— 打包器将无法注入，且下一版会静默用旧号');
    /* 反向：05 里不许出现「已经写成真号」的 CARD_VER —— 那是上一个坑的形态 */
    const burned = /var CARD_VER = '(v\d+)';/.exec(s5);
    burned
      ? bad('05 的 CARD_VER 被写成了真号 ' + burned[1] + ' —— 必须留占位 __XZ_CARD_VER__')
      : ok('05 没有把版本号烧死（仍是占位）');
  }
  if (verNow) ok('当前卡版本号（工具/版本号.txt）=' + verNow);

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

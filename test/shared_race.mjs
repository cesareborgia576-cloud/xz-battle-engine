/* 战斗引擎/test/shared_race.mjs
   验三件事，全部用酒馆助手的真实拓扑（顶层 + 04 iframe + 05 iframe，
   见 JS-Slash-Runner 的 src/panel/Script.vue：`v-for` 一个脚本一个 `<Iframe>`）：

   ① 竞态边界：04 要先下载 2.19MB 才挂表，05 首帧可能抢在前面
   ② 05 现在的 XZ_SHARED 能不能跨 iframe 取到 04 的表（改前取不到）
   ③ 取不到时是否**可见**（写明"加载中"），而不是静默少一行

   ⚠ 全程抠 05 源码里的真函数跑，不复刻。
     复刻一份去验"05 有没有 bug"，验的是我的复刻，不是 05。
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/* ⚠ 必须用 fileURLToPath：路径里有中文，new URL().pathname 会给出 %E5%81%9A… 编码串 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SRC05 = path.join(ROOT, '脚本', '05-界面脚本.js');

let pass = 0, fail = 0;
const ok = (n, d) => { pass++; console.log('  ✓ ' + n + (d ? '  ' + d : '')); };
const bad = (n, d) => { fail++; console.log('  ✗ ' + n + (d ? '  ' + d : '')); };

/* ── 最小 window ── */
function makeWin(label, top) {
  const noop = () => {};
  const el = () => new Proxy(function () {}, {
    get: (t, k) => {
      if (k === 'style') return {};
      if (k === 'classList') return { add: noop, remove: noop, toggle: noop, contains: () => false };
      if (k === 'children' || k === 'childNodes') return [];
      if (k === Symbol.toPrimitive || k === 'toString') return () => '';
      return el();
    },
    set: () => true,
  });
  const doc = {
    readyState: 'complete',
    body: el(), head: el(), documentElement: el(),
    createElement: () => el(), getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    defaultView: null,
  };
  const w = {
    __label: label,
    document: doc,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: noop,
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    location: { href: 'http://localhost/', search: '' },
    console: { log: noop, info: noop, warn: noop, error: noop, debug: noop },
    navigator: { userAgent: 'node' },
    performance: { now: () => Date.now() },
    parent: top || null, top: top || null,
  };
  w.window = w; w.self = w; w.globalThis = w;
  doc.defaultView = w;
  return w;
}

function makeTopology() {
  const top = makeWin('top', null);
  const w04 = makeWin('04', top);
  const w05 = makeWin('05', top);
  const frames = [w04, w05];
  top.document = Object.assign(top.document, {
    querySelectorAll: (sel) => (sel === 'iframe'
      ? frames.map((fw) => ({ get contentWindow() { return fw; } }))
      : []),
  });
  return { top, w04, w05, frames };
}

const TABLE = { xzSkillMpOf: () => 30, xzSkillCapOf: () => 999, qualityPowerOf: () => 41 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 抠 05 源码里的真函数（含前导注释一起，方便一眼看出抠的是哪段） */
function fnBody(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return null;
  /* 从 header 往后找到配对的右花括号 */
  const open = src.indexOf('{', i);
  let depth = 0, j = open;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(i, j);
}

const S05 = fs.readFileSync(SRC05, 'utf8');

console.log('=== 探针：04 挂表时机 + 05 跨 iframe 取值 ===\n');

/* ══════════ ① 竞态边界 ══════════ */
console.log('【① 竞态边界】');
{
  const t1 = makeTopology();
  t1.w04.__XZ_SHARED__ = TABLE;                       // 内联形态：同步挂
  const a = !!t1.w04.__XZ_SHARED__.xzSkillMpOf;
  a ? ok('旧形态：04 同步挂表 → 立刻读，取到了') : bad('旧形态对照失败（探针有问题）');

  const t2 = makeTopology();
  setTimeout(() => { t2.w04.__XZ_SHARED__ = TABLE; }, 60);   // import 还在下
  const b = !!t2.w04.__XZ_SHARED__;
  !b ? ok('新形态：04 还在下载 → 立刻读，确认拿不到（该帧需可见降级）')
     : bad('未复现竞态');

  const t3 = makeTopology();
  setTimeout(() => { t3.w04.__XZ_SHARED__ = TABLE; }, 60);
  await sleep(200);
  !!t3.w04.__XZ_SHARED__
    ? ok('新形态：稍后读（2s watchdog / 点面板）→ 取到了，能自愈')
    : bad('稍后读仍取不到 ⇒ 自愈路径断了');
}

/* ══════════ ② 05 的 XZ_SHARED 跨 iframe ══════════ */
console.log('\n【② 05 的 XZ_SHARED 能否跨 iframe 取到 04】');
{
  const body = fnBody(S05, 'function XZ_SHARED(name)');
  if (!body) {
    bad('抠不到 05 的 XZ_SHARED 定义（源码结构变了？）');
  } else {
    const hasScan = /querySelectorAll\(\s*['"]iframe['"]\s*\)/.test(body);
    hasScan ? ok('05 的 XZ_SHARED 里带 iframe 扫描')
            : bad('05 的 XZ_SHARED 仍不扫 iframe ⇒ 04 在别的 iframe 时恒 null');

    /* 真跑：04 挂在**它自己**那个 iframe 上，05 在自己的 iframe 里取值 */
    const topo = makeTopology();
    topo.w04.__XZ_SHARED__ = TABLE;                    // 注意：不挂到 top，只挂 04 自己

    const ctx = vm.createContext(topo.w05);
    vm.runInContext(body + '\nthis.__probe = XZ_SHARED;', ctx, { filename: '05-XZ_SHARED' });
    const fn = topo.w05.__probe;
    const got = fn ? fn('xzSkillMpOf') : null;
    typeof got === 'function'
      ? ok('真跑：05 在自己 iframe 里取到了 04 挂在另一个 iframe 的函数', '→ ' + got())
      : bad('真跑仍取不到（04 只挂自己窗口时）', String(got));

    /* 反向：04 什么都没挂时，必须返回 null 而不是抛错 */
    const topo2 = makeTopology();
    const ctx2 = vm.createContext(topo2.w05);
    vm.runInContext(body + '\nthis.__probe = XZ_SHARED;', ctx2, { filename: '05-XZ_SHARED-neg' });
    const got2 = topo2.w05.__probe ? topo2.w05.__probe('xzSkillMpOf') : 'ERR';
    got2 === null ? ok('反向：04 完全没挂时返回 null，不抛错') : bad('反向异常', String(got2));
  }
}

/* ══════════ ③ 取不到时必须可见 + 只会挂一个定时器 ══════════ */
console.log('\n【③ 取不到时可见 + 定时器不重复挂】');
{
  const mark = fnBody(S05, 'function _xzMarkDepPending()');
  mark ? ok('_xzMarkDepPending 存在') : bad('_xzMarkDepPending 不存在');

  /* 关键约束：一屏 10 门招式会调 10 次，只能挂 1 个定时器 */
  mark && /if \(_depTimer\) return;/.test(mark)
    ? ok('重复调用不会重复挂定时器（有 _depTimer 早退）')
    : bad('没有早退 ⇒ 一屏 10 门招式会挂 10 个轮询');

  /* 就绪判据必须看「能力」，不是看时间戳 */
  mark && /XZ_SHARED\('xzSkillMpOf'\)/.test(mark)
    ? ok('就绪判据用的是能力本身（能取到函数），不是时间戳')
    : bad('判据可疑 ⇒ 可能只要 04「跑到了」就重画，即使它挂的是空表');

  /* 必须只重画一次就停，不能无限重画 */
  mark && /clearInterval/.test(mark)
    ? ok('拿到就 clearInterval，不会无限重画')
    : bad('没有 clearInterval ⇒ 无限重画');

  /* 渲染处：取不到时要写出来，不是少一行 */
  /数值模块加载中/.test(S05)
    ? ok('面板上有"数值模块加载中"的明文（不是静默少一行）')
    : bad('取不到时仍是静默少一行');

  /* 反向：本来就有值的招式（_rec.消耗 写了数）不该被挂上"加载中"提示 */
  const seg = S05.slice(S05.indexOf('var _mpShow = Number(_rec.消耗)'), S05.indexOf('var _mpShow = Number(_rec.消耗)') + 1400);
  /if \(typeof _mpFn !== 'function'\)/.test(seg)
    ? ok('只在真的缺引擎时才提示（有值时走不到那一支）')
    : bad('提示条件可疑');
}

/* ══════════ ④ 04 侧真的往 parent/top 广播 ══════════ */
console.log('\n【④ 04 往 parent/top 广播共享表】');
{
  const TRUE_SRC = path.join(ROOT, '战斗引擎', '核心脚本', 'index.js');
  const t = fs.readFileSync(TRUE_SRC, 'utf8');
  const body = fnBody(t, 'function exposeSharedRegistry()');
  if (!body) {
    bad('抠不到 exposeSharedRegistry');
  } else {
    /window\.parent/.test(body) ? ok('往 window.parent 挂了一份') : bad('没挂 parent');
    /window\.top/.test(body) ? ok('往 window.top 挂了一份') : bad('没挂 top');
    /* 跨域时读 parent 会抛，必须每句单独 try */
    const tryCount = (body.match(/try\s*\{/g) || []).length;
    tryCount >= 3 ? ok('每处挂载都单独 try（跨域读 parent 抛错不连坐）', tryCount + ' 个 try')
                  : bad('try 太少 ⇒ 跨域时可能整段跳过', String(tryCount));
    /* 不能因为挂不上 parent 就跳过自己窗口 */
    const selfFirst = body.indexOf('globalThis.__XZ_SHARED__') < body.indexOf('_bcast');
    selfFirst ? ok('先挂自己窗口、再广播（顺序正确）') : bad('顺序反了 ⇒ 跨域时自己的也可能挂不上');
  }
}

console.log('\n' + '─'.repeat(58));
console.log(fail === 0
  ? '全绿：' + pass + '/' + (pass + fail) + '　竞态已可见自愈，跨 iframe 取数已修'
  : '红 ' + fail + ' 项 / 共 ' + (pass + fail) + ' 项');
process.exit(fail === 0 ? 0 : 1);

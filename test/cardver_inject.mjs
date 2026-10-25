/* 战斗引擎/test/cardver_inject.mjs
   ─────────────────────────────────────────────────────────────────────────────
   验「卡版本号」这条链：卡 → 05 → 引擎。

   ⚠ 这个测试是为什么存在的（写下来，不然半年后没人知道它防的是什么）：
     `XZ_BUILD` 语义是**这张卡的版本号**，它唯一的实际用途是跟世界书
     《版本号测试》里那条对账 —— 状态栏那枚 `📖 世界书 vNNN` 徽章的判据。
     04 改成一行 import 之后，这个常量物理上住到了 CDN 仓库里，
     而 CDN 是按 tag 锁内容的 ⇒ **每发一版卡都要重推 2.19 MB 引擎只为改一个字符串**。
     不推的后果不是报错，而是：
       · 徽章永远报「世界书没同步」（它指的补救动作「重新导入世界书」恰好无效）；
       · 闸红在「CDN 与本地字节一致」，红灯理由指向一个假问题。

   所以把归属改对：卡版本号由**卡自己的 05** 给出（占位 `__XZ_CARD_VER__`，
   打包时替换），引擎只负责读。这个文件就是钉住这条链的每条接缝。

   验 5 组，缺一条链就是断的：
     ① 引擎真的会读注入值（不是硬编码）
     ② 引擎有合法回落号（注入没到时印得出人话，不是 undefined）
     ③ 05 的占位在、且**没被烧成真号**（烧死 = 下一版静默用旧号）
     ④ 打包器真的会替换，且「找不到占位」时硬失败（不静默）
     ⑤ 真跑：把 05 那段注入代码抠出来执行 → 引擎读到的是本版号
   ───────────────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const ENGINE_TRUE = path.join(ROOT, '战斗引擎/核心脚本/index.js');
const S05 = path.join(ROOT, '脚本/05-界面脚本.js');
const PACK = path.join(ROOT, '工具/pack.js');
const VER_FILE = path.join(ROOT, '工具/版本号.txt');

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('  ✓ ' + n); };
const bad = (n, d) => {
  fail++;
  console.log('  ✗ ' + n + (d ? '\n      ' + String(d).split('\n').slice(0, 6).join('\n      ') : ''));
};

console.log('=== 卡版本号注入链（卡 → 05 → 引擎）===\n');

const eng = fs.readFileSync(ENGINE_TRUE, 'utf8');
const s5 = fs.readFileSync(S05, 'utf8');
const packSrc = fs.readFileSync(PACK, 'utf8');
const verNow = fs.existsSync(VER_FILE) ? fs.readFileSync(VER_FILE, 'utf8').trim() : '';

/* ══════════ ① 引擎会读注入值 ══════════ */
console.log('【① 引擎读 window.__XZ_CARD_VER__（而不是硬编码）】');
{
  /* 硬编码的识别特征：`var XZ_BUILD = 'vNNN';` 这种一口气赋值 */
  const hard = /var XZ_BUILD\s*=\s*'v?\d/.test(eng);
  hard
    ? bad('引擎还是硬编码 XZ_BUILD —— 发一版卡就得重推 2.19 MB 引擎，徽章还会假红')
    : ok('不是硬编码赋值');

  /__XZ_CARD_VER__/.test(eng)
    ? ok('引擎里出现 __XZ_CARD_VER__（注入入口在）')
    : bad('引擎里没有 __XZ_CARD_VER__ —— 注入值根本没人读');

  /* 只认版本号形态：宿主被写脏时不能把乱码印进战报 */
  /\^v\?\\d\+\(\?:\\\.\\d\+\)\*\$/i.test(eng) || /\/\^v\?\\d\+/.test(eng)
    ? ok('注入值有格式校验（只收 vNNN 形态）')
    : bad('注入值没有格式校验 —— 宿主被写脏会把乱码印进战报');
}

/* ══════════ ② 回落号合法 ══════════ */
console.log('\n【② 注入没到时有合法回落号】');
{
  const m = /return '(v\d+(?:\.\d+)*)';/.exec(eng);
  if (!m) {
    bad('找不到合法回落号（注入失败时战报会印出 undefined/空）');
  } else {
    ok('回落号 = ' + m[1] + '（合法版本号形态）');
    /* ★ 回落号**不该**等于卡版本号：它代表「引擎自己这一版」。
       两者相等说明还在用「改引擎来改卡版本」的老路。 */
    if (verNow && m[1] === verNow) {
      bad('回落号 ' + m[1] + ' 恰好等于卡版本号 —— 说明还在用「改引擎来改卡版本」的老路，'
        + '下版会漂');
    } else {
      ok('回落号与卡版本号（' + verNow + '）分开 —— 引擎内容与卡版本已解耦');
    }
  }
}

/* ══════════ ③ 05 的占位 ══════════ */
console.log('\n【③ 05 留着占位，没被烧成真号】');
{
  s5.includes("'__XZ_CARD_VER__'")
    ? ok('占位 __XZ_CARD_VER__ 在磁盘上是原文（打包器靠它替换）')
    : bad('占位被改掉了 —— 打包器注入不了，下一版会静默用旧号');

  const burned = /var CARD_VER\s*=\s*'(v\d+)';/.exec(s5);
  burned
    ? bad('CARD_VER 被写成真号 ' + burned[1] + ' —— 必须留占位，否则下一版忘改就永久假红')
    : ok('CARD_VER 没被烧成真号');

  /* 占位没被替换时要**不注入**，不能把 '__XZ_CARD_VER__' 这个字面量当版本号 */
  /if\s*\(\s*!\/\^v\\d\+\$\/\.test\(CARD_VER\)\s*\)\s*return/.test(s5)
    ? ok('占位没被替换时直接 return（不会把字面量当版本号印出去）')
    : bad('占位没被替换时代码仍会注入 —— 战报会印出 __XZ_CARD_VER__');

  /* 05 必须同时写 window 和 globalThis：04/05 在不同 iframe，靠的正是 window 那一份 */
  s5.includes('window.__XZ_CARD_VER__')
    ? ok('往 window 写了（04/05 跨 iframe 时靠这一份）')
    : bad('没往 window 写 —— 跨 iframe 时 04 读不到');

  /* 04 可能比 05 先跑完，所以 05 还要用 __XZ_SET_BUILD__ 补推一次 */
  s5.includes('__XZ_SET_BUILD__')
    ? ok('还用 __XZ_SET_BUILD__ 补推（04 先跑完时也能改过来）')
    : bad('没有补推通道 —— 04 先跑完就会一直用回落号');
  /window\.__XZ_SET_BUILD__\s*=/.test(eng)
    ? ok('引擎确实开了 __XZ_SET_BUILD__ 这个口')
    : bad('引擎没开 __XZ_SET_BUILD__ —— 05 补推会静默无效');
}

/* ══════════ ④ 打包器真的替换，且找不到就硬失败 ══════════ */
console.log('\n【④ 打包器注入（找不到占位必须硬失败，不能静默）】');
{
  packSrc.includes('__XZ_CARD_VER__')
    ? ok('pack.js 里有 __XZ_CARD_VER__ 的替换逻辑')
    : bad('pack.js 不认占位 —— 卡里会留着字面量，05 直接 return，引擎永远用回落号');

  /* 硬失败：匹配不到就 process.exit，不能只是 console.log 然后继续。
     ★ v396 判据换了：不再盯 `indexOf(NEEDLE) < 0` 那种写法 —— 那种写法**恰恰是 bug 本身**
       （见下面那条新断言）。现在只要求"注入函数里对"找不到"和"多处"都硬失败"。 */
  /function injectCardVer\(/.test(packSrc)
    ? ok('注入逻辑抽成了 injectCardVer（可被单测直接验）')
    : bad('注入逻辑还是内联的 —— 没法单独验，只能靠"打包没报错"来猜');
  const injM = /function injectCardVer\([\s\S]*?\n\}/.exec(packSrc);
  const injBody = injM ? injM[0] : '';
  ((injBody.match(/ok:\s*false/g) || []).length >= 2)
    ? ok('「找不到占位」和「多处赋值」都返回 ok:false（调用方据此 exit 9）')
    : bad('injectCardVer 没有覆盖两种失败（找不到 / 多处），会把错卡发出去');
  /process\.exit\(9\)/.test(packSrc)
    ? ok('注入失败时 process.exit 硬失败（不静默）')
    : bad('找不到占位只打日志不退出 —— 会把一张「引擎用回落号」的卡发出去');

  /* ★★★ v396 这条是**真事故的回归锁** ★★★
     事故：注入用 `txt.replace("'__XZ_CARD_VER__'", 真号)`，只换第一处；
     而 05 里第一处占位在**注释**里（用法说明），真正的 `var CARD_VER = '...'` 在注释后面。
     ⇒ 注释被改了、赋值没改 ⇒ 卡里 05 的 CARD_VER 仍是字面量 ⇒ 注入 IIFE 正则不过 ⇒
       直接 return ⇒ 引擎回落旧号 ⇒ 徽章永久报「世界书没同步」。全程打包器输出 ✔。
     ⇒ 判据两条：① 必须用赋值语句的正则定位；② 不许对裸字符串做 replace。
     ⚠⚠ 这两条**必须只看 injectCardVer 的函数体、且剥掉注释**。
       我第一版扫的是整个 pack.js，结果两条都红：因为失败写法的**原文就写在
       那段解释事故的注释里**（"事故：注入用 `txt.replace(...)`"）。
       判据扫注释 = 把"记录错误"读成"犯了错误" —— 和本项目之前踩过的
       「剥注释后 PLACE_DICT 被判零读」是同一类错，方向相反。 */
  const injNoCmt = injBody
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  /* 只看锚点：函数体里有没有一个以 `var CARD_VER = '` 开头的匹配模式。
     ⚠ 不在这里重写那个完整正则 —— 判据自己抄一遍正则再判一遍，
       抄错了就是"判据比实现严"⇒ 假红（第一次就栽在这：`\\d\+` 在 JS 正则字面量里
       匹配的是字面反斜杠+加号，永远 false）。判"用的是赋值语句锚点"就够了。 */
  /var CARD_VER = '/.test(injNoCmt)
    ? ok('注入按「赋值语句」定位（不是裸字符串，注释里那处不会被误改）')
    : bad('注入还在按裸字符串 `\'__XZ_CARD_VER__\'` 找 —— 会命中注释里的用法说明，静默失效');
  /\.replace\(\s*NEEDLE\b/.test(injNoCmt)
    ? bad('还在对裸字符串做 replace —— 只换第一处（注释），赋值语句原样留着占位')
    : ok('不对裸字符串做 replace（这类替换换掉的是注释，不是代码）');
  /hits\.length > 1[\s\S]{0,200}?ok:\s*false/.test(injBody) || /hits\.length > 1/.test(injBody)
    ? ok('多处赋值时拒绝注入（改哪一处都可能是错的）')
    : bad('多处赋值时不报错 —— 会挑一个改掉，另一半留占位');

  /* ★ 关键：只能改**装进卡那份**，不能改磁盘。
     改磁盘 ⇒ 「脚本与磁盘逐字一致」那条闸假红，且下次会把上一版的号当占位再替换 */
  /let txt = fs\.readFileSync/.test(packSrc)
    ? ok('用的是局部 let txt（只改灌进卡的那份，不动磁盘）')
    : bad('可能直接改了磁盘文件 —— 工作区会永久比卡多一个改动');
  /const txt = fs\.readFileSync/.test(packSrc)
    ? bad('txt 还是 const —— 后面没法替换，注入不会发生')
    : ok('txt 不是 const，可以替换');
}

/* ══════════ ⑤ 真跑：抠 05 的注入段执行，引擎读到本版号 ══════════ */
console.log('\n【⑤ 真跑一遍注入链】');
{
  /* 抠 05 里那个 IIFE（从「var CARD_VER」到它所在 IIFE 的 `})()`） */
  const at = s5.indexOf('var CARD_VER');
  if (at < 0) {
    bad('05 里找不到 var CARD_VER');
  } else {
    const start = s5.lastIndexOf('(function ()', at);
    const end = s5.indexOf('})();', at);
    let snippet = (start >= 0 && end > at) ? s5.slice(start, end + 5) : '';
    if (!snippet) {
      bad('抠不出 05 的注入 IIFE');
    } else {
      /* 模拟「打包器已替换成 v396」的那份：把占位换成真号再跑 */
      if (!verNow) {
        bad('读不到 工具/版本号.txt，跳过真跑');
      } else {
        const replaced = snippet.replace("'__XZ_CARD_VER__'", "'" + verNow + "'");
        const win = {};
        const ctx = { window: win, globalThis: win };
        try {
          vm.runInNewContext(replaced, ctx, { filename: 'cardver-snippet.js' });
          win.__XZ_CARD_VER__ === verNow
            ? ok('替换后跑起来，window.__XZ_CARD_VER__ = ' + win.__XZ_CARD_VER__)
            : bad('跑完了但没挂上 window.__XZ_CARD_VER__（实际 ' + win.__XZ_CARD_VER__ + '）');
        } catch (e) {
          bad('注入段跑起来抛错：' + (e && e.message));
        }

        /* 反向：占位**没**被替换时，必须什么都不注入 */
        const win2 = {};
        const ctx2 = { window: win2, globalThis: win2 };
        try {
          vm.runInNewContext(snippet, ctx2, { filename: 'cardver-raw.js' });
          win2.__XZ_CARD_VER__ === undefined
            ? ok('占位没替换时一个都不注入（不会把 __XZ_CARD_VER__ 当版本号）')
            : bad('占位没替换却注入了 ' + win2.__XZ_CARD_VER__ + ' —— 战报会印出字面量');
        } catch (e) {
          bad('占位原文跑起来抛错：' + (e && e.message));
        }
      }
    }
  }

  /* 05 补推通道：__XZ_SET_BUILD__ 被调用后，引擎里的 XZ_BUILD 应该换成新号。
     这里不重跑整个引擎（太慢，且 cdn_smoke 已经跑过），只验函数体认这个号。 */
  const setterBody = /window\.__XZ_SET_BUILD__ = function \(v\) \{([\s\S]{0,300}?)\};/.exec(eng);
  if (!setterBody) {
    bad('引擎里找不到 __XZ_SET_BUILD__ 的函数体');
  } else {
    const body = setterBody[1];
    /XZ_BUILD\s*=/.test(body)
      ? ok('__XZ_SET_BUILD__ 真的会改写 XZ_BUILD')
      : bad('__XZ_SET_BUILD__ 收下号但没赋给 XZ_BUILD（补推是空操作）');
    /test\(v\.trim\(\)\)|test\(v\)/.test(body)
      ? ok('补推也做格式校验（脏值改不进来）')
      : bad('补推不校验格式 —— 脏值能直接改掉 XZ_BUILD');
  }
}

console.log('\n' + '─'.repeat(60));
console.log((fail === 0 ? '全绿：' : '有红：') + pass + '/' + (pass + fail)
  + (fail === 0 ? '　卡版本号从卡注入到引擎，引擎内容与卡版本解耦' : ''));
process.exit(fail === 0 ? 0 : 1);

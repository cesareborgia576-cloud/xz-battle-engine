# 天元录 · 战斗引擎

《天元录》战斗数值内核的**独立可调用版本**。一行 import，`window.XZBattle` 就绪。

```js
import 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/xz-battle-engine@v1.1.0/index.js'
```

⚠ 用 **tag** 不用 `@main`，原因见下面「缓存那一节」——`@main` 出过一次真事故。

然后直接用：

```js
const B = window.XZBattle

B.parseEffect('伤害:2400｜烧尽三里')
// → { kind:'damage', dmgFlat:2400, dur:0, isBuff:false, ... }

B.qualityPower('玄阶')          // → 41
B.clampToCap(99999, '玄阶', '玄枢后期', '伤害')   // → 定档上限内的值
B.bigRealm('凝府中期')          // → '凝府'
B.realmCoeff('玄枢')            // → 1.5

B.critRate(atk, def)            // → 0.35
B.dr(def, ctx)                  // → 0.2
B.rollHit(atk, def, skill)      // → { mode:'命中', total:17.5, note:'【…】' }

B.attrCap('帝境')               // → 20   （单项上限）
B.attrTotalCap('帝境')          // → 38   （总量上限，保证不可能双满）
B.clampFour({力量:20,敏捷:20,体质:1,智力:1}, 38)
// → { v:{力量:18,敏捷:18,体质:2,智力:2}, over:42, cap:38, cut:true }
```

控制台确认版本：

```js
window.XZBattle.version
```

---

## 这包里有什么

| 分类 | 方法 | 说明 |
|---|---|---|
| **效果解析** | `parseEffect` / `parseBlood` / `atomName` / `effKey` / `effLine` | 把 `伤害:2400｜烧尽三里` 这类文本变成结构化数据 |
| **境界品阶** | `bigRealm` / `normRealm` / `realmCoeff` / `realmMult` / `realmRank` | 境界名归一 + 数值系数 |
| | `qualityPower` / `skillCap` / `clampToCap` / `skillMp` / `capEffectKeys` | 品阶威力、定档上限 |
| **四维** | `attrCap` / `attrTotalCap` / `clampFour` | 单项 20、总量 38（2×20−2） |
| **战斗判定** | `rollHit` / `hitBonus` / `evadeValue` / `critRate` / `dr` / `vuln` / `perm` | 一次交手的四步 |
| **机制读写** | `mechVal` / `mechFlag` / `mechStr` / `mechSub` / `mechSumField` / `mechBuffs` | 引擎的「属性袋」 |
| **招式原子** | `skillAtoms` / `nameKey` / `skillKey` / `atomName` | 某招翻译出来的原子 |
| **其它** | `trackAdd` / `swordIntentCap` / `setTransStore` | 轨迹、剑意、翻译缓存注入 |
| **逃生口** | `raw` | 43 个原始函数全在里面 |

---

## ⚠ 三条必须知道的

### 1. 这里只有「数值层」，没有「演出」

`calcDamage` 那 1324 行**故意没抽**。它把三件事揉在一起：

- 算这一下多少伤害（数值）
- 写战报日志、弹伤害数字、放元素特效（演出）

抽出去等于把 DOM 和音效拖进引擎。所以本包只回答「**这一下打多少**」，不回答「**怎么演**」。要做完整战斗流程，得在 ST 里用卡内脚本。

### 2. 这份是**抽取**的，不是手抄的

`src/core.js` 由 `工具/_extract_battle.mjs` 从 `脚本/04-核心脚本.js` 原样切出来，**不许手改**——改了下次重抽会被覆盖。

```sh
node 工具/_extract_battle.mjs           # 重抽
node 工具/_extract_battle.mjs --check   # 只比对；不一致 exit 1
```

抽取用的是「函数闭包 + 常量闭包」双闭包：

- 函数闭包：从 32 个数值层入口出发，逮到「调用即依赖」的所有函数
- 常量闭包：**这一步上一版漏了**——`REALM_COEFFS` / `XZ_LEVEL_COEFF` 这些顶层 `var` 没跟过来，一 import 就 `ReferenceError`，而 `node --check` 看不出来

### 3. 数值与卡内**逐格一致**，有测试兜着

```sh
node 战斗引擎/test/parity.mjs
# ✔ 双跑一致：1968 格全部相同
```

做法是把同一批输入分别喂给「卡内 04」和「独立 core.js」，逐格比对输出。1968 格覆盖：

- 20 种境界写法 × 8 个境界函数
- 9 种品阶 × 8 境界 × 9 类型（定档/钳制）
- 25 条效果文本 × 5 个解析函数
- 四维 6 组极端值（含 999/负数/小数/null）
- 命中/暴击/减伤/承伤/常驻

`xzRollHit` 里掷 d20，测试会固定随机源，保证「同一题、同一骰」——否则随机噪声会盖住真问题。

---

## 一键更新

```sh
sh 工具/发布战斗引擎.sh
```

它按顺序做 7 件事，任一步红就停：

1. 重抽内核（04 → `src/core.js`）
2. 一致性校验（改了 04 忘了重抽会在这里红）
3. 双跑比对（1968 格，不是绿的推不出去）
4. 版本号 +1（自动写进 `index.js` 的 `VERSION`）
5. `git commit`（在 `战斗引擎/` 这个独立仓库里）
6. `git push`
7. 打标签 `v<版本>` 并推送

常用变体：

```sh
sh 工具/发布战斗引擎.sh --dry              # 只校验，不提交
sh 工具/发布战斗引擎.sh --note "补了破甲钳制"  # 带发布说明
```

### 首次发布（只做一次）

`战斗引擎/` 是一个**独立 git 仓库**，不是卡工程的子目录提交 —— 卡工程 6.7 GB，混在一起会把仓库撑爆，而且成品卡正文不该公开。

```sh
cd 天元一界/战斗引擎
git remote add origin https://github.com/cesareborgia576-cloud/xz-battle-engine.git
git push -u origin main
```

之后每次更新都只跑发布脚本就行。

### 关于 jsdelivr 缓存（这个坑很隐蔽）

| 引用方式 | 缓存 | 什么时候用 |
|---|---|---|
| `@main` | **12 小时** | 默认。玩家会自动跟进，但有延迟 |
| `@<commit>` | 永久 | 自己调试，**改完立刻生效** |
| `@v1.0.1` | 永久 | 发版给玩家，钉死不漂 |

⚠ `@main` 那 12 小时最容易让人误判：你明明推了，玩家那边还是旧的，看起来像「更新失败」——其实是缓存。所以：

- 玩家遇到「更新没生效」，让他跑 `window.XZBattle.version` 看号
- 要立刻验证，用 commit 号那条地址
- 发正式版给玩家，用标签地址

⚠ 还有一层：**刚推完 CDN 不会立刻有**，jsdelivr 首次拉取要 1~5 分钟。这段延迟跟 12 小时缓存是两回事，别混。

### 如果推送报认证失败

本机 git 用 Windows 凭据管理器。报 401/403 的话：

1. 去 https://github.com/settings/tokens 生成一个 **classic token**，勾 `repo`
2. 推送时用户名填 `cesareborgia576-cloud`，密码填 **token**（不是账号密码）

或者直接把 token 写进 remote（省事但会留在 git 配置里）：

```sh
git remote set-url origin https://<token>@github.com/cesareborgia576-cloud/xz-battle-engine.git
```

---

## 在 SillyTavern 里用

ST 的「脚本」支持顶层 `await` 和动态 `import`，CSP 在 v1.14.0 已禁用，jsdelivr 开 CORS，**默认可用、不用配置**。

新建一个脚本，内容就一行：

```js
import 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/xz-battle-engine@v1.1.0/index.js'
```

⚠ 用 **tag** 不用 `@main`，原因见下面「缓存那一节」——`@main` 出过一次真事故。

加载后 `window.XZBattle` 就在了，后面所有脚本都能用。

### 翻译缓存要自己注入

`skillAtoms()` 依赖「效果翻译缓存」。卡内由 04 的 `xzTransStore()` 供给（读 `window.__XZ_TRANS__` + localStorage）；引擎不带宿主，默认返回空缓存：

```js
window.XZBattle.setTransStore(() => ({
  stamp: Date.now(),
  source: 'self',
  byName: { '张三': { skills: { '斩': ['伤害'] }, passive: ['暴击'] } }
}))
```

不注入的话 `skillAtoms` 恒返回 `[]`——这是**安全侧**：拿不到翻译就当没有原子，不会编出一个假效果。

---

## 目录

```
（仓库根就是这个包）
├── index.js          CDN 入口：挂 window.XZBattle，按用途分组的门面
├── src/core.js       抽取产物（43 函数 + 25 常量，⚠ 不许手改）
├── test/parity.mjs   双跑比对（1968 格）
├── package.json
└── README.md
```

源码在卡工程里（`天元一界/战斗引擎/`），发布时只把这几个文件推上来。

---

## 和卡内 04 的关系

**卡里没有算法，只有一行 import。** 实现只有一份，在这个仓库。

```
   脚本/04-核心脚本.js  （卡里，1.5 KB）
   └─ import 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/xz-battle-engine@v1.2.0/核心脚本/index.js'

   战斗引擎/核心脚本/index.js  （本仓库，2.19 MB）← 整段核心脚本，原样
   战斗引擎/index.js + src/core.js  （本仓库）← 独立的战斗数值内核，卡默认不加载
```

卡里那个文件去掉注释后**只剩一条语句**，没有 `function`、没有 `var`、没有 `await`。
闸会验这一点（`战斗引擎/test/cdn_smoke.mjs` ①）：体积 <8 KB、语句数 = 1、7 个算法特征锚点 0 处。

### 为什么是「一行 import」而不是「转发外壳」

中途做过一版**原地转发外壳**（v394）：把 43 个函数改成一行转发、25 张表改成 `__XZ_B_CONST("X")`，
实现搬进引擎，但其余 13900 行仍留在卡里。这版被明确否掉了 —— 卡里还是有一堆东西。

现在的口径对标 `Alice233-Alice/Apeiria` 那种成卡：一个功能一个目录、里面只有 index.js，
玩家在酒馆助手的脚本栏里贴一行就能用。所以：

| 形态 | 卡里大小 | 卡里有什么 |
|---|---|---|
| `inline`（v394 之前） | 2.19 MB | 全部算法 |
| `shell`（v394，已废弃） | 1.55 MB | 43 个转发外壳 + 25 个常量指向 + 其余实现 |
| **`bare`（v1.2.0 起，当前）** | **1.5 KB** | **一行 import** |

三种形态的判断收口在 `工具/_xz_shellmode.cjs` 的 `formOf()`，**谁都不许再自己写正则**。
判据必须带「文件极小」辅证（`text.length < 8192`）：`shell` 内部也有 `await import(...)`，
只看 import 字样会把它误判成 `bare`。

### 改脚本的正确姿势

```sh
# 1. 改实现 —— 只改这一个地方
#    战斗引擎/核心脚本/index.js

# 2. 发布（自动：校验 → 提版本 → 推 → 打 tag → 改卡里的 tag → 真拉 CDN 验证）
sh 工具/发布战斗引擎.sh --note "改了什么"

# 3. 重新打包（卡里才会带上新 tag）
node 工具/pack.js
```

第 2 步的⑧「把卡里的 tag 改过去」是最容易漏、后果最安静的一环：漏了的话引擎已经是 v1.3.0，
而卡还在拉 v1.2.0 —— 玩家跑的仍是旧内核，**而所有发布日志都显示成功**。
所以它写进脚本，不靠人记。

### 改完为什么 200+ 个工具还能工作

卡里只有 1.5 KB，任何按文本切片 / `eval` 04 的老工具都会立刻拿到空壳。
`工具/_xz_preload.cjs` 在进程启动时把「读现役 04」**重定向到真身**：

| 形态 | 重定向落点 |
|---|---|
| `bare`（当前） | `战斗引擎/核心脚本/index.js` |
| `shell` | `脚本/04-核心脚本.js.bak-v394-CDN改造前` |
| `inline` | 不重定向 |

⚠ 但有两类语义必须读**卡里原样**，所以另开了 `fs.__readLive` 后门：

- 问「**卡里现在写着什么**」→ 用 `fs.__readLive`（验形态、读 tag 号）
- 问「**这段算法是什么**」→ 用普通读取（会被重定向到真身）

搞反的话会得出完全相反的结论：拿真身去验「卡里有没有算法残留」，会报「还有 2MB 残留」，
而卡里明明只有 1.5 KB。

### 引擎取不到时会怎样（刻意设计成不崩卡）

| 类别 | 降级值 | 理由 |
|---|---|---|
| 判定类（命中/暴击/闪避/减伤） | 返回「不触发」的保守值 | 不冤枉玩家 |
| 加权类（境界系数/品质威力） | `1.0` | 等于无加成，不至于算出天文数字 |
| 查表类 | 空表 | 下游读不到键就吃自己的默认值 |
| 计数类 | `0` | |

为什么不抛错：04 是整卡主脚本，一个数值模块取不到就把存档/界面/秘境一起带走，那是「为一个零件报废整台机器」。
为什么不保留内联兜底：那等于两份实现，改仓库不改卡 = 卡还在跑旧的，而你以为改了。那不叫兜底，叫悄悄分叉。

---

## 缓存那一节（v395 真事故，务必读）

`@main` 是「跟随分支走」，**各 CDN 节点缓存进度不同步**。实测同一时刻：

| 节点 | `@main/index.js` 拿到的版本 |
|---|---|
| cdn.jsdelivr.net | **v1.0.0（旧）** |
| fastly.jsdelivr.net | **v1.0.0（旧）** |
| gcore.jsdelivr.net | **v1.0.0（旧）** |
| testingcf.jsdelivr.net | v1.1.0 |

而 v1.0.0 那份 `core.js` 只导出函数、**不导出 25 张常量表**。后果：

- import 成功 ✅
- `VERSION` 显示 1.1.0 或 1.0.0，看起来正常 ✅
- 控制台日志照打「已就绪（44 个函数）」✅
- 但 `QUALITY_POWER` / `REALM_COEFFS` 全是 `undefined` ❌
- ⇒ 卡里 25 张表全是 `{}`，**所有数值静默失效，零报错**

本地 `md5` 对比、`git status`、GitHub 上的文件——**全都查不出来**（本地是对的）。唯一查得出来的办法：像玩家那样从 CDN 把文件拉下来跑一遍。

所以现在：

- 卡里锁 **tag**（tag = 固定 commit，内容永久、不分裂）
- 闸里有 `工具/_cdn_verify.mjs` 真拉真跑（12 项）
- 发布脚本第 ⑨ 步会重试 6 次等回源

### 拉不到 ≠ 线上是错的

`工具/_cdn_verify.mjs` 用退出码区分两种情况，别混：

| 退出码 | 含义 | 闸怎么处理 |
|---|---|---|
| `0` | 线上与本地逐字节一致 | 绿 |
| `1` | **内容**不对（旧内核 / 缺表 / 数值不符） | **红，必须修** |
| `2` | 拉不到（网络/代理/SSL 抖动） | 只提示，不判红 |

分成两类是刻意的：网络抖一下就判红，闸就会教人「无视红灯」，那比不加这条闸更糟。

### 国内网络提示

`cdn.jsdelivr.net` 在大陆常有 SSL 握手失败（`curl: (35) schannel: failed to receive handshake`），同内容换镜像域名即可：

```js
https://fastly.jsdelivr.net/gh/cesareborgia576-cloud/xz-battle-engine@v1.1.0/index.js
https://gcore.jsdelivr.net/gh/cesareborgia576-cloud/xz-battle-engine@v1.1.0/index.js
```

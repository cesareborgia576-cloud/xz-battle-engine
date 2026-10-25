# 天元录 · 战斗引擎

《天元录》战斗数值内核的**独立可调用版本**。一行 import，`window.XZBattle` 就绪。

```js
import 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/xz-battle-engine@main/index.js'
```

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
import 'https://cdn.jsdelivr.net/gh/cesareborgia576-cloud/xz-battle-engine@main/index.js'
```

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

```
脚本/04-核心脚本.js  ──── 抽取 ────→  战斗引擎/src/core.js
      （卡内真身）                        （独立副本）
           │                                   │
           │                                   └─ import → window.XZBattle
           │
           └─ 卡内直接用裸函数，不需要 export

改数值：改 04 → 跑发布脚本 → 卡内和 CDN 同时更新。
两边永远是同一份字节，`--check` 能验。
```

import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';

const ENGINE = path.resolve(import.meta.dirname, '..', '核心脚本', 'index.js');
const src = fs.readFileSync(ENGINE, 'utf8');
const start = src.indexOf('function xzCdKeyOf(sk)');
const end = src.indexOf('function xzCdBlockMsg(f, sk)', start);
assert(start >= 0 && end > start, 'cooldown manager functions must exist');
const block = src.slice(start, end);
const sandbox = {};
vm.runInNewContext(block + '\nglobalThis.testCd = { xzCdOf: xzCdOf, xzCdSettle: xzCdSettle };', sandbox);
const { xzCdOf, xzCdSettle } = sandbox.testCd;
const actor = { cdMap: {} };
const a = { name: '雷鸣掌', 冷却: 2 };
const b = { name: '引雷落', 冷却: 3 };
const divine = { name: '九霄雷狱', 冷却: 6 };

xzCdSettle(actor, a);
assert.equal(xzCdOf(actor, a), 2, 'cast skill starts its full cooldown');
assert.equal(xzCdOf(actor, b), 0);

xzCdSettle(actor, b); // the actor spends another hand on another skill
assert.equal(xzCdOf(actor, a), 1, 'other spent hand advances A cooldown by one');
assert.equal(xzCdOf(actor, b), 3, 'newly used skill receives full cooldown after decrement');

xzCdSettle(actor, null); // normal attack / item / pass
assert.equal(xzCdOf(actor, a), 0, 'non-skill action also advances cooldown');
assert.equal(xzCdOf(actor, b), 2);

xzCdSettle(actor, a);
xzCdSettle(actor, divine, false); // divine is a free action; does not advance ordinary skill timers
assert.equal(xzCdOf(actor, a), 2, 'free divine action must not tick other cooldowns');
assert.equal(xzCdOf(actor, divine), 6, 'divine receives its own cooldown');

const guard = src.indexOf('if (forcedSk && xzCdOf(actor, forcedSk) > 0)');
const waitingClear = src.indexOf('S.waiting = null;', guard);
const trackCommit = src.indexOf('actor.track = Math.max(0, actor.track - TRACK_MAX);', guard);
assert(guard >= 0 && waitingClear > guard && trackCommit > guard,
  'execution-level cooldown guard must run before consuming the hand');
assert(src.includes('var isCooling = cdLeft > 0;'), 'skill card renderer must derive cooldown state');
assert(src.includes("pill('cd', '冷却 ' + cdLeft)"), 'skill card must show remaining cooldown');
assert(src.includes("S.skPick = -1;"), 'stale selected skill must be cleared');

console.log('✓ Cast applies full CD');
console.log('✓ Every normal spent hand ticks remaining CD');
console.log('✓ Newly cast skill is not reduced in the same hand');
console.log('✓ Free divine action does not tick normal skill CD');
console.log('✓ Stale selection is rejected before turn/track consumption');
console.log('✓ Skill cards expose disabled/cooldown state');
console.log('Cooldown regression: 6 checks passed');

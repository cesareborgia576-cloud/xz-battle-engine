import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(HERE, '..', '核心脚本', 'index.js');
const src = fs.readFileSync(ENGINE, 'utf8');
function templateValue(name) {
  const marker = 'var ' + name + ' = `';
  const i = src.indexOf(marker);
  if (i < 0) throw new Error('missing ' + name);
  const start = i + marker.length;
  const end = src.indexOf('\n`;', start);
  if (end < 0) throw new Error('unterminated ' + name);
  return src.slice(start, end);
}
const skin = templateValue('XZ_JJB_SKIN');
const legacy = templateValue('XZ_JJB_LEGACY');

const card = (name, side) => `<div class="xz-jjb-card ${side}" data-name="${name}">
  <div class="xz-jjb-u-art"><div class="xz-jjb-u-core"><span></span></div></div>
  <div class="xz-jjb-u-info"><div class="xz-jjb-top"><span class="xz-jjb-nm ${side}">${name}</span><span class="xz-jjb-rlm">练气中期</span><span class="xz-jjb-spd">速 21</span><span class="xz-jjb-ebadge">雷</span><button class="xz-jjb-look">查看</button></div>
  <div class="xz-jjb-hprow"><span class="xz-jjb-bar-lbl">血</span><div class="xz-jjb-hp"><div class="xz-jjb-hpf" style="width:75%"></div><span class="xz-jjb-bar-txt">2100/2800</span></div></div>
  <div class="xz-jjb-mprow"><span class="xz-jjb-bar-lbl">灵</span><div class="xz-jjb-mp"><div class="xz-jjb-mpf" style="width:70%"></div><span class="xz-jjb-bar-txt">630/900</span></div></div>
  <div class="xz-jjb-bfs"><span class="xz-jjb-bf good">速<i class="xz-jjb-bfn">2</i></span><span class="xz-jjb-bfnone">无状态</span></div></div>
</div>`;
const docHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>
:root{--xz-fs:1;--accent-gold:#dec47f;--text-muted:#a5b5b1;--accent-star:#83d6c4;--accent-red:#e7766e;--glass-panel:rgba(12,25,30,.84);--glass-border-light:rgba(220,210,180,.2);color-scheme:dark}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#050d11;color:#e8eee9;font-family:Arial,sans-serif}
${skin}${legacy}
#xz-jjb-overlay{display:block!important;position:fixed!important;inset:0!important;padding:0!important;background:transparent!important}
#xz-jjb-frame{left:50%;top:12px;width:min(1180px,calc(100vw - 24px));height:calc(100dvh - 24px);max-height:calc(100dvh - 24px);transform:translateX(-50%)}
@media(max-width:700px){#xz-jjb-frame{left:0;top:0;width:100vw;height:100dvh;max-height:100dvh;transform:none}}
</style></head><body><dialog id="xz-jjb-overlay" open><div id="xz-jjb-frame"><div id="xz-jjb-head"><span id="xz-jjb-seal">演</span><span id="xz-jjb-caption"><span id="xz-jjb-title">布局回归验证</span></span><button>重开</button><button>关闭</button></div><div id="xz-jjb-rail"><div id="xz-jjb-railline"></div></div><div id="xz-jjb-sides"><div class="xz-jjb-side mate"><p class="xz-jjb-lbl">我方</p><div class="xz-jjb-row is-solo" id="ally">${card('测试','ally')}</div></div><div class="xz-jjb-side foe"><p class="xz-jjb-lbl">敌方</p><div class="xz-jjb-row is-solo" id="enemy">${card('剑修·萧决','enemy')}</div></div></div><div id="xz-jjb-log"></div><div id="xz-jjb-bar"></div></div></dialog></body></html>`;

const browser = await chromium.launch();
let failures = 0;
const check = (ok, label, detail='') => {
  if (ok) console.log('✓ ' + label + (detail ? ' · ' + detail : ''));
  else { failures++; console.log('✗ ' + label + (detail ? ' · ' + detail : '')); }
};
for (const vp of [{name:'desktop',width:1280,height:800},{name:'phone',width:390,height:844}]) {
  const page = await browser.newPage({viewport:{width:vp.width,height:vp.height}});
  const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
  await page.setContent(docHtml, {waitUntil:'load'});
  for (const count of [1,2,4]) {
    const metrics = await page.evaluate(({count, cardHtml}) => {
      for (const [id,side,prefix] of [['ally','ally','同门'],['enemy','enemy','来敌']]) {
        const row=document.getElementById(id); row.innerHTML=''; row.className='xz-jjb-row '+(count===1?'is-solo':'is-multi');
        for(let i=0;i<count;i++) { const h=cardHtml.replaceAll('__NAME__',prefix+(i+1)).replaceAll('__SIDE__',side); row.insertAdjacentHTML('beforeend',h); }
      }
      const out=[];
      for(const id of ['ally','enemy']){
        const row=document.getElementById(id), rr=row.getBoundingClientRect(), cards=[...row.querySelectorAll('.xz-jjb-card')];
        out.push({height:rr.height,scrollHeight:row.scrollHeight,clientHeight:row.clientHeight,cards:cards.map(c=>Math.round(c.getBoundingClientRect().height)),infoFit:cards.map(c=>{const i=c.querySelector('.xz-jjb-u-info');return i.scrollHeight<=i.clientHeight+1})});
      }
      const see=document.createElement('button');see.className='xz-jjb-see';document.body.appendChild(see);
      const border=getComputedStyle(see).borderLeftWidth;
      return {out,border};
    }, {count,cardHtml:card('__NAME__','__SIDE__')}).catch(e=>({error:String(e)}));
    if (metrics.error) { check(false, vp.name+' roster '+count, metrics.error); continue; }
    for(const [sideIndex,side] of [['我方',metrics.out[0]],['敌方',metrics.out[1]]]){
      const ratio=side.cards.map(h=>h/side.clientHeight);
      if(count===1) check(ratio[0]>.90, vp.name+' '+sideIndex+'单人卡占满队伍区', Math.round(ratio[0]*100)+'%');
      else {
        const half=ratio.every(r=>r>.38&&r<.62);
        check(half, vp.name+' '+sideIndex+count+'人卡片固定半高', ratio.map(x=>Math.round(x*100)+'%').join(','));
        if(count>2) check(side.scrollHeight>side.clientHeight, vp.name+' '+sideIndex+'多于两人时队伍区可滚动', side.scrollHeight+'>'+side.clientHeight);
        if(vp.name==='phone' && count>2) check(side.infoFit.every(Boolean),vp.name+' '+sideIndex+'半高多人卡内容完整',JSON.stringify(side.infoFit));
      }
    }
    if(count===1) check(metrics.border==='1px', vp.name+'「详」左侧分隔边可见', metrics.border);
  }
  if(errors.length) check(false,vp.name+' 无 JS 错误',errors.join('|'));
  else check(true,vp.name+' 无 JS 错误');
  await page.close();
}
/* Motion smoke test: ensure requested transitions are present and tied to discrete events. */
{
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.setContent(docHtml,{waitUntil:'load'});
  const motion=await page.evaluate(()=>{
    const read=e=>e?getComputedStyle(e).animationName:'missing';
    const log=document.getElementById('xz-jjb-log'), line=document.createElement('div');line.className='xz-jjb-lg';log.appendChild(line);
    const loss=document.createElement('span');loss.className='xz-jjb-bar-loss hp';document.querySelector('.xz-jjb-hp').appendChild(loss);
    const card=document.querySelector('.xz-jjb-card');card.classList.add('hit');
    const aura=document.createElement('span');aura.className='xz-jjb-buff-surge';card.appendChild(aura);
    const row=document.createElement('div');row.className='xz-jjb-skrow page-enter-next';row.innerHTML='<span class="xz-jjb-skgrp"></span>';document.body.appendChild(row);
    const modal=document.createElement('div');modal.id='xz-jjb-skill-dialog-overlay';modal.innerHTML='<div></div>';document.body.appendChild(modal);
    return {report:read(line),bar:read(loss),hit:read(card),aura:read(aura),page:read(row.firstElementChild),modal:read(modal),modalCard:read(modal.firstElementChild)};
  });
  check(motion.report==='xz-jjb-report-drop','战报新条目从上方滑入',motion.report);
  check(motion.bar==='xz-jjb-bar-evaporate','血蓝条损失残影缓退消散',motion.bar);
  check(motion.hit==='xz-jjb-impact-soft','受击卡片柔和回震',motion.hit);
  check(motion.aura==='xz-jjb-buff-spread','自身增益光效向卡片边缘蔓延',motion.aura);
  check(motion.page==='xz-jjb-skill-next','技能翻页轻推入场',motion.page);
  check(motion.modal==='xz-jjb-modal-veil'&&motion.modalCard==='xz-jjb-modal-card','详情弹层暗幕与面板分层入场',motion.modal+'/'+motion.modalCard);
  check(src.includes("if (_buffVfxLanded) { try { triggerSelfSkillAura(_holderRoot, skill);"),'真实增益结算已连接到全卡蔓延光效');
  check(src.includes("lg.scrollTo({ top: lg.scrollHeight, behavior: _reduceScroll ? 'auto' : 'smooth' })"),'真实战报跟底采用平滑滚动');
  check(src.includes("moveResourceBar(hpf,")&&src.includes("moveResourceBar(mpf,"),'真实战斗血/灵条使用旧值残影缓退');
  check(src.includes("row.classList.add(dir < 0 ? 'page-enter-prev' : 'page-enter-next')"),'真实技能翻页接入方向入场动画');
  check(src.includes('#xiuxian_timeline_atb-skill-dialog-overlay'),'主战斗详情弹层也覆盖入场动画');
  /* v1.3.72：三套战报版式 + 表头切换 + 查看 */
  check(src.includes('function jjbLogStyleOf')&&src.includes('function jjbParseLogEntry'),'三版式共用一份结构化解析入口');
  check(src.includes("function jjbLogRowA")&&src.includes("function jjbLogRowB")&&src.includes("function jjbLogRowC"),'A/B/C 三套渲染器齐备');
  check(src.includes("data-jjblogstyle")&&src.includes("localStorage.setItem('xz_jjb_log_style'"),'版式切换入口与跨局持久化在位');
  check(src.includes('.xz-jjb-loghead{')&&src.includes('.xz-jjb-lga{')&&src.includes('.xz-jjb-lgb{')&&src.includes('.xz-jjb-lgc{'),'三版式与表头样式齐备');
  check(src.includes('var _ma = String(x.t).match(')&&src.includes('var _mb = _ma ? null : String(x.t).match('),'v403 锚点语句形状保持（渲染正则可被闸抠出）');
  check(src.includes('>查看</button>')&&!src.includes('>详</button>'),'查看按钮文案落位');
  const styleDom = await page.evaluate(() => {
    const log=document.getElementById('xz-jjb-log');
    log.innerHTML='<div class="xz-jjb-loghead"><b>战况记录</b><span class="xz-jjb-logtabs"><button class="xz-jjb-logtab" aria-selected="true">⏱ 时间轴</button><button class="xz-jjb-logtab" aria-selected="false">⚔ 交锋卡</button><button class="xz-jjb-logtab" aria-selected="false">📜 战场纪事</button></span></div>'
      +'<div class="xz-jjb-logstream">'
      +'<article class="xz-jjb-lg xz-jjb-lga ally" id="rowA"><div class="xz-jjb-lga-turn"><span>1</span><small>我方</small></div><div class="xz-jjb-lga-main"><div class="xz-jjb-lga-line"><b>测试</b><i>施展</i><strong>雷鸣掌</strong><em>→ 敌</em></div></div><div class="xz-jjb-lga-dmg"><b>−120</b><small>气血</small></div></article>'
      +'<article class="xz-jjb-lg xz-jjb-lgb enemy" id="rowB"><header><span class="xz-jjb-lgb-idx">2</span><b class="foe-name">敌</b><span class="xz-jjb-lgb-arrow">对</span><b class="ally-name">测试</b><time>敌方行动</time></header><div class="xz-jjb-lgb-skill"><span class="xz-jjb-lgb-sigil foe-sigil">剑</span><div><strong>青锋直递</strong></div><span class="xz-jjb-lgb-result hit">命中</span></div><footer><span class="xz-jjb-lgb-desc"></span><span class="xz-jjb-lgb-impact enemy-impact"><b>−80</b><small>气血</small></span></footer></article>'
      +'<article class="xz-jjb-lg xz-jjb-lgc ally" id="rowC"><div class="xz-jjb-lgc-rail"><span>3</span></div><div class="xz-jjb-lgc-body"><div class="xz-jjb-lgc-kicker"><span>我方出手</span><small></small></div><div class="xz-jjb-lgc-title">雷鸣掌<span>命中 敌</span></div><div class="xz-jjb-lgc-foot"><span class="xz-jjb-lgc-impact">🩸 <b>120</b> 气血</span></div></div></article>'
      +'</div>';
    const read=id=>{const e=document.getElementById(id);const cs=getComputedStyle(e);return{display:cs.display,borderLeft:cs.borderLeftWidth,visible:cs.display!=='none'&&e.getBoundingClientRect().width>0};};
    const tabSel=[...document.querySelectorAll('.xz-jjb-logtab')].map(b=>getComputedStyle(b).color);
    const see=document.createElement('button');see.className='xz-jjb-see';document.body.appendChild(see);
    const seeCS=getComputedStyle(see);
    return {a:read('rowA'),b:read('rowB'),c:read('rowC'),tabSel,seeTop:seeCS.top,seeBorder:seeCS.borderLeftWidth,headSticky:getComputedStyle(document.querySelector('.xz-jjb-loghead')).position};
  });
  check(styleDom.a.display==='grid'&&styleDom.a.visible,'A 时间轴行为网格布局且可见',styleDom.a.display);
  check(styleDom.b.visible&&styleDom.b.borderLeft==='2px','B 交锋卡带阵营侧边条',styleDom.b.borderLeft);
  check(styleDom.c.visible,'C 战场纪事行可见',styleDom.c.display);
  check(styleDom.headSticky==='sticky','战报表头吸顶',styleDom.headSticky);
  check(styleDom.tabSel.length===3&&styleDom.tabSel[0]!==styleDom.tabSel[1],'三个版式页签选中态有区分',styleDom.tabSel.join(','));
  check(styleDom.seeTop==='2px'&&styleDom.seeBorder==='1px','查看键位于卡内顶部且四边有框',styleDom.seeTop+'/'+styleDom.seeBorder);
  await page.close();
}
await browser.close();
console.log('\n布局与动效回归：'+(failures?'失败 '+failures:'全绿'));
process.exit(failures?1:0);

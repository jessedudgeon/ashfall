import {makeWorld,findPath,canWalk,key,isoToWorld,worldToIso,nearestOpen,moveParty,TILE_W,TILE_H} from './core.mjs';
import {createEncounter,activeUnit,isStanding,calculateShot,attemptMove,fire,aim,reload,stabilize,runEnemyPhase,battleResult,finishVictory} from './combat.mjs';

const $=id=>document.getElementById(id);
const canvas=$('game'),ctx=canvas.getContext('2d',{alpha:false});
const area=$('playArea');
const seed=Number(new URLSearchParams(location.search).get('seed'))||3867;
const world=makeWorld(seed);
$('seed').textContent=seed;
const squad=[
  {name:'MARA VOSS',short:'MARA',role:'SCOUT',initial:'M',color:'#dbb57d',trim:'#42554a',x:9,y:24,hp:85,path:[],moving:false},
  {name:'ELI WARD',short:'ELI',role:'MEDIC',initial:'E',color:'#a6b5a2',trim:'#55664c',x:10,y:24,hp:100,path:[],moving:false},
  {name:'ROOK HAYES',short:'ROOK',role:'ENGINEER',initial:'R',color:'#ba937e',trim:'#47565a',x:9,y:25,hp:72,path:[],moving:false}
];
for(const p of squad){p.renderX=p.x;p.renderY=p.y;p.elapsed=0;}
const state={selected:0,followSquad:true,paused:false,zoom:.91,cam:{x:0,y:0},hover:null,scrap:0,intel:0,panUntil:0,lastKey:0,awaitingSite:null,frame:0,combat:null,combatMode:'shoot',targeted:null,combatCleared:false,combatLost:false,medkits:4};
let viewW=800,viewH=650,dpr=1,toastTimer;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const selected=()=>squad[state.selected];
const rgb=(hex,delta=0)=>{const c=hex.match(/\w\w/g).map(x=>clamp(parseInt(x,16)+delta,0,255));return `rgb(${c.join(',')})`;};
function announce(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600);const p=document.createElement('p');p.textContent=message;$('log').prepend(p);while($('log').children.length>5)$('log').lastChild.remove();}
function resize(){const r=canvas.getBoundingClientRect();viewW=Math.max(1,r.width);viewH=Math.max(1,r.height);dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.floor(viewW*dpr);canvas.height=Math.floor(viewH*dpr);}
new ResizeObserver(resize).observe(area);resize();
function toScreen(x,y){const p=isoToWorld(x,y);return {x:viewW/2+(p.x-state.cam.x)*state.zoom,y:viewH/2+(p.y-state.cam.y)*state.zoom};}
function fromScreen(sx,sy){const px=(sx-viewW/2)/state.zoom+state.cam.x,py=(sy-viewH/2)/state.zoom+state.cam.y;const p=worldToIso(px,py);return {x:Math.round(p.x),y:Math.round(p.y)};}
const centerOf=(p)=>isoToWorld(p.renderX,p.renderY);
const battling=()=>Boolean(state.combat&&state.combat.phase==='player');
const battleUnit=(i=state.selected)=>state.combat?activeUnit(state.combat,`hero-${i}`):null;
function drawDiamond(px,py,fill,stroke=null){ctx.beginPath();ctx.moveTo(px,py-18);ctx.lineTo(px+36,py);ctx.lineTo(px,py+18);ctx.lineTo(px-36,py);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.65;ctx.stroke();}}
function ellipse(x,y,rx,ry,col){ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,2*Math.PI);ctx.fill();}
function polygon(coords,color){ctx.beginPath();ctx.moveTo(...coords[0]);for(let i=1;i<coords.length;i++)ctx.lineTo(...coords[i]);ctx.closePath();ctx.fillStyle=color;ctx.fill();}
function drawTiles(){
  const palette={dust:'#656d54',dry:'#737157',grass:'#596e52',dirt:'#6a6650',road:'#575e56',camp:'#858065',concrete:'#6e7268'};
  ctx.fillStyle='#26372f';ctx.fillRect(-2500,-700,5000,4200);
  // Painter ordering by depth ensures the foreground conceals objects farther away.
  for(let sum=0;sum<world.size*2;sum++)for(let y=0;y<world.size;y++){
    const x=sum-y;if(x<0||x>=world.size)continue;
    const t=world.tiles[y][x],p=isoToWorld(x,y);
    const noise=Math.round((t.shade-.5)*12);
    drawDiamond(p.x,p.y,rgb(palette[t.terrain],noise),'#232f2980');
    if(t.terrain==='road'){
      if((x+y)%4===0){polygon([[p.x-10,p.y-1],[p.x+1,p.y-7],[p.x+4,p.y-5],[p.x-8,p.y+1]],'#a59a6e88');}
      if(t.detail>.68){ctx.strokeStyle='#333f36aa';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.x-20,p.y-2);ctx.lineTo(p.x-4,p.y+5);ctx.lineTo(p.x+9,p.y-1);ctx.stroke();}
    }
    if(t.terrain==='grass'&&t.detail>.46){for(let j=0;j<3;j++){const u=((t.detail*83+j*17)%28)-14,v=((t.shade*71+j*11)%12)-6;ctx.strokeStyle=j===1?'#435b43':'#809170';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.x+u,p.y+v);ctx.lineTo(p.x+u-2,p.y+v-4);ctx.stroke();}}
    if(t.detail>.94&&t.terrain==='dry')ellipse(p.x+12,p.y+2,5,2,'#9f967052');
    if(state.hover?.x===x&&state.hover?.y===y){drawDiamond(p.x,p.y,'#bda76533','#e1c87bbb');}
    const site=world.sites.find(s=>s.x===x&&s.y===y);
    if(t.object)drawObject(t.object,p.x,p.y,t,site);
    if(site&&!site.claimed)drawSignal(p.x,p.y,site);
    // Characters drawn at their current world-space position below, not once per tile.
  }
}
function drawObject(type,x,y,t,site){
  if(type==='scrub'){ellipse(x,y+1,17,6,'#263f2b99');for(let i=0;i<4;i++){const a=i*1.6;ellipse(x+Math.sin(a)*9,y-4+Math.cos(a)*3,8,6,i%2?'#415f42':'#4b6a46');}return;}
  if(type==='rubble'){ellipse(x,y+3,22,8,'#1b292899');polygon([[x-19,y],[x-5,y-12],[x+12,y-4],[x+17,y+5],[x-2,y+9]],'#848376');polygon([[x-19,y],[x-5,y-12],[x-8,y+5]],'#4c534b');return;}
  if(type==='crates'){ellipse(x,y+4,19,6,'#151e1999');for(const [dx,dy] of [[-12,-2],[1,-4]]){ctx.fillStyle='#8e6e46';ctx.fillRect(x+dx,y+dy-13,16,13);ctx.fillStyle='#bd9562';ctx.fillRect(x+dx,y+dy-13,16,3);ctx.strokeStyle='#44392f';ctx.strokeRect(x+dx,y+dy-13,16,13);}return;}
  if(type==='barrel'){ellipse(x,y+5,12,5,'#17251f');ctx.fillStyle='#705e46';ctx.fillRect(x-8,y-22,16,25);ellipse(x,y-22,8,4,'#b49a71');ctx.fillStyle='#a87c4d';ctx.fillRect(x-8,y-12,16,4);return;}
  if(type==='dead-tree'){ellipse(x,y+3,19,6,'#24372d77');ctx.strokeStyle='#584c38';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x,y-3);ctx.lineTo(x-3,y-48);ctx.stroke();ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-2,y-30);ctx.lineTo(x-18,y-45);ctx.moveTo(x-2,y-24);ctx.lineTo(x+17,y-37);ctx.stroke();return;}
  if(type==='wreck'){ellipse(x,y+5,27,8,'#101a15aa');polygon([[x-25,y-11],[x+2,y-23],[x+26,y-10],[x,y+2]],'#68706b');polygon([[x-25,y-11],[x,y+2],[x,y+9],[x-25,y-5]],'#3e514c');polygon([[x,y+2],[x+26,y-10],[x+26,y-1],[x,y+9]],'#8d6b55');polygon([[x-12,y-15],[x+2,y-22],[x+12,y-15],[x-2,y-8]],'#263d42');ellipse(x-13,y+7,5,3,'#1c211c');ellipse(x+15,y+4,5,3,'#1c211c');return;}
  if(type==='wall'){ellipse(x,y+4,24,7,'#111d17aa');polygon([[x-23,y],[x+3,y-13],[x+23,y-1],[x-3,y+12]],'#60665b');polygon([[x-23,y],[x+3,y-13],[x+3,y-34],[x-23,y-21]],'#979482');polygon([[x+3,y-13],[x+23,y-1],[x+23,y-22],[x+3,y-34]],'#696b63');ctx.strokeStyle='#444f47';ctx.beginPath();ctx.moveTo(x+3,y-34);ctx.lineTo(x+3,y-13);ctx.stroke();return;}
  if(type==='terminal'){ellipse(x,y+5,18,6,'#0d1714aa');ctx.fillStyle='#434f47';ctx.fillRect(x-12,y-21,24,21);ctx.fillStyle='#b19b6a';ctx.fillRect(x-11,y-25,22,5);ctx.fillStyle=site?.claimed?'#39483f':'#729a76';ctx.fillRect(x-8,y-17,16,10);ctx.fillStyle='#d2b86f';ctx.fillRect(x-8,y-3,14,2);return;}
  if(type==='salvage'){ellipse(x,y+4,19,6,'#122119aa');ctx.fillStyle='#827554';ctx.fillRect(x-15,y-12,31,14);ctx.fillStyle='#ba9a64';ctx.fillRect(x-15,y-14,31,4);ctx.strokeStyle='#423b2e';ctx.strokeRect(x-15,y-14,31,16);ctx.strokeRect(x-8,y-14,16,16);return;}
  if(type==='tent'){ellipse(x,y+5,28,9,'#16271b99');polygon([[x-24,y+7],[x,y-46],[x+25,y+8]],'#9f9771');polygon([[x,y-46],[x+25,y+8],[x,y+15]],'#5a6550');ctx.strokeStyle='#bbb289';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y-46);ctx.lineTo(x,y+15);ctx.stroke();return;}
  if(type==='campfire'){ellipse(x,y+4,16,6,'#28302a');polygon([[x-5,y+2],[x-8,y-7],[x,y-22],[x+7,y-6],[x+5,y+4]],'#cf7641');polygon([[x-2,y],[x-2,y-6],[x+2,y-14],[x+3,y-2]],'#ffd484');return;}
}
function drawSignal(x,y,site){const pulse=(Math.sin(state.frame*.004+site.x)+1)/2;const r=16+pulse*3;ctx.strokeStyle=`rgba(237,192,101,${.7+pulse*.25})`;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y-18,r,6,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(x,y-25);ctx.lineTo(x,y-58);ctx.stroke();ctx.fillStyle='#edd18f';ctx.beginPath();ctx.arc(x,y-59,4.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#1a2823dd';ctx.fillRect(x-28,y-76,56,13);ctx.font='700 8px IBM Plex Mono,monospace';ctx.textAlign='center';ctx.fillStyle='#f0d49a';ctx.fillText(site.type==='radio'?'RELAY':'SALVAGE',x,y-67);}
function drawCharacters(){
  for(let i=squad.length-1;i>=0;i--){const p=squad[i];const unit=battleUnit(i);if(p.dead||unit?.dead)continue;const pos=isoToWorld(p.renderX,p.renderY),isSelected=i===state.selected;if(unit?.downed){ellipse(pos.x,pos.y+3,16,6,'#802f28aa');ctx.fillStyle='#bc8571';ctx.fillRect(pos.x-12,pos.y-5,24,6);ctx.font='bold 9px IBM Plex Mono,monospace';ctx.textAlign='center';ctx.fillStyle='#f1b89c';ctx.fillText('DOWN '+unit.bleedout,pos.x,pos.y-20);continue;}
    if(isSelected){ctx.lineWidth=2;ctx.strokeStyle='#eed28b';ctx.beginPath();ctx.ellipse(pos.x,pos.y+1,18,8,0,0,Math.PI*2);ctx.stroke();}
    ellipse(pos.x,pos.y+3,10,4,'#14221da8');
    // Backpack, boot shadow, body, arms, head, hat.
    ctx.fillStyle='#343d35';ctx.fillRect(pos.x-7,pos.y-20,15,12);
    ctx.fillStyle=p.trim;ctx.fillRect(pos.x-8,pos.y-17,16,12);
    ctx.fillStyle=p.color;ctx.fillRect(pos.x-7,pos.y-22,14,13);
    ctx.fillStyle='#c1aa88';ctx.fillRect(pos.x-4,pos.y-31,8,9);
    ctx.fillStyle='#4b4b3b';ctx.fillRect(pos.x-7,pos.y-33,15,5);
    ctx.fillStyle='#d7b98b';ctx.fillRect(pos.x-10,pos.y-19,3,9);ctx.fillRect(pos.x+7,pos.y-19,3,9);
    ctx.fillStyle='#29362f';ctx.fillRect(pos.x-6,pos.y-9,5,9);ctx.fillRect(pos.x+2,pos.y-9,5,9);
    ctx.font='700 9px IBM Plex Mono,monospace';ctx.textAlign='center';const w=ctx.measureText(p.short).width+18;ctx.fillStyle=isSelected?'#e0c786':'#1e2923df';ctx.fillRect(pos.x-w/2,pos.y-52,w,15);ctx.fillStyle=isSelected?'#263328':'#d4dcc0';ctx.fillText(p.short,pos.x,pos.y-41);
    if(isSelected){ctx.fillStyle='#fbe6a3';polygon([[pos.x,pos.y-61],[pos.x-5,pos.y-69],[pos.x+5,pos.y-69]],'#fbe6a3');}
  }
}
function drawPath(){const p=selected(),nodes=p.path;if(!nodes.length)return;ctx.setLineDash([5,7]);ctx.beginPath();let start=isoToWorld(p.renderX,p.renderY);ctx.moveTo(start.x,start.y);for(const n of nodes){const point=isoToWorld(n.x,n.y);ctx.lineTo(point.x,point.y);}ctx.strokeStyle='#efd08caa';ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);const end=isoToWorld(nodes.at(-1).x,nodes.at(-1).y);ctx.strokeStyle='#e8c684';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(end.x,end.y,14,7,0,0,Math.PI*2);ctx.stroke();}
function render(){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const bg=ctx.createLinearGradient(0,0,0,viewH);bg.addColorStop(0,'#27392f');bg.addColorStop(1,'#384737');ctx.fillStyle=bg;ctx.fillRect(0,0,viewW,viewH);
  ctx.save();ctx.translate(viewW/2,viewH/2);ctx.scale(state.zoom,state.zoom);ctx.translate(-state.cam.x,-state.cam.y);
  drawTiles();if(state.combat)drawCombatOverlay();if(!state.combat)drawPath();drawCharacters();if(state.combat)drawEnemyUnits();ctx.restore();
  const vignette=ctx.createRadialGradient(viewW/2,viewH/2,viewH*.2,viewW/2,viewH/2,Math.max(viewW,viewH)*.9);vignette.addColorStop(0,'#0000');vignette.addColorStop(1,'#09140c75');ctx.fillStyle=vignette;ctx.fillRect(0,0,viewW,viewH);
}

function cycleHero(){for(let i=1;i<=squad.length;i++){const n=(state.selected+i)%squad.length;const u=battleUnit(n);if(!state.combat||(u&&!u.dead&&!u.downed)){selectHero(n);return;}}}
function syncCombatPositions(){if(!state.combat)return;for(let i=0;i<squad.length;i++){const u=battleUnit(i);if(!u)continue;const p=squad[i];p.x=u.x;p.y=u.y;p.renderX=p.x;p.renderY=p.y;p.path=[];p.elapsed=0;}}
function maybeStartEncounter(){if(state.combat||state.combatCleared||state.combatLost)return;const hero=selected();if(Math.abs(hero.x-18)+Math.abs(hero.y-9)>6)return;
 state.awaitingSite=null;state.paused=false;for(const p of squad){p.path=[];p.renderX=p.x;p.renderY=p.y;p.elapsed=0;}
 state.combat=createEncounter(world,squad,seed);state.combatMode='shoot';state.targeted=null;
 announce('CONTACT! Two raiders guard the Silent Relay. Tactical combat engaged.');updateHUD();
}
function drawCombatOverlay(){const enc=state.combat;const chosen=battleUnit();
 for(const u of enc.units){if(u.side!=='enemy'||!isStanding(u))continue;
  const p=isoToWorld(u.x,u.y);ctx.lineWidth=2;ctx.strokeStyle=state.targeted===u.id?'#ffe08d':'#d67b64';ctx.beginPath();ctx.ellipse(p.x,p.y+1,19,9,0,0,2*Math.PI);ctx.stroke();
  if(state.targeted===u.id&&chosen){const shot=calculateShot(world,chosen,u);ctx.strokeStyle=shot.ok?'#e6b783aa':'#d86c6c99';ctx.setLineDash([6,6]);const a=isoToWorld(chosen.x,chosen.y);ctx.beginPath();ctx.moveTo(a.x,a.y-20);ctx.lineTo(p.x,p.y-20);ctx.stroke();ctx.setLineDash([]);}
 }
 if(battling()&&state.hover&&state.combatMode==='move'&&canWalk(world,state.hover.x,state.hover.y)){
  const pt=isoToWorld(state.hover.x,state.hover.y);drawDiamond(pt.x,pt.y,'#a5bc7533','#dbd88d');
 }
}
function drawEnemyUnits(){for(const u of state.combat.units.filter(u=>u.side==='enemy')){
 const p=isoToWorld(u.x,u.y);ellipse(p.x,p.y+5,12,5,'#131714bb');
 if(u.dead){ctx.fillStyle='#772f2988';ctx.fillRect(p.x-12,p.y-4,24,6);ctx.fillStyle='#d1957a';ctx.font='8px IBM Plex Mono';ctx.textAlign='center';ctx.fillText('NEUTRALIZED',p.x,p.y-12);continue;}
 ctx.fillStyle='#4e332c';ctx.fillRect(p.x-9,p.y-19,18,15);ctx.fillStyle='#a66b54';ctx.fillRect(p.x-6,p.y-31,12,11);
 ctx.fillStyle='#382f30';ctx.fillRect(p.x-8,p.y-34,16,5);ctx.fillRect(p.x-7,p.y-5,5,10);ctx.fillRect(p.x+2,p.y-5,5,10);
 ctx.fillStyle='#cfac8b';ctx.fillRect(p.x+8,p.y-18,4,11);
 ctx.font='700 9px IBM Plex Mono,monospace';ctx.textAlign='center';const w=ctx.measureText(u.name).width+12;
 ctx.fillStyle='#342520e8';ctx.fillRect(p.x-w/2,p.y-55,w,14);ctx.fillStyle='#f2b39a';ctx.fillText(u.name,p.x,p.y-45);
 ctx.fillStyle='#582b2b';ctx.fillRect(p.x-22,p.y-38,44,4);ctx.fillStyle='#dc8069';ctx.fillRect(p.x-22,p.y-38,44*u.hp/u.maxHp,4);
}}
function updateCombatHUD(){const c=state.combat,active=Boolean(c),play=c?.phase==='player';
 $('explorationActions').hidden=active||state.combatLost;$('combatActions').hidden=!active&&!state.combatLost;
 $('combatSwitch').hidden=!active||state.combatLost;
 $('combatBanner').hidden=!active&&!state.combatLost;$('combatFeedback').hidden=!active&&!state.combatLost;
 $('explorationBriefing').hidden=active||state.combatLost;$('combatBriefing').hidden=!active&&!state.combatLost;
 $('modeTag').textContent=active?(play?'◈ TURN-BASED · PLAYER PHASE':c.phase==='enemy'?'⚠ ENEMY PHASE':'◈ COMBAT RESOLVED'):state.combatLost?'⚠ EXPEDITION LOST':'◈ REAL-TIME · PAUSE SPACE';
 $('threatStatus').innerHTML=state.combatCleared?'SECTOR SECURED<br><span>NO HOSTILES DETECTED</span>':'CAUTION: UNMAPPED TERRITORY<br><span>HOSTILE PRESENCE SUSPECTED</span>';
 if(!active&&!state.combatLost)return;
 if(state.combatLost){$('roundCounter').textContent='SQUAD DEFEATED';$('combatHint').textContent='RESTART TO TRY AGAIN';$('combatEnd').textContent='↻ RESTART EXPEDITION';return;}
 $('roundCounter').textContent=c.phase==='won'?'SECTOR SECURED':`ROUND ${String(c.round).padStart(2,'0')} · ${play?'YOUR TURN':'ENEMY TURN'}`;
 $('combatHint').textContent='4 AP PER SURVIVOR · USE YOUR WHOLE SQUAD';
 const unit=battleUnit(),foe=activeUnit(c,state.targeted),shot=unit&&foe?calculateShot(world,unit,foe):null;
 $('combatTarget').textContent=foe&&isStanding(foe)?(shot?.ok?`${foe.name} · ${foe.hp}/${foe.maxHp} HP · ${shot.chance}% hit · ${shot.damage} damage · cover ${shot.cover}`:`${foe.name} · ${shot?.reason||'Invalid target'}`):'Select a raider to view hit chance and damage. Click a downed ally with MEDKIT selected to rescue them.';
 $('combatFeedback').textContent=`${unit?.name||'SURVIVOR'}: ${unit?.ap||0} AP | ${unit?.ammo||0} rounds | ${c.medkits} medical kits | ${state.combatMode.toUpperCase()} MODE`;
 for(const [mode,id] of [['move','combatMove'],['shoot','combatShoot'],['heal','combatHeal']]){$(id).classList.toggle('active',state.combatMode===mode);$(id).setAttribute('aria-pressed',String(state.combatMode===mode));}
 for(const id of ['combatMove','combatShoot','combatAim','combatReload','combatHeal'])$(id).disabled=!play||!isStanding(unit)||unit.ap<=0;
 $('combatShoot').disabled ||= unit.ap<2||unit.ammo<1;
 $('combatAim').disabled ||= unit.aimed;
 $('combatReload').disabled ||= unit.ammo>=unit.weapon.mag;
 $('combatHeal').disabled ||= unit.ap<2||c.medkits<1;
 $('combatEnd').disabled=!play;
 $('controlHint').textContent=unit.ap===0?'No AP left. Choose another survivor (Q / 1–3), or end your turn.':state.combatMode==='move'?'Move: click an open tile. Up to 3 tiles costs 1 AP.':state.combatMode==='heal'?'Medkit: click yourself or an adjacent ally. Costs 2 AP and 1 kit.':unit.ammo===0?'Magazine empty. Reload (L) before firing.':unit.ap<2?'Firing needs 2 AP. Move, reload, or choose another survivor.':'Fire: hover a raider to check hit chance, then click to shoot. Costs 2 AP.';
}
function setCombatMode(mode){if(!battling())return;state.combatMode=mode;updateHUD();}
function afterCombatAction(result){announce(result.message);const enc=state.combat;if(result.ok){const outcome=battleResult(enc);if(outcome==='won'){endCombatVictory();return;}if(outcome==='lost'){endCombatLoss();return;}}updateHUD();}
function combatAim(){if(!battling())return;afterCombatAction(aim(state.combat,`hero-${state.selected}`));}
function combatReload(){if(!battling())return;afterCombatAction(reload(state.combat,`hero-${state.selected}`));}
function handleCombatClick(mx,my){if(!battling())return;const enc=state.combat;
 for(let i=0;i<squad.length;i++){const u=battleUnit(i),p=toScreen(u.x,u.y);if(Math.hypot(mx-p.x,my-(p.y-20*state.zoom))<20*state.zoom){
  if(state.combatMode==='heal')afterCombatAction(stabilize(enc,`hero-${state.selected}`,u.id));else selectHero(i);
  return;
 }}
 for(const foe of enc.units.filter(u=>u.side==='enemy'&&isStanding(u))){const p=toScreen(foe.x,foe.y);if(Math.hypot(mx-p.x,my-(p.y-20*state.zoom))<22*state.zoom){state.targeted=foe.id;
   if(state.combatMode==='shoot')afterCombatAction(fire(enc,world,`hero-${state.selected}`,foe.id));else {announce('Raider targeted. Select FIRE to attack.');updateHUD();}return;
 }}
 if(state.combatMode==='move'){const t=fromScreen(mx,my);issueMove(t.x,t.y);}
 else if(state.combatMode==='heal')announce('Click a nearby squad member to use a medical kit.');
 else announce('Click a raider to fire or switch to MOVE (M).');
}
function endCombatTurn(){if(state.combatLost){location.reload();return;}if(!battling())return;
 const result=runEnemyPhase(state.combat,world);syncCombatPositions();for(const message of result.messages){const p=document.createElement('p');p.textContent=message;$('log').prepend(p);}while($('log').children.length>7)$('log').lastChild.remove();
 announce(result.result==='lost'?'Your squad has been defeated.':result.messages.at(-1)||'New round.');
 if(result.result==='won'){endCombatVictory();return;}if(result.result==='lost'){endCombatLoss();return;}
 if(!isStanding(battleUnit())){const next=state.combat.units.find(u=>u.side==='player'&&isStanding(u));if(next)state.selected=Number(next.id.split('-')[1]);}
 updateHUD();
}
function endCombatVictory(){const enc=state.combat;if(enc.phase!=='won')return;
 finishVictory(enc,squad);state.medkits=enc.medkits;state.combat=null;state.combatCleared=true;state.targeted=null;state.scrap+=8;
 if(squad[state.selected].dead){const replacement=squad.findIndex(p=>!p.dead);if(replacement>=0)state.selected=replacement;}
 const losses=squad.filter(p=>p.dead).length;announce(`RELAY SECURED · +8 scrap. ${losses?`${losses} survivor(s) lost.`:'All surviving allies extracted.'} Continue to the terminal.`);updateHUD();
}
function endCombatLoss(){state.combatLost=true;state.combat.phase='lost';state.combat.winner='enemy';updateHUD();announce('EXPEDITION FAILED. Use RESTART EXPEDITION to try again.');}
function approachSite(site){const hero=selected();if(site.claimed)return;
  if(site.id==='radio'&&!state.combatCleared&&Math.abs(hero.x-site.x)+Math.abs(hero.y-site.y)<=1){announce('Radio access blocked by raiders. Clear the patrol first.');return;}
  const distance=Math.abs(hero.x-site.x)+Math.abs(hero.y-site.y);
  if(distance<=1){site.claimed=true;world.interactions++;if(site.type==='radio')state.intel++;else state.scrap+=site.id==='cache'?6:4;announce(site.reward+' — '+site.name);state.awaitingSite=null;updateHUD();return;}
  const ok=moveParty(world,squad,state.selected,{x:site.x,y:site.y});if(ok){state.awaitingSite=site.id;announce('Heading toward '+site.name+'.');}else announce('No safe route to '+site.name+'.');
}
function interactNearby(){const hero=selected();const reachable=world.sites.filter(s=>!s.claimed&&Math.abs(hero.x-s.x)+Math.abs(hero.y-s.y)<=1);if(reachable.length)approachSite(reachable[0]);else announce('No points of interest within reach. Approach a gold marker.');}
function updateHUD(){
 $('squadList').innerHTML=squad.map((p,i)=>{const u=battleUnit(i),hp=u?u.hp:p.hp,max=u?u.maxHp:100,dead=u?.dead||p.dead,downed=u?.downed&&!u?.dead;return `<button class="squad-member ${i===state.selected?'selected':''} ${dead?'dead':downed?'incapacitated':''}" data-index="${i}" ${dead?'disabled':''}><span class="portrait">${p.initial}</span><span class="member-meta"><strong>${p.short} ${p.name.split(' ')[1]}</strong><small>${dead?'K.I.A.':downed?`DOWN · ${u.bleedout} ROUNDS`:p.role+' · LEVEL 01'}</small><span class="health"><span style="width:${Math.max(0,hp/max*100)}%"></span></span><em>${hp} / ${max} HP</em>${u?`<span class="squad-ap">${u.ap}/4 AP · ${u.ammo} ROUNDS</span>`:''}</span></button>`;}).join('');
 $('squadList').querySelectorAll('button').forEach(b=>b.onclick=()=>selectHero(+b.dataset.index));
 $('selectedName').innerHTML=`${selected().name} <span>${selected().role}</span>`;
 $('coordinates').textContent=`GRID ${String(selected().x).padStart(2,'0')},${String(selected().y).padStart(2,'0')}`;
 $('followAction').setAttribute('aria-pressed',String(state.followSquad));
 $('followAction').classList.toggle('active',state.followSquad);
 $('followAction').innerHTML=`<span aria-hidden="true">⇶</span> SQUAD FOLLOW: ${state.followSquad?'ON':'OFF'} <kbd>C</kbd><small>${state.followSquad?'Allies follow when you move':'Others hold position'}</small>`;
 $('followAction').title='Toggle squad following (C). Applies during exploration only.';
 $('followAction').disabled=Boolean(state.combat||state.combatLost);
 $('controlHint').textContent=state.paused?'Paused. Select Resume or press Space to continue.':`${state.followSquad?'Move together':'Move selected survivor only'} · Click ground to move · Gold markers collect · Q / 1–3 selects survivors`;
 $('scrap').textContent=state.scrap;$('intel').textContent=`${state.intel} / 1`;$('medkits').textContent=String(state.combat?.medkits??state.medkits).padStart(2,'0');
 const radio=world.sites.find(s=>s.id==='radio'),salvage=world.sites.filter(s=>s.type==='salvage');const found=Boolean(radio.claimed||radio.seen);
 const flags=[state.combatCleared,found,radio.claimed,salvage.some(s=>s.claimed)];
 [...$('objectives').children].forEach((el,i)=>el.classList.toggle('done',flags[i]));
 $('poiList').innerHTML=world.sites.map(s=>`<button class="poi ${s.claimed?'done':''}" ${state.combat?'disabled':''} data-site="${s.id}"><span class="poi-mark">${s.claimed?'✓':'◇'}</span><div><strong>${s.name}</strong><small>${s.claimed?'RECOVERED':`${Math.abs(s.x-selected().x)+Math.abs(s.y-selected().y)} tiles away`}</small></div></button>`).join('');
 $('poiList').querySelectorAll('button').forEach(b=>b.onclick=()=>{const site=world.sites.find(s=>s.id===b.dataset.site);if(site&&!site.claimed&&!state.combat)approachSite(site);});
 $('investigate').disabled=!world.sites.some(s=>!s.claimed&&Math.abs(s.x-selected().x)+Math.abs(s.y-selected().y)<=1);
 $('pauseAction').innerHTML=state.paused?'<span>▶</span> RESUME <kbd>SPACE</kbd>':'<span>Ⅱ</span> PAUSE <kbd>SPACE</kbd>';
 $('zoomLabel').textContent=`${Math.round(state.zoom*100)}%`;
 updateCombatHUD();
}
function stopOtherSurvivors(){
 for(let i=0;i<squad.length;i++)if(i!==state.selected){const p=squad[i];p.path=[];p.elapsed=0;p.renderX=p.x;p.renderY=p.y;}
}
function toggleSquadFollow(){
 if(state.combat||state.combatLost)return;
 state.followSquad=!state.followSquad;
 if(!state.followSquad)stopOtherSurvivors();
 updateHUD();
 announce(state.followSquad?'Squad follow ON. Allies follow when you move.':'Squad follow OFF. Other survivors hold position; select them to move individually.');
}
function selectHero(i){if(i<0||i>=squad.length)return;if(state.combat){const u=battleUnit(i);if(u?.dead){announce('This survivor was lost.');return;}if(u?.downed){announce('This survivor needs medical assistance.');return;}}state.selected=i;if(!state.combat&&!state.followSquad)stopOtherSurvivors();state.awaitingSite=null;state.panUntil=0;updateHUD();}
function issueMove(x,y){if(state.combat){if(!battling())return;const result=attemptMove(state.combat,world,`hero-${state.selected}`,{x,y});if(result.ok){syncCombatPositions();announce(result.message);}else announce(result.message);updateHUD();return;}if(state.paused){announce('Resume exploration to move.');return;}if(!canWalk(world,x,y)){announce('Terrain blocked. Choose an open tile.');return;}state.awaitingSite=null;const ok=moveParty(world,squad,state.selected,{x,y});if(!ok&&!(selected().x===x&&selected().y===y))announce('No open route to that tile.');}
function moveTick(delta){if($('helpDialog').open||state.paused||state.combat||state.combatLost)return;
 for(let i=0;i<squad.length;i++){
  const p=squad[i];if(p.dead){p.path=[];continue;}if(!p.path.length){p.renderX=p.x;p.renderY=p.y;continue;}
  const n=p.path[0],occupied=squad.some((other,j)=>j!==i&&other.x===n.x&&other.y===n.y);
  if(occupied){p.path=[];continue;}
  p.elapsed+=delta;const fraction=clamp(p.elapsed/195,0,1);
  p.renderX=p.x+(n.x-p.x)*fraction;p.renderY=p.y+(n.y-p.y)*fraction;
  if(fraction>=1){const prev={x:p.x,y:p.y};p.x=n.x;p.y=n.y;p.renderX=p.x;p.renderY=p.y;p.path.shift();p.elapsed=0;
    if(state.followSquad&&i===state.selected){for(let j=0;j<squad.length;j++)if(j!==i){const follower=squad[j],distance=Math.abs(follower.x-p.x)+Math.abs(follower.y-p.y);if(!follower.dead&&distance>2&&!follower.path.length)moveParty(world,squad,j,prev);}}
    if(i===state.selected){const radio=world.sites.find(s=>s.id==='radio');if(radio&&Math.abs(p.x-radio.x)+Math.abs(p.y-radio.y)<=3)radio.seen=true;}
    if(i===state.selected){maybeStartEncounter();}
    if(!state.combat&&i===state.selected&&state.awaitingSite){const site=world.sites.find(s=>s.id===state.awaitingSite);if(site&&Math.abs(p.x-site.x)+Math.abs(p.y-site.y)<=1)approachSite(site);}
    updateHUD();
  }
 }
}
const held=new Set();
function keyStep(now){if(state.paused||state.combat||state.combatLost||now-state.lastKey<165)return;
 let dx=0,dy=0;if(held.has('w')||held.has('arrowup'))dy=-1;else if(held.has('s')||held.has('arrowdown'))dy=1;else if(held.has('a')||held.has('arrowleft'))dx=-1;else if(held.has('d')||held.has('arrowright'))dx=1;
 if(dx||dy){state.lastKey=now;const p=selected();if(p.path.length===0&&canWalk(world,p.x+dx,p.y+dy)){issueMove(p.x+dx,p.y+dy);}}
}
let last=performance.now();function loop(now){const delta=Math.min(60,now-last);last=now;state.frame=now;keyStep(now);moveTick(delta);if(now>state.panUntil){const target=centerOf(selected());state.cam.x+=(target.x-state.cam.x)*.095;state.cam.y+=(target.y-state.cam.y)*.095;}render();requestAnimationFrame(loop);}state.cam=centerOf(selected());requestAnimationFrame(loop);
let dragging=false,lastPointer=null,dragDistance=0;
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(e.button===2){dragging=true;dragDistance=0;lastPointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}});
canvas.addEventListener('pointermove',e=>{
 if(dragging&&lastPointer){const dx=e.clientX-lastPointer.x,dy=e.clientY-lastPointer.y;dragDistance+=Math.abs(dx)+Math.abs(dy);state.cam.x-=dx/state.zoom;state.cam.y-=dy/state.zoom;state.panUntil=performance.now()+4000;lastPointer={x:e.clientX,y:e.clientY};return;}
 const r=canvas.getBoundingClientRect(),pos=fromScreen(e.clientX-r.left,e.clientY-r.top);state.hover=pos;
 const tile=world.tiles[pos.y]?.[pos.x],site=world.sites.find(s=>s.x===pos.x&&s.y===pos.y);
 const foe=state.combat?.units.find(u=>u.side==='enemy'&&isStanding(u)&&u.x===pos.x&&u.y===pos.y);
 const shot=foe&&battling()?calculateShot(world,battleUnit(),foe):null;
 const label=foe?(shot?.ok?`${foe.name} · ${shot.chance}% HIT`:`${foe.name} · ${shot?.reason||'TARGET'}`):site?.name||(tile?.walkable?'GROUND':'BLOCKED');
 const tooltip=$('hoverLabel');tooltip.hidden=!tile;if(tile){tooltip.textContent=label;tooltip.style.left=`${Math.min(viewW-145,e.clientX-r.left+15)}px`;tooltip.style.top=`${Math.min(viewH-40,e.clientY-r.top+15)}px`;}
});
canvas.addEventListener('pointerup',e=>{if(e.button===2){dragging=false;lastPointer=null;}});
canvas.addEventListener('pointerleave',()=>{$('hoverLabel').hidden=true;state.hover=null;});
canvas.addEventListener('click',e=>{const r=canvas.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
 if(state.combat){handleCombatClick(mx,my);return;}if(state.combatLost)return;
 for(let i=0;i<squad.length;i++){const p=toScreen(squad[i].renderX,squad[i].renderY);if(Math.hypot(p.x-mx,(p.y-21*state.zoom)-my)<17*state.zoom){selectHero(i);return;}}
 const t=fromScreen(mx,my);const site=world.sites.find(s=>s.x===t.x&&s.y===t.y&&!s.claimed);
 if(site){approachSite(site);return;}if(canWalk(world,t.x,t.y))issueMove(t.x,t.y);else announce('Blocked terrain.');
});
canvas.addEventListener('wheel',e=>{e.preventDefault();state.zoom=clamp(state.zoom+(e.deltaY<0?.1:-.1),.55,1.6);updateHUD();},{passive:false});
function pause(){state.paused=!state.paused;updateHUD();announce(state.paused?'Exploration paused.':'Expedition resumed.');}
window.addEventListener('keydown',e=>{
 if($('helpDialog').open||e.ctrlKey||e.metaKey||e.altKey)return;const tag=document.activeElement?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag)||document.activeElement?.isContentEditable)return;
 if(tag==='BUTTON'&&['Enter',' '].includes(e.key))return;
 const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();
 if(k==='c'&&!e.repeat){toggleSquadFollow();return;}
 if(k==='q'&&!e.repeat){cycleHero();return;}
 if(['1','2','3'].includes(k)){selectHero(Number(k)-1);return;}
 if(state.combat){if(e.repeat)return;if(k==='enter'){endCombatTurn();return;}if(k==='f'){setCombatMode('shoot');return;}if(k==='m'){setCombatMode('move');return;}if(k==='h'){setCombatMode('heal');return;}if(k==='g'){combatAim();return;}if(k==='l'){combatReload();return;}if(k===' '||k==='e'){return;}}
 if(k===' '&&!e.repeat){pause();return;}
 if(k==='e'&&!e.repeat){interactNearby();return;}
 if(k==='r'&&!e.repeat){state.panUntil=0;return;}
 if(k==='+'||k==='='){state.zoom=clamp(state.zoom+.1,.55,1.6);updateHUD();return;}
 if(k==='-'){state.zoom=clamp(state.zoom-.1,.55,1.6);updateHUD();return;}
 held.add(k);
});
window.addEventListener('keyup',e=>held.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>held.clear());
$('followAction').onclick=toggleSquadFollow;
$('switchAction').onclick=cycleHero;$('combatSwitch').onclick=cycleHero;
$('investigate').onclick=interactNearby;$('pauseAction').onclick=pause;
$('walkAction').onclick=()=>announce('Click a reachable tile on the map, or use WASD.');
$('zoomIn').onclick=()=>{state.zoom=clamp(state.zoom+.1,.55,1.6);updateHUD();};
$('zoomOut').onclick=()=>{state.zoom=clamp(state.zoom-.1,.55,1.6);updateHUD();};
$('recenter').onclick=()=>{state.panUntil=0;};
$('helpBtn').onclick=()=>{held.clear();$('helpDialog').showModal();};$('closeHelp').onclick=()=>$('helpDialog').close();
for(const [id,handler] of [['combatMove',()=>setCombatMode('move')],['combatShoot',()=>setCombatMode('shoot')],['combatHeal',()=>setCombatMode('heal')],['combatAim',combatAim],['combatReload',combatReload],['combatEnd',endCombatTurn]])$(id).onclick=handler;
updateHUD();announce('Expedition started. Find the Silent Relay northeast of camp. Watch for raiders.');

// Pure, deterministic tactical rules. No DOM or Canvas dependencies.
import {canWalk,cell,findPath,key,nearestOpen,rngFromSeed} from './core.mjs';

export const AP_PER_TURN=4;
export const MOVE_PER_AP=3;
export const BLEEDOUT_ROUNDS=3;
const obstructsSight=t=>Boolean(t&&!t.walkable&&['wall','wreck','rubble','crates','dead-tree','tent'].includes(t.object));
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));
export const isStanding=u=>u.hp>0&&!u.dead;
const live=(enc,side)=>enc.units.filter(u=>u.side===side&&isStanding(u));
export function activeUnit(enc,id){return enc.units.find(u=>u.id===id);}

// A supercover grid ray; diagonally grazed terrain cannot be shot through.
export function hasLineOfSight(world,a,b){
 const dx=b.x-a.x,dy=b.y-a.y,nx=Math.abs(dx),ny=Math.abs(dy);
 const sx=Math.sign(dx),sy=Math.sign(dy);let x=a.x,y=a.y,ix=0,iy=0;
 while(ix<nx||iy<ny){
  const decision=(1+2*ix)*ny-(1+2*iy)*nx;
  if(decision===0){
   if(ix<nx&&iy<ny){
    const acrossX=cell(world,x+sx,y),acrossY=cell(world,x,y+sy);
    if(obstructsSight(acrossX)&&obstructsSight(acrossY))return false;
   }
   x+=sx;y+=sy;ix++;iy++;
  }else if(decision<0){x+=sx;ix++;}else{y+=sy;iy++;}
  if((x!==b.x||y!==b.y)&&obstructsSight(cell(world,x,y)))return false;
 }
 return true;
}
export function coverPenalty(world,attacker,target){
 const dx=Math.sign(attacker.x-target.x),dy=Math.sign(attacker.y-target.y);
 const probes=[];
 if(dx)probes.push(cell(world,target.x+dx,target.y));
 if(dy)probes.push(cell(world,target.x,target.y+dy));
 const blockers=probes.filter(t=>t?.object&&['wall','crates','wreck','rubble','barrel'].includes(t.object)).length;
 return blockers>=2?35:blockers===1?20:0;
}
export function calculateShot(world,attacker,target){
 const range=dist(attacker,target),weapon=attacker.weapon;
 if(!isStanding(attacker)||!isStanding(target))return {ok:false,reason:'Target unavailable.'};
 if(range>weapon.range)return {ok:false,reason:`Out of range (${range}/${weapon.range}).`};
 if(!hasLineOfSight(world,attacker,target))return {ok:false,reason:'Line of sight blocked.'};
 const cover=coverPenalty(world,attacker,target);
 const longRange=Math.max(0,range-weapon.optimal)*7;
 const chance=clamp(55+3*attacker.per+4*attacker.firearms+weapon.accuracy+(attacker.aimed?15:0)-cover-longRange,10,95);
 return {ok:true,chance,cover,range,longRange,damage:Math.max(1,weapon.damage-(target.armor||0))};
}
const weapon=(name,damage,range,optimal,mag,accuracy=0)=>({name,damage,range,optimal,mag,accuracy});
export function createEncounter(world,party,seed=3867){
 const occupied=new Set(party.map(p=>key(p.x,p.y)));
 const configs=[{x:17,y:10,id:'raider-1',name:'RAIDER SCOUT',hp:42,weapon:weapon('Scrap Rifle',12,10,6,6,-2),per:4,firearms:1,armor:1},
                {x:21,y:10,id:'raider-2',name:'RAIDER GUNNER',hp:48,weapon:weapon('Pipe Pistol',11,8,5,6,-4),per:4,firearms:1,armor:2}];
 const enemies=configs.map(e=>{
   const pt=nearestOpen(world,{x:e.x,y:e.y},occupied,5);
   if(!pt)throw new Error('No clear enemy spawn point');occupied.add(key(pt.x,pt.y));
   return {...e,...pt,maxHp:e.hp,side:'enemy',ap:AP_PER_TURN,ammo:e.weapon.mag,aimed:false,downed:false,dead:false,stabilized:false,bleedout:0};
 });
 const heroes=party.map((p,i)=>({
   id:`hero-${i}`,name:p.name,short:p.short,side:'player',x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp||100,
   per:[7,5,6][i]||5,firearms:[2,1,1][i]||1,armor:[2,1,3][i]||1,
   weapon:[weapon('Service Rifle',18,11,7,6,0),weapon('10mm Pistol',13,8,6,8,2),weapon('Carbine',15,10,7,7,0)][i]||weapon('Pistol',12,8,6,6,0),
   ap:AP_PER_TURN,ammo:[6,8,7][i]||6,aimed:false,downed:false,dead:false,stabilized:false,bleedout:0
 }));
 return {phase:'player',round:1,units:[...heroes,...enemies],medkits:4,seed,random:rngFromSeed(seed+7301),events:['Raiders emerge from the relay ruins!'],winner:null};
}
export function attemptMove(enc,world,id,destination){
 const u=activeUnit(enc,id);
 if(enc.phase!==u?.side)return {ok:false,message:'Not your turn.'};
 if(!isStanding(u))return {ok:false,message:'This survivor cannot move.'};
 const blocked=new Set(enc.units.filter(v=>v.id!==id&&isStanding(v)).map(v=>key(v.x,v.y)));
 if(!canWalk(world,destination.x,destination.y)||blocked.has(key(destination.x,destination.y)))return {ok:false,message:'Destination blocked.'};
 const route=findPath(world,u,destination,blocked);
 if(!route.length)return {ok:false,message:'No route to destination.'};
 const cost=Math.ceil(route.length/MOVE_PER_AP);
 if(cost>u.ap)return {ok:false,message:`Need ${cost} AP to move ${route.length} tiles.`};
 u.x=destination.x;u.y=destination.y;u.ap-=cost;u.aimed=false;
 return {ok:true,message:`${u.name} moves ${route.length} tiles (${cost} AP).`,cost};
}
export function aim(enc,id){
 const u=activeUnit(enc,id);
 if(enc.phase!==u?.side||!isStanding(u)||u.ap<1)return {ok:false,message:'Cannot aim now.'};
 if(u.aimed)return {ok:false,message:'Already aiming.'};
 u.ap--;u.aimed=true;return {ok:true,message:`${u.name} takes careful aim (+15% next shot).`};
}
export function reload(enc,id){
 const u=activeUnit(enc,id);
 if(enc.phase!==u?.side||!isStanding(u)||u.ap<1)return {ok:false,message:'Cannot reload now.'};
 if(u.ammo>=u.weapon.mag)return {ok:false,message:'Magazine already full.'};
 u.ap--;u.ammo=u.weapon.mag;return {ok:true,message:`${u.name} reloads ${u.weapon.name}.`};
}
export function fire(enc,world,attackerId,targetId){
 const a=activeUnit(enc,attackerId),b=activeUnit(enc,targetId);
 if(!a||!b||enc.phase!==a.side||a.side===b.side)return {ok:false,message:'Invalid target.'};
 if(a.ap<2||!isStanding(a))return {ok:false,message:'Need 2 AP to fire.'};
 if(a.ammo<1)return {ok:false,message:'Empty magazine. Reload first.'};
 const shot=calculateShot(world,a,b);
 if(!shot.ok)return {ok:false,message:shot.reason};
 a.ap-=2;a.ammo--;a.aimed=false;
 const hit=enc.random()*100<shot.chance;
 let message='';
 if(hit){
  b.hp=Math.max(0,b.hp-shot.damage);
  if(b.hp===0){
   b.downed=true;
   if(b.side==='enemy'){b.dead=true;message=`${a.name} eliminates ${b.name} (${shot.damage} damage).`;} 
   else {b.bleedout=BLEEDOUT_ROUNDS;message=`${b.name} is incapacitated! Rescue before bleedout (${b.bleedout} rounds).`;}
  }else message=`${a.name} hits ${b.name} for ${shot.damage} damage.`;
 } else message=`${a.name} misses ${b.name} (${shot.chance}% chance).`;
 return {ok:true,hit,message,shot,downed:b.downed};
}
export function stabilize(enc,medicId,targetId){
 const medic=activeUnit(enc,medicId),target=activeUnit(enc,targetId);
 if(enc.phase!=='player'||!medic||!target||medic.side!=='player'||target.side!=='player')return {ok:false,message:'Invalid treatment.'};
 if(!isStanding(medic)||medic.ap<2||enc.medkits<1)return {ok:false,message:'Need 2 AP and a medical kit.'};
 if(dist(medic,target)>1)return {ok:false,message:'Move adjacent to treat your ally.'};
 if(target.dead)return {ok:false,message:'Too late. This survivor has died.'};
 if(target.hp>=target.maxHp)return {ok:false,message:'This survivor does not need treatment.'};
 medic.ap-=2;enc.medkits--;
 const before=target.hp;
 target.hp=Math.min(target.maxHp,target.hp+(target.downed?30:24));
 target.downed=false;target.stabilized=true;target.bleedout=0;target.ap=0;
 return {ok:true,message:`${medic.name} treats ${target.name} (+${target.hp-before} HP, 1 medkit).`};
}
export function advanceBleedout(enc){
 const lost=[];
 for(const u of enc.units.filter(u=>u.side==='player'&&u.downed&&!u.dead)){
  u.bleedout=Math.max(0,u.bleedout-1);
  if(u.bleedout===0){u.dead=true;lost.push(u.name);}
 }
 return lost;
}
export function battleResult(enc){
 const enemiesAlive=live(enc,'enemy').length;
 const heroesAlive=live(enc,'player').length;
 if(!enemiesAlive){enc.phase='won';enc.winner='player';return 'won';}
 if(!heroesAlive){enc.phase='lost';enc.winner='enemy';return 'lost';}
 return null;
}
function closestHero(enc,enemy){
 return live(enc,'player').sort((a,b)=>dist(a,enemy)-dist(b,enemy))[0];
}
export function runEnemyPhase(enc,world){
 if(enc.phase!=='player')return {ok:false,messages:['No enemy phase available.']};
 enc.phase='enemy';const messages=[];
 for(const e of live(enc,'enemy')){
  e.ap=AP_PER_TURN;e.aimed=false;
  let loops=0;
  while(e.ap>=1&&loops++<6&&enc.phase==='enemy'){
   const opponents=live(enc,'player');
   if(!opponents.length)break;
   const candidates=opponents.map(h=>({h,shot:calculateShot(world,e,h)})).filter(x=>x.shot.ok);
   if(candidates.length&&e.ap>=2){
    candidates.sort((a,b)=>b.shot.chance-a.shot.chance||a.h.hp-b.h.hp);
    if(e.ammo===0){const res=reload(enc,e.id);if(res.ok)messages.push(res.message);continue;}
    const result=fire(enc,world,e.id,candidates[0].h.id);
    if(result.ok)messages.push(result.message);
    else break;
    continue;
   }
   const goal=closestHero(enc,e);if(!goal)break;
   const blocked=new Set(enc.units.filter(u=>u.id!==e.id&&isStanding(u)).map(u=>key(u.x,u.y)));
   const adjacent=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:goal.x+dx,y:goal.y+dy}))
     .filter(p=>canWalk(world,p.x,p.y)&&!blocked.has(key(p.x,p.y)));
   const options=adjacent.map(p=>findPath(world,e,p,blocked)).filter(p=>p.length);
   options.sort((a,b)=>a.length-b.length);const path=options[0];
   if(!path?.length)break;
   const steps=Math.min(path.length,MOVE_PER_AP,e.ap*MOVE_PER_AP);
   const point=path[steps-1];e.x=point.x;e.y=point.y;e.ap-=Math.ceil(steps/MOVE_PER_AP);
   messages.push(`${e.name} advances ${steps} tiles.`);
  }
 }
 // Incapacitated characters lose a recovery round at the end of each enemy phase.
 const lost=advanceBleedout(enc);
 for(const name of lost)messages.push(`${name} died before rescue could arrive.`);
 const result=battleResult(enc);
 if(!result){enc.round++;enc.phase='player';for(const u of live(enc,'player')){u.ap=AP_PER_TURN;u.aimed=false;}messages.push(`ROUND ${enc.round} — your squad's turn.`);}
 return {ok:true,messages,result};
}
export function finishVictory(enc,party){
 if(enc.phase!=='won')return false;
 for(let i=0;i<party.length;i++){
  const unit=activeUnit(enc,`hero-${i}`),hero=party[i];
  if(!unit)continue;
  hero.hp=unit.dead?0:unit.downed?20:unit.hp;
  hero.dead=unit.dead;
  hero.injured=Boolean(unit.downed||unit.hp<35);
  hero.x=unit.x;hero.y=unit.y;hero.renderX=hero.x;hero.renderY=hero.y;hero.path=[];
 }
 return true;
}

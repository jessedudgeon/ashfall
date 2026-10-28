import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWorld,canWalk,key} from '../core.mjs';
import {createEncounter,hasLineOfSight,calculateShot,coverPenalty,attemptMove,fire,aim,reload,stabilize,advanceBleedout,runEnemyPhase,battleResult,finishVictory,AP_PER_TURN} from '../combat.mjs';
const squad=()=>[
 {name:'MARA VOSS',short:'MARA',x:17,y:13,hp:85,path:[],renderX:17,renderY:13},
 {name:'ELI WARD',short:'ELI',x:16,y:13,hp:100,path:[],renderX:16,renderY:13},
 {name:'ROOK HAYES',short:'ROOK',x:17,y:14,hp:72,path:[],renderX:17,renderY:14}
];
const setup=()=>{const world=makeWorld(3867),party=squad();return {world,party,enc:createEncounter(world,party,3867)};};
test('encounter spawns two distinct, walkable raiders and three survivors',()=>{
 const {world,enc}=setup();assert.equal(enc.phase,'player');assert.equal(enc.round,1);assert.equal(enc.units.length,5);
 assert.equal(new Set(enc.units.map(u=>key(u.x,u.y))).size,5);
 for(const e of enc.units){assert.ok(canWalk(world,e.x,e.y));assert.equal(e.ap,AP_PER_TURN);}
});
test('line of sight blocks wall tiles but permits open lanes',()=>{
 const world=makeWorld(3867);
 assert.equal(hasLineOfSight(world,{x:19,y:7},{x:19,y:4}),false);
 assert.equal(hasLineOfSight(world,{x:17,y:10},{x:17,y:9}),true);
});
test('shot chance includes aim and AP/ammunition costs',()=>{
 const {world,enc}=setup();const player=enc.units[0],enemy=enc.units[3];
 const before=calculateShot(world,player,enemy);assert.ok(before.ok);
 assert.equal(aim(enc,player.id).ok,true);const after=calculateShot(world,player,enemy);
 assert.equal(after.chance,Math.min(95,before.chance+15));
 const res=fire(enc,world,player.id,enemy.id);assert.ok(res.ok);assert.equal(player.ap,1);assert.equal(player.ammo,5);assert.equal(player.aimed,false);
 assert.equal(fire(enc,world,player.id,enemy.id).ok,false);
});
test('movement must respect action points and occupied cells',()=>{
 const {world,enc}=setup();const p=enc.units[0];
 assert.equal(attemptMove(enc,world,p.id,{x:16,y:13}).ok,false);
 const result=attemptMove(enc,world,p.id,{x:17,y:12});assert.ok(result.ok);assert.equal(p.ap,3);
 assert.equal(attemptMove(enc,world,p.id,{x:29,y:29}).ok,false);
});
test('reload uses AP and fails if the magazine is already full',()=>{
 const {enc}=setup(),p=enc.units[0];assert.equal(reload(enc,p.id).ok,false);
 p.ammo=0;assert.equal(reload(enc,p.id).ok,true);assert.equal(p.ammo,p.weapon.mag);assert.equal(p.ap,3);
});
test('medkits rescue an adjacent incapacitated ally; bleedout kills only if untreated',()=>{
 const {enc}=setup(),medic=enc.units[1],patient=enc.units[0];patient.hp=0;patient.downed=true;patient.bleedout=3;
 const heal=stabilize(enc,medic.id,patient.id);assert.ok(heal.ok);assert.equal(patient.hp,30);assert.equal(patient.downed,false);assert.equal(enc.medkits,3);assert.equal(medic.ap,2);
 patient.hp=0;patient.downed=true;patient.bleedout=2;
 assert.deepEqual(advanceBleedout(enc),[]);assert.equal(patient.bleedout,1);
 assert.deepEqual(advanceBleedout(enc),['MARA VOSS']);assert.equal(patient.dead,true);
 assert.equal(stabilize(enc,medic.id,patient.id).ok,false);
});
test('enemy phase advances rounds, fires or moves, and cannot stack on units',()=>{
 const {world,enc}=setup();const res=runEnemyPhase(enc,world);
 assert.ok(res.ok);assert.ok(res.messages.length>0);assert.equal(enc.round,2);assert.equal(enc.phase,'player');
 const living=enc.units.filter(u=>u.hp>0);assert.equal(new Set(living.map(u=>key(u.x,u.y))).size,living.length);
 assert.ok(enc.units.filter(u=>u.side==='player'&&u.hp>0).every(u=>u.ap===4));
});
test('defeating raiders ends combat and salvages surviving squad state',()=>{
 const {enc,party}=setup();for(const e of enc.units.filter(u=>u.side==='enemy')){e.hp=0;e.dead=true;}
 const hero=enc.units[0];hero.hp=0;hero.downed=true;hero.bleedout=2;
 assert.equal(battleResult(enc),'won');assert.equal(finishVictory(enc,party),true);
 assert.equal(party[0].hp,20);assert.equal(party[0].injured,true);
 assert.equal(party[0].dead,false);
});
test('all incapacitated survivors lose combat',()=>{
 const {enc}=setup();for(const p of enc.units.filter(u=>u.side==='player')){p.hp=0;p.downed=true;}
 assert.equal(battleResult(enc),'lost');assert.equal(enc.winner,'enemy');
});
test('identical seeded combat rolls produce identical outcomes',()=>{
 const a=setup(),b=setup();const aFire=fire(a.enc,a.world,'hero-0','raider-1');const bFire=fire(b.enc,b.world,'hero-0','raider-1');
 assert.deepEqual({...aFire},{...bFire});assert.equal(a.enc.units[3].hp,b.enc.units[3].hp);
});

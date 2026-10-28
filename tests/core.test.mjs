import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWorld,findPath,canWalk,isoToWorld,worldToIso,nearestOpen,moveParty,key} from '../core.mjs';

test('identical seeds produce identical terrain and objects',()=>{
  const a=makeWorld(123),b=makeWorld(123),c=makeWorld(124);
  assert.deepEqual(a.tiles,b.tiles);
  assert.notDeepEqual(a.tiles,c.tiles);
});
test('spawn area is navigable',()=>{
  const w=makeWorld(3867);
  for(const p of [[9,24],[10,24],[9,25],[9,23]])assert.equal(canWalk(w,...p),true);
  assert.ok(findPath(w,{x:9,y:24},{x:15,y:13}).length>5);
});
test('routes avoid walls and other obstacles',()=>{
  const w=makeWorld();const p=findPath(w,{x:19,y:7},{x:23,y:10});
  assert.ok(p.length>0);assert.ok(p.every(c=>canWalk(w,c.x,c.y)));
  assert.equal(canWalk(w,19,5),false);
  assert.deepEqual(findPath(w,{x:9,y:24},{x:19,y:5}),[]);
});
test('isometric projection round trips',()=>{
  for(const a of [{x:0,y:0},{x:17,y:3},{x:23.25,y:18.5}]){
    const b=worldToIso(...Object.values(isoToWorld(a.x,a.y)));
    assert.ok(Math.abs(a.x-b.x)<1e-9);assert.ok(Math.abs(a.y-b.y)<1e-9);
  }
});
test('occupied destinations are redirected and do not overlap',()=>{
  const w=makeWorld(),party=[{x:9,y:24,path:[]},{x:10,y:24,path:[]},{x:9,y:25,path:[]}];
  assert.equal(moveParty(w,party,0,{x:10,y:24}),true);
  const end=party[0].path.at(-1);
  assert.notEqual(key(end.x,end.y),key(party[1].x,party[1].y));
  assert.ok(nearestOpen(w,{x:10,y:24},new Set([key(10,24)])));
});
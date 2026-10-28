export const SIZE = 30;
export const TILE_W = 72;
export const TILE_H = 36;

export function rngFromSeed(seed) {
  let h = (Number(seed) >>> 0) || 1;
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const key = (x, y) => `${x},${y}`;
export const inside = (world, x, y) => x >= 0 && y >= 0 && x < world.size && y < world.size;
export const cell = (world, x, y) => inside(world,x,y) ? world.tiles[y][x] : undefined;
export const canWalk = (world, x, y) => Boolean(cell(world,x,y)?.walkable);
export function isoToWorld(x,y) {return {x:(x-y)*TILE_W/2,y:(x+y)*TILE_H/2};}
export function worldToIso(px,py) {return {x:(px/(TILE_W/2)+py/(TILE_H/2))/2,y:(py/(TILE_H/2)-px/(TILE_W/2))/2};}

export function makeWorld(seed=3867) {
  const rand=rngFromSeed(seed), size=SIZE;
  const tiles=Array.from({length:size},(_,y)=>Array.from({length:size},(_,x)=>{
    const r=rand(); return {x,y,terrain:r<.1?'dirt':r<.25?'dry':r<.38?'grass':'dust',detail:rand(),shade:rand(),walkable:true,object:null,discovered:true};
  }));
  const world={size,seed,tiles,sites:[],interactions:0};
  function tile(x,y,terrain,object=null,walkable=true){if(inside(world,x,y)){Object.assign(tiles[y][x],{terrain,object,walkable});}}
  // Two cracked highways intersect beyond the camp.
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    if(Math.abs(x-y-3)<=1 || (y>=17&&y<=19&&x>6)) tile(x,y,'road');
  }
  // Walkable camp in the southern half.
  for(let y=20;y<=27;y++) for(let x=5;x<=13;x++) tile(x,y,'camp');
  // Building and obstacle placement, no placement inside camp.
  const features=['rubble','crates','wreck','scrub','dead-tree','barrel','wall'];
  for(let y=2;y<size-2;y++) for(let x=2;x<size-2;x++) {
    if(x>=4&&x<=15&&y>=19) continue;
    if(tiles[y][x].terrain==='road') continue;
    const chance=rand();
    if(chance<.075){ const type=features[Math.floor(rand()*features.length)]; tile(x,y,tiles[y][x].terrain,type,type==='scrub'); }
  }
  // Scenic set-pieces with deliberately open approaches.
  for(let y=5;y<=8;y++) for(let x=17;x<=21;x++) tile(x,y,'concrete');
  for(let x=17;x<=21;x++){tile(x,5,'concrete','wall',false);tile(x,8,'concrete','wall',false);}
  tile(17,6,'concrete','wall',false);tile(21,6,'concrete','wall',false);
  tile(19,6,'concrete','terminal',true);
  tile(19,7,'concrete',null,true);
  for(let x=22;x<26;x++) {tile(x,12,'concrete','wall',false);tile(x,15,'concrete','wall',false);}
  for(let y=12;y<=15;y++){tile(22,y,'concrete','wall',false);tile(25,y,'concrete','wall',false);}
  tile(23,13,'concrete','crates',false);tile(24,14,'concrete','rubble',false);
  const poi=[
    {id:'cache',x:15,y:13,name:'Roadside Cache',type:'salvage',reward:'Recovered field supplies',description:'A battered cargo container rests beside the highway.'},
    {id:'radio',x:19,y:6,name:'Silent Relay',type:'radio',reward:'Signal fragment recovered',description:'A pre-Cascade terminal is still drawing power.'},
    {id:'fuel',x:9,y:10,name:'Fuel Wreck',type:'salvage',reward:'Recovered scrap components',description:'The engine bay still contains usable parts.'}
  ];
  for(const p of poi){tile(p.x,p.y,p.id==='radio'?'concrete':'road',p.type==='radio'?'terminal':'salvage',true);world.sites.push({...p,claimed:false});}
  // A safe starting area and spawn positions.
  for(const [x,y] of [[9,24],[10,24],[9,25],[8,24],[10,25],[11,24],[9,23],[8,25]])tile(x,y,'camp');
  tile(7,23,'camp','tent',false);tile(12,25,'camp','campfire',false);tile(6,25,'camp','crates',false);
  return world;
}

export function findPath(world,start,end,blocked=new Set()) {
  const sx=Math.round(start.x),sy=Math.round(start.y),ex=Math.round(end.x),ey=Math.round(end.y);
  if(!canWalk(world,sx,sy)||!canWalk(world,ex,ey)||blocked.has(key(ex,ey)))return [];
  if(sx===ex&&sy===ey)return [];
  const frontier=[{x:sx,y:sy,f:0,g:0}],g=new Map([[key(sx,sy),0]]),parents=new Map();
  const h=(x,y)=>Math.abs(ex-x)+Math.abs(ey-y);let processed=0;
  while(frontier.length&&processed++<world.size*world.size*5){
    frontier.sort((a,b)=>a.f-b.f||a.g-b.g);const node=frontier.shift();
    if(node.g!==g.get(key(node.x,node.y)))continue;
    if(node.x===ex&&node.y===ey){
      const path=[];let k=key(ex,ey);
      while(k!==key(sx,sy)){const [x,y]=k.split(',').map(Number);path.unshift({x,y});k=parents.get(k);if(!k)return [];}
      return path;
    }
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const x=node.x+dx,y=node.y+dy,k=key(x,y);
      if(!canWalk(world,x,y)||blocked.has(k))continue;
      const ng=node.g+1;
      if(ng<(g.get(k)??Infinity)){g.set(k,ng);parents.set(k,key(node.x,node.y));frontier.push({x,y,g:ng,f:ng+h(x,y)});}
    }
  }
  return [];
}
export function nearestOpen(world, target, occupied=new Set(), maxRadius=8){
  for(let radius=0;radius<=maxRadius;radius++){
    for(let y=target.y-radius;y<=target.y+radius;y++) for(let x=target.x-radius;x<=target.x+radius;x++) {
      if(Math.abs(x-target.x)+Math.abs(y-target.y)!==radius)continue;
      if(canWalk(world,x,y)&&!occupied.has(key(x,y)))return {x,y};
    }
  }
  return null;
}
export function moveParty(world,party,index,destination){
  const hero=party[index],occupied=new Set(party.filter((_,i)=>i!==index).map(p=>key(p.x,p.y)));
  const target=nearestOpen(world,destination,occupied);
  if(!target)return false;
  const path=findPath(world,hero,target,occupied);
  if(!path.length)return false;
  hero.path=path;
  // Followers are updated in the real-time simulation, not moved instantly.
  return true;
}
// In-process browser UI smoke test: exercises actual game.js DOM event handlers
// without requiring Chromium/network access in restricted CI environments.
import test from 'node:test';
import assert from 'node:assert/strict';

const nodes=new Map();
function element(id=''){
 const attrs={};let html='',buttons=[];
 const el={id,style:{},hidden:false,disabled:false,clientWidth:1000,clientHeight:700,
  classList:{add(){},remove(){},toggle(){}},dataset:{},
  getBoundingClientRect(){return {left:0,top:0,width:1000,height:700};},
  querySelectorAll(sel){return sel==='button'?buttons:[];},
  children:[],prepend(child){child.parent=this;this.children.unshift(child);},
  get lastChild(){return this.children.at(-1);},remove(){if(this.parent){this.parent.children=this.parent.children.filter(c=>c!==this);}},
  addEventListener(type,handler){(this.events??={})[type]=handler;},
  setAttribute(name,value){attrs[name]=value;},getAttribute(name){return attrs[name];},setPointerCapture(){},getContext(){return ctx;},
  showModal(){this.open=true;},close(){this.open=false;},open:false,
  get innerHTML(){return html;},set innerHTML(value){html=value;buttons=[...value.matchAll(/<button\b[^>]*\bdata-(index|site)="([^"]+)"/g)].map(m=>{const b=element('child');b.dataset[m[1]]=m[2];return b;});},
  get textContent(){return attrs.text||'';},set textContent(v){attrs.text=String(v);},
 };
 return el;
}
const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),measureText:t=>({width:String(t).length*5})},{get(t,p){return p in t?t[p]:()=>{};}});
const document={getElementById(id){if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id);},createElement(){return element('created');},activeElement:{tagName:'BODY'}};
globalThis.document=document;
globalThis.window={events:{},addEventListener(type,fn){this.events[type]=fn;}};
globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;}observe(){this.callback();}};
globalThis.devicePixelRatio=1;
globalThis.location={search:'?seed=3867',reload(){}};
let nextFrame=null;globalThis.requestAnimationFrame=(callback)=>{nextFrame=callback;};

await import('../game.js');
const $=id=>document.getElementById(id);

test('HUD initializes and explorer can walk from keyboard input',()=>{
 assert.match($('selectedName').innerHTML,/MARA VOSS/);
 assert.equal($('combatActions').hidden,true);
 window.events.keydown({key:'w',repeat:false,preventDefault(){}});
 let t=performance.now();for(let i=0;i<6;i++){const cb=nextFrame;assert.equal(typeof cb,'function');cb(t+=120);}
 window.events.keyup({key:'w'});
 assert.match($('coordinates').textContent,/GRID 09,23/);
});

test('approaching relay switches interface to combat and allows actions',()=>{
 const radio=$('poiList').querySelectorAll('button').find(b=>b.dataset.site==='radio');
 assert.ok(radio,'Radio destination should be in the POI list');
 radio.onclick();
 let t=performance.now();
 for(let i=0;i<170&&$('combatActions').hidden;i++){const cb=nextFrame;cb(t+=120);}
 assert.equal($('combatActions').hidden,false,'Raiders should trigger on approach to the relay');
 assert.match($('roundCounter').textContent,/ROUND 01/);
 assert.equal($('combatReload').disabled,true);
 $('combatMove').onclick();
 assert.match($('controlHint').textContent,/Move: click/);
 assert.equal($('combatMove').getAttribute('aria-pressed'),'true');
 $('combatAim').onclick();
 assert.equal($('combatAim').disabled,true);
 assert.match($('combatFeedback').textContent,/3 AP/);
 $('combatEnd').onclick();
 assert.match($('roundCounter').textContent,/ROUND 02|SQUAD DEFEATED/);
});

 test('Tab remains native and focused buttons do not trigger game shortcuts',()=>{
  let prevented=false;const before=$('selectedName').innerHTML;
  window.events.keydown({key:'Tab',preventDefault(){prevented=true;}});
  assert.equal(prevented,false);assert.equal($('selectedName').innerHTML,before);
  const round=$('roundCounter').textContent;document.activeElement={tagName:'BUTTON'};
  window.events.keydown({key:'Enter',preventDefault(){}});
  assert.equal($('roundCounter').textContent,round);
  document.activeElement={tagName:'BODY'};
 });

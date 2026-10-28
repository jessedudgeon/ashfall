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

test('squad following can stop queued movement and resume on the next move',()=>{
 let time=performance.now()+10000;
 const step=n=>{for(let i=0;i<n;i++)nextFrame(time+=120);};
 const press=key=>window.events.keydown({key,repeat:false,preventDefault(){}});
 const release=key=>window.events.keyup({key});
 const position=i=>{press(String(i));return $('coordinates').textContent;};
 assert.equal($('followAction').getAttribute('aria-pressed'),'true');
 $('followAction').onclick();
 assert.equal($('followAction').getAttribute('aria-pressed'),'false');
 const eli=position(2),rook=position(3),mara=position(1);
 press('w');step(24);release('w');step(4);
 assert.notEqual($('coordinates').textContent,mara);
 assert.equal(position(2),eli);assert.equal(position(3),rook);position(1);
 press('c');
 assert.equal($('followAction').getAttribute('aria-pressed'),'true');
 press('s');step(12);release('s');
 // Stop while followers still have a route queued.
 press('c');
 const heldEli=position(2),heldRook=position(3);position(1);
 step(20);
 assert.equal(position(2),heldEli);assert.equal(position(3),heldRook);position(1);
 press('c');press('w');step(28);release('w');step(20);
 assert.notEqual(position(2),heldEli,'Following resumes when the leader moves');position(1);
 // Switching in solo mode cancels the previous survivor's pending step.
 press('c');
 const beforeSwitch=position(1);
 press('s');step(1);release('s');position(2);step(12);
 assert.equal(position(1),beforeSwitch);

});


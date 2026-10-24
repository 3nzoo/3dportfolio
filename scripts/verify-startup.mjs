import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { portfolioHtmlPlugin } from './lib/portfolio-html.js';

const source = await readFile(new URL('../src/startup.js', import.meta.url), 'utf8');
function environment() {
  const handlers = new Map(), classes = new Set(), attributes = new Map();
  const screen = {
    classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
    setAttribute: (name,value) => attributes.set(name,value), removeAttribute: name => attributes.delete(name),
  };
  const message = {textContent:''};
  const navigator = {onLine:true};
  runInNewContext(source, {
    document: {querySelector: selector => selector === '#loading-screen' ? screen : selector === '#loading-message' ? message : null},
    window: {addEventListener(type,handler) {handlers.set(type,[...(handlers.get(type)||[]),handler]);}},
    navigator,
  });
  return {screen,message,navigator,dispatch(type,event={}) {for(const handler of handlers.get(type)||[]) handler(event);}};
}
const normal=environment();
assert.equal(normal.message.textContent,'Preparing the 3D machine…');
assert(!normal.screen.classList.contains('is-loaded'),'The original loader remains visible until a completed board event');
normal.dispatch('board:ready');
assert(normal.screen.classList.contains('is-loaded'));
normal.dispatch('offline');
assert.equal(normal.message.textContent,'Preparing the 3D machine…','A connection change after readiness must not reopen or rewrite the loader');
normal.dispatch('board:waiting',{detail:{message:'Restoring the board…'}});
assert(!normal.screen.classList.contains('is-loaded'));
assert.equal(normal.message.textContent,'Restoring the board…');
normal.dispatch('board:ready');
assert(normal.screen.classList.contains('is-loaded'));

const failed=environment();
failed.dispatch('error',{target:{type:'image'}});
assert.equal(failed.message.textContent,'Preparing the 3D machine…','Optional image failures are handled by the board material fallback');
failed.dispatch('error',{target:{type:'module'}});
assert.match(failed.message.textContent,/couldn’t load/);
assert(!failed.screen.classList.contains('is-loaded'),'Failed downloads must not reveal an empty board');
failed.dispatch('board:ready');
assert(failed.screen.classList.contains('is-loaded'));

const offline=environment();
offline.navigator.onLine=false;offline.dispatch('offline');
assert.match(offline.message.textContent,/offline/);
offline.navigator.onLine=true;offline.dispatch('online');
assert.match(offline.message.textContent,/Connection restored.*Reload/);
assert(!offline.screen.classList.contains('is-loaded'));
offline.dispatch('board:ready');
assert(offline.screen.classList.contains('is-loaded'));

const index=await readFile(new URL('../index.html',import.meta.url),'utf8');
const html=portfolioHtmlPlugin().transformIndexHtml(index);
assert(!html.includes('<!--board-startup'));
assert(html.includes('<script id="board-startup">'));
assert(html.indexOf('.loading-screen {')<html.indexOf('<body>'));
assert(html.includes('<div class="loading-orbit" aria-hidden="true"><i></i><span>ED</span></div>'));
assert(html.includes('WELCOME TO MY WORLD'));
assert(html.includes('<h4 id="loading-message">Preparing the 3D machine…</h4>'));
assert(!html.includes('class="loading-board"')&&!html.includes('class="loading-actions"'),'Keep the original loading presentation');
assert(html.includes('src="/src/boot.js"'));
assert(html.includes('media="print"'),'Web fonts must not block board initialization');
console.log('Startup checks passed: original rotating loader and text, completed-frame gating, failed module, optional image fallback, offline recovery, graphics restoration, and initial HTML.');

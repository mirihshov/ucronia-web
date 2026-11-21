import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// Pruebas de los borradores automáticos del panel (sin navegador): npm run test:draft
// Usa un mini-DOM para comprobar guardar, recuperar, descartar, «ok=1» y filas dinámicas.
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/scripts/admin-draft.ts');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ucronia-draft-'));
globalThis.window = globalThis; globalThis.confirm = () => false;
const mem = new Map();
globalThis.localStorage = { get length() { return mem.size; }, key: (i) => [...mem.keys()][i] ?? null, getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const sess = new Map();
globalThis.sessionStorage = { getItem: (k) => sess.get(k) ?? null, setItem: (k, v) => sess.set(k, v), removeItem: (k) => sess.delete(k) };
class El { constructor() { this.attrs = {}; this.children = []; this.listeners = {}; this.classList = { toggle() {}, add() {} }; this.dataset = {}; this.hidden = false; this.textContent = ''; }
  setAttribute(k, v) { this.attrs[k] = v; } append(...c) { this.children.push(...c); } prepend(...c) { this.children.unshift(...c); } before() {} after() {} remove() {}
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); } dispatchEvent(e) { (this.listeners[e.type] || []).forEach((f) => f(e)); } }
globalThis.HTMLInputElement = class extends El {}; globalThis.HTMLTextAreaElement = class extends El {}; globalThis.HTMLSelectElement = class extends El {};
globalThis.Event = class { constructor(type, o) { this.type = type; Object.assign(this, o); } };
globalThis.URLSearchParams = URLSearchParams;
const docListeners = {};
globalThis.document = { querySelectorAll: () => [], addEventListener: (t, f) => (docListeners[t] ||= []).push(f), createElement: () => new El(), visibilityState: 'visible' };
const winL = {}; globalThis.addEventListener = (t, f) => (winL[t] ||= []).push(f);
globalThis.location = { search: '', pathname: '/admin/articulos/1', hash: '' };
globalThis.history = { replaceState() {} };
const inp = (name, value, type = 'text') => { const e = new HTMLInputElement(); Object.assign(e, { name, value, type, disabled: false, checked: false }); return e; };
const area = (name, value) => { const e = new HTMLTextAreaElement(); Object.assign(e, { name, value, disabled: false }); return e; };
let forms = [];
document.querySelectorAll = (sel) => sel === 'form[data-draft]' ? forms : [];
const makeForm = (key, els, extra = {}) => { const f = new El(); f.dataset = { draft: key, ...extra }; f.elements = els; f.querySelector = (s) => s === '.form-actions' ? null : null; f.querySelectorAll = () => []; return f; };
// -- el módulo ya se inicializó sin formularios; lo reutilizamos importando de nuevo con otra consulta
let n = 0; const boot = async () => { n++; const f = path.join(TMP, `d${n}.ts`); fs.copyFileSync(SRC, f); await import(pathToFileURL(f).href); }; // una copia por arranque: Node no reejecuta un módulo ya importado
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const ok = (name, c) => { if (!c) fails++; console.log(`${c ? '✓' : '✗'} ${name}`); };

// 1) escribir → se guarda borrador
const A = () => [inp('intent', 'save', 'hidden'), inp('title', 'Original'), area('body', 'Texto base'), inp('cover', '', 'file')];
forms = [makeForm('article:1', A())]; await boot();
forms[0].elements[1].value = 'Título nuevo'; forms[0].dispatchEvent({ type: 'input' }); await wait(700);
let d = JSON.parse(localStorage.getItem('ucronia:draft:article:1') ?? 'null');
ok('se guarda el borrador al escribir', d && d.f.includes('Título nuevo'));
ok('no guarda ocultos ni archivos', d && d.f.length === 2 && !d.f.includes('save'));

// 2) el guardado falla (misma página con valores del servidor) → se recupera
forms = [makeForm('article:1', A())]; await boot();
ok('se restaura el título', forms[0].elements[1].value === 'Título nuevo');
ok('aparece el aviso de recuperación', forms[0].children.some((c) => c.className === 'draft-banner'));
ok('el borrador se conserva hasta guardar', localStorage.getItem('ucronia:draft:article:1') !== null);

// 3) volver a lo original borra el borrador
forms[0].elements[1].value = 'Original'; forms[0].dispatchEvent({ type: 'input' }); await wait(700);
ok('si todo vuelve a lo guardado, se borra', localStorage.getItem('ucronia:draft:article:1') === null);

// 4) borrador idéntico al servidor → se descarta sin aviso
localStorage.setItem('ucronia:draft:article:1', JSON.stringify({ v: 1, at: Date.now(), cards: 0, sig: 'title|body', f: ['Original', 'Texto base'] }));
forms = [makeForm('article:1', A())]; await boot();
ok('borrador igual al servidor se descarta', localStorage.getItem('ucronia:draft:article:1') === null && !forms[0].children.some((c) => c.className === 'draft-banner'));

// 5) borrador de otra estructura (formulario cambió) → se descarta sin romper
localStorage.setItem('ucronia:draft:article:1', JSON.stringify({ v: 1, at: Date.now(), cards: 0, sig: 'otro|campo', f: ['x', 'y'] }));
forms = [makeForm('article:1', A())]; await boot();
ok('estructura distinta: descartado y sin tocar valores', localStorage.getItem('ucronia:draft:article:1') === null && forms[0].elements[1].value === 'Original');

// 6) guardado correcto (ok=1) borra el borrador, incl. el de «nuevo»
localStorage.setItem('ucronia:draft:article:nuevo', JSON.stringify({ v: 1, at: Date.now(), cards: 0, sig: 'title|body', f: ['A', 'B'] }));
sess.set('ucronia:pending-new', JSON.stringify({ key: 'article:nuevo', path: '/admin/articulos/nuevo' }));
localStorage.setItem('ucronia:draft:article:1', JSON.stringify({ v: 1, at: Date.now(), cards: 0, sig: 'title|body', f: ['Otro', 'Otro'] }));
location.search = '?msg=Guardado&ok=1'; forms = [makeForm('article:1', A())]; await boot();
ok('ok=1 borra el borrador de la página', localStorage.getItem('ucronia:draft:article:1') === null);
ok('ok=1 borra el borrador del «nuevo» recién creado', localStorage.getItem('ucronia:draft:article:nuevo') === null);
ok('tras ok=1 no se restaura nada', forms[0].elements[1].value === 'Original');

// 7) error en un «nuevo»: el borrador sigue y se recupera en la misma página
location.search = '?msg=La portada supera 3 MB.'; location.pathname = '/admin/articulos/nuevo';
const N = () => [inp('title', ''), area('body', '')];
forms = [makeForm('article:nuevo', N(), { draftNew: '' })]; await boot();
forms[0].elements[0].value = 'Mi artículo'; forms[0].elements[1].value = 'Mucho texto'; forms[0].dispatchEvent({ type: 'input' }); await wait(700);
forms[0].dispatchEvent({ type: 'submit' }); // envío que el servidor rechazará
ok('al enviar se anota lo pendiente y se guarda copia', sess.get('ucronia:pending-new') && localStorage.getItem('ucronia:draft:article:nuevo'));
forms = [makeForm('article:nuevo', N(), { draftNew: '' })]; await boot();
ok('tras el rechazo se recupera todo', forms[0].elements[0].value === 'Mi artículo' && forms[0].elements[1].value === 'Mucho texto');

// 8) filas dinámicas: se añaden las que faltan antes de rellenar
location.search = ''; location.pathname = '/admin/acerca';
const row = (t, b) => [inp('sec_title', t), area('sec_body', b)];
localStorage.setItem('ucronia:draft:about', JSON.stringify({ v: 1, at: Date.now(), cards: 2, sig: 'page_title|sec_title|sec_body|sec_title|sec_body', f: ['Acerca', 'Uno', 'Texto 1', 'Dos', 'Texto 2'] }));
const aboutForm = makeForm('about', [inp('page_title', 'Acerca'), ...row('Uno', 'Texto 1')], { draftCards: '[data-about-card]', draftAdd: '[data-add]' });
let cards = 1; aboutForm.querySelectorAll = (s) => s === '[data-about-card]' ? Array.from({ length: cards }) : [];
const add = { disabled: false, click() { cards++; aboutForm.elements.push(...row('', '')); } };
aboutForm.querySelector = (s) => s === '[data-add]' ? add : null;
globalThis.window = globalThis; globalThis.confirm = () => false;
forms = [aboutForm]; await boot();
ok('se añade la fila que faltaba y se rellena', cards === 2 && aboutForm.elements[3].value === 'Dos' && aboutForm.elements[4].value === 'Texto 2');

fs.rmSync(TMP, { recursive: true, force: true });
if (fails) { console.error(`\n${fails} fallaron`); process.exit(1); }
console.log('\nTodo correcto');

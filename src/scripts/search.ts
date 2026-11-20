// Buscador con sugerencias: combobox accesible, teclado, resaltado sin acentos. Mejora progresiva: sin JS el formulario sigue funcionando.
type Hit = { slug: string; title: string; author: string; category: string | null; year: number | null; tags?: string[] };
type St = { ul: HTMLUListElement; status: HTMLElement; clear: HTMLButtonElement; hits: Hit[]; active: number; q: string; timer?: number; ctrl?: AbortController };
const states = new WeakMap<HTMLFormElement, St>();
let uid = 0;
const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const inputOf = (f: HTMLFormElement) => f.querySelector<HTMLInputElement>('input[name=q]')!;

function ensure(form: HTMLFormElement): St {
  const old = states.get(form);
  if (old && old.ul.isConnected) return old;
  const input = inputOf(form);
  const id = `sg-${++uid}`;
  const ul = document.createElement('ul');
  ul.className = 'suggest'; ul.id = id; ul.hidden = true; ul.setAttribute('role', 'listbox'); ul.setAttribute('aria-label', 'Sugerencias');
  const status = document.createElement('div');
  status.className = 'sr-only'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const clear = document.createElement('button');
  clear.type = 'button'; clear.className = 'clear'; clear.textContent = '×'; clear.hidden = !input.value; clear.setAttribute('aria-label', 'Borrar búsqueda');
  input.after(clear);
  form.append(ul, status);
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', id); input.autocomplete = 'off';
  const s: St = { ul, status, clear, hits: [], active: -1, q: '' };
  states.set(form, s);
  return s;
}

function close(form: HTMLFormElement, s: St) {
  s.ul.hidden = true; s.active = -1;
  const i = inputOf(form);
  i.setAttribute('aria-expanded', 'false'); i.removeAttribute('aria-activedescendant');
}
function open(form: HTMLFormElement, s: St) {
  s.ul.hidden = false; inputOf(form).setAttribute('aria-expanded', 'true');
}
function setActive(form: HTMLFormElement, s: St, idx: number) {
  const lis = [...s.ul.querySelectorAll<HTMLLIElement>('li[role=option]')];
  lis.forEach((li, k) => li.setAttribute('aria-selected', String(k === idx)));
  s.active = idx;
  const i = inputOf(form);
  if (idx >= 0) { i.setAttribute('aria-activedescendant', lis[idx].id); lis[idx].scrollIntoView({ block: 'nearest' }); }
  else i.removeAttribute('aria-activedescendant');
}

// Resalta las palabras buscadas ignorando acentos; construye nodos (sin innerHTML).
function hl(text: string, words: string[]): (string | Node)[] {
  const n = Array.from(text).map((c) => strip(c)).join('');
  if (n.length !== text.length) return [text];
  const on = new Array<boolean>(text.length).fill(false);
  for (const w of words) {
    if (!w) continue;
    let i = n.indexOf(w);
    while (i > -1) { for (let k = i; k < i + w.length; k++) on[k] = true; i = n.indexOf(w, i + w.length); }
  }
  const out: (string | Node)[] = [];
  for (let i = 0; i < text.length;) {
    let j = i;
    while (j < text.length && on[j] === on[i]) j++;
    if (on[i]) { const m = document.createElement('mark'); m.textContent = text.slice(i, j); out.push(m); } else out.push(text.slice(i, j));
    i = j;
  }
  return out;
}

function render(form: HTMLFormElement, s: St, q: string, d: { total: number; results: Hit[] }) {
  const words = strip(q).split(/\s+/).filter(Boolean);
  s.ul.replaceChildren(); s.hits = d.results; s.q = q; s.active = -1;
  d.results.forEach((h, i) => {
    const li = document.createElement('li');
    li.id = `${s.ul.id}-${i}`; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', 'false');
    const a = document.createElement('a'); a.href = `/libro/${h.slug}`; a.tabIndex = -1;
    const tx = document.createElement('span'); tx.className = 'tx';
    const t = document.createElement('b'); t.append(...hl(h.title, words));
    const m = document.createElement('small'); m.append(...hl([h.author, h.category, h.year].filter(Boolean).join(' · '), words));
    tx.append(t, m);
    if (h.tags?.length) { const g = document.createElement('small'); g.className = 'tg'; g.append(...hl(h.tags.join(' · '), words)); tx.append(g); }
    a.append(tx); li.append(a); s.ul.append(li);
  });
  const row = document.createElement('li'); row.setAttribute('role', 'presentation');
  if (d.results.length) {
    row.className = 'more-row';
    const b = document.createElement('button'); b.type = 'submit';
    b.textContent = `Ver ${d.total === 1 ? 'el resultado' : `los ${d.total} resultados`} →`;
    row.append(b);
  } else {
    row.className = 'empty-row';
    row.textContent = `Sin resultados para «${q}». Prueba con otro título, autor o tema.`;
  }
  s.ul.append(row);
  s.status.textContent = d.results.length ? `${d.total} ${d.total === 1 ? 'resultado' : 'resultados'}. Usa las flechas para elegir.` : 'Sin resultados.';
  open(form, s);
}

function schedule(form: HTMLFormElement, s: St, q: string) {
  clearTimeout(s.timer); s.ctrl?.abort();
  if (strip(q).trim().length < 2) { form.classList.remove('loading'); s.hits = []; close(form, s); return; }
  form.classList.add('loading');
  s.timer = window.setTimeout(async () => {
    const ctrl = (s.ctrl = new AbortController());
    try {
      const r = await fetch(`/api/buscar?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
      if (!r.ok) throw new Error('http');
      const d = await r.json();
      if (inputOf(form).value.trim() === q) render(form, s, q, d);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') close(form, s);
    } finally {
      if (!ctrl.signal.aborted) form.classList.remove('loading');
    }
  }, 190);
}

const formOf = (t: EventTarget | null) => (t as HTMLElement | null)?.closest?.<HTMLFormElement>('form[data-suggest]') ?? null;

document.addEventListener('input', (e) => {
  const form = formOf(e.target);
  if (!form || (e.target as HTMLElement).getAttribute('name') !== 'q') return;
  const s = ensure(form), v = inputOf(form).value;
  s.clear.hidden = !v; form.classList.toggle('has-value', !!v);
  schedule(form, s, v.trim());
});

document.addEventListener('focusin', (e) => {
  const form = formOf(e.target);
  if (!form || (e.target as HTMLElement).getAttribute('name') !== 'q') return;
  const s = ensure(form), v = inputOf(form).value.trim();
  if (s.hits.length && s.q === v && s.ul.hidden) open(form, s);
});

document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  const form = formOf(t);
  if (form && t.getAttribute('name') === 'q') {
    const s = ensure(form), n = s.hits.length;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) {
      e.preventDefault();
      if (s.ul.hidden) open(form, s);
      setActive(form, s, e.key === 'ArrowDown' ? (s.active + 1) % n : s.active <= 0 ? n - 1 : s.active - 1);
    } else if (e.key === 'Enter' && !s.ul.hidden && s.active >= 0) {
      e.preventDefault();
      s.ul.querySelectorAll<HTMLAnchorElement>('li[role=option] a')[s.active]?.click();
    } else if (e.key === 'Escape') {
      if (!s.ul.hidden) { e.preventDefault(); close(form, s); }
      else if (inputOf(form).value) { inputOf(form).value = ''; s.clear.hidden = true; form.classList.remove('has-value'); }
    }
    return;
  }
  // Atajo "/" para ir al buscador
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) {
    const i = document.querySelector<HTMLInputElement>('form[data-suggest] input[name=q]');
    if (i) { e.preventDefault(); i.focus(); i.select(); }
  }
});

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const clear = t.closest?.<HTMLButtonElement>('form[data-suggest] .clear');
  if (clear) {
    const form = formOf(clear)!, s = ensure(form), i = inputOf(form);
    i.value = ''; clear.hidden = true; form.classList.remove('has-value'); s.hits = []; s.ctrl?.abort(); close(form, s); i.focus();
    return;
  }
  document.querySelectorAll<HTMLFormElement>('form[data-suggest]').forEach((f) => { if (!f.contains(t)) { const s = states.get(f); if (s) close(f, s); } });
});

document.addEventListener('submit', (e) => {
  const form = formOf(e.target);
  if (form) { const s = ensure(form); clearTimeout(s.timer); s.ctrl?.abort(); form.classList.remove('loading'); close(form, s); }
});

document.addEventListener('astro:page-load', () => {
  document.querySelectorAll<HTMLFormElement>('form[data-suggest]').forEach((f) => { ensure(f); f.classList.toggle('has-value', !!inputOf(f).value); });
  if (location.hash === '#buscar') document.querySelector<HTMLInputElement>('form[data-suggest] input[name=q]')?.focus({ preventScroll: true });
});

/* Panel de administración: borradores automáticos y archivos grandes.
   1) Los formularios marcados con `data-draft="clave"` guardan lo escrito en este navegador (localStorage) mientras se edita.
      Si la pestaña se cierra, la sesión caduca o el guardado falla (p. ej. una imagen demasiado grande), al volver se recupera todo.
      El borrador solo se borra cuando el servidor confirma el guardado (redirección con `ok=1`) o al pulsar «Descartar».
      Los campos de archivo no se pueden guardar: hay que volver a elegirlos.
   2) Los campos de archivo con `data-max-mb` avisan antes de enviar si el archivo es demasiado grande; si además llevan `data-image`,
      la imagen se reduce sola (JPG, máx. 2400 px) hasta que cabe en el límite. */

const PREFIX = 'ucronia:draft:';
const PENDING = 'ucronia:pending-new';
const MAX_AGE = 30 * 24 * 3600 * 1000;
type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type Draft = { v: 1; at: number; cards: number; sig: string; f: (string | boolean)[] };

const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string): boolean { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* sin almacenamiento: no pasa nada */ } },
};
const fmtSize = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`);
const ago = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m < 1 ? 'hace unos segundos' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`;
};

/* ───────── Borradores ───────── */
const dirtyForms = new Set<() => boolean>();
let submitting = false;

function fieldsOf(form: HTMLFormElement, keep: Set<string>): Field[] {
  return [...form.elements].filter((el): el is Field => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) || !el.name || el.disabled) return false;
    if (el instanceof HTMLInputElement) {
      if (['file', 'password', 'submit', 'button', 'reset', 'image'].includes(el.type)) return false;
      if (el.type === 'hidden') return keep.has(el.name); // los ocultos (id, huellas…) los pone el servidor
    }
    return true;
  });
}
const readField = (el: Field): string | boolean =>
  el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;

function setupDraft(form: HTMLFormElement) {
  const key = form.dataset.draft!;
  const K = PREFIX + key;
  const keep = new Set((form.dataset.draftHidden ?? '').split(',').map((x) => x.trim()).filter(Boolean));
  const cardSel = form.dataset.draftCards, addSel = form.dataset.draftAdd;
  const cardCount = () => (cardSel ? form.querySelectorAll(cardSel).length : 0);
  const snap = () => { const fs = fieldsOf(form, keep); return { sig: fs.map((f) => f.name).join('|'), f: fs.map(readField), cards: cardCount() }; };
  const same = (a: { f: (string | boolean)[]; cards: number }, b: { f: (string | boolean)[]; cards: number }) =>
    a.cards === b.cards && a.f.length === b.f.length && a.f.every((v, i) => v === b.f[i]);

  // Zona de avisos
  const status = document.createElement('p');
  status.className = 'draft-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.hidden = true;
  const actions = form.querySelector('.form-actions');
  actions ? actions.before(status) : form.append(status);
  const say = (t: string, warn = false) => { status.textContent = t; status.hidden = !t; status.classList.toggle('warn', warn); };

  const base = snap();
  const baseJson = JSON.stringify(base.f);

  // Recuperar
  const raw = store.get(K);
  if (raw) {
    let d: Draft | null = null;
    try { d = JSON.parse(raw) as Draft; } catch { d = null; }
    if (!d || d.v !== 1 || Date.now() - d.at > MAX_AGE) store.del(K);
    else if (same(d, base)) store.del(K); // ya está guardado en el servidor
    else restore(d);
  }

  function restore(d: Draft) {
    // Dos formularios con filas que se añaden o quitan: se iguala el número de filas antes de rellenar.
    if (cardSel && addSel) {
      const add = form.querySelector<HTMLButtonElement>(addSel);
      const realConfirm = window.confirm;
      window.confirm = () => true;
      try {
        let guard = 30;
        while (cardCount() < d.cards && add && !add.disabled && guard--) add.click();
        while (cardCount() > d.cards && guard--) {
          const rm = form.querySelectorAll<HTMLButtonElement>(`${cardSel} [data-remove]`);
          const last = rm[rm.length - 1];
          if (!last || last.disabled) break;
          last.click();
        }
      } finally { window.confirm = realConfirm; }
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
    const fs = fieldsOf(form, keep);
    if (fs.map((f) => f.name).join('|') !== d.sig || fs.length !== d.f.length) { store.del(K); return; } // el formulario cambió: borrador inservible
    fs.forEach((el, i) => {
      const v = d.f[i];
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) el.checked = v === true;
      else el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const hasFile = !!form.querySelector('input[type=file]');
    const box = document.createElement('div');
    box.className = 'draft-banner'; box.setAttribute('role', 'status');
    const t = document.createElement('span');
    t.textContent = `Recuperamos los cambios sin guardar (${ago(Date.now() - d.at)}). Revísalos y pulsa «Guardar».${hasFile ? ' Si habías elegido un archivo, vuelve a elegirlo.' : ''}`;
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = 'Descartar';
    b.addEventListener('click', () => { store.del(K); submitting = true; location.href = location.pathname; });
    box.append(t, b);
    form.prepend(box);
  }

  // Guardar mientras se escribe
  const save = () => {
    const s = snap();
    if (JSON.stringify(s.f) === baseJson && s.cards === base.cards) { store.del(K); say(''); return; }
    const ok = store.set(K, JSON.stringify({ v: 1, at: Date.now(), cards: s.cards, sig: s.sig, f: s.f } satisfies Draft));
    say(ok ? `Borrador guardado en este navegador · ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
           : 'No se pudo guardar el borrador (almacenamiento del navegador lleno o bloqueado).', !ok);
  };
  let timer = 0;
  const later = () => { clearTimeout(timer); timer = window.setTimeout(save, 600); };
  form.addEventListener('input', later);
  form.addEventListener('change', later);
  form.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button[type=button]')) setTimeout(later, 50); }); // añadir, quitar o reordenar filas
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && !submitting) { clearTimeout(timer); save(); } });
  addEventListener('pagehide', () => { if (!submitting) { clearTimeout(timer); save(); } });

  // Al enviar: se guarda una última copia (por si el servidor rechaza algo) y se anota si era algo nuevo.
  form.addEventListener('submit', () => {
    clearTimeout(timer); save(); submitting = true;
    if ('draftNew' in form.dataset) { try { sessionStorage.setItem(PENDING, JSON.stringify({ key, path: location.pathname })); } catch { /* ok */ } }
  });
  dirtyForms.add(() => JSON.stringify(snap().f) !== baseJson || snap().cards !== base.cards || [...form.querySelectorAll<HTMLInputElement>('input[type=file]')].some((i) => !!i.files?.length));
}

/* ───────── Archivos grandes ───────── */
function note(input: HTMLInputElement, text: string, warn = false) {
  let n = input.parentElement?.querySelector<HTMLElement>(':scope > .file-note');
  if (!text) { n?.remove(); return; }
  if (!n) { n = document.createElement('small'); n.className = 'file-note'; n.setAttribute('role', 'status'); input.after(n); }
  n.textContent = text; n.classList.toggle('warn', warn);
}

/** Reduce la imagen (JPG, hasta 2400 px) hasta que cabe en `maxBytes`. Devuelve null si el navegador no puede. */
async function shrink(file: File, maxBytes: number): Promise<File | null> {
  if (!('createImageBitmap' in window)) return null;
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { try { bmp = await createImageBitmap(file); } catch { return null; } }
  const target = maxBytes * 0.92;
  let scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  try {
    for (let step = 0; step < 8; step++) {
      const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d'); if (!ctx) return null;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
      for (const q of [0.88, 0.8, 0.7, 0.6]) {
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
        if (blob && blob.size <= target) return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'imagen'}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
      }
      scale *= 0.8;
    }
    return null;
  } finally { bmp.close?.(); }
}

document.addEventListener('change', async (e) => {
  const input = e.target;
  if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.dataset.maxMb) return;
  if (input.dataset.shrunk) { delete input.dataset.shrunk; return; } // el cambio lo provocamos nosotros al sustituir la imagen
  const maxMb = Number(input.dataset.maxMb), max = maxMb * 1048576;
  input.setCustomValidity(''); note(input, '');
  const f = input.files?.[0];
  if (!f) return;
  if ('image' in input.dataset && f.type.startsWith('image/') && f.size > max) {
    note(input, `Reduciendo la imagen (${fmtSize(f.size)}) para poder subirla…`);
    const small = await shrink(f, max);
    if (small && input.files?.[0] === f) {
      const dt = new DataTransfer(); dt.items.add(small); input.files = dt.files;
      note(input, `Imagen reducida de ${fmtSize(f.size)} a ${fmtSize(small.size)} para poder subirla.`);
      input.dataset.shrunk = '1';
      input.dispatchEvent(new Event('change', { bubbles: true })); // vista previa y borrador se enteran
      return;
    }
  }
  const cur = input.files?.[0];
  if (cur && cur.size > max) {
    const msg = `Este archivo pesa ${fmtSize(cur.size)} y el máximo es ${maxMb} MB. Elige uno más ligero.`;
    input.setCustomValidity(msg); note(input, msg, true); input.reportValidity();
  }
});

/* ───────── Arranque ───────── */
function init() {
  // Limpieza de borradores antiguos
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      try { if (Date.now() - (JSON.parse(localStorage.getItem(k) ?? '{}') as Draft).at > MAX_AGE) localStorage.removeItem(k); } catch { localStorage.removeItem(k); }
    }
  } catch { /* sin almacenamiento */ }
  // El servidor confirmó el guardado (`ok=1`): se borran los borradores de esta página y el del «nuevo» que se acaba de crear.
  const params = new URLSearchParams(location.search);
  if (params.get('ok') === '1') {
    document.querySelectorAll<HTMLFormElement>('form[data-draft]').forEach((f) => store.del(PREFIX + f.dataset.draft));
    try { const p = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null') as { key: string } | null; if (p?.key) store.del(PREFIX + p.key); } catch { /* ok */ }
    params.delete('ok'); // para que recargar o volver a esta dirección no borre un borrador posterior
    history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}${location.hash}`);
  }
  document.querySelectorAll<HTMLFormElement>('form[data-draft]').forEach(setupDraft);
  try { sessionStorage.removeItem(PENDING); } catch { /* ok */ }
  // Aviso al cerrar con cambios sin guardar (los archivos elegidos no se pueden recuperar)
  addEventListener('beforeunload', (e) => {
    if (submitting || ![...dirtyForms].some((d) => d())) return;
    e.preventDefault(); e.returnValue = '';
  });
}
init();

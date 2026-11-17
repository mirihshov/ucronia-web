// Vista previa del EPUB en la ficha del libro: abre un <dialog> y pinta el fragmento con textContent (nunca HTML).
type Block = { t: 'h' | 'p'; x: string };
type Data = { blocks: Block[]; words: number };
const cache = new Map<string, Data>();

const el = (tag: string, text: string, cls?: string) => {
  const n = document.createElement(tag);
  n.textContent = text;
  if (cls) n.className = cls;
  return n;
};

async function load(url: string): Promise<Data> {
  const hit = cache.get(url);
  if (hit) return hit;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as Data;
  if (!Array.isArray(data.blocks) || !data.blocks.length) throw new Error('vacío');
  cache.set(url, data);
  return data;
}

// Un solo oyente en el documento: sirve también tras navegar con ClientRouter.
document.addEventListener('click', async (e) => {
  const t = e.target as Element | null;
  const dlg = document.getElementById('preview-dialog') as HTMLDialogElement | null;
  if (!t || !dlg) return;
  if (t === dlg || t.closest('[data-preview-close]')) { dlg.close(); return; } // fondo o ✕
  const btn = t.closest<HTMLElement>('[data-preview]');
  if (!btn?.dataset.url) return;

  const body = dlg.querySelector<HTMLElement>('[data-preview-body]')!;
  const note = dlg.querySelector<HTMLElement>('[data-preview-note]')!;
  body.replaceChildren(el('p', 'Cargando vista previa…', 'preview-msg'));
  body.scrollTop = 0;
  if (!dlg.open) dlg.showModal();
  try {
    const d = await load(btn.dataset.url);
    body.replaceChildren(
      ...d.blocks.map((b) => el(b.t === 'h' ? 'h3' : 'p', b.x)),
      el('p', 'Fin de la vista previa. Descarga el EPUB para seguir leyendo.', 'preview-end'),
    );
    note.textContent = `Fragmento inicial · unas ${Math.max(10, Math.round(d.words / 10) * 10)} palabras`;
  } catch {
    body.replaceChildren(el('p', 'No se pudo cargar la vista previa. Puedes descargar el EPUB para leer el libro completo.', 'preview-msg'));
  }
});

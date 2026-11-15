// Validación pura del pie de página (sin dependencias del servidor: se prueba con tsx).
export const MAX_COLS = 4;
export const MAX_COL_LINKS = 5;
export const MAX_SOCIAL = 6;
export const NETWORKS = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', x: 'X', telegram: 'Telegram', tiktok: 'TikTok', web: 'Sitio web', email: 'Correo' } as const;
export type Network = keyof typeof NETWORKS;
export type FooterLink = { label: string; url: string };
export type FooterColumn = { title: string; text: string; links: FooterLink[] };
export type Social = { network: Network; url: string };
export type FooterValue = { tagline: string; note: string; columns: FooterColumn[]; social: Social[] };

/** Enlaces del pie: rutas del sitio, http(s):// o mailto: — nunca javascript:, data: ni "//otro-sitio". */
export const safeUrl = (u: string) => /^(\/(?!\/)|https?:\/\/|mailto:)/i.test(u) && !/[\s<>"'`\\]/.test(u) && u.length <= 200;
export const isExternal = (u: string) => /^https?:\/\//i.test(u);
/** Redes: https:// (o mailto: para «Correo»). */
export const safeSocial = (n: string, u: string) =>
  n in NETWORKS && !/[\s<>"'`\\]/.test(u) && u.length <= 200 && (n === 'email' ? /^mailto:.+@.+/i.test(u) : /^https:\/\/[^/]/i.test(u));

const clean = (x: unknown, n: number) => String(x ?? '').trim().replace(/\s+/g, ' ').slice(0, n);
/** Texto multilínea: conserva los saltos de línea (máx. 8 líneas). */
export const cleanText = (x: unknown, n: number) =>
  String(x ?? '').split(/\r?\n/).map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 8).join('\n').slice(0, n);

/** Divide una línea en trozos de texto y correos (los correos se enlazan solos). */
export function segments(line: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  const re = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    out.push({ text: m[0], href: `mailto:${m[0]}` });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

export function parseFooterForm(f: FormData): { error: string } | { value: FooterValue } {
  const titles = f.getAll('col_title'), texts = f.getAll('col_text');
  const ll = f.getAll('col_link_label'), lu = f.getAll('col_link_url');
  const columns: FooterColumn[] = [];
  for (let c = 0; c < MAX_COLS; c++) {
    const title = clean(titles[c], 40), text = cleanText(texts[c], 300);
    const links: FooterLink[] = [];
    for (let k = 0; k < MAX_COL_LINKS; k++) {
      const label = clean(ll[c * MAX_COL_LINKS + k], 40), url = clean(lu[c * MAX_COL_LINKS + k], 200);
      if (!label && !url) continue; // fila en blanco
      if (!label || !url) return { error: `Columna ${c + 1}, enlace ${k + 1}: necesita texto y dirección.` };
      if (!safeUrl(url)) return { error: `Columna ${c + 1}, enlace ${k + 1}: dirección no válida. Usa /ruta, https://… o mailto:…` };
      links.push({ label, url });
    }
    if (title || text || links.length) columns.push({ title, text, links });
  }
  const nets = f.getAll('soc_network'), urls = f.getAll('soc_url');
  const social: Social[] = [];
  for (let i = 0; i < MAX_SOCIAL; i++) {
    let url = clean(urls[i], 200);
    if (!url) continue;
    const network = String(nets[i] ?? '');
    if (!(network in NETWORKS)) return { error: `Red ${i + 1}: elige una red de la lista.` };
    if (network === 'email' && !/^mailto:/i.test(url) && url.includes('@')) url = `mailto:${url}`;
    if (!safeSocial(network, url)) return { error: `Red ${i + 1}: la dirección debe empezar por https:// (o ser un correo en «Correo»).` };
    social.push({ network: network as Network, url });
  }
  return { value: { tagline: clean(f.get('tagline'), 140), note: clean(f.get('note'), 200), columns, social } };
}

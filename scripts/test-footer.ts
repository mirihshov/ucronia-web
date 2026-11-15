import { parseFooterForm, safeUrl, safeSocial, segments, cleanText } from '../src/lib/footer-form';

const form = (o: Record<string, string[] | string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x));
  return f;
};
let bad = 0;
const t = (name: string, ok: boolean) => { console.log(ok ? 'OK  ' : 'FAIL', name); if (!ok) bad++; };
const blanks = (n: number) => Array(n).fill('');

for (const u of ['/acerca#legal', 'https://example.org/x', 'mailto:hola@x.org']) t(`url válida ${u}`, safeUrl(u));
for (const u of ['javascript:alert(1)', 'JaVaScRiPt:1', 'data:text/html,x', '//evil.com', 'ftp://x', 'acerca', '/a b', '/<x>']) t(`url rechazada ${u}`, !safeUrl(u));
t('red https válida', safeSocial('instagram', 'https://instagram.com/x'));
t('red http rechazada', !safeSocial('instagram', 'http://instagram.com/x'));
t('red javascript rechazada', !safeSocial('web', 'javascript:alert(1)'));
t('red desconocida rechazada', !safeSocial('myspace', 'https://x.org'));
t('correo mailto válido', safeSocial('email', 'mailto:a@b.org'));

let r = parseFooterForm(form({
  tagline: ' Hola   mundo ', note: 'Nota', col_title: ['Uno', '', 'Tres', ''], col_text: ['L1\n\n  L2  ', '', 'x', ''],
  col_link_label: ['A', ...blanks(4), ...blanks(5), 'C', ...blanks(9)], col_link_url: ['/a', ...blanks(4), ...blanks(5), 'https://c.org', ...blanks(9)],
  soc_network: ['instagram', 'email'], soc_url: ['https://instagram.com/u', 'hola@x.org'],
}));
t('columnas: salta la vacía y conserva 2', 'value' in r && r.value.columns.length === 2 && r.value.columns[1].title === 'Tres');
t('texto multilínea sin líneas vacías', 'value' in r && r.value.columns[0].text === 'L1\nL2');
t('enlaces por columna', 'value' in r && r.value.columns[0].links.length === 1 && r.value.columns[1].links[0].url === 'https://c.org');
t('redes: correo → mailto:', 'value' in r && r.value.social.length === 2 && r.value.social[1].url === 'mailto:hola@x.org');

r = parseFooterForm(form({ col_title: ['A'], col_link_label: ['Solo texto'], col_link_url: [''] }));
t('enlace incompleto → error', 'error' in r);
r = parseFooterForm(form({ col_title: ['A'], col_link_label: ['X'], col_link_url: ['javascript:alert(1)'] }));
t('javascript: en enlace → error', 'error' in r);
r = parseFooterForm(form({ soc_network: ['instagram'], soc_url: ['javascript:alert(1)'] }));
t('javascript: en red → error', 'error' in r);
r = parseFooterForm(form({ soc_network: ['instagram'], soc_url: ['http://insegura.org'] }));
t('red por http → error', 'error' in r);
r = parseFooterForm(form({ soc_network: ['<script>'], soc_url: ['https://x.org'] }));
t('red inventada → error', 'error' in r);
r = parseFooterForm(form({ tagline: 'x'.repeat(500), note: 'y'.repeat(500), col_title: ['t'.repeat(90)], col_text: ['z'.repeat(900)] }));
t('recorta tagline, nota, título y texto', 'value' in r && r.value.tagline.length === 140 && r.value.note.length === 200 && r.value.columns[0].title.length === 40 && r.value.columns[0].text.length === 300);
r = parseFooterForm(form({}));
t('pie vacío es válido', 'value' in r && r.value.columns.length === 0 && r.value.social.length === 0);
t('máx. 8 líneas de texto', cleanText(Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n'), 300).split('\n').length === 8);

const sg = segments('Escribe a hola@ucronia.org o a otra@x.cl hoy');
t('correos enlazados en el texto', sg.filter((x) => x.href).length === 2 && sg[1].href === 'mailto:hola@ucronia.org');
t('texto sin correo queda igual', segments('Lunes a jueves').length === 1 && !segments('Lunes a jueves')[0].href);
process.exit(bad ? 1 : 0);

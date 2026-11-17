import { parseAboutForm, normalizeAbout, slugify, cleanBody, inline, blocks } from '../src/lib/about-form';

const form = (o: Record<string, string[] | string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x));
  return f;
};
let bad = 0;
const t = (name: string, ok: boolean) => { console.log(ok ? 'OK  ' : 'FAIL', name); if (!ok) bad++; };

t('slug sin tildes ni símbolos', slugify('¿Criterios de publicación?') === 'criterios-de-publicacion');
t('slug vacío si no hay letras', slugify('¡¿?!') === '');
t('párrafos: una línea en blanco los separa', cleanBody('a  b\r\n\r\n\r\n  c \n d') === 'a b\n\nc\nd');

let r = parseAboutForm(form({ page_title: ' Acerca   de ', sec_id: ['', 'x'], sec_title: ['El proyecto', 'Contacto'], sec_body: ['Hola', 'Mail'] }));
t('guarda título y secciones', 'value' in r && r.value.title === 'Acerca de' && r.value.sections.length === 2);
t('ancla sale del título si no se da', 'value' in r && r.value.sections[0].id === 'el-proyecto' && r.value.sections[1].id === 'x');

r = parseAboutForm(form({ page_title: 'T', sec_id: ['', ''], sec_title: ['Legal', 'Legal'], sec_body: ['a', 'b'] }));
t('anclas repetidas se desambiguan', 'value' in r && r.value.sections[0].id === 'legal' && r.value.sections[1].id === 'legal-2');
r = parseAboutForm(form({ page_title: 'T', sec_id: ['top'], sec_title: ['Top'], sec_body: ['a'] }));
t('ancla reservada «top» se evita', 'value' in r && r.value.sections[0].id !== 'top');
r = parseAboutForm(form({ page_title: 'T', sec_id: ['', ''], sec_title: ['A', ''], sec_body: ['a', ''] }));
t('salta la sección en blanco', 'value' in r && r.value.sections.length === 1);
r = parseAboutForm(form({ page_title: 'T', sec_id: [''], sec_title: [''], sec_body: ['texto sin título'] }));
t('texto sin título → error', 'error' in r);
r = parseAboutForm(form({ page_title: 'T', sec_id: [''], sec_title: [''], sec_body: [''] }));
t('sin secciones → error', 'error' in r);
r = parseAboutForm(form({ page_title: '  ', sec_id: ['a'], sec_title: ['A'], sec_body: ['a'] }));
t('título de página vacío → error', 'error' in r);
const many = Array.from({ length: 13 }, (_, i) => `S${i}`);
r = parseAboutForm(form({ page_title: 'T', sec_id: many.map(() => ''), sec_title: many, sec_body: many }));
t('más de 12 secciones → error', 'error' in r);
r = parseAboutForm(form({ page_title: 'T'.repeat(200), sec_id: ['i'.repeat(90)], sec_title: ['t'.repeat(200)], sec_body: ['b'.repeat(9000)] }));
t('recorta títulos, ancla y texto', 'value' in r && r.value.title.length === 80 && r.value.sections[0].title.length === 80 && r.value.sections[0].id.length <= 40 && r.value.sections[0].body.length === 3000);

t('normalizeAbout rechaza basura', normalizeAbout(null) === null && normalizeAbout({}) === null && normalizeAbout({ sections: [] }) === null && normalizeAbout({ sections: [{ body: 'x' }] }) === null);
const n = normalizeAbout({ title: 'T', sections: [{ id: 'A B', title: 'Uno', body: 'x' }, { title: 'Uno', body: 'y' }] });
t('normalizeAbout revalida anclas al leer', !!n && n.sections[0].id === 'a-b' && n.sections[1].id === 'uno');

let s = inline('Escribe a hola@ucronia.org hoy');
t('correo enlazado', s.length === 3 && s[1].href === 'mailto:hola@ucronia.org');
s = inline('Mira https://example.org/a?b=1, y listo.');
t('URL enlazada sin la coma final', s[1].href === 'https://example.org/a?b=1' && s[1].text === 'https://example.org/a?b=1' && s.slice(2).map((x) => x.text).join('') === ', y listo.' && !s[2].href);
s = inline('Ver [criterios](/acerca#criterios) aquí');
t('enlace [texto](/ruta)', s[1].text === 'criterios' && s[1].href === '/acerca#criterios');
for (const bad_ of ['javascript:alert(1)', '//evil.com', 'data:text/html,x']) {
  s = inline(`[clic](${bad_})`);
  t(`enlace inseguro queda como texto: ${bad_}`, s.every((x) => !x.href) && s.map((x) => x.text).join('') === `[clic](${bad_})`);
}
s = inline('<script>alert(1)</script>');
t('el HTML queda como texto (Astro lo escapa)', s.length === 1 && !s[0].href && s[0].text.includes('<script>'));
s = inline('Sin enlaces, solo texto.');
t('texto plano intacto', s.length === 1 && !s[0].href);

const b = blocks('Hola {nombre}\nsegunda línea\n\n{origen}/opds\n\nEscribe a {correo}.', { nombre: 'Ucronía', origen: 'https://x.org', correo: 'a@b.org' });
t('párrafos y saltos de línea', b.length === 3 && b[0].length === 2);
t('marcadores sustituidos', b[0][0][0].text === 'Hola Ucronía' && b[1][0][0].href === 'https://x.org/opds' && b[2][0][1].href === 'mailto:a@b.org');
t('marcador desconocido se deja', blocks('{otro}', {})[0][0][0].text === '{otro}');
process.exit(bad ? 1 : 0);

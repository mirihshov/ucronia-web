import { zipSync, strToU8 } from 'fflate';
import { validateEpub } from '../src/lib/epub';
import { sniffImage, sha256Hex } from '../src/lib/storage';

const container = `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/></package>`;
const mk = (o: Record<string, any>) => zipSync(o);
const good = { mimetype: [strToU8('application/epub+zip'), { level: 0 }], 'META-INF/container.xml': strToU8(container), 'OEBPS/content.opf': strToU8(opf) };
const cases: [string, Uint8Array, boolean][] = [
  ['EPUB válido', mk(good), true],
  ['mimetype incorrecto', mk({ ...good, mimetype: strToU8('text/plain') }), false],
  ['sin container.xml', mk({ mimetype: good.mimetype, 'OEBPS/content.opf': good['OEBPS/content.opf'] }), false],
  ['OPF inexistente', mk({ mimetype: good.mimetype, 'META-INF/container.xml': good['META-INF/container.xml'] }), false],
  ['OPF sin <package>', mk({ ...good, 'OEBPS/content.opf': strToU8('<x/>') }), false],
  ['texto plano', strToU8('hola mundo'), false],
  ['ZIP truncado', mk(good).slice(0, 60), false],
  ['PDF disfrazado', strToU8('%PDF-1.4 ...'), false],
];
let bad = 0;
for (const [name, data, expect] of cases) {
  const ok = validateEpub(data).ok;
  console.log(ok === expect ? 'OK  ' : 'FAIL', name);
  if (ok !== expect) bad++;
}
const img = [
  ['jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])],
  ['png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])],
  ['webp', new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])],
  [null, strToU8('<svg onload=alert(1)>')],
] as const;
for (const [ext, b] of img) { const r = sniffImage(b)?.ext ?? null; console.log(r === ext ? 'OK  ' : 'FAIL', `imagen ${ext}`); if (r !== ext) bad++; }
const h = await sha256Hex(strToU8('abc'));
const okH = h === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
console.log(okH ? 'OK  ' : 'FAIL', 'sha256'); if (!okH) bad++;
process.exit(bad ? 1 : 0);

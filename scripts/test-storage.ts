// Pruebas de src/lib/storage.ts con un cliente de Supabase simulado (sin red). Ejecutar: npm run test:storage
import { BUCKET, getObject, putObject, removeObjects } from '../src/lib/storage';

type Call = { op: string; args: unknown[] };
const calls: Call[] = [];
// Cliente falso: registra las llamadas y devuelve lo que indique `plan`.
const fake = (plan: { upload?: any; remove?: any; download?: any; throws?: boolean }) => ({
  storage: {
    from: (bucket: string) => {
      calls.push({ op: 'from', args: [bucket] });
      const act = (op: string, res: any) => async (...args: unknown[]) => { calls.push({ op, args }); if (plan.throws) throw new Error('red caída'); return res; };
      return {
        upload: act('upload', plan.upload ?? { data: {}, error: null }),
        remove: act('remove', plan.remove ?? { data: [], error: null }),
        download: act('download', plan.download ?? { data: null, error: { message: 'Object not found' } }),
      };
    },
  },
}) as any;

let bad = 0;
const check = (name: string, ok: boolean) => { console.log(ok ? 'OK  ' : 'FAIL', name); if (!ok) bad++; };
const rejects = async (p: Promise<unknown>) => { try { await p; return false; } catch { return true; } };

check('el bucket es ucronia-libros', BUCKET === 'ucronia-libros');

// putObject
calls.length = 0;
await putObject(fake({}), 'epub/a.epub', new Uint8Array([1, 2, 3]), 'application/epub+zip');
const up = calls.find((c) => c.op === 'upload')!;
check('sube al bucket correcto', calls[0].args[0] === 'ucronia-libros');
check('sube con la clave y el tipo indicados', up.args[0] === 'epub/a.epub' && (up.args[2] as any).contentType === 'application/epub+zip');
check('nunca sobrescribe (upsert: false)', (up.args[2] as any).upsert === false);
check('putObject lanza si Storage devuelve error', await rejects(putObject(fake({ upload: { data: null, error: { message: 'new row violates row-level security policy' } } }), 'k', new Uint8Array(1), 'x')));
check('putObject lanza si falla la red', await rejects(putObject(fake({ throws: true }), 'k', new Uint8Array(1), 'x')));

// removeObjects
calls.length = 0;
check('borrar lista vacía = éxito sin llamar a Storage', (await removeObjects(fake({}), [null, undefined, ''])) === true && calls.length === 0);
calls.length = 0;
check('borra solo las claves válidas', (await removeObjects(fake({}), ['epub/a.epub', null, 'covers/b.jpg'])) === true && JSON.stringify(calls.find((c) => c.op === 'remove')!.args[0]) === '["epub/a.epub","covers/b.jpg"]');
check('removeObjects → false si Storage da error', (await removeObjects(fake({ remove: { data: null, error: { message: 'x' } } }), ['k'])) === false);
check('removeObjects → false si falla la red', (await removeObjects(fake({ throws: true }), ['k'])) === false);

// getObject
const blob = new Blob(['hola'], { type: 'application/epub+zip' });
const got = await getObject(fake({ download: { data: blob, error: null } }), 'epub/a.epub');
check('getObject devuelve blob, tamaño y tipo', !!got && got.size === 4 && got.type === 'application/epub+zip');
check('getObject → null si no existe o RLS lo oculta', (await getObject(fake({}), 'epub/x.epub')) === null);
check('getObject → null si falla la red', (await getObject(fake({ throws: true }), 'k')) === null);

process.exit(bad ? 1 : 0);

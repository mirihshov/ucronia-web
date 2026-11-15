import type { APIRoute } from 'astro';
import { dispatchBackup } from '../../../lib/backup';

export const POST: APIRoute = async ({ locals }) => {
  const r = await dispatchBackup((locals as any).runtime?.env);
  const msg = r.ok ? 'Respaldo solicitado. Se actualizará en un minuto aproximadamente.'
    : r.reason === 'not-configured' ? 'Respaldo no configurado (falta GITHUB_BACKUP_REPO o GITHUB_DISPATCH_TOKEN).'
    : `No se pudo solicitar el respaldo (${r.reason}).`;
  return new Response(null, { status: 303, headers: { Location: `/admin?msg=${encodeURIComponent(msg)}` } });
};

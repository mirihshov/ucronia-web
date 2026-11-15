// Dispara el workflow de respaldo en GitHub. El token vive solo como secreto del backend (Cloudflare).
export async function dispatchBackup(env: any): Promise<{ ok: boolean; reason?: string }> {
  const repo = env?.GITHUB_BACKUP_REPO, token = env?.GITHUB_DISPATCH_TOKEN;
  if (!repo || !token) return { ok: false, reason: 'not-configured' };
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/sync.yml/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'folio-backup', 'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: env?.GITHUB_BACKUP_BRANCH || 'main' }),
    });
    return r.status === 204 ? { ok: true } : { ok: false, reason: `github-${r.status}` };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Tras un cambio exitoso en el catálogo: respaldo en segundo plano, sin bloquear ni romper la respuesta. */
export function notifyBackup(locals: any) {
  const rt = locals?.runtime;
  rt?.ctx?.waitUntil?.(dispatchBackup(rt?.env).catch(() => {}));
}

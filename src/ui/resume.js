/** Resolve the public PDF from the deployment base, including subdirectory hosting. */
export function getResumeUrl(profile = {}) {
  const path = profile.resume || '';
  if (!/^assets\/[\w./-]+\.pdf$/i.test(path) || path.split('/').includes('..')) return '';
  return new URL(path, new URL(import.meta.env.BASE_URL, document.baseURI)).href;
}

export const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg>';

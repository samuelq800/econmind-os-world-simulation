/** Only the new public homepage shell; existing downstream URLs retain theirs. */
export function isPublicWorldPreview(url: URL, basePath = '/') {
  const base = new URL(basePath, url.origin).pathname;
  if (url.pathname !== base && url.pathname !== `${base}index.html`)
    return false;
  const atlas = url.searchParams.get('atlas');
  return (
    atlas === 'overview' ||
    atlas === null ||
    (atlas === 'explorer' && !url.searchParams.has('country'))
  );
}

/** Cross the legacy/public shell boundary with a real document navigation.
 * The legacy country-to-country camera/history path remains owned by Explorer. */
export function navigateToPublicWorld(
  location: Pick<Location, 'href' | 'assign'>,
  basePath = '/',
) {
  const target = new URL(basePath, new URL(location.href).origin);
  target.searchParams.set('atlas', 'explorer');
  location.assign(target.href);
}

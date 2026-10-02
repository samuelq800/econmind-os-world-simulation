/** Camera-only projection policy. Source frames/coordinates are never changed. */
export type ExplorerCamera = Readonly<{ x: number; y: number; width: number }>;
export type ExplorerViewport = Readonly<{ width: number; height: number }>;
export type ExplorerCameraFit =
  | Readonly<{ kind: 'world'; camera: ExplorerCamera }>
  | Readonly<{
      kind: 'bounds';
      bounds: readonly [number, number, number, number];
      padding: number;
    }>;

export function isUsableViewport(size: ExplorerViewport): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}

/** null means manual intent: preserve the exact camera across every resize.
 * Zero-size observations during layout do not replace the last valid camera. */
export function cameraForViewport(
  current: ExplorerCamera,
  size: ExplorerViewport,
  fit: ExplorerCameraFit | null,
): ExplorerCamera {
  if (fit === null || !isUsableViewport(size)) return current;
  if (fit.kind === 'world')
    return { ...fit.camera, width: size.width < 600 ? 700 : fit.camera.width };
  const [left, top, right, bottom] = fit.bounds;
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    width:
      Math.max(right - left, ((bottom - top) * size.width) / size.height) *
      fit.padding,
  };
}

/** Camera-only projection policy. Source frames/coordinates are never changed. */
export type ExplorerCamera = Readonly<{ x: number; y: number; width: number }>;
export type ExplorerViewport = Readonly<{ width: number; height: number }>;
export type ExplorerCameraFit =
  | Readonly<{
      kind: 'world';
      camera: ExplorerCamera;
      frame: readonly [number, number];
    }>
  | Readonly<{
      kind: 'bounds';
      bounds: readonly [number, number, number, number];
      padding: number;
      extent?: readonly [number, number];
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
  if (fit.kind === 'world') {
    const [width, height] = fit.frame;
    // Preserve the existing overview center and horizontal margin, but fit
    // both source dimensions instead of cropping with a mobile width cap.
    const padding = fit.camera.width / width;
    return {
      ...fit.camera,
      width: Math.max(
        fit.camera.width,
        ((height * size.width) / size.height) * padding,
      ),
    };
  }
  const [left, top, right, bottom] = fit.bounds;
  const camera = {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    width:
      Math.max(right - left, ((bottom - top) * size.width) / size.height) *
      fit.padding,
  };
  if (!fit.extent) return camera;
  const [worldWidth, worldHeight] = fit.extent;
  const height = (camera.width * size.height) / size.width;
  const scale = Math.min(1, worldWidth / camera.width, worldHeight / height);
  const width = camera.width * scale;
  const fittedHeight = height * scale;
  return {
    width,
    x: Math.max(width / 2, Math.min(worldWidth - width / 2, camera.x)),
    y: Math.max(
      fittedHeight / 2,
      Math.min(worldHeight - fittedHeight / 2, camera.y),
    ),
  };
}

export type LabelBox = { x: number; y: number; width: number; height: number };
export function overlaps(a: LabelBox, b: LabelBox, gap = 6) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}
export function layoutLabels(
  points: { id: string; x: number; y: number }[],
  size: { width: number; height: number },
  reserved: LabelBox[],
) {
  const width = Math.min(210, Math.max(156, size.width * 0.31)),
    height = 72;
  const occupied = [
    ...reserved,
    ...points.map((p) => ({ x: p.x - 18, y: p.y - 18, width: 36, height: 36 })),
  ];
  return points.map((point) => {
    const candidates: LabelBox[] = [];
    for (let y = 12; y <= size.height - height - 66; y += 18) {
      for (let x = 10; x <= size.width - width - 10; x += 18)
        candidates.push({ x, y, width, height });
    }
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x + width / 2 - point.x, a.y + height / 2 - point.y) -
        Math.hypot(b.x + width / 2 - point.x, b.y + height / 2 - point.y),
    );
    const placement = candidates.find((c) =>
      occupied.every((o) => !overlaps(c, o)),
    ) ?? {
      x: Math.max(10, Math.min(size.width - width - 10, point.x + 12)),
      y: Math.max(12, Math.min(size.height - height - 66, point.y)),
      width,
      height,
    };
    occupied.push(placement);
    return { id: point.id, anchorX: point.x, anchorY: point.y, ...placement };
  });
}

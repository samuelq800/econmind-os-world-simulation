// Publish only assets that have actually been generated. Preserve reviewed anchors.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('apps/world-web/src/assets/country-scenes');
const briefs = JSON.parse(fs.readFileSync(path.join(root, 'briefs.json')));
const existing = JSON.parse(fs.readFileSync(path.join(root, 'index.json')));
const reviews = JSON.parse(fs.readFileSync(path.join(root, 'reviews.json')));
const result = briefs
  .filter((b) => fs.existsSync(path.join(root, b.file)))
  .map((b) => {
    const old = existing.find((s) => s.id === b.id);
    const data = old ?? {
      id: b.id,
      number: b.number,
      name: b.name,
      file: b.file,
      frame: b.frame,
      anchors: b.anchors,
      status: 'ILLUSTRATED_PLANNING_SCENE',
      landmarkReview: 'PENDING_VISUAL_REVIEW',
    };
    const review = reviews[b.number];
    return review
      ? { ...data, anchors: review.anchors, landmarkReview: 'VISUALLY_ALIGNED' }
      : data;
  });
fs.writeFileSync(
  path.join(root, 'index.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(`${result.length}/70 country illustrations available`);

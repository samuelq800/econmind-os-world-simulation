// Explicit browser-owned asset references keep the atlas within the import boundary.
import asset0 from '../assets/continent-scenes/central.png';
import asset1 from '../assets/continent-scenes/east.png';
import asset2 from '../assets/continent-scenes/northwest.png';
import asset3 from '../assets/continent-scenes/southwest.png';

export const continentSceneUrls: Readonly<Record<string, string>> = {
  'central.png': asset0,
  'east.png': asset1,
  'northwest.png': asset2,
  'southwest.png': asset3,
};

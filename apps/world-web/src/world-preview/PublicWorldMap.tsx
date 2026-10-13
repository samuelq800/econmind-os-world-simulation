import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from 'react';
import terrain from '../assets/asterra-satellite-terrain-v8.png';
import { countryDetailUrls } from '../map-explorer/country-detail-urls.js';
import { shouldMountDetailTile } from '../map-explorer/detail-tile-visibility.js';
import {
  cameraForViewport,
  isUsableViewport,
  type ExplorerCamera,
  type ExplorerCameraFit,
} from '../map-explorer/viewport-camera.js';
import {
  countries,
  geographicArtwork,
  publicDetailMaps,
  publicFrame,
  publicResources,
  visibleCountryLabels,
  type PreviewLayers,
  type PublicCountry,
} from './geography.js';
import { messages, type PreviewLocale } from './locale.js';

const world = { x: publicFrame[0] / 2, y: publicFrame[1] / 2, width: 1900 };
const worldFit: ExplorerCameraFit = {
  kind: 'world',
  camera: world,
  frame: publicFrame,
};
export type PreviewMapApi = {
  zoom: (factor: number) => void;
  reset: () => void;
};
export type MapMetrics = {
  camera: ExplorerCamera;
  pointer: readonly number[];
  texture: 'loading' | 'ready' | 'error';
  sourcePixelsPerScreenPixel: number;
};

export function PublicWorldMap({
  locale,
  selected,
  allowedIds,
  layers,
  onSelect,
  onMetrics,
  apiRef,
}: {
  locale: PreviewLocale;
  selected: PublicCountry | undefined;
  allowedIds: ReadonlySet<string>;
  layers: PreviewLayers;
  onSelect: (id: string) => void;
  onMetrics: (metrics: MapMetrics) => void;
  apiRef: RefObject<PreviewMapApi | null>;
}) {
  const text = messages[locale];
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1200, height: 700 });
  const [camera, setCamera] = useState<ExplorerCamera>(world);
  const [texture, setTexture] = useState<MapMetrics['texture']>('loading');
  // SVG image load events can be missed on a warm-cache React mount. Observe
  // the same public bitmap with an HTML image; never infer ready from file existence.
  useEffect(() => {
    const bitmap = new Image();
    let active = true;
    bitmap.onload = () => {
      if (active) setTexture('ready');
    };
    bitmap.onerror = () => {
      if (active) setTexture('error');
    };
    bitmap.src = terrain;
    if (bitmap.complete && bitmap.naturalWidth > 0) setTexture('ready');
    return () => {
      active = false;
      bitmap.onload = null;
      bitmap.onerror = null;
    };
  }, []);
  const [point, setPoint] = useState<readonly number[]>([world.x, world.y]);
  const fit = useRef<ExplorerCameraFit | null>(worldFit);
  const cameraRef = useRef(camera),
    sizeRef = useRef(size);
  cameraRef.current = camera;
  sizeRef.current = size;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{
    x: number;
    y: number;
    country: string;
    moved: boolean;
  } | null>(null);

  const zoomAt = (factor: number, x: number, y: number) => {
    fit.current = null;
    setCamera((current) => {
      const s = sizeRef.current,
        width = Math.max(0.0001, Math.min(12000, current.width * factor));
      const dx = x / s.width - 0.5,
        dy = y / s.height - 0.5;
      return {
        x: current.x + dx * (current.width - width),
        y: current.y + (dy * (current.width - width) * s.height) / s.width,
        width,
      };
    });
  };
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;
  useImperativeHandle(
    apiRef,
    () => ({
      zoom: (factor) =>
        zoomRef.current(
          factor,
          sizeRef.current.width / 2,
          sizeRef.current.height / 2,
        ),
      reset: () => {
        fit.current = worldFit;
        setCamera(cameraForViewport(world, sizeRef.current, worldFit));
      },
    }),
    [],
  );

  useEffect(() => {
    fit.current = selected
      ? { kind: 'bounds', bounds: selected.bounds, padding: 1.45 }
      : worldFit;
    setCamera((current) =>
      cameraForViewport(current, sizeRef.current, fit.current),
    );
  }, [selected]);
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
      if (!isUsableViewport(next)) return;
      sizeRef.current = next;
      setSize(next);
      setCamera((current) => cameraForViewport(current, next, fit.current));
    });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoomRef.current(
        Math.exp(Math.max(-200, Math.min(200, event.deltaY)) * 0.0025),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener('wheel', wheel);
    };
  }, []);
  useEffect(() => {
    onMetrics({
      camera,
      pointer: point,
      texture,
      sourcePixelsPerScreenPixel: camera.width / size.width,
    });
  }, [camera, point, texture, size.width, onMetrics]);

  const height = (camera.width * size.height) / size.width;
  const box = {
    x: camera.x - camera.width / 2,
    y: camera.y - height / 2,
    width: camera.width,
    height,
  };
  const labels = visibleCountryLabels(
    camera,
    size,
    selected?.id ?? '',
    allowedIds,
  );
  const radius = (camera.width / size.width) * 2.5;
  return (
    <div
      ref={viewport}
      className="preview-map-canvas"
      role="group"
      tabIndex={0}
      aria-label={text.map}
      data-camera-policy="EXISTING_V8_CAMERA_COMPLETE_WORLD_FIT"
      data-world-width={publicFrame[0]}
      data-world-height={publicFrame[1]}
      data-texture-state={texture}
      data-label-count={labels.length}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const directions: Record<string, readonly [number, number]> = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        };
        const direction = directions[event.key];
        if (direction) {
          event.preventDefault();
          fit.current = null;
          setCamera((c) => ({
            ...c,
            x: c.x + direction[0] * c.width * 0.08,
            y: c.y + direction[1] * c.width * 0.08,
          }));
        } else if (event.key === '+' || event.key === '=') {
          event.preventDefault();
          zoomAt(0.8, size.width / 2, size.height / 2);
        } else if (event.key === '-') {
          event.preventDefault();
          zoomAt(1.25, size.width / 2, size.height / 2);
        }
      }}
      onDoubleClick={(event) => {
        const r = event.currentTarget.getBoundingClientRect();
        zoomAt(0.65, event.clientX - r.left, event.clientY - r.top);
      }}
      onPointerDown={(event) => {
        if ((event.target as Element).closest('button')) return;
        pointers.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        drag.current = {
          x: event.clientX,
          y: event.clientY,
          country:
            (event.target as Element)
              .closest('[data-country-id]')
              ?.getAttribute('data-country-id') ?? '',
          moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const r = event.currentTarget.getBoundingClientRect(),
          c = cameraRef.current,
          s = sizeRef.current;
        setPoint([
          c.x + ((event.clientX - r.left - s.width / 2) * c.width) / s.width,
          c.y + ((event.clientY - r.top - s.height / 2) * c.width) / s.width,
        ]);
        const old = pointers.current.get(event.pointerId);
        if (!old || !drag.current) return;
        if (pointers.current.size === 2) {
          const other = [...pointers.current.entries()].find(
            ([id]) => id !== event.pointerId,
          )?.[1];
          if (other) {
            const previous = Math.hypot(old.x - other.x, old.y - other.y),
              next = Math.hypot(
                event.clientX - other.x,
                event.clientY - other.y,
              );
            if (previous > 0 && next > 0)
              zoomAt(
                previous / next,
                (event.clientX + other.x) / 2 - r.left,
                (event.clientY + other.y) / 2 - r.top,
              );
          }
          drag.current.moved = true;
        } else {
          const dx = event.clientX - old.x,
            dy = event.clientY - old.y;
          if (
            Math.abs(event.clientX - drag.current.x) +
              Math.abs(event.clientY - drag.current.y) >
            6
          )
            drag.current.moved = true;
          if (drag.current.moved) {
            fit.current = null;
            setCamera((current) => ({
              ...current,
              x: current.x - (dx * current.width) / s.width,
              y: current.y - (dy * current.width) / s.width,
            }));
          }
        }
        pointers.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        pointers.current.delete(event.pointerId);
        if (current && !current.moved && current.country)
          onSelect(current.country);
        if (!pointers.current.size) drag.current = null;
      }}
      onPointerCancel={() => {
        pointers.current.clear();
        drag.current = null;
      }}
    >
      <svg
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
        preserveAspectRatio="none"
        aria-label={text.overview}
      >
        <defs>
          {countries.map((country) => (
            <clipPath id={`public-clip-${country.number}`} key={country.id}>
              <path d={country.path} fillRule="evenodd" clipRule="evenodd" />
            </clipPath>
          ))}
        </defs>
        {layers.terrain && (
          <image
            href={terrain}
            x={0}
            y={0}
            width={publicFrame[0]}
            height={publicFrame[1]}
            onLoad={() => setTexture('ready')}
            onError={() => setTexture('error')}
          />
        )}
        {layers.details &&
          publicDetailMaps
            .filter((map) => {
              const country = countries.find((c) => c.id === map.id)!;
              return shouldMountDetailTile(box, country.bounds, false);
            })
            .map((map) => (
              <image
                key={map.id}
                data-native-detail={map.number}
                href={`${countryDetailUrls[map.file]}#svgView(preserveAspectRatio(none))`}
                x={map.viewBox[0]}
                y={map.viewBox[1]}
                width={map.viewBox[2]}
                height={map.viewBox[3]}
                clipPath={`url(#public-clip-${map.number})`}
                pointerEvents="none"
              />
            ))}
        {layers.climate &&
          geographicArtwork.climates.map((region) => (
            <path
              key={region.id}
              d={region.path}
              fill={region.color}
              opacity={0.2}
              pointerEvents="none"
            />
          ))}
        {geographicArtwork.physical
          .filter((feature) =>
            feature.kind === 'mountain' ? layers.mountains : layers.water,
          )
          .map((feature) => (
            <path
              key={feature.id}
              d={feature.path}
              className={`preview-feature ${feature.kind}`}
              pointerEvents="none"
            />
          ))}
        {layers.currents &&
          geographicArtwork.currents.map((current) => (
            <path
              key={current.id}
              d={current.path}
              className="preview-current"
              pointerEvents="none"
            />
          ))}
        {layers.routes &&
          geographicArtwork.routes.map((route) => (
            <path
              key={route.id}
              d={route.path}
              className="preview-route"
              pointerEvents="none"
            />
          ))}
        {layers.resourcesLayer &&
          publicResources.map((resource) => (
            <circle
              key={resource.id}
              data-resource-id={resource.id}
              cx={resource.point[0]}
              cy={resource.point[1]}
              r={radius}
              className="preview-resource"
              pointerEvents="none"
            >
              <title>
                {text.resourcesLayer} · {resource.id}
              </title>
            </circle>
          ))}
        {layers.settlements &&
          geographicArtwork.nodes.map((node) => (
            <circle
              key={node.id}
              cx={node.point[0]}
              cy={node.point[1]}
              r={radius}
              className="preview-settlement"
              pointerEvents="none"
            >
              <title>
                {text.settlements} · {node.id}
              </title>
            </circle>
          ))}
        {countries.map((country) => (
          <path
            key={country.id}
            d={country.path}
            data-country-id={country.id}
            data-country-number={country.number}
            className={`preview-country ${selected?.id === country.id ? 'selected' : ''} ${allowedIds.has(country.id) ? '' : 'filtered'}`}
            style={{
              strokeOpacity: layers.borders
                ? allowedIds.has(country.id)
                  ? 1
                  : 0.2
                : 0,
            }}
            fillRule="evenodd"
            role="button"
            tabIndex={0}
            aria-label={`${text.selectCountry} ${country.number} ${country.name}`}
            aria-pressed={selected?.id === country.id}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onSelect(country.id);
              }
            }}
          >
            <title>
              {country.number} · {country.name}
            </title>
          </path>
        ))}
      </svg>
      <div className="preview-number-labels">
        {labels.map((country) => (
          <button
            key={country.id}
            className={country.id === selected?.id ? 'selected' : ''}
            data-original-label={`${country.label[0]},${country.label[1]}`}
            style={{
              left: `${((country.label[0]! - box.x) / box.width) * 100}%`,
              top: `${((country.label[1]! - box.y) / box.height) * 100}%`,
            }}
            aria-label={`${text.selectCountry} ${country.number} ${country.name}`}
            title={`${country.number} · ${country.name}`}
            onClick={() => onSelect(country.id)}
          >
            {country.number}
          </button>
        ))}
      </div>
      {texture === 'error' && (
        <p className="preview-map-error" role="status">
          {text.textureError}
        </p>
      )}
    </div>
  );
}

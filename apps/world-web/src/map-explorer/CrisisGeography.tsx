import terrain from '../assets/asterra-satellite-terrain-v8.png';
import detailMaps from '../assets/country-detail/index.json';
import { partition } from '../map-lab/display-layers.js';

/** Reuse the immutable canonical display geography. No crisis point, route,
 * operating facility or supply quantity is inferred from this static layer. */
export function CrisisGeography({
  countryNumber,
}: {
  countryNumber: string | null;
}) {
  const country = partition.territories.find((c) => c.number === countryNumber);
  const detail = detailMaps.find((c) => c.number === countryNumber);
  const box = detail?.viewBox;
  const desired = box
    ? [
        Math.max(0, box[0]! - box[2]! * 0.65),
        Math.max(0, box[1]! - box[3]! * 0.65),
        box[2]! * 2.3,
        box[3]! * 2.3,
      ]
    : [0, 0, partition.width, partition.height];
  const scale = Math.min(
    1,
    partition.width / desired[2]!,
    partition.height / desired[3]!,
  );
  const width = desired[2]! * scale;
  const height = desired[3]! * scale;
  const view = [
    Math.max(0, Math.min(partition.width - width, desired[0]!)),
    Math.max(0, Math.min(partition.height - height, desired[1]!)),
    width,
    height,
  ];
  return (
    <div className="crisis-canonical-geography">
      <svg
        viewBox={view.join(' ')}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="连续地理底图：历史静态来源，未接危机点位或运输路线"
      >
        <defs>
          <filter id="crisis-country-fade">
            <feGaussianBlur stdDeviation="35" />
          </filter>
          <mask id="crisis-country-context">
            <rect
              width={partition.width}
              height={partition.height}
              fill="white"
            />
            {country && (
              <path
                d={country.path}
                fill="black"
                filter="url(#crisis-country-fade)"
              />
            )}
          </mask>
        </defs>
        <image
          href={terrain}
          width={partition.width}
          height={partition.height}
        />
        <g fill="none" stroke="#d7debb" strokeWidth="0.7" opacity="0.35">
          {partition.territories.map((c) => (
            <path key={c.id} d={c.path} />
          ))}
        </g>
        {country && (
          <>
            <rect
              width={partition.width}
              height={partition.height}
              fill="#081c24"
              opacity="0.8"
              mask="url(#crisis-country-context)"
            />
            <path
              d={country.path}
              fill="none"
              stroke="#ffe9a8"
              strokeWidth="1.4"
            />
          </>
        )}
      </svg>
      <p>历史静态地理来源 · 危机点位与供给路线尚未接入</p>
    </div>
  );
}

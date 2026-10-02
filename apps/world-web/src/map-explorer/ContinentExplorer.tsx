import { useEffect, useRef, useState } from 'react';
import continents from '../assets/continent-scenes/index.json';
import { artwork, partition } from '../map-lab/display-layers.js';
import { continentSceneUrls } from './continent-scene-urls.js';
import { continentFor } from './continent-layout.js';
import './continent-explorer.css';
const readId = () =>
  new URLSearchParams(window.location.search).get('continent') ?? 'northwest';
export function ContinentExplorer() {
  const [id, setId] = useState(readId),
    [search, setSearch] = useState('');
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const current = continents.find((c) => c.id === id) ?? continents[0]!;
  const src = continentSceneUrls[current.file];
  const members = partition.territories
    .map((c, i) => ({ ...c, name: artwork.political.countries[i]!.name }))
    .filter(
      (c) =>
        continentFor(c.label) === current.id &&
        `${c.number} ${c.name}`.toLowerCase().includes(search.toLowerCase()),
    );
  const choose = (next: string) => {
    setId(next);
    setCamera({ x: 0, y: 0, scale: 1 });
    const u = new URL(window.location.href);
    u.searchParams.set('continent', next);
    window.history.pushState({}, '', u);
  };
  useEffect(() => {
    const back = () => {
      setId(readId());
      setCamera({ x: 0, y: 0, scale: 1 });
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  useEffect(() => {
    const el = viewport.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const px = e.clientX - box.left - box.width / 2,
        py = e.clientY - box.top - box.height / 2;
      setCamera((c) => {
        const scale = Math.max(
          0.35,
          Math.min(
            128,
            c.scale *
              Math.exp(-Math.max(-200, Math.min(200, e.deltaY)) * 0.0025),
          ),
        );
        const ratio = scale / c.scale;
        return {
          scale,
          x: px - (px - c.x) * ratio,
          y: py - (py - c.y) * ratio,
        };
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  return (
    <main className="continent-explorer">
      <header>
        <a href="?atlas=explorer">
          E <span>ASTERRA ATLAS</span>
        </a>
        <nav>
          {continents.map((c) => (
            <button
              key={c.id}
              className={c.id === current.id ? 'active' : ''}
              onClick={() => choose(c.id)}
            >
              {c.name}
            </button>
          ))}
        </nav>
        <a href="?atlas=explorer">国家图谱 ↗</a>
      </header>
      <div className="continent-layout">
        <section
          className="continent-viewport"
          ref={viewport}
          tabIndex={0}
          aria-label="可拖拽缩放的大陆场景图"
          onKeyDown={(e) => {
            if (e.key === '0') setCamera({ x: 0, y: 0, scale: 1 });
            if (e.key === '+')
              setCamera((c) => ({ ...c, scale: Math.min(128, c.scale * 1.5) }));
            if (e.key === '-')
              setCamera((c) => ({
                ...c,
                scale: Math.max(0.35, c.scale / 1.5),
              }));
          }}
          onPointerDown={(e) => {
            if ((e.target as Element).closest('button,a')) return;
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current?.id !== e.pointerId) return;
            const dx = e.clientX - drag.current.x,
              dy = e.clientY - drag.current.y;
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
            setCamera((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
          }}
          onPointerUp={(e) => {
            drag.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          {src ? (
            <img
              src={src}
              alt={`${current.name}独立精绘场景`}
              draggable={false}
              style={{
                transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`,
              }}
            />
          ) : (
            <div className="continent-pending">大陆场景正在绘制</div>
          )}
          <div className="continent-title">
            <span>CONTINENT / LANDSCAPE & SETTLEMENTS</span>
            <h1>{current.name}</h1>
            <p>{current.description}</p>
          </div>
          <div className="continent-tools">
            <button
              aria-label="放大大陆"
              onClick={() =>
                setCamera((c) => ({
                  ...c,
                  scale: Math.min(128, c.scale * 1.5),
                }))
              }
            >
              ＋
            </button>
            <button
              aria-label="缩小大陆"
              onClick={() =>
                setCamera((c) => ({
                  ...c,
                  scale: Math.max(0.35, c.scale / 1.5),
                }))
              }
            >
              −
            </button>
            <button
              aria-label="重置大陆视图"
              onClick={() => setCamera({ x: 0, y: 0, scale: 1 })}
            >
              ⌖
            </button>
            <small>{camera.scale.toFixed(1)}×</small>
          </div>
          <div className="continent-caption">
            拖拽探索 · 滚轮缩放{' '}
            <span>大陆规划场景插画 · 城市与设施为示意复原</span>
          </div>
        </section>
        <aside>
          <span>EXPLORE THE COUNTRIES</span>
          <h2>进入独立国家图</h2>
          <p>每个国家都有自己的场景与设施目录。</p>
          <input
            aria-label="搜索大陆内国家"
            placeholder="搜索名称或编号"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="continent-countries">
            {members.map((c) => (
              <a key={c.id} href={`?atlas=explorer&country=${c.number}`}>
                <b>{c.number}</b>
                <span>{c.name}</span>
                <i>↗</i>
              </a>
            ))}
          </div>
          <a className="all-countries" href="?atlas=explorer">
            浏览全部 70 国 →
          </a>
        </aside>
      </div>
    </main>
  );
}

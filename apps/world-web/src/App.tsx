import './landing.css';

export function App() {
  return (
    <main className="world-landing">
      <section className="world-landing__panel" aria-labelledby="world-title">
        <p className="world-landing__eyebrow">ECONMIND WORLD</p>
        <h1 id="world-title">A living nation, ready for audit.</h1>
        <p className="world-landing__copy">
          Open the national command preview to inspect the country scene,
          office-bound action path, relationship map, replay strip, and local
          transfer journey.
        </p>
        <a className="world-landing__action" href="./command.html">
          Open national command
        </a>
        <p className="world-landing__boundary">
          Public preview only. It does not connect to World State or establish
          Gate B evidence.
        </p>
      </section>
    </main>
  );
}

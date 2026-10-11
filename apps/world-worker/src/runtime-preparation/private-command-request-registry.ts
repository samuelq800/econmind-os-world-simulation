/** Identity mechanism only. This class is not exported by any package subpath.
 * Each instance has disjoint private records; test instances cannot mint a
 * runtime recognized by the production host's module-private instance. */
export type CommandRequestRoute = '/v1/office-command' | '/v1/financial-intake';
export interface CommandRequestIdentityBinding {
  readonly host: object;
  readonly worldId: string;
  readonly route: CommandRequestRoute;
  readonly intakePool: object;
  readonly sourcePool: object | null;
  readonly clock: object;
  readonly generation: number;
}
type HostRecord = {
  worldId: string | null;
  generation: number;
  accepting: boolean;
  requests: Set<object>;
};
export class CommandRequestIdentityRegistry {
  readonly #hosts = new WeakMap<object, HostRecord>();
  readonly #requests = new WeakMap<object, CommandRequestIdentityBinding>();
  registerHost(host: object, world: string | null): void {
    if (
      world !== null &&
      (!/^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(world) || world.length > 256)
    )
      throw new Error('WORLD_IDENTITY_REQUIRED');
    if (this.#hosts.has(host)) throw new Error('HOST_ALREADY_REGISTERED');
    this.#hosts.set(host, {
      worldId: world,
      generation: 0,
      accepting: true,
      requests: new Set(),
    });
  }
  hasHost(host: unknown): host is object {
    return typeof host === 'object' && host !== null && this.#hosts.has(host);
  }
  generation(host: object): number | null {
    return this.#hosts.get(host)?.generation ?? null;
  }
  issueRequest(binding: CommandRequestIdentityBinding): object {
    const h = this.#hosts.get(binding.host);
    if (
      !h?.accepting ||
      h.worldId === null ||
      h.worldId !== binding.worldId ||
      h.generation !== binding.generation ||
      !['/v1/office-command', '/v1/financial-intake'].includes(binding.route) ||
      !binding.intakePool ||
      !binding.clock
    )
      throw new Error('REQUEST_IDENTITY_NOT_BOUND');
    const runtime = Object.freeze({});
    this.#requests.set(runtime, Object.freeze({ ...binding }));
    h.requests.add(runtime);
    return runtime;
  }
  hasRuntime(runtime: unknown): runtime is object {
    return (
      typeof runtime === 'object' &&
      runtime !== null &&
      this.#requests.has(runtime)
    );
  }
  boundIntake(
    runtime: unknown,
    input: { pool: object; clock: object; worldId: string },
  ): boolean {
    if (!this.hasRuntime(runtime)) return false;
    const binding = this.#requests.get(runtime)!;
    return this.bound(runtime, {
      ...binding,
      intakePool: input.pool,
      clock: input.clock,
      worldId: input.worldId,
    });
  }
  bound(runtime: unknown, binding: CommandRequestIdentityBinding): boolean {
    if (!this.hasRuntime(runtime)) return false;
    const r = this.#requests.get(runtime)!;
    const h = this.#hosts.get(r.host);
    return (
      !!h?.accepting &&
      h.worldId === binding.worldId &&
      h.generation === binding.generation &&
      r.host === binding.host &&
      r.worldId === binding.worldId &&
      r.route === binding.route &&
      r.intakePool === binding.intakePool &&
      r.sourcePool === binding.sourcePool &&
      r.clock === binding.clock &&
      r.generation === binding.generation
    );
  }
  retire(runtime: object): void {
    const r = this.#requests.get(runtime);
    if (r) this.#hosts.get(r.host)?.requests.delete(runtime);
    this.#requests.delete(runtime);
  }
  stop(host: object): void {
    const h = this.#hosts.get(host);
    if (!h) throw new Error('HOST_IDENTITY_REQUIRED');
    if (!h.accepting) return;
    h.accepting = false;
    h.generation++;
    for (const runtime of h.requests) this.#requests.delete(runtime);
    h.requests.clear();
  }
}

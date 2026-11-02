/** Explicit local/CI Node owner. HTTP borrowers share one privately issued
 * Worker runtime. This owner never starts a loop or discovers credentials. */
import type { OpeningSeed } from '@econmind/core';
import {
  readPostwarFinanceSocialRuntimeBinding,
  hasPreparedPostwarFinanceSocialTreasuryFx,
  type PostwarFinanceSocialRuntimeConnection,
} from '@econmind/world-worker/finance-social-runtime-connection';
import {
  createPostwarFinanceConnection,
  type PostwarFinanceConnection,
} from './postwar-finance-connection.js';
import {
  createPostwarSocialConnection,
  type PostwarSocialConnection,
  type PostwarSocialConnectionConfiguration,
} from './postwar-social-connection.js';
import { createPostwarOfficeCommandFetchHandler } from './postwar-office-command-fetch-handler.js';
import {
  createPostwarTreasuryFxConnection,
  type PostwarTreasuryFxConnection,
} from './postwar-treasury-fx-connection.js';

export interface PostwarFinanceSocialApiConnectionInput {
  readonly binding: Readonly<PostwarFinanceSocialRuntimeConnection>;
  /** Ownership of these four original pools transfers after exact binding
   * validation. Borrowed office connections never end any of them. */
  readonly social: PostwarSocialConnectionConfiguration;
  readonly financeAllowedOrigins?: readonly string[];
  /** Offline Core seed, verified against live SQL header/source pins by Worker.
   * Server startup only; never an HTTP field or online-reader privilege. */
  readonly socialStartupSeed?: Readonly<OpeningSeed>;
  /** Actual server-held opening/policy/receipt inputs for the fixed FX source.
   * Never accepted from HTTP and never substituted with a readiness flag. */
  readonly treasuryFxPreparation?: Parameters<
    PostwarFinanceSocialRuntimeConnection['prepare']
  >[1];
}
export interface PostwarSharedOfficeConsumer {
  startPreparation(): void;
  consumeOnce(): ReturnType<
    PostwarFinanceSocialRuntimeConnection['consumeOnce']
  >;
}
export interface PostwarFinanceSocialApiConnection {
  readonly worldId: string;
  readonly control: Readonly<PostwarSharedOfficeConsumer>;
  prepare(): Promise<void>;
  stop(): Promise<void>;
}
export interface PostwarFinanceSocialApiPorts {
  readonly finance: Readonly<PostwarFinanceConnection>;
  readonly social: Readonly<PostwarSocialConnection>;
  readonly treasuryFx?: Readonly<PostwarTreasuryFxConnection>;
  readonly control: Readonly<PostwarSharedOfficeConsumer>;
  readonly environment: 'local' | 'ci';
}
const owners = new WeakMap<object, Readonly<PostwarFinanceSocialApiPorts>>();
const worlds = new Map<string, object>();
export function readPostwarFinanceSocialApiConnection(
  connection: Readonly<PostwarFinanceSocialApiConnection>,
): Readonly<PostwarFinanceSocialApiPorts> {
  const ports = owners.get(connection);
  if (!ports) throw Error('GENUINE_FINANCE_SOCIAL_API_OWNER_REQUIRED');
  return ports;
}

export async function createPostwarFinanceSocialApiConnection(
  input: PostwarFinanceSocialApiConnectionInput,
): Promise<Readonly<PostwarFinanceSocialApiConnection>> {
  const binding = input.binding;
  const ports = readPostwarFinanceSocialRuntimeBinding(binding);
  const c = input.social;
  // Before ownership transfer, reject unrelated ports without closing another
  // host's pools. World reservation remains held through ALL cleanup settlement.
  if (
    ports.worldId !== c.admittedWorldPins.worldId ||
    ports.workerId !== c.workerId ||
    ports.clock !== c.clock ||
    ports.environment !== c.environment ||
    ports.rawIntakePool !== c.intakePool ||
    ports.workerPool !== c.workerPool ||
    !ports.financeCountryIds.length
  )
    throw Error('FINANCE_SOCIAL_API_EXACT_BINDING_REQUIRED');
  if (
    (!ports.treasuryFx && input.treasuryFxPreparation !== undefined) ||
    (ports.treasuryFx &&
      input.treasuryFxPreparation === undefined &&
      !hasPreparedPostwarFinanceSocialTreasuryFx(binding))
  )
    throw Error('FINANCE_SOCIAL_API_EXACT_FX_PREPARATION_REQUIRED');
  if (worlds.has(ports.worldId))
    throw Error('FINANCE_SOCIAL_API_WORLD_ALREADY_OWNED');
  const reservation = Object.freeze({});
  worlds.set(ports.worldId, reservation);
  const pools = [
    ...new Set([c.boundedReadPool, c.intakePool, c.sourcePool, c.workerPool]),
  ];
  let finance: Readonly<PostwarFinanceConnection> | undefined;
  let social: Readonly<PostwarSocialConnection> | undefined;
  let treasuryFx: Readonly<PostwarTreasuryFxConnection> | undefined;
  let stopped = false;
  let stopping: Promise<void> | undefined;
  let owner: Readonly<PostwarFinanceSocialApiConnection> | undefined;
  const stop = (): Promise<void> => {
    stopped = true;
    stopping ??= (async () => {
      const errors: unknown[] = [];
      // Retire all borrowers immediately, then await both drains. Neither
      // borrower calls this owner or stops its shared Worker/source/pools.
      const drains = await Promise.allSettled([
        Promise.resolve().then(() => finance?.stop()),
        Promise.resolve().then(() => social?.stop()),
        Promise.resolve().then(() => treasuryFx?.stop()),
      ]);
      for (const r of drains)
        if (r.status === 'rejected') errors.push(r.reason);
      try {
        await binding.stop();
      } catch (e) {
        errors.push(e);
      }
      const ends = await Promise.allSettled(
        pools.map((p) => Promise.resolve().then(() => p.end())),
      );
      for (const r of ends) if (r.status === 'rejected') errors.push(r.reason);
      if (owner) owners.delete(owner);
      if (worlds.get(ports.worldId) === reservation)
        worlds.delete(ports.worldId);
      if (errors.length)
        throw new AggregateError(
          errors,
          'FINANCE_SOCIAL_API_CLEANUP_UNCONFIRMED',
        );
    })();
    return stopping;
  };
  try {
    social = createPostwarSocialConnection(
      c,
      binding,
      input.treasuryFxPreparation,
      input.socialStartupSeed,
    );
    finance = createPostwarFinanceConnection(
      {
        worldId: ports.worldId,
        // Construction hint only; the genuine shared runtime retains its finite
        // multi-country router and each request resolves its actual current seat.
        countryId: ports.financeCountryIds[0]!,
        workerId: ports.workerId,
        admittedWorldPins: c.admittedWorldPins,
        readPool: c.boundedReadPool,
        intakePool: c.intakePool,
        workerDatabase: ports.database,
        readerRole: c.boundedReaderRole,
        intakeRole: c.intakeRole,
        authorizationPublisherRole: c.authorizationPublisherRole,
        auth: c.auth,
        resolveActorId: c.resolveActorId,
        clock: ports.clock,
        environment: Object.freeze({ ECONMIND_ENV: ports.environment }),
        allowedOrigins: input.financeAllowedOrigins ?? c.allowedOrigins ?? [],
      },
      binding,
    );
    if (ports.treasuryFx)
      treasuryFx = createPostwarTreasuryFxConnection(
        {
          readPool: c.boundedReadPool,
          readerRole: c.boundedReaderRole,
          intakeRole: c.intakeRole,
          authorizationPublisherRole: c.authorizationPublisherRole,
          admittedWorldPins: c.admittedWorldPins,
          auth: c.auth,
          resolveActorId: c.resolveActorId,
          allowedOrigins: input.financeAllowedOrigins ?? c.allowedOrigins ?? [],
        },
        binding,
      );
    // Validate the actual finite HTTP union now, so constructor errors use the
    // same complete cleanup as failed preparation/listen, before installation.
    createPostwarOfficeCommandFetchHandler({
      finance,
      social,
      ...(treasuryFx ? { treasuryFx } : {}),
    });
    const requireOpen = () => {
      if (stopped) throw Error('FINANCE_SOCIAL_API_OWNER_RETIRED');
    };
    const control: Readonly<PostwarSharedOfficeConsumer> = Object.freeze({
      startPreparation() {
        requireOpen();
        binding.startPreparation();
      },
      consumeOnce() {
        requireOpen();
        return binding.consumeOnce();
      },
    });
    const socialConnection = social;
    owner = Object.freeze({
      worldId: ports.worldId,
      control,
      prepare() {
        requireOpen();
        return socialConnection.prepare();
      },
      stop,
    });
    owners.set(
      owner,
      Object.freeze({
        finance,
        social,
        ...(treasuryFx ? { treasuryFx } : {}),
        control,
        environment: ports.environment,
      }),
    );
    return owner;
  } catch (error) {
    const cleanup = await stop().then(
      () => null,
      (failure: unknown) => failure,
    );
    if (cleanup !== null) {
      throw new AggregateError(
        [error, cleanup],
        'FINANCE_SOCIAL_API_CONSTRUCTION_FAILED',
        { cause: error },
      );
    }
    throw error;
  }
}

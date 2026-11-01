/** Fixed child DATA preparation/lifecycle only. Owns no consumer/pool, creates
 * no source registration/admission/Clock and never accepts caller readiness. */
import { canonicalSerialize } from '@econmind/core';
import {
  readFinanceSocialSourceBinding,
  type FinanceSocialSourceBinding,
} from './finance-social-runtime-connection.js';
import { readPostwarSocialRuntimeConnectionResources } from './social-runtime-connection.js';
import {
  consumeBeneficialHousingRentSource,
  type PreparedBeneficialHousingRentSource,
} from '../persistence/postwar-beneficial-housing-rent-source.js';
import {
  readPostwarBeneficialHousingRentRuntimeResources,
  readPostwarBeneficialHousingRentSourcePreparation,
  type PostwarBeneficialHousingRentRuntime,
} from '../persistence/postwar-beneficial-housing-rent-runtime.js';
import {
  bindPostwarBeneficialHousingRentMixedSource,
  releasePostwarBeneficialHousingRentMixedSource,
} from '../persistence/postwar-beneficial-housing-rent-mixed-source.js';
import type { PostwarSocialSourcePreparationInput } from '../persistence/prepared-postwar-social-source.js';
export interface PostwarBeneficialRentPreparationController {
  readonly runtime: Readonly<PostwarBeneficialHousingRentRuntime>;
  /** fxSourcePreparation is the token captured by the actual fixed FX prepare;
   * an installed FX source must use exactly the same child proof instance. */
  prepare(
    configuration: PostwarSocialSourcePreparationInput,
    fxSourcePreparation?: PreparedBeneficialHousingRentSource,
  ): Promise<void>;
  assertPrepared(): void;
  /** Sole owner calls only after HTTP/shared-consumer drain; source binding must
   * still exist here. Social/pools close afterwards. */
  close(): Promise<void>;
}
const controllers = new WeakSet<object>(),
  owners = new WeakMap<object, object>();
function invalid(reason: string): never {
  throw Error('BENEFICIAL_RENT_PREPARATION:' + reason);
}
export function isPostwarBeneficialRentPreparationController(
  value: unknown,
): value is Readonly<PostwarBeneficialRentPreparationController> {
  return !!value && typeof value === 'object' && controllers.has(value);
}
export function createPostwarBeneficialRentPreparationController(input: {
  readonly sharedBinding: FinanceSocialSourceBinding;
  readonly runtime: Readonly<PostwarBeneficialHousingRentRuntime>;
}): Readonly<PostwarBeneficialRentPreparationController> {
  const ports = readFinanceSocialSourceBinding(input.sharedBinding),
    social = readPostwarSocialRuntimeConnectionResources(
      ports.socialConnection,
    ),
    rent = readPostwarBeneficialHousingRentRuntimeResources(
      input.runtime,
      ports.worldId,
    );
  if (
    rent.worldId !== ports.worldId ||
    rent.workerId !== ports.workerId ||
    rent.database !== ports.database ||
    rent.clock !== ports.clock ||
    rent.workerRole !== social.workerRole
  )
    invalid('EXACT_GENUINE_SHARED_TRANSPORT_REQUIRED');
  if (owners.has(input.runtime)) invalid('RENT_RUNTIME_ALREADY_OWNED');
  const reservation = Object.freeze({});
  owners.set(input.runtime, reservation);
  const requiresFx = ports.readers.treasuryFx !== undefined;
  let identity: string | undefined,
    token: PreparedBeneficialHousingRentSource | undefined,
    transferred = false,
    ready = false,
    attached = false,
    closed = false,
    pending: Promise<void> | undefined,
    closing: Promise<void> | undefined;
  function live() {
    if (closed) invalid('CONTROLLER_RETIRED');
  }
  const controller: Readonly<PostwarBeneficialRentPreparationController> =
    Object.freeze({
      runtime: input.runtime,
      prepare(
        configuration: PostwarSocialSourcePreparationInput,
        fxSourcePreparation?: PreparedBeneficialHousingRentSource,
      ): Promise<void> {
        try {
          live();
          const proof =
            configuration.startupBeneficialHousingRentSource ?? token;
          if (!proof) invalid('EXPLICIT_GENUINE_CHILD_PROOF_REQUIRED');
          const data = consumeBeneficialHousingRentSource(proof);
          if (
            (requiresFx && fxSourcePreparation !== proof) ||
            (!requiresFx && fxSourcePreparation !== undefined)
          )
            invalid('FX_AND_SOCIAL_EXACT_SAME_CHILD_PROOF_REQUIRED');
          const pins = configuration.admittedWorldPins;
          if (
            data.worldId !== ports.worldId ||
            pins.worldId !== data.worldId ||
            pins.seedRef !== data.seedId ||
            pins.contentHash !== data.seedFingerprint
          )
            invalid('EXACT_CHILD_PREPARATION_PINS_REQUIRED');
          const next = canonicalSerialize({
            pins,
            modelVersion: configuration.modelVersion,
          });
          if (identity !== undefined && (identity !== next || token !== proof))
            invalid('PREPARATION_PINS_OR_PROOF_CHANGED');
          if (ready) {
            controller.assertPrepared();
            return Promise.resolve();
          }
          if (pending) return pending;
          if (
            !configuration.startupSeed ||
            configuration.startupSeed.fingerprint !== data.seedFingerprint
          )
            invalid('EXPLICIT_ACTUAL_CHILD_STARTUP_SEED_REQUIRED');
          identity = next;
          token = proof;
          const work = Promise.resolve().then(async () => {
            if (!transferred) {
              await input.runtime.prepareFromVerifiedSource(proof);
              transferred = true;
            }
            live();
            await ports.socialConnection.prepare({
              ...configuration,
              startupBeneficialHousingRentSource: proof,
            });
            live();
            bindPostwarBeneficialHousingRentMixedSource({
              shared: input.sharedBinding,
              rent: input.runtime,
            });
            attached = true;
            ready = true;
          });
          pending = work;
          void work.then(
            () => {
              if (pending === work) pending = undefined;
            },
            () => {
              if (pending === work) pending = undefined;
            },
          );
          return work;
        } catch (error) {
          return Promise.reject(error);
        }
      },
      assertPrepared(): void {
        live();
        if (
          !ready ||
          !token ||
          readPostwarBeneficialHousingRentSourcePreparation(
            input.runtime,
            ports.worldId,
          ) !== token
        )
          invalid('GENUINE_CHILD_SOURCE_NOT_PREPARED');
        consumeBeneficialHousingRentSource(token);
      },
      close(): Promise<void> {
        if (closing) return closing;
        closed = true;
        closing = (async () => {
          if (pending) await Promise.allSettled([pending]);
          const failures: unknown[] = [];
          try {
            if (attached)
              releasePostwarBeneficialHousingRentMixedSource({
                shared: input.sharedBinding,
                rent: input.runtime,
              });
          } catch (error) {
            failures.push(error);
          }
          try {
            await input.runtime.close();
          } catch (error) {
            failures.push(error);
          }
          ready = false;
          attached = false;
          token = undefined;
          if (owners.get(input.runtime) === reservation)
            owners.delete(input.runtime);
          if (failures.length === 1) throw failures[0];
          if (failures.length > 1)
            throw new AggregateError(
              failures,
              'Beneficial rent owner cleanup failed',
            );
        })();
        return closing;
      },
    });
  controllers.add(controller);
  return controller;
}

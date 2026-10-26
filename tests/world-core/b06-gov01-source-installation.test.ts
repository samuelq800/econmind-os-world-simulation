/** Inert descriptor tests only; no source store, target or native SQL is installed. */
import { createHash } from 'node:crypto';
import { canonicalSerialize } from '@econmind/core';
import { describe, expect, it } from 'vitest';
import {
  classifyGov01SourceReadFailure,
  inspectGov01SourceInstallationDescriptor,
} from '../../apps/world-worker/src/preparation/b06-gov01-source-installation.js';

function descriptor() {
  return {
    schemaVersion: 'gov01-inert-installation-descriptor-v1',
    backend: 'EXISTING_WORKER_POSTGRES',
    targetIdentity: 'TEST_ONLY_DATABASE_IDENTITY',
    connectorReference: 'TEST_ONLY_EXISTING_CONNECTOR',
    allowedCaller: 'WORKER_GOV01_ACCOUNT_READ_V1',
    scope: {
      worldId: 'WORLD_GOV01_INSTALLATION_METADATA_ONLY',
      countryId: 'COUNTRY_01',
      originalId: 'U2544::ENTITY::ENTITY_GOVERNMENT_01::account',
      registrationReference: 'TEST_ONLY_REGISTRATION',
      sourceSetVersion: 'TEST_ONLY_SOURCE_SET_V1',
      controlScope: 'TEST_ONLY_UNINSTALLED_CONTROL_SCOPE',
    },
    pins: [
      {
        documentId: 'TEST_ONLY_SOURCE_METADATA',
        sourceVersion: 'TEST_ONLY_SOURCE_SET_V1',
        byteLength: '64',
        sha256: 'a'.repeat(64),
        pointer: '/records/0',
      },
    ],
  };
}
function envelope(value: unknown = descriptor()) {
  return rawEnvelope(canonicalSerialize(value));
}
function rawEnvelope(bytes: string) {
  return {
    documentId: 'TEST_ONLY_CANONICAL_INSTALLATION_DESCRIPTOR',
    bytes,
    byteLength: String(Buffer.byteLength(bytes)),
    sha256: createHash('sha256').update(bytes, 'utf8').digest('hex'),
  };
}

describe('closed inert installation descriptor', () => {
  it('returns meaningful immutable metadata while retaining exact missing source gates', () => {
    const data = descriptor();
    const result = inspectGov01SourceInstallationDescriptor(envelope(data));
    expect(result.classification).toBe(
      'VALIDATED_METADATA_NOT_INSTALLED_SOURCE',
    );
    expect(result.targetIdentity).toBe(data.targetIdentity);
    expect(result.scope.originalId).toBe(data.scope.originalId);
    expect(result.pins).toEqual(data.pins);
    expect(result.pinMeaning).toBe('METADATA_ONLY_SOURCE_BODIES_NOT_READ');
    expect(result.actualControlMapping).toBeNull();
    expect(result.actualTypedRegisterBinding).toBeNull();
    expect(result.sourceInstalled).toBe(false);
    expect(result.sourceAdmitted).toBe(false);
    expect(result.blockers).toHaveLength(3);
    expect(Object.isFrozen(result.scope)).toBe(true);
    expect(Object.isFrozen(result.pins[0])).toBe(true);
    data.pins[0]!.documentId = 'CHANGED';
    expect(result.pins[0]!.documentId).toBe('TEST_ONLY_SOURCE_METADATA');
  });
  it.each(['verify', 'source', 'installed', 'locked'])(
    'rejects caller-supplied %s authority fields',
    (key) => {
      expect(() =>
        inspectGov01SourceInstallationDescriptor({
          ...envelope(),
          [key]: true,
        }),
      ).toThrow('GOV01_INSTALLATION_EXACT_KEYS_REQUIRED');
    },
  );
  it.each(['sha256', 'byteLength', 'bytes'])(
    'checks full raw %s before parsing',
    (key) => {
      const input = envelope();
      const changed = {
        ...input,
        [key]:
          key === 'bytes'
            ? input.bytes + ' '
            : key === 'sha256'
              ? '0'.repeat(64)
              : '1',
      };
      expect(() => inspectGov01SourceInstallationDescriptor(changed)).toThrow(
        'GOV01_INSTALLATION_RAW_PIN_MISMATCH',
      );
    },
  );
  it('rejects duplicate JSON keys rather than adopting the last value', () => {
    const bytes = '{"schemaVersion":"one","schemaVersion":"two"}';
    expect(() =>
      inspectGov01SourceInstallationDescriptor(rawEnvelope(bytes)),
    ).toThrow('GOV01_INSTALLATION_CANONICAL_DESCRIPTOR_REQUIRED');
  });
  it('does not normalize noncanonical bytes or malformed UTF-8 into the descriptor', () => {
    expect(() =>
      inspectGov01SourceInstallationDescriptor(
        rawEnvelope(JSON.stringify(descriptor(), null, 2)),
      ),
    ).toThrow('GOV01_INSTALLATION_CANONICAL_DESCRIPTOR_REQUIRED');
    expect(() =>
      inspectGov01SourceInstallationDescriptor(rawEnvelope('\ud800')),
    ).toThrow('GOV01_INSTALLATION_BYTE_BUDGET');
  });
  it('rejects input accessors and proxies without invoking them', () => {
    let calls = 0;
    const input = envelope();
    Object.defineProperty(input, 'bytes', {
      enumerable: true,
      get() {
        calls++;
        throw new Error('GETTER');
      },
    });
    expect(() => inspectGov01SourceInstallationDescriptor(input)).toThrow(
      'GOV01_INSTALLATION_ACCESSOR_DENIED',
    );
    expect(() =>
      inspectGov01SourceInstallationDescriptor(
        new Proxy(envelope(), {
          ownKeys() {
            calls++;
            throw new Error('PROXY');
          },
        }),
      ),
    ).toThrow('GOV01_INSTALLATION_CLOSED_DATA_REQUIRED');
    expect(calls).toBe(0);
  });
  it('rejects overflowing bytes and depth before recursive normalization', () => {
    expect(() =>
      inspectGov01SourceInstallationDescriptor(rawEnvelope(' '.repeat(16385))),
    ).toThrow('GOV01_INSTALLATION_BYTE_BUDGET');
    expect(() =>
      inspectGov01SourceInstallationDescriptor(
        rawEnvelope('['.repeat(26) + 'null' + ']'.repeat(26)),
      ),
    ).toThrow('GOV01_INSTALLATION_STRUCTURE_BUDGET');
  });
  it.each(['allowedCaller', 'backend', 'schemaVersion'])(
    'rejects a different %s',
    (key) => {
      expect(() =>
        inspectGov01SourceInstallationDescriptor(
          envelope({ ...descriptor(), [key]: 'FOREIGN' }),
        ),
      ).toThrow('GOV01_INSTALLATION_DESCRIPTOR_SCOPE_REQUIRED');
    },
  );
  it.each(['targetIdentity', 'connectorReference'])(
    'rejects connection URLs in inert %s references',
    (key) => {
      expect(() =>
        inspectGov01SourceInstallationDescriptor(
          envelope({ ...descriptor(), [key]: 'postgres://not-a-source' }),
        ),
      ).toThrow('GOV01_INSTALLATION_REFERENCE_REQUIRED');
    },
  );
  it('rejects foreign original scope and extra scope data', () => {
    const d = descriptor();
    expect(() =>
      inspectGov01SourceInstallationDescriptor(
        envelope({ ...d, scope: { ...d.scope, countryId: 'COUNTRY_02' } }),
      ),
    ).toThrow('GOV01_INSTALLATION_ORIGINAL_SCOPE_REQUIRED');
    expect(() =>
      inspectGov01SourceInstallationDescriptor(
        envelope({ ...d, scope: { ...d.scope, actualControl: true } }),
      ),
    ).toThrow('GOV01_INSTALLATION_EXACT_KEYS_REQUIRED');
  });
  it.each(['01', '-1', '1.0'])(
    'rejects noncanonical declared bytes %s',
    (byteLength) => {
      const d = descriptor();
      d.pins[0]!.byteLength = byteLength;
      expect(() =>
        inspectGov01SourceInstallationDescriptor(envelope(d)),
      ).toThrow('GOV01_INSTALLATION_DECIMAL_REQUIRED');
    },
  );
  it.each(['/records/~2', 'records/0'])(
    'rejects ambiguous pointer %s',
    (pointer) => {
      const d = descriptor();
      d.pins[0]!.pointer = pointer;
      expect(() =>
        inspectGov01SourceInstallationDescriptor(envelope(d)),
      ).toThrow('GOV01_INSTALLATION_POINTER_REQUIRED');
    },
  );
  it('rejects duplicates and whole-document budgets without truncating pins', () => {
    const d = descriptor();
    d.pins.push({ ...d.pins[0]! });
    expect(() => inspectGov01SourceInstallationDescriptor(envelope(d))).toThrow(
      'GOV01_INSTALLATION_DUPLICATE_DOCUMENT',
    );
    d.pins = Array.from({ length: 9 }, (_, i) => ({
      ...d.pins[0]!,
      documentId: 'DOC_' + i,
      byteLength: '1048576',
    }));
    expect(() => inspectGov01SourceInstallationDescriptor(envelope(d))).toThrow(
      'GOV01_INSTALLATION_TOTAL_BUDGET',
    );
  });
  it('does not label arbitrary failures as successful or committed reads', () => {
    expect(classifyGov01SourceReadFailure(new Error('unclassified'))).toBe(
      'REJECTED',
    );
  });
});

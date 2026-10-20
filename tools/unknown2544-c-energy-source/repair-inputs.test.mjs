import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import {
  extractPinnedRepairInputs,
  inspectUntrustedRepairInputs,
  PINS,
  LIMITS,
} from './repair-inputs.mjs';
import { parseLossless } from '../unknown2544-c-physical/candidate.mjs';

// Exactly one actual fixed-source positive. All other semantic cases below are
// explicitly untrusted synthetic streams, not repinned/rewritten source files.
const actual = await extractPinnedRepairInputs();
const positions = [1323, 1328, 1332, 1336];
function fixture(mutate = () => {}) {
  const data = {
    jobs: actual.witnesses.jobs.map((f) => parseLossless(Buffer.from(f.raw))),
    daily: parseLossless(Buffer.from(actual.witnesses.daily.raw)),
    action: structuredClone(actual.witnesses.action),
    quote: structuredClone(actual.witnesses.quote),
    catalogue: structuredClone(actual.witnesses.catalogue),
  };
  mutate(data);
  const rows = Array(1337).fill('{}');
  positions.forEach((p, i) => {
    rows[p] = JSON.stringify(data.jobs[i]);
  });
  const actions = Array(331).fill(null);
  actions[330] = data.action;
  const countries = Array(53).fill(null);
  countries[52] = data.quote;
  return {
    jobs: Buffer.from('[' + rows.join(',') + ']'),
    daily: Buffer.from('{}\n'.repeat(255) + JSON.stringify(data.daily) + '\n'),
    action: Buffer.from(
      JSON.stringify({ version: actual.witnesses.sourceVersion, actions }),
    ),
    quote: Buffer.from(JSON.stringify({ countries })),
    catalogue: Buffer.from(JSON.stringify(data.catalogue)),
  };
}
function chunks(bytes, size = LIMITS.chunk) {
  return (function* () {
    for (let i = 0; i < bytes.length; i += size)
      yield bytes.subarray(i, i + size);
  })();
}
function streams(buffers, size) {
  return Object.fromEntries(
    Object.entries(buffers).map(([k, v]) => [k, chunks(v, size)]),
  );
}
async function inspect(buffers = fixture(), size) {
  const out = await inspectUntrustedRepairInputs(streams(buffers, size));
  assert.equal(out.sourceBytesVerified, false);
  assert.equal(out.class, 'UNVERIFIED_REFERENCE_INSPECTION_ONLY');
  return out;
}

test('one actual positive: same-FD full pins/EOF, four raw jobs, exact reference input vector', () => {
  assert.equal(actual.sourceBytesVerified, true);
  assert.equal(
    actual.class,
    'CONSTRUCTED_REFERENCE_REPAIR_INPUT_VECTOR_NOT_ACTUAL_OPERATION',
  );
  assert.equal(
    actual.referenceVector.electricityInputMWh,
    '721.32686051059275',
  );
  assert.deepEqual(actual.referenceVector.workerDaysBySourceSkillBucket, [
    '865.59223261271122',
    '432.79611630635561',
    '144.26537210211855',
  ]);
  assert.equal(
    actual.referenceVector.recordedWagesReferenceGcu,
    '41235.01799646048',
  );
  assert.equal(
    actual.referenceVector.materialBookCostReferenceGcu,
    '461649.19072677935',
  );
  assert.equal(
    actual.bookkeeping.knownComponentsSubtotalNative,
    '160922946.7914367456',
  );
  assert.deepEqual(actual.identity.jobPointers, [
    '/1323',
    '/1328',
    '/1332',
    '/1336',
  ]);
  assert.equal(actual.witnesses.daily.line, 256);
  assert.equal(
    actual.sourceReceipts.find((r) => r.key === 'jobs').recordCount,
    138966,
  );
  assert.equal(
    actual.sourceReceipts.find((r) => r.key === 'daily').lineCount,
    27127,
  );
  assert.ok(
    actual.sourceReceipts.every(
      (r) =>
        r.matchesFixedPin &&
        r.hashCompleteAtEof &&
        r.bytes === PINS[r.key].bytes,
    ),
  );
  const steel = actual.referenceVector.materials.find(
    (r) => r.commodityId === 'STEEL',
  );
  assert.deepEqual(steel, {
    commodityId: 'STEEL',
    unit: 'tonne',
    amount: '144.26537210211855',
  });
  assert.equal(
    actual.referenceVector.materials.find((r) => r.commodityId === 'MACHINERY')
      .unit,
    'equipment unit',
  );
  assert.ok(
    actual.witnesses.jobs[0].raw.includes(
      '"electricityMWh":148.13475025991653',
    ),
  );
});

test('synthetic byte streams never authenticate source, even with caller verification flags', async () => {
  const input = streams(fixture());
  input.sourceBytesVerified = true;
  input.mode = 'PINNED';
  const out = await inspectUntrustedRepairInputs(input);
  assert.equal(out.sourceBytesVerified, false);
  assert.equal(out.class, 'UNVERIFIED_REFERENCE_INSPECTION_ONLY');
  assert.equal(
    out.referenceVector.electricityInputMWh,
    actual.referenceVector.electricityInputMWh,
  );
});

test('finite chunk partitions preserve escaped strings, nested arrays and split UTF8', async () => {
  const buffers = fixture((d) => {
    d.jobs[0].note = 'braces } [ , and quote " backslash \\ 水';
  });
  for (const size of [1, 7, 4096]) {
    const out = await inspect(buffers, size);
    assert.deepEqual(out.referenceVector, actual.referenceVector);
    assert.equal(
      parseLossless(Buffer.from(out.witnesses.jobs[0].raw)).note,
      'braces } [ , and quote " backslash \\ 水',
    );
    assert.equal(out.witnesses.jobs.length, 4);
  }
});

test('bad top-level framing, separators, nested brackets, and trailing junk reject', async () => {
  for (const raw of [
    '{}',
    '[1]',
    '[{},]',
    '[{} {}]',
    '[{}]]',
    '[{"x":[1,2}',
    '[{}] []',
  ]) {
    const input = fixture();
    input.jobs = Buffer.from(raw);
    await assert.rejects(
      inspect(input, 2),
      /JOB_ROOT|INVALID_JOB_OUTER_FRAME|JOB_BRACKET/u,
    );
  }
  const input = fixture();
  input.jobs = Buffer.concat([input.jobs, Buffer.from('x')]);
  await assert.rejects(inspect(input), /INVALID_JOB_OUTER_FRAME:DONE/u);
});

test('EOF in array/string/escape rejects instead of returning selected partial data', async () => {
  for (const raw of ['[', '[{"x":', '[{"x":"abc', '[{"x":"abc\\']) {
    const input = fixture();
    input.jobs = Buffer.from(raw);
    await assert.rejects(inspect(input, 1), /TRUNCATED_JOB_ARRAY/u);
  }
  const input = fixture();
  input.jobs = input.jobs.subarray(0, input.jobs.length - 1);
  await assert.rejects(inspect(input), /TRUNCATED_JOB_ARRAY/u);
});

test('fatal UTF8 includes unselected rows and dangling multibyte EOF', async () => {
  const input = fixture();
  input.jobs = Buffer.from([91, 123, 34, 120, 34, 58, 34, 255, 34, 125, 93]);
  await assert.rejects(inspect(input, 1), /INVALID_UTF8/u);
  input.jobs = Buffer.concat([Buffer.from('[{"x":"'), Buffer.from([230, 176])]);
  await assert.rejects(inspect(input, 1), /INVALID_UTF8_EOF/u);
});

test('chunk, record, physical-line, and nesting budgets are finite', async () => {
  const input = streams(fixture());
  input.jobs = [Buffer.alloc(LIMITS.chunk + 1, 32)];
  await assert.rejects(
    inspectUntrustedRepairInputs(input),
    /CHUNK_LIMIT:jobs/u,
  );
  const strings = streams(fixture());
  strings.jobs = ['[]'];
  await assert.rejects(
    inspectUntrustedRepairInputs(strings),
    /BYTE_CHUNK_REQUIRED/u,
  );
  const b = fixture();
  b.jobs = Buffer.from('[{"x":"' + 'x'.repeat(LIMITS.frame) + '"}]');
  await assert.rejects(inspect(b), /JOB_FRAME_LIMIT/u);
  b.jobs = Buffer.from(
    '[{"x":' + '['.repeat(LIMITS.depth) + '0' + ']'.repeat(LIMITS.depth) + '}]',
  );
  await assert.rejects(inspect(b), /JOB_NESTING_LIMIT/u);
  const d = fixture();
  d.daily = Buffer.from(' '.repeat(LIMITS.frame + 1));
  await assert.rejects(inspect(d), /DAILY_LINE_LIMIT/u);
});

test('I/O failure after selected frames cannot expose a verified result', async () => {
  const b = fixture(),
    input = streams(b);
  input.jobs = (async function* () {
    yield b.jobs;
    throw new Error('TEST_IO_AFTER_SELECTION');
  })();
  await assert.rejects(
    inspectUntrustedRepairInputs(input),
    /TEST_IO_AFTER_SELECTION/u,
  );
});

test('physical line identity: CRLF, no final LF and blank-line indexing', async () => {
  const b = fixture();
  b.daily = Buffer.from(b.daily.toString().replaceAll('\n', '\r\n'));
  const crlf = await inspect(b, 7);
  assert.ok(crlf.witnesses.daily.raw.endsWith('\r'));
  assert.equal(crlf.witnesses.daily.line, 256);
  b.daily = b.daily.subarray(0, b.daily.length - 2);
  assert.equal(
    (await inspect(b, 7)).sourceReceipts.find((r) => r.key === 'daily')
      .lineCount,
    256,
  );
  const blank = fixture();
  blank.daily = Buffer.concat([Buffer.from('\n'), blank.daily]);
  await assert.rejects(inspect(blank), /DAILY_SCOPE_MISMATCH/u);
});

test('exact pointer set rejects duplicates, missing and foreign indices', async () => {
  for (const indices of [
    ['1323', '1323', '1332', '1336'],
    ['1323', '1328', '1332'],
    ['1323', '1328', '1332', '0'],
  ]) {
    await assert.rejects(
      inspect(
        fixture((d) => {
          d.daily.sourceIndices = indices;
        }),
      ),
      /DAILY_POINTER_SET_MISMATCH/u,
    );
  }
  await assert.rejects(
    inspect(
      fixture((d) => {
        d.jobs[1].settlementId = d.jobs[0].settlementId;
      }),
    ),
    /JOB_SCOPE_OR_SETTLEMENT/u,
  );
});

test('wrong job/day/finish/recipe, action, quote and original flags reject', async () => {
  for (const mutate of [
    (d) => {
      d.jobs[0].simDay1 = '2';
    },
    (d) => {
      d.jobs[0].finishSimDay1 = '4';
    },
    (d) => {
      d.jobs[0].name = 'OTHER';
    },
    (d) => {
      d.jobs[0].newSceneContract = false;
    },
    (d) => {
      d.action.countryId = 'COUNTRY_54';
    },
    (d) => {
      d.quote.adopted = true;
    },
    (d) => {
      d.daily.actualWorldPosting = true;
    },
  ])
    await assert.rejects(inspect(fixture(mutate)), /SCOPE|SETTLEMENT/u);
});

test('missing energy/skill/raw material/unit cannot become zero or aggregate fallback', async () => {
  for (const mutate of [
    (d) => {
      delete d.jobs[0].electricityMWh;
    },
    (d) => {
      d.jobs[0].electricityMWh = null;
    },
    (d) => {
      d.jobs[0].workDaysBySkill[1] = null;
    },
    (d) => {
      delete d.jobs[0].materialsNative.STEEL;
    },
    (d) => {
      delete d.catalogue[9].unit;
    },
  ])
    await assert.rejects(
      inspect(fixture(mutate)),
      /MISSING_OR_INVALID|EXPLICIT_RAW|EXPLICIT_UNIQUE/u,
    );
  const out = await inspect(
    fixture((d) => {
      for (const job of d.jobs) job.electricityMWh = '0.0';
      d.daily.electricityMWhKnown = '0.0';
    }),
  );
  assert.equal(out.referenceVector.electricityInputMWh, '0');
});

test('plain decimal tails stay exact, with no core precision rounding', async () => {
  const out = await inspect(
    fixture((d) => {
      d.jobs[0].electricityMWh = '148.1347502599165300000001';
      d.daily.electricityMWhKnown = '721.3268605105927500000001';
    }),
    1,
  );
  assert.equal(
    out.referenceVector.electricityInputMWh,
    '721.3268605105927500000001',
  );
  assert.ok(out.witnesses.jobs[0].raw.includes('148.1347502599165300000001'));
});

test('quoted and unquoted selected exponent lexemes explicitly unsupported', async () => {
  for (const token of ['1e0', '1E-3']) {
    const b = fixture((d) => {
      d.jobs[0].electricityMWh = token;
    });
    await assert.rejects(
      inspect(b, 1),
      /EXPONENT_LEXEME_UNSUPPORTED_THIS_SLICE/u,
    );
    b.jobs = Buffer.from(
      b.jobs
        .toString()
        .replace(
          '"electricityMWh":"' + token + '"',
          '"electricityMWh":' + token,
        ),
    );
    await assert.rejects(
      inspect(b, 1),
      /EXPONENT_LEXEME_UNSUPPORTED_THIS_SLICE/u,
    );
  }
});

test('same-length late tail drift through the real FD rejects after all four frames and EOF', async (t) => {
  const originalOpen = fs.open;
  let changed = false;
  t.mock.method(fs, 'open', async (...args) => {
    const handle = await originalOpen(...args);
    if (args[0] === PINS.jobs.path) {
      const originalStream = handle.createReadStream.bind(handle);
      t.mock.method(handle, 'createReadStream', (options) => {
        const source = originalStream(options);
        return Readable.from(
          (async function* () {
            let offset = 0;
            for await (const bytes of source) {
              let out = bytes;
              if (!changed && offset + bytes.length > PINS.jobs.bytes - 256) {
                out = Buffer.from(bytes);
                for (
                  let i = Math.max(0, PINS.jobs.bytes - 256 - offset);
                  i < out.length;
                  i++
                ) {
                  if (out[i] >= 48 && out[i] <= 57) {
                    out[i] = out[i] === 48 ? 49 : 48;
                    changed = true;
                    break;
                  }
                }
              }
              offset += bytes.length;
              yield out;
            }
          })(),
          { objectMode: false },
        );
      });
    }
    return handle;
  });
  await assert.rejects(extractPinnedRepairInputs(), (error) => {
    assert.equal(error.message, 'SOURCE_INTEGRITY_MISMATCH:jobs');
    assert.equal(error.receipt.bytes, PINS.jobs.bytes);
    assert.equal(error.receipt.recordCount, 138966);
    assert.equal(error.receipt.retainedFrames, 4);
    assert.equal(error.receipt.hashCompleteAtEof, true);
    assert.equal(error.receipt.matchesFixedPin, false);
    return true;
  });
  assert.equal(changed, true);
});

test('inclusive wages/material subtotal is never counted twice or used as complete cost', async () => {
  await assert.rejects(
    inspect(
      fixture((d) => {
        d.daily.knownCostGcu = '544119.22671970031';
      }),
    ),
    /INCLUSIVE_REFERENCE_SUBTOTAL_MISMATCH/u,
  );
  for (const out of [actual, await inspect()]) {
    for (const key of [
      'actualLabourHours',
      'actualEnergyDeliveredMWh',
      'actualRecurringEnergyCost',
      'nationalMinimum',
    ])
      assert.equal(out[key], null);
    for (const key of [
      'actualWorldPosting',
      'sourceAdmitted',
      'runtimeRegistered',
      'productionAuthority',
    ])
      assert.equal(out[key], false);
    assert.ok(Object.values(out.originalStages).every((v) => v === false));
    assert.equal(out.originalFieldsClosed, 0);
    assert.equal(out.bookkeeping.quoteAdoptedInSource, false);
    assert.equal(out.bookkeeping.completeServiceCost, null);
    assert.equal(out.cashJournalRead, false);
    assert.ok(Object.isFrozen(out.referenceVector.materials));
  }
});

after(() => {
  const out = process.env.C_REPAIR_EVIDENCE_DIR;
  if (!out) return;
  assert.match(
    out,
    /^\/Users\/samuel\/Documents\/econclub\/\.econmind-artifacts\/unknown2544-resume-20261018\/C\/repair-inputs-implementation-v1\/run-[1-9]\d*$/u,
  );
  assert.equal(
    existsSync(out),
    false,
    'Never overwrite a frozen evidence directory',
  );
  mkdirSync(out);
  writeFileSync(
    out + '/REAL_SOURCE_OUTPUT.json',
    JSON.stringify(actual, null, 2) + '\n',
    { flag: 'wx' },
  );
});

/** Bounded transport encoding only. The decoded canonical OpeningSeed remains
 * the identical signed/hashed source; compression grants no authority. */
import { createHash } from 'node:crypto';
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';
import { canonicalSerialize, type OpeningSeed } from '@econmind/core';
const MAX_DECODED_BYTES = 128 * 1024 * 1024;
const MAX_ENCODED_BYTES = 32 * 1024 * 1024;
const sha = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
export function encodePostwarSeedDocument(seed: OpeningSeed): string {
  const bytes = Buffer.from(canonicalSerialize(seed), 'utf8');
  if (bytes.byteLength > MAX_DECODED_BYTES)
    throw Error('POSTWAR_SEED_DOCUMENT_DECODED_SIZE_EXCEEDED');
  const packed = brotliCompressSync(bytes, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
  });
  const document = canonicalSerialize({
    schemaVersion: 'postwar-opening-seed-transport-v1',
    encoding: 'BROTLI_BASE64',
    decodedBytes: bytes.byteLength.toString(),
    decodedSha256: sha(bytes),
    payload: packed.toString('base64'),
  });
  if (Buffer.byteLength(document) > MAX_ENCODED_BYTES)
    throw Error('POSTWAR_SEED_DOCUMENT_ENCODED_SIZE_EXCEEDED');
  return document;
}
export function decodePostwarSeedDocument(documentBytes: string): unknown {
  if (Buffer.byteLength(documentBytes) > MAX_ENCODED_BYTES)
    throw Error('POSTWAR_SEED_DOCUMENT_ENCODED_SIZE_EXCEEDED');
  const document = JSON.parse(documentBytes) as Record<string, unknown>;
  if (
    !document ||
    typeof document !== 'object' ||
    Array.isArray(document) ||
    Object.keys(document).sort().join('|') !==
      'decodedBytes|decodedSha256|encoding|payload|schemaVersion' ||
    document.schemaVersion !== 'postwar-opening-seed-transport-v1' ||
    document.encoding !== 'BROTLI_BASE64' ||
    typeof document.decodedBytes !== 'string' ||
    !/^[1-9]\d{0,8}$/u.test(document.decodedBytes) ||
    BigInt(document.decodedBytes) > BigInt(MAX_DECODED_BYTES) ||
    typeof document.decodedSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(document.decodedSha256) ||
    typeof document.payload !== 'string' ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(document.payload)
  )
    throw Error('POSTWAR_SEED_DOCUMENT_INVALID');
  const packed = Buffer.from(document.payload, 'base64');
  if (packed.toString('base64') !== document.payload)
    throw Error('POSTWAR_SEED_DOCUMENT_BASE64_INVALID');
  const decoded = brotliDecompressSync(packed, {
    maxOutputLength: MAX_DECODED_BYTES,
  });
  if (
    decoded.byteLength.toString() !== document.decodedBytes ||
    sha(decoded) !== document.decodedSha256
  )
    throw Error('POSTWAR_SEED_DOCUMENT_CONTENT_MISMATCH');
  const text = decoded.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(decoded))
    throw Error('POSTWAR_SEED_DOCUMENT_UTF8_INVALID');
  const seed = JSON.parse(text) as unknown;
  if (canonicalSerialize(seed) !== text)
    throw Error('POSTWAR_SEED_DOCUMENT_NONCANONICAL');
  return seed;
}

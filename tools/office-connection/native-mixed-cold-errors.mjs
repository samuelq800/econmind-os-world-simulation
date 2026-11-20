/** TEST_ONLY error transport/recognition. No PG, source authority or runtime IO. */
const semantic = 'POSTWAR_DAY_ONE_FX_CUSTODY:FX_SOURCE_REVOKED';
const MAX_NODES = 64;
const MAX_DEPTH = 16;
const errorLike = (v) =>
  v !== null &&
  typeof v === 'object' &&
  (v instanceof Error || v.kind === 'ERROR') &&
  typeof v.name === 'string' &&
  typeof v.message === 'string';
const children = (v) => {
  const result = [];
  if (v.cause !== undefined && v.cause !== null) result.push(v.cause);
  if (v.rollbackError !== undefined) result.push(v.rollbackError);
  if (v.errors !== undefined) {
    if (!Array.isArray(v.errors)) return null;
    result.push(...v.errors);
  }
  return result;
};
/** Only the exact custody SQL 55000 leaf establishes the rejection. An
 * optional DomainError must have its exact mapped message. Every branch agrees. Unknown errors, uncertain transaction
 * outcomes, missing/truncated/cyclic causes and generic/timeout leaves deny. */
export function isExactColdFxSourceRevocation(error) {
  const path = new Set();
  let nodes = 0;
  function visit(value, depth) {
    if (
      depth > MAX_DEPTH ||
      ++nodes > MAX_NODES ||
      !errorLike(value) ||
      path.has(value)
    )
      return false;
    const nested = children(value);
    if (nested === null) return false;
    const sql = value.code === '55000' && value.message === 'FX_SOURCE_REVOKED';
    if (sql) return nested.length === 0;
    const domain =
      value.name === 'DomainError' &&
      value.code === 'TRANSITION_EVIDENCE_INVALID' &&
      value.message === semantic;
    const rollback =
      value.name === 'PostgresTransactionError' &&
      value.outcome === 'ROLLED_BACK' &&
      value.rollbackError === undefined &&
      value.code === undefined;
    const aggregate =
      value.name === 'AggregateError' &&
      value.code === undefined &&
      value.outcome === undefined;
    if ((!domain && !rollback && !aggregate) || nested.length === 0)
      return false;
    path.add(value);
    const recognized = nested.every((child) => visit(child, depth + 1));
    path.delete(value);
    return recognized;
  }
  return visit(error, 0);
}
/** Preserve complete Error.cause and AggregateError.errors without serializing
 * SQL parameters, connections or credentials. Explicit limits are visible and
 * cannot be mistaken for a recognized complete revocation chain. */
export function wireColdError(error) {
  const path = new Set();
  let nodes = 0;
  function visit(value, depth) {
    if (depth > MAX_DEPTH || ++nodes > MAX_NODES) return { kind: 'TRUNCATED' };
    if (!errorLike(value)) return { kind: 'NON_ERROR', value: String(value) };
    if (path.has(value)) return { kind: 'CYCLE' };
    path.add(value);
    const result = { kind: 'ERROR', name: value.name, message: value.message };
    for (const key of ['code', 'outcome', 'stack', 'where'])
      if (typeof value[key] === 'string') result[key] = value[key];
    if (value.cause !== undefined && value.cause !== null)
      result.cause = visit(value.cause, depth + 1);
    if (value.rollbackError !== undefined)
      result.rollbackError = visit(value.rollbackError, depth + 1);
    if (Array.isArray(value.errors))
      result.errors = value.errors.map((child) => visit(child, depth + 1));
    else if (value.errors !== undefined)
      result.errors = [{ kind: 'NON_ERROR', value: 'NON_ARRAY_ERRORS' }];
    path.delete(value);
    return result;
  }
  return visit(error, 0);
}

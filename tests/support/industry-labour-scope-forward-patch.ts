/** Offline TEST_ONLY artifact generator. It does not connect, execute, register
 * sources or claim a DDL receipt. Apply only in an explicitly controlled window;
 * an uncertain COMMIT requires catalog readback, never automatic retry. */
import { createHash } from 'node:crypto';

const owner = 'world_v2_postwar_projection_owner';
const publisher = 'world_v2_postwar_projection_publisher';
const prepare = 'prepare_postwar_industry_labour_scopes';
const repair = 'repair_postwar_industry_regional_source_capacity';
export const INDUSTRY_LABOUR_FORWARD_PREDECESSOR_COMMIT =
  'da94940a6e0319fff298c5370dc6f4d251a5e258';
export const INDUSTRY_LABOUR_FORWARD_PREDECESSOR_SHA256 =
  '3b5f065737ed2bd88f30831f60acb951859bd91a91df380aa8183f6d5a864a0e';
const sha = (text: string) =>
  createHash('sha256').update(text, 'utf8').digest('hex');
function fail(reason: string): never {
  throw Error('INDUSTRY_LABOUR_FORWARD:' + reason);
}
function extract(sql: string, name: typeof prepare | typeof repair) {
  // Deliberately only these two literal functions, not a general SQL loader.
  const matches = [
    ...sql.matchAll(
      new RegExp(
        '^create function world_v2\\.' +
          name +
          '\\(([\\s\\S]*?)\\bas\\s+(\\$[A-Za-z_0-9]*\\$)([\\s\\S]*?)\\2;',
        'gimu',
      ),
    ),
  ];
  if (matches.length !== 1) fail('EXACT_FUNCTION_REQUIRED:' + name);
  const match = matches[0]!;
  const header = match[0].slice(0, match[0].indexOf(match[2]!));
  if (
    !/language plpgsql security definer set search_path=pg_catalog as\s*$/iu.test(
      header,
    )
  )
    fail('FIXED_DEFINER_REQUIRED:' + name);
  return { definition: match[0], header, body: match[3]! };
}
const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
function metadataCheck(signature: string, bodyHash: string, result: string) {
  return `select p.*,pg_get_function_result(p.oid)as result into f from pg_proc p where p.oid=to_regprocedure(${literal(signature)});
 if not found or pg_get_userbyid(f.proowner)<>${literal(owner)} or not f.prosecdef or f.proconfig is distinct from array['search_path=pg_catalog']::text[] or f.result<>${literal(result)} or f.prolang<>(select oid from pg_language where lanname='plpgsql') or encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>${literal(bodyHash)} then raise exception 'INDUSTRY_LABOUR_FORWARD_EXACT_FUNCTION_REQUIRED'using errcode='55000';end if;
 if (select count(*)from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))))<>2 or exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))x where x.grantee=0 or x.privilege_type<>'EXECUTE' or x.is_grantable or x.grantor<>f.proowner or x.grantee not in(f.proowner,(select oid from pg_roles where rolname=${literal(publisher)}))) or (select count(*)from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))x where x.grantee=(select oid from pg_roles where rolname=${literal(publisher)}))<>1 then raise exception 'INDUSTRY_LABOUR_FORWARD_EXACT_ACL_REQUIRED'using errcode='42501';end if;`;
}
export function buildIndustryLabourScopeForwardPatch(input: {
  readonly previousSql: string;
  readonly nextSql: string;
  readonly expectedNextSqlSha256: string;
}) {
  if (sha(input.previousSql) !== INDUSTRY_LABOUR_FORWARD_PREDECESSOR_SHA256)
    fail('EXACT_PREDECESSOR_SOURCE_REQUIRED');
  if (
    !/^[a-f0-9]{64}$/u.test(input.expectedNextSqlSha256) ||
    sha(input.nextSql) !== input.expectedNextSqlSha256
  )
    fail('EXACT_NEXT_SOURCE_REQUIRED');
  const previous = extract(input.previousSql, prepare);
  const next = extract(input.nextSql, prepare);
  const addition = extract(input.nextSql, repair);
  if (previous.header !== next.header || previous.body === next.body)
    fail('SAME_PREPARE_CONTRACT_AND_CHANGED_BODY_REQUIRED');
  if (
    !/^create function world_v2\.repair_postwar_industry_regional_source_capacity\(p_world text,p_country text\)\s*returns world_v2\.postwar_office_projection_document\s*language/iu.test(
      addition.header,
    )
  )
    fail('FIXED_REPAIR_CONTRACT_REQUIRED');
  // Transfer only the two definitions. No table, policy, other function or
  // source publication statement from the fresh-install proposal is replayed.
  const oldHash = sha(previous.body);
  const newHash = sha(next.body);
  const repairHash = sha(addition.body);
  const oldSignature = 'world_v2.' + prepare + '(text)';
  const repairSignature = 'world_v2.' + repair + '(text,text)';
  const repairResult = 'world_v2.postwar_office_projection_document';
  if (
    next.body.includes('$nextbody$') ||
    next.body.includes('$patch$') ||
    addition.definition.includes('$patch$')
  )
    fail('DOLLAR_DELIMITER_COLLISION');
  const sql = `-- Function-only forward candidate; not a fresh schema installation.
-- Predecessor source ${INDUSTRY_LABOUR_FORWARD_PREDECESSOR_SHA256}
-- Next source ${input.expectedNextSqlSha256}
-- Drain affected callers first. No source preparation RPC is invoked here.
-- Before known COMMIT, rollback this transaction on error. UNKNOWN COMMIT:
-- STOP, inspect exact catalogs/release receipt; never retry automatically.
begin;
set local search_path=pg_catalog;
do $patch$declare f record;old_acl aclitem[];old_oid oid;definition text;replacement text;begin
 if not exists(select 1 from pg_roles where rolname=${literal(owner)} and not(rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or rolreplication))or has_schema_privilege(${literal(owner)},'world_v2','CREATE')then raise exception 'INDUSTRY_LABOUR_FORWARD_FIXED_OWNER_REQUIRED'using errcode='42501';end if;
 ${metadataCheck(oldSignature, oldHash, 'void')}
 if to_regprocedure(${literal(repairSignature)})is not null then raise exception 'INDUSTRY_LABOUR_FORWARD_NEW_RPC_ALREADY_EXISTS'using errcode='55000';end if;
 old_acl:=f.proacl;old_oid:=f.oid;definition:=pg_get_functiondef(f.oid);
 replacement:=$nextbody$${next.body}$nextbody$;
 if length(definition)-length(replace(definition,f.prosrc,''))<>length(f.prosrc)then raise exception 'INDUSTRY_LABOUR_FORWARD_UNIQUE_BODY_REQUIRED'using errcode='55000';end if;
 execute replace(definition,f.prosrc,replacement);
 ${metadataCheck(oldSignature, newHash, 'void')}
 if f.oid<>old_oid or f.proacl is distinct from old_acl then raise exception 'INDUSTRY_LABOUR_FORWARD_PREPARE_IDENTITY_OR_ACL_CHANGED'using errcode='42501';end if;
end;$patch$;
-- Existing owner needs schema CREATE only for the owner transfer, inside this
-- transaction; the precondition and final check require it absent afterwards.
grant create on schema world_v2 to ${owner};
${addition.definition}
alter function ${repairSignature}owner to ${owner};
revoke all on function ${repairSignature}from public;
grant execute on function ${repairSignature}to ${publisher};
revoke create on schema world_v2 from ${owner};
do $patch$declare f record;begin
 ${metadataCheck(oldSignature, newHash, 'void')}
 ${metadataCheck(repairSignature, repairHash, repairResult)}
 if has_schema_privilege(${literal(owner)},'world_v2','CREATE')then raise exception 'INDUSTRY_LABOUR_FORWARD_OWNER_CREATE_REMAINS'using errcode='42501';end if;
end;$patch$;
commit;
`;
  return Object.freeze({
    schemaVersion: 'postwar-industry-labour-function-forward-patch-v1' as const,
    predecessorCommit: INDUSTRY_LABOUR_FORWARD_PREDECESSOR_COMMIT,
    predecessorSourceSha256: INDUSTRY_LABOUR_FORWARD_PREDECESSOR_SHA256,
    nextSourceSha256: input.expectedNextSqlSha256,
    functions: Object.freeze([
      Object.freeze({
        signature: oldSignature,
        operation: 'REPLACE' as const,
        oldBodySha256: oldHash,
        newBodySha256: newHash,
        owner,
        executeRoles: Object.freeze([publisher]),
        securityDefiner: true as const,
        searchPath: 'pg_catalog' as const,
      }),
      Object.freeze({
        signature: repairSignature,
        operation: 'CREATE' as const,
        oldBodySha256: null,
        newBodySha256: repairHash,
        owner,
        executeRoles: Object.freeze([publisher]),
        securityDefiner: true as const,
        searchPath: 'pg_catalog' as const,
      }),
    ]),
    sql,
    sha256: sha(sql),
  });
}

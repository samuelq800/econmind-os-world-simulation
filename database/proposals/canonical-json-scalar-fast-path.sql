-- Preserve the existing canonical text. Only containers need recursion.
begin;

create or replace function world_v2.canonical_json(value jsonb)
returns text
language plpgsql
immutable
strict
as $$
declare
  rendered text;
begin
  case jsonb_typeof(value)
    when 'object' then
      select '{' || coalesce(
        string_agg(
          to_jsonb(entry.key)::text || ':' ||
            case when jsonb_typeof(entry.value) in ('array', 'object')
              then world_v2.canonical_json(entry.value)
              else entry.value::text
            end,
          ',' order by entry.key
        ),
        ''
      ) || '}'
        into rendered
        from jsonb_each(value) as entry(key, value);
    when 'array' then
      select '[' || coalesce(
        string_agg(
          case when jsonb_typeof(item.value) in ('array', 'object')
            then world_v2.canonical_json(item.value)
            else item.value::text
          end,
          ',' order by item.ordinality
        ),
        ''
      ) || ']'
        into rendered
        from jsonb_array_elements(value) with ordinality as item(value, ordinality);
    else
      rendered := value::text;
  end case;
  return rendered;
end;
$$;

commit;

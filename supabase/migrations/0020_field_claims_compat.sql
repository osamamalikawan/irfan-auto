-- Run this AFTER 0017_edit_tasks_claims.sql ("orders, tasks, claims"). It is also safe to run before it.
--
-- That update changes create_return: it now takes the kind ('return' or 'claim'), a claim is numbered C:0001 and its goods are
-- not put back in stock, and only a Delivered or Completed order can be returned. This makes an approved request from the
-- salesman app follow the same rules: a "claim" request becomes a real claim.

create or replace function approve_return_request(p_req uuid, p_user uuid, p_lines jsonb, p_damaged boolean)
returns uuid language plpgsql as $$
declare r return_requests%rowtype; v_lines jsonb; ret_id uuid; has_kind boolean;
begin
  select * into r from return_requests where id = p_req for update;
  if not found then raise exception 'Return request not found.'; end if;
  if r.status = 'approved' then return r.return_id; end if;
  if r.status <> 'pending' then raise exception 'This request was already %.', r.status; end if;

  v_lines := p_lines;
  if v_lines is null then
    select jsonb_agg(jsonb_build_object('item_id', l->>'item_id', 'qty', (l->>'qty')::numeric)) into v_lines
      from jsonb_array_elements(r.lines) l;
  end if;

  select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'create_return' and p.pronargs = 6) into has_kind;
  if has_kind then
    ret_id := create_return(r.sale_id, v_lines, coalesce(p_damaged, r.damaged), coalesce(r.reason, ''), p_user, r.kind);
  else
    ret_id := create_return(r.sale_id, v_lines, coalesce(p_damaged, r.damaged), coalesce(r.reason, ''), p_user);
  end if;
  update sale_returns set salesman_id = r.salesman_id where id = ret_id;
  update return_requests set status = 'approved', return_id = ret_id, reviewed_by = p_user, reviewed_at = now() where id = r.id;
  return ret_id;
end $$;

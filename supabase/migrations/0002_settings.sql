-- Settings: choose which price lists show up in Inventory.
alter table price_lists add column if not exists visible boolean not null default true;

-- CP is the counter (selling) price, not a cost. Rename the column if it was created as "cost".
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'products' and column_name = 'cost') then
    alter table products rename column cost to cp;
  end if;
end $$;

-- The returned column changed (cost -> cp), so the function must be dropped and recreated.
drop function if exists inventory_list(text, uuid, text, int, int);

-- Stock screen: same as before, but products whose list is hidden are left out.
create or replace function inventory_list(
  p_q text default null, p_list uuid default null, p_filter text default 'all',
  p_limit int default 30, p_offset int default 0
) returns table (
  id uuid, legacy_no int, name_en text, code_name text, name_ur text, scheme text,
  cp numeric, unit text, reorder_level numeric, list_name text, brand text, company text,
  on_hand numeric, racks text[], locations text[], by_location jsonb, total bigint
) language sql stable as $$
  select p.id, p.legacy_no, p.name_en, p.code_name, p.name_ur, p.scheme,
         p.cp, p.unit, p.reorder_level, l.name, b.name, c.name,
         coalesce(s.on_hand, 0),
         coalesce(rk.racks, '{}'), coalesce(lc.locs, '{}'), coalesce(bl.by_loc, '[]'::jsonb),
         count(*) over ()
  from products p
  left join price_lists l on l.id = p.list_id
  left join brands b on b.id = p.brand_id
  left join companies c on c.id = p.company_id
  left join lateral (select sum(m.qty) as on_hand from stock_movements m where m.product_id = p.id) s on true
  left join lateral (select array_agg(r.code order by r.code) as racks
                     from product_racks pr join racks r on r.id = pr.rack_id
                     where pr.product_id = p.id) rk on true
  left join lateral (select array_agg(lo.name order by lo.name) as locs
                     from product_locations pl join locations lo on lo.id = pl.location_id
                     where pl.product_id = p.id) lc on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('location', x.name, 'qty', x.qty, 'racks', x.racks) order by x.name) as by_loc
    from (
      select lo.name, coalesce(sl.qty, 0) as qty,
             coalesce((select array_agg(r.code order by r.code) from product_racks pr
                       join racks r on r.id = pr.rack_id
                       where pr.product_id = p.id and r.location_id = lo.id), '{}') as racks
      from locations lo
      left join stock_levels sl on sl.location_id = lo.id and sl.product_id = p.id
      where lo.active and (sl.qty is not null or exists
            (select 1 from product_locations pl where pl.product_id = p.id and pl.location_id = lo.id))
    ) x
  ) bl on true
  where p.active
    and (l.id is null or l.visible)   -- products of hidden lists are left out
    and (coalesce(p_q, '') = '' or p.name_en ilike '%' || p_q || '%'
         or p.code_name ilike '%' || p_q || '%' or p.name_ur ilike '%' || p_q || '%'
         or b.name ilike '%' || p_q || '%'
         or exists (select 1 from product_racks pr2 join racks r2 on r2.id = pr2.rack_id
                    where pr2.product_id = p.id and r2.code ilike '%' || p_q || '%'))
    and (p_list is null or p.list_id = p_list)
    and (p_filter = 'all'
         or (p_filter = 'low'    and p.reorder_level > 0 and coalesce(s.on_hand, 0) <= p.reorder_level)
         or (p_filter = 'out'    and coalesce(s.on_hand, 0) <= 0)
         or (p_filter = 'norack' and rk.racks is null))
  order by p.legacy_no nulls last, p.name_en
  limit p_limit offset p_offset
$$;

-- Lists with product counts, for the Settings page.
create or replace function price_list_stats()
returns table (id uuid, name text, visible boolean, products bigint)
language sql stable as $$
  select l.id, l.name, l.visible, count(p.id)
  from price_lists l
  left join products p on p.list_id = l.id and p.active
  group by l.id
  order by l.name
$$;

revoke all on function price_list_stats() from public, anon, authenticated;
revoke all on function inventory_list(text, uuid, text, int, int) from public, anon, authenticated;

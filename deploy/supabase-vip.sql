-- ============================================================
-- 鲨鱼 Pro（VIP）一键建表脚本
-- 用法：Supabase Dashboard → SQL Editor → New query → 粘贴全部 → Run
-- 全部语句可重复执行（重复 Run 不会报错）。
-- 完整方案见 docs/VIP功能方案.md
-- ============================================================

-- 1) 兑换码池：由服务方线下生成插入（客户端无权直接读这张表）
create table if not exists licenses (
  code        text primary key,
  plan        text not null default 'yearly',   -- yearly | lifetime
  duration_days int,                            -- yearly 用；lifetime 为 null
  bound_user  uuid null,                        -- 绑定后写入；null=未使用
  bound_at    timestamptz null,
  note        text,
  created_at  timestamptz not null default now()
);
alter table licenses enable row level security;

-- 2) 用户权益表：每用户一行（RLS 只能读自己的行）
create table if not exists pro_entitlements (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  plan       text not null default 'yearly',
  expires_at timestamptz null,                  -- lifetime 为 null（永久）
  code       text,
  updated_at timestamptz not null default now()
);
alter table pro_entitlements enable row level security;
drop policy if exists "read own entitlement" on pro_entitlements;
create policy "read own entitlement" on pro_entitlements
  for select using (auth.uid() = user_id);

-- 3) 兑换：校验码 → 绑定当前用户 → 写权益（SECURITY DEFINER，事务内完成）
create or replace function redeem_license(p_code text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_row licenses;
  v_exp timestamptz;
begin
  if auth.uid() is null then raise exception '未登录'; end if;
  select * into v_row from licenses where code = upper(trim(p_code));
  if not found then raise exception '兑换码不存在'; end if;
  if v_row.bound_user is not null and v_row.bound_user <> auth.uid() then
    raise exception '兑换码已被使用';
  end if;
  update licenses set bound_user = auth.uid(), bound_at = now()
    where code = v_row.code;
  if v_row.plan = 'lifetime' then
    v_exp := null;
  else
    -- 已有权益在续费：从当前到期日顺延（未过期）或从现在起算（已过期/首次）
    select expires_at into v_exp from pro_entitlements where user_id = auth.uid();
    v_exp := greatest(coalesce(v_exp, now()), now()) + make_interval(days => coalesce(v_row.duration_days, 365));
  end if;
  insert into pro_entitlements (user_id, plan, expires_at, code, updated_at)
    values (auth.uid(), v_row.plan, v_exp, v_row.code, now())
    on conflict (user_id) do update set plan = excluded.plan, expires_at = excluded.expires_at,
      code = excluded.code, updated_at = now();
  return v_exp;
end; $$;

-- 4) 生成兑换码的辅助函数（调用示例：select gen_license('yearly', 365, '首批用户');）
create or replace function gen_license(p_plan text, p_days int, p_note text default null)
returns text language plpgsql as $$
declare v_code text;
begin
  v_code := 'SHARK-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' || substr(md5(random()::text), 1, 4));
  insert into licenses (code, plan, duration_days, note) values (v_code, p_plan, p_days, p_note);
  return v_code;
end; $$;

-- 5) 固定测试码（自测用；正式运营前删除：
--    delete from licenses where code like 'SHARK-TEST-%'; ）
insert into licenses (code, plan, duration_days, note) values
  ('SHARK-TEST-2026', 'yearly', 365, '测试年卡'),
  ('SHARK-TEST-LIFETIME', 'lifetime', null, '测试永久')
on conflict (code) do nothing;

-- 6) 照片云同步：Storage 私有桶 + 按用户目录隔离（路径 photos/<uid>/<photoId>）
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
  on conflict (id) do nothing;
drop policy if exists "own photo folder" on storage.objects;
create policy "own photo folder" on storage.objects for all
  using (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- Ejecutá esto en Supabase → SQL Editor (una vez).
-- La app usa solo la clave anon desde el navegador (sin backend propio).

create table if not exists public.visitas_imprevisto (
  area_name text not null,
  file_name text not null,
  visitas integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (area_name, file_name)
);

alter table public.visitas_imprevisto enable row level security;

-- Políticas abiertas: adecuado solo para uso interno; con la anon key cualquiera con la URL puede leer/escribir.
drop policy if exists "visitas_select" on public.visitas_imprevisto;
drop policy if exists "visitas_insert" on public.visitas_imprevisto;
drop policy if exists "visitas_update" on public.visitas_imprevisto;

create policy "visitas_select" on public.visitas_imprevisto for select using (true);
create policy "visitas_insert" on public.visitas_imprevisto for insert with check (true);
create policy "visitas_update" on public.visitas_imprevisto for update using (true) with check (true);

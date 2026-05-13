import type { SupabaseClient } from "@supabase/supabase-js";
import { weekStartMondayISO } from "./week";

export type SemanalRow = {
  area_name: string;
  file_name: string;
  week_start: string;
  visitas: number;
};

export type ManifestLike = {
  areas: { id?: string; nombre: string; personas: { nombre: string; file: string }[] }[];
};

export async function fetchAllSemanalRows(supabase: SupabaseClient): Promise<SemanalRow[]> {
  const pageSize = 1000;
  let from = 0;
  const all: SemanalRow[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("visitas_imprevisto_semanal")
      .select("area_name, file_name, week_start, visitas")
      .order("area_name", { ascending: true })
      .order("file_name", { ascending: true })
      .order("week_start", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      all.push({
        area_name: row.area_name as string,
        file_name: row.file_name as string,
        week_start: String(row.week_start),
        visitas: Number(row.visitas) || 0,
      });
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/** Suma `delta` al contador de la semana calendario actual (lunes Argentina en curso). */
export async function incrementVisitaSemanaActual(
  supabase: SupabaseClient,
  areaNombre: string,
  fileName: string,
  delta: number,
): Promise<void> {
  const weekStart = weekStartMondayISO();
  const { data, error } = await supabase
    .from("visitas_imprevisto_semanal")
    .select("visitas")
    .eq("area_name", areaNombre)
    .eq("file_name", fileName)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  const cur = typeof data?.visitas === "number" ? data.visitas : 0;
  const next = Math.max(0, cur + delta);
  const { error: upErr } = await supabase.from("visitas_imprevisto_semanal").upsert(
    {
      area_name: areaNombre,
      file_name: fileName,
      week_start: weekStart,
      visitas: next,
    },
    { onConflict: "area_name,file_name,week_start" },
  );
  if (upErr) throw upErr;
}

export function personaNombreEnManifest(manifest: ManifestLike, area: string, file: string): string {
  const a = manifest.areas.find((x) => x.nombre === area);
  return a?.personas.find((p) => p.file === file)?.nombre ?? file;
}

export function areaIdPorNombre(manifest: ManifestLike, areaNombre: string): string | undefined {
  return manifest.areas.find((a) => a.nombre === areaNombre)?.id;
}

/** Suma todas las semanas por (área, archivo) y devuelve los N mayores. */
export function topPersonasPorVisitasTotales(
  rows: SemanalRow[],
  manifest: ManifestLike,
  limite: number,
): {
  rank: number;
  nombre: string;
  areaNombre: string;
  areaId: string | undefined;
  file: string;
  total: number;
}[] {
  const sums = new Map<string, { areaNombre: string; file: string; total: number }>();
  for (const r of rows) {
    const k = `${r.area_name}\0${r.file_name}`;
    const cur = sums.get(k) ?? { areaNombre: r.area_name, file: r.file_name, total: 0 };
    cur.total += r.visitas;
    sums.set(k, cur);
  }
  const sorted = [...sums.values()].sort((a, b) => b.total - a.total).slice(0, limite);
  return sorted.map((item, i) => ({
    rank: i + 1,
    nombre: personaNombreEnManifest(manifest, item.areaNombre, item.file),
    areaNombre: item.areaNombre,
    areaId: areaIdPorNombre(manifest, item.areaNombre),
    file: item.file,
    total: item.total,
  }));
}

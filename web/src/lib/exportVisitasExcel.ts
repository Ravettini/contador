import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllSemanalRows, personaNombreEnManifest, type ManifestLike } from "./semanalData";

export type ManifestForExport = ManifestLike;

/**
 * Excel: detalle por semana, resumen por área (histórico), totales por semana calendario.
 */
export async function exportVisitasToExcel(
  manifest: ManifestForExport,
  supabase: SupabaseClient | null
): Promise<void> {
  const semanal = supabase ? await fetchAllSemanalRows(supabase) : [];

  const detalle: Record<string, string | number>[] = semanal.map((r) => ({
    Área: r.area_name,
    Persona: personaNombreEnManifest(manifest, r.area_name, r.file_name),
    "Archivo foto": r.file_name,
    "Semana (inicio lunes)": r.week_start,
    "Visitas (esa semana)": r.visitas,
  }));
  detalle.sort((a, b) => {
    const w = String(b["Semana (inicio lunes)"]).localeCompare(String(a["Semana (inicio lunes)"]));
    if (w !== 0) return w;
    const c = String(a["Área"]).localeCompare(String(b["Área"]), "es");
    if (c !== 0) return c;
    return String(a["Persona"]).localeCompare(String(b["Persona"]), "es");
  });

  const porArea = new Map<string, number>();
  for (const r of semanal) {
    porArea.set(r.area_name, (porArea.get(r.area_name) ?? 0) + r.visitas);
  }
  const resumenArea: Record<string, string | number>[] = [...porArea.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "es"))
    .map(([nombre, total]) => ({
      Área: nombre,
      "Total visitas (todas las semanas)": total,
    }));

  const porSemana = new Map<string, number>();
  for (const r of semanal) {
    porSemana.set(r.week_start, (porSemana.get(r.week_start) ?? 0) + r.visitas);
  }
  const resumenSemana: Record<string, string | number>[] = [...porSemana.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([week, total]) => ({
      "Semana (lunes)": week,
      "Total visitas (suma todas las áreas y personas)": total,
    }));

  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), "Detalle por semana");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenArea), "Resumen por área");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenSemana), "Totales por semana");

  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fname = `visitas-imprevisto-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`;
  XLSX.writeFile(wb, fname);
}

import type { SupabaseClient } from "@supabase/supabase-js";

export type ManifestForExport = {
  areas: { nombre: string; personas: { nombre: string; file: string }[] }[];
};

async function fetchAllVisitas(supabase: SupabaseClient) {
  const pageSize = 1000;
  let from = 0;
  const all: { area_name: string; file_name: string; visitas: number }[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("visitas_imprevisto")
      .select("area_name, file_name, visitas")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      all.push({
        area_name: row.area_name as string,
        file_name: row.file_name as string,
        visitas: Number(row.visitas) || 0,
      });
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function keyAreaFile(area: string, file: string) {
  return `${area}\0${file}`;
}

/**
 * Genera un .xlsx: hoja detalle (área, persona, archivo, visitas) y resumen por área.
 */
export async function exportVisitasToExcel(
  manifest: ManifestForExport,
  supabase: SupabaseClient | null
): Promise<void> {
  const visitMap = new Map<string, number>();
  if (supabase) {
    const rows = await fetchAllVisitas(supabase);
    for (const r of rows) {
      visitMap.set(keyAreaFile(r.area_name, r.file_name), r.visitas);
    }
  }

  const detalle: Record<string, string | number>[] = [];
  for (const area of manifest.areas) {
    for (const p of area.personas) {
      detalle.push({
        Área: area.nombre,
        Persona: p.nombre,
        "Archivo foto": p.file,
        "Visitas (imprevisto)": visitMap.get(keyAreaFile(area.nombre, p.file)) ?? 0,
      });
    }
  }
  detalle.sort((a, b) => {
    const c = String(a["Área"]).localeCompare(String(b["Área"]), "es");
    if (c !== 0) return c;
    return String(a["Persona"]).localeCompare(String(b["Persona"]), "es");
  });

  const porArea = new Map<string, { total: number; conVisita: number }>();
  for (const r of detalle) {
    const nombre = String(r["Área"]);
    const v = Number(r["Visitas (imprevisto)"]);
    if (!porArea.has(nombre)) porArea.set(nombre, { total: 0, conVisita: 0 });
    const t = porArea.get(nombre)!;
    t.total += v;
    if (v > 0) t.conVisita += 1;
  }
  const resumen: Record<string, string | number>[] = [...porArea.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "es"))
    .map(([nombre, { total, conVisita }]) => ({
      Área: nombre,
      "Total visitas (imprevisto)": total,
      "Personas con al menos 1 visita": conVisita,
    }));

  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), "Detalle");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen por área");

  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fname = `visitas-imprevisto-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`;
  XLSX.writeFile(wb, fname);
}

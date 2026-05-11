import { DateTime } from "luxon";

/** Zona horaria para definir “semana” (lunes 00:00 a domingo 23:59:59). */
export const APP_TZ = "America/Argentina/Buenos_Aires";

/** Fecha del lunes que inicia la semana ISO que contiene “ahora” en APP_TZ, como YYYY-MM-DD. */
export function weekStartMondayISO(now?: DateTime): string {
  const z = (now ?? DateTime.now()).setZone(APP_TZ).startOf("day");
  const monday = z.minus({ days: z.weekday - 1 });
  return monday.toISODate()!;
}

/** Texto legible: “Lun dd/mm/aaaa a dom dd/mm/aaaa”. */
export function formatWeekRangeEs(weekMondayISO: string): string {
  const mon = DateTime.fromISO(weekMondayISO, { zone: APP_TZ }).startOf("day");
  const sun = mon.plus({ days: 6 });
  return `Lun ${mon.toFormat("dd/MM/yyyy")} a dom ${sun.toFormat("dd/MM/yyyy")}`;
}

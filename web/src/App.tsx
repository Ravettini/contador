import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { exportVisitasToExcel } from "./lib/exportVisitasExcel";
import { fetchAllSemanalRows, topPersonasPorVisitasTotales } from "./lib/semanalData";
import { getSupabase } from "./lib/supabase";
import { formatWeekRangeEs, weekStartMondayISO } from "./lib/week";

type Persona = { file: string; nombre: string };
type Area = { id: string; nombre: string; personas: Persona[] };
type Manifest = { areas: Area[] };

function assetUrl(...parts: string[]): string {
  const b = import.meta.env.BASE_URL;
  const root = b.endsWith("/") ? b : `${b}/`;
  const path = parts.map((p) => p.replace(/^\/+|\/+$/g, "")).join("/");
  return `${root}${path}`;
}

function imageUrl(areaNombre: string, file: string): string {
  const seg = [areaNombre, file].map(encodeURIComponent).join("/");
  return assetUrl(`imagenes_comprimidas/${seg}`);
}

type TopEntry = {
  rank: number;
  nombre: string;
  areaNombre: string;
  areaId: string | undefined;
  file: string;
  total: number;
};

function Home({ manifest }: { manifest: Manifest | null }) {
  const [exporting, setExporting] = useState(false);
  const [top5, setTop5] = useState<TopEntry[] | null>(null);
  const [topLoading, setTopLoading] = useState(false);
  const [topErr, setTopErr] = useState<string | null>(null);

  useEffect(() => {
    if (!manifest?.areas.length) return;
    const sb = getSupabase();
    if (!sb) {
      setTop5(null);
      setTopErr(null);
      return;
    }
    setTopLoading(true);
    setTopErr(null);
    fetchAllSemanalRows(sb)
      .then((rows) => setTop5(topPersonasPorVisitasTotales(rows, manifest, 5)))
      .catch((e: unknown) => {
        setTop5(null);
        setTopErr(e instanceof Error ? e.message : "No se pudo cargar el ranking.");
      })
      .finally(() => setTopLoading(false));
  }, [manifest]);

  if (manifest === null) {
    return (
      <div className="wrap">
        <p className="muted">Cargando…</p>
      </div>
    );
  }
  if (!manifest.areas.length) {
    return (
      <div className="wrap">
        <p className="muted">
          No hay áreas. El build debe ver la carpeta <code>imagenes_comprimidas</code> al lado de{" "}
          <code>web</code> (o configurá el proyecto en Vercel con la raíz del repo completo).
        </p>
      </div>
    );
  }

  async function handleExportExcel() {
    setExporting(true);
    try {
      await exportVisitasToExcel(manifest, getSupabase());
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo generar el Excel.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="wrap">
      <div className="toolbar-row">
        <h1>Áreas</h1>
        <button type="button" className="btn-export" disabled={exporting} onClick={() => void handleExportExcel()}>
          {exporting ? "Generando…" : "Exportar Excel"}
        </button>
      </div>
      <p className="export-hint muted">
        Descarga un .xlsx con el histórico por semana (lunes a domingo, hora Argentina), resumen por área y
        totales por semana.
        {!getSupabase() ? " Sin Supabase el archivo sale vacío de conteos." : ""}
      </p>
      <ul className="grid">
        {manifest.areas.map((a) => (
          <li key={a.id}>
            <Link className="card" to={`/area/${a.id}`}>
              {a.nombre}
            </Link>
          </li>
        ))}
      </ul>

      <section className="top5-section" aria-labelledby="top5-title">
        <h2 id="top5-title">Top 5 — más pedidos (visitas de improvisto)</h2>
        <p className="top5-sub muted">
          Total acumulado en todas las semanas. Tocá el nombre para abrir el área de esa persona.
        </p>
        {!getSupabase() ? (
          <p className="muted">Conectá Supabase para ver el ranking.</p>
        ) : topLoading ? (
          <p className="muted">Cargando ranking…</p>
        ) : topErr ? (
          <p className="banner">{topErr}</p>
        ) : !top5?.length ? (
          <p className="muted">Todavía no hay visitas registradas.</p>
        ) : (
          <ol className="top5-list">
            {top5.map((row) => (
              <li key={`${row.areaNombre}\0${row.file}`} className="top5-item">
                <span className="top5-rank">{row.rank}</span>
                <div className="top5-body">
                  {row.areaId ? (
                    <Link className="top5-name" to={`/area/${row.areaId}`}>
                      {row.nombre}
                    </Link>
                  ) : (
                    <span className="top5-name">{row.nombre}</span>
                  )}
                  <span className="top5-area">{row.areaNombre}</span>
                </div>
                <span className="top5-count">{row.total}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function AreaView({ manifest }: { manifest: Manifest | null }) {
  const { id } = useParams<{ id: string }>();
  const area = useMemo(
    () => manifest?.areas.find((x) => x.id === id) ?? null,
    [manifest, id],
  );

  const [modal, setModal] = useState<Persona | null>(null);

  if (manifest === null) {
    return (
      <div className="wrap">
        <p className="muted">Cargando…</p>
      </div>
    );
  }
  if (!area) {
    return (
      <div className="wrap">
        <p className="muted">Área no encontrada.</p>
        <Link className="back" to="/">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <Link className="back" to="/">
          ← Áreas
        </Link>
        <h1 style={{ margin: 0 }}>{area.nombre}</h1>
      </div>
      {!getSupabase() ? (
        <p className="banner">
          Agregá en Vercel <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> para
          que el contador se guarde en la nube.
        </p>
      ) : null}
      <div className="people">
        {area.personas.map((p) => (
          <button type="button" key={p.file} className="person" onClick={() => setModal(p)}>
            {p.nombre}
          </button>
        ))}
      </div>
      {modal ? (
        <VisitModal areaNombre={area.nombre} persona={modal} onClose={() => setModal(null)} />
      ) : null}
    </div>
  );
}

function VisitModal({
  areaNombre,
  persona,
  onClose,
}: {
  areaNombre: string;
  persona: Persona;
  onClose: () => void;
}) {
  const supabase = getSupabase();
  const weekStart = useMemo(() => weekStartMondayISO(), [areaNombre, persona.file]);
  const weekLabel = useMemo(() => formatWeekRangeEs(weekStart), [weekStart]);

  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    if (!supabase) {
      setCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("visitas_imprevisto_semanal")
      .select("visitas")
      .eq("area_name", areaNombre)
      .eq("file_name", persona.file)
      .eq("week_start", weekStart)
      .maybeSingle();
    if (error) setErr(error.message);
    setCount(typeof data?.visitas === "number" ? data.visitas : 0);
    setLoading(false);
  }, [supabase, areaNombre, persona.file, weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  async function persist(next: number) {
    if (!supabase) return;
    setSaving(true);
    setErr(null);
    const { error } = await supabase.from("visitas_imprevisto_semanal").upsert(
      {
        area_name: areaNombre,
        file_name: persona.file,
        week_start: weekStart,
        visitas: next,
      },
      { onConflict: "area_name,file_name,week_start" },
    );
    if (error) setErr(error.message);
    setSaving(false);
  }

  async function setAndSave(next: number) {
    const v = Math.max(0, next);
    setCount(v);
    if (supabase) await persist(v);
  }

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title">Visitas de improvisto</h2>
        <p className="muted" style={{ margin: "-0.35rem 0 0.5rem", fontSize: "0.88rem" }}>
          Semana calendario: {weekLabel}
        </p>
        <p className="muted" style={{ margin: "0 0 0.5rem", fontSize: "0.8rem" }}>
          El contador es solo de esta semana (cada lunes en Argentina arranca una nueva).
        </p>
        <img src={imageUrl(areaNombre, persona.file)} alt="" />
        <p style={{ margin: "0 0 0.75rem", fontWeight: 600 }}>{persona.nombre}</p>
        {!supabase ? (
          <p className="banner">Configurá Supabase en variables de entorno para guardar el contador.</p>
        ) : null}
        {err ? <p className="banner">{err}</p> : null}
        <div className="counter">
          <button
            type="button"
            disabled={loading || saving || count <= 0}
            onClick={() => void setAndSave(count - 1)}
          >
            −
          </button>
          <span>{loading ? "…" : count}</span>
          <button type="button" disabled={loading || saving} onClick={() => void setAndSave(count + 1)}>
            +
          </button>
        </div>
        <button type="button" className="close" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);

  useEffect(() => {
    fetch(assetUrl("manifest.json"))
      .then((r) => r.json() as Promise<Manifest>)
      .then(setManifest)
      .catch(() => setManifest({ areas: [] }));
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Home manifest={manifest} />} />
      <Route path="/area/:id" element={<AreaView manifest={manifest} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

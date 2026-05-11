import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { getSupabase } from "./lib/supabase";

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

function Home({ manifest }: { manifest: Manifest | null }) {
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
  return (
    <div className="wrap">
      <h1>Áreas</h1>
      <ul className="grid">
        {manifest.areas.map((a) => (
          <li key={a.id}>
            <Link className="card" to={`/area/${a.id}`}>
              {a.nombre}
            </Link>
          </li>
        ))}
      </ul>
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
      .from("visitas_imprevisto")
      .select("visitas")
      .eq("area_name", areaNombre)
      .eq("file_name", persona.file)
      .maybeSingle();
    if (error) setErr(error.message);
    setCount(typeof data?.visitas === "number" ? data.visitas : 0);
    setLoading(false);
  }, [supabase, areaNombre, persona.file]);

  useEffect(() => {
    void load();
  }, [load]);

  async function persist(next: number) {
    if (!supabase) return;
    setSaving(true);
    setErr(null);
    const { error } = await supabase.from("visitas_imprevisto").upsert(
      {
        area_name: areaNombre,
        file_name: persona.file,
        visitas: next,
      },
      { onConflict: "area_name,file_name" },
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

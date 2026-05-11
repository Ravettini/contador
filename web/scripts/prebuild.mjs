import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function areaId(nombre) {
  return crypto.createHash("sha256").update(nombre, "utf8").digest("base64url").slice(0, 22);
}

/** Clave estable por persona: ignora (1), (2), puntos finales raros, mayúsculas. */
function normalizePersonKey(stem) {
  let s = stem.trim().toLowerCase().replace(/\s+/g, " ");
  let prev;
  do {
    prev = s;
    s = s.replace(/\s*\(\d+\)\s*$/i, "").trim();
    s = s.replace(/\.+$/g, "").trim();
  } while (s !== prev);
  return s;
}

function stemHasNumericSuffix(stem) {
  return /\(\d+\)\s*$/i.test(stem.trim());
}

function rankFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return 0;
  if (ext === ".png" || ext === ".gif" || ext === ".webp") return 1;
  if (ext === ".dng") return 3;
  return 2;
}

/** Entre variantes de la misma persona, una sola archivo. */
function pickRepresentative(candidates) {
  const sorted = [...candidates].sort((a, b) => {
    const ra = rankFile(a.file);
    const rb = rankFile(b.file);
    if (ra !== rb) return ra - rb;
    const sa = stemHasNumericSuffix(a.nombre) ? 1 : 0;
    const sb = stemHasNumericSuffix(b.nombre) ? 1 : 0;
    if (sa !== sb) return sa - sb;
    if (a.file.length !== b.file.length) return a.file.length - b.file.length;
    return a.file.localeCompare(b.file, "es");
  });
  return sorted[0];
}

function displayNombreFromStem(stem) {
  let s = stem.trim().replace(/\s+/g, " ");
  let prev;
  do {
    prev = s;
    s = s.replace(/\s*\(\d+\)\s*$/i, "").trim();
    s = s.replace(/\.+$/g, "").trim();
  } while (s !== prev);
  return s;
}

function dedupePersonas(raw) {
  const groups = new Map();
  for (const p of raw) {
    const key = normalizePersonKey(p.nombre);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const out = [];
  for (const list of groups.values()) {
    const best = pickRepresentative(list);
    out.push({
      file: best.file,
      nombre: displayNombreFromStem(best.nombre),
    });
  }
  out.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return out;
}

function pruneAreaImages(destAreaDir, keepFiles) {
  if (!fs.existsSync(destAreaDir)) return;
  const keep = new Set(keepFiles);
  for (const name of fs.readdirSync(destAreaDir)) {
    const fp = path.join(destAreaDir, name);
    if (!fs.statSync(fp).isFile()) continue;
    if (!IMG.test(name)) continue;
    if (!keep.has(name)) fs.unlinkSync(fp);
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const repoRoot = path.join(webRoot, "..");
const srcDir = path.join(repoRoot, "imagenes_comprimidas");
const publicDir = path.join(webRoot, "public");
const destDir = path.join(publicDir, "imagenes_comprimidas");
const manifestPath = path.join(publicDir, "manifest.json");

const IMG = /\.(jpe?g|png|gif|webp|JPG|JPEG|PNG|dng|DNG)$/i;

function copyRecursive(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const fp = path.join(from, ent.name);
    const tp = path.join(to, ent.name);
    if (ent.isDirectory()) copyRecursive(fp, tp);
    else fs.copyFileSync(fp, tp);
  }
}

function writeEmptyManifest() {
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({ areas: [] }, null, 2));
}

if (!fs.existsSync(srcDir)) {
  const msg =
    "No se encontró ../imagenes_comprimidas (debe estar al mismo nivel que la carpeta web).";
  if (process.env.VERCEL) {
    console.error(msg);
    console.error(
      "En Vercel: importá el repo completo (carpeta padre con web + imagenes_comprimidas) y como Root Directory dejá vacío o la raíz del repo; Build: cd web && npm ci && npm run build; Output: web/dist."
    );
    process.exit(1);
  }
  console.warn(msg + " manifest vacío.");
  writeEmptyManifest();
  process.exit(0);
}

copyRecursive(srcDir, destDir);

const areas = [];
for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue;
  const nombre = ent.name;
  const dir = path.join(srcDir, nombre);
  const raw = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!f.isFile()) continue;
    if (!IMG.test(f.name)) continue;
    const file = f.name;
    const base = path.basename(file, path.extname(file));
    raw.push({ file, nombre: base });
  }
  const personas = dedupePersonas(raw);
  pruneAreaImages(path.join(destDir, nombre), personas.map((p) => p.file));
  areas.push({ id: areaId(nombre), nombre, personas });
}
areas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify({ areas }, null, 2));
const total = areas.reduce((n, a) => n + a.personas.length, 0);
console.log("OK prebuild:", areas.length, "áreas,", total, "personas (dedupe), public/imagenes_comprimidas depurado");

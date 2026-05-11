import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function areaId(nombre) {
  return crypto.createHash("sha256").update(nombre, "utf8").digest("base64url").slice(0, 22);
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
  const personas = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!f.isFile()) continue;
    if (!IMG.test(f.name)) continue;
    const file = f.name;
    const base = path.basename(file, path.extname(file));
    personas.push({ file, nombre: base });
  }
  personas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  areas.push({ id: areaId(nombre), nombre, personas });
}
areas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify({ areas }, null, 2));
console.log("OK prebuild:", areas.length, "áreas, imágenes en public/imagenes_comprimidas");

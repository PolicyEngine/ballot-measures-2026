// Cut one boundary file per state that shows district results (Colorado)
// from the national 119th Congress file, so the districts tab loads only
// its state's shapes:
//   node scripts/cut-district-boundaries.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const geoDir = path.join(root, 'public', 'data', 'geojson');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'measures.json'), 'utf8'));
const national = JSON.parse(fs.readFileSync(path.join(geoDir, 'congressional_districts.geojson'), 'utf8'));

const states = new Map(
  registry.measures.filter((m) => m.show_districts).map((m) => [m.state, String(m.state_fips).padStart(2, '0')]),
);
for (const [code, fips] of states) {
  const features = national.features.filter((f) => {
    const p = f.properties ?? {};
    return p.STATEFP === fips || p.STATEAB === code || String(p.DISTRICT_ID ?? '').startsWith(`${code}-`);
  });
  if (features.length === 0) throw new Error(`No ${code} districts in the national file`);
  const out = path.join(geoDir, `${code.toLowerCase()}_districts.json`);
  fs.writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }));
  console.log(`Wrote ${features.length} ${code} districts to ${path.relative(root, out)} (${fs.statSync(out).size} bytes)`);
}

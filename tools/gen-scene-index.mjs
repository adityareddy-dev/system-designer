// Indexes original scene drawings using the shared palette in both themes.
import fs from 'node:fs';
const tokens = { '#F5F2E9': '--bg', '#FFFEFA': '--surface-solid', '#FFFFFF': '--surface-solid', '#182F40': '--text', '#526575': '--text-2', '#405868': '--text-2', '#C7D1D0': '--border', '#657A87': '--edge-idle', '#244ED8': '--accent', '#006E68': '--cat-compute', '#865400': '--cat-data', '#4051A1': '--cat-edge', '#24643F': '--ok', '#B42C37': '--bad', '#875500': '--warn' };
const scenes = {};
for (const name of fs.readdirSync('assets/scenes').filter(n => n.endsWith('.svg'))) {
  let svg = fs.readFileSync('assets/scenes/' + name, 'utf8');
  svg = svg.replace(/#[0-9a-f]{6}/gi, hex => tokens[hex.toUpperCase()] ? `var(${tokens[hex.toUpperCase()]})` : hex);
  scenes[name.slice(0,-4)] = svg;
}
fs.writeFileSync('assets/scenes/index.js', '// Original concept diagrams, indexed by tools/gen-scene-index.mjs.\nconst scenes = ' + JSON.stringify(scenes) + ';\nexport const sceneMarkup = id => scenes[id] || scenes["shared-load"];\n');
console.log('Indexed ' + Object.keys(scenes).length + ' theme-aware concept drawings.');

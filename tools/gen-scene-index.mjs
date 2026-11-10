// Indexes original scene drawings using the shared palette in both themes.
import fs from 'node:fs';
const tokens = { '#EDF2F9': '--bg', '#F1F5FB': '--surface-solid', '#FFFFFF': '--surface-solid', '#1B2B45': '--text', '#4D607B': '--text-2', '#3D506E': '--text-2', '#C5D0E1': '--border', '#60738D': '--edge-idle', '#244ED8': '--accent', '#006E68': '--cat-compute', '#865400': '--cat-data', '#4051A1': '--cat-edge', '#24643F': '--ok', '#A92733': '--bad', '#875500': '--warn' };
const scenes = {};
for (const name of fs.readdirSync('assets/scenes').filter(n => n.endsWith('.svg'))) {
  let svg = fs.readFileSync('assets/scenes/' + name, 'utf8');
  svg = svg.replace(/#[0-9a-f]{6}/gi, hex => tokens[hex.toUpperCase()] ? `var(${tokens[hex.toUpperCase()]})` : hex);
  scenes[name.slice(0,-4)] = svg;
}
fs.writeFileSync('assets/scenes/index.js', '// Original concept diagrams, indexed by tools/gen-scene-index.mjs.\nconst scenes = ' + JSON.stringify(scenes) + ';\nexport const sceneMarkup = id => scenes[id] || scenes["shared-load"];\n');
console.log('Indexed ' + Object.keys(scenes).length + ' theme-aware concept drawings.');

// Indexes original scene drawings using the shared palette in both themes.
import fs from 'node:fs';
const tokens = { '#FFF4E0': '--paper', '#FFFCF4': '--card', '#141414': '--ink', '#FF5B3A': '--tomato', '#2D5BFF': '--blue', '#FFC93C': '--yellow', '#7FD9A8': '--mint', '#33312C': '--text-2', '#55514A': '--text-3', '#D9CFBB': '--border', '#0F6B49': '--accent-2', '#7A4B00': '--warn', '#B3261E': '--bad', '#17663A': '--ok', '#3B4FB8': '--cat-edge' };
const scenes = {};
for (const name of fs.readdirSync('assets/scenes').filter(n => n.endsWith('.svg'))) {
  let svg = fs.readFileSync('assets/scenes/' + name, 'utf8');
  svg = svg.replace(/#[0-9a-f]{6}/gi, hex => tokens[hex.toUpperCase()] ? `var(${tokens[hex.toUpperCase()]})` : hex);
  scenes[name.slice(0,-4)] = svg;
}
fs.writeFileSync('assets/scenes/index.js', '// Original concept diagrams, indexed by tools/gen-scene-index.mjs.\nconst scenes = ' + JSON.stringify(scenes) + ';\nexport const sceneMarkup = id => scenes[id] || scenes["shared-load"];\n');
console.log('Indexed ' + Object.keys(scenes).length + ' theme-aware concept drawings.');

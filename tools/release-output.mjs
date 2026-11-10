// Validate and prepare a dedicated release directory before removing any old output.
import fs from 'node:fs';
import path from 'node:path';

const marker = '.system-designer-release';
const markerText = 'System Designer release output\n';
const within = (parent, child) => child === parent || child.startsWith(parent + path.sep);
function canonical(file) {
  if (fs.existsSync(file)) return fs.realpathSync(file);
  return path.join(canonical(path.dirname(file)), path.basename(file));
}

export function releaseDirectory(root, output) {
  const source = fs.realpathSync(root);
  const requested = path.resolve(output);
  const dist = canonical(requested);
  if (dist === path.parse(dist).root || within(dist, source)
      || (within(source, dist) && dist !== path.join(source, 'dist'))) {
    throw new Error('Release output must be dist/ or a dedicated directory outside the checkout.');
  }
  if (fs.existsSync(requested) && (fs.lstatSync(requested).isSymbolicLink() || !fs.statSync(requested).isDirectory())) {
    throw new Error('Release output must be a directory, not a file or symbolic link.');
  }
  if (fs.existsSync(dist) && fs.readdirSync(dist).length) {
    const file = path.join(dist, marker);
    if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink() || fs.readFileSync(file, 'utf8') !== markerText) {
      throw new Error('Release output is not empty or marked as a dedicated release directory.');
    }
  }
  return dist;
}

export function prepareReleaseDirectory(root, output) {
  const dist = releaseDirectory(root, output);
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, marker), markerText);
  return dist;
}

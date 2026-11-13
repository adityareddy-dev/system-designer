// Canvas-only trial. Mode is part of the key so a daily URL-shortener stays unchanged.
export function canvasLook(mode, problem) {
  return mode === 'practice' && problem?.id === 'url-shortener' ? 'paper' : 'classic';
}

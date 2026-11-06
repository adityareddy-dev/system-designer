// Scoped lesson figure styles, also carried by the optional release bundle.
export const styles = `/* Lesson instruments on the game's drafting paper. */
.fg-bench {margin:0;display:grid;gap:14px;min-width:0}
.fg-drawing {display:block;width:100%;max-width:600px;max-height:300px;margin:auto;color:var(--text);background-color:var(--canvas);background-image:radial-gradient(var(--border-strong) .7px,transparent .7px);background-size:16px 16px;border:1px solid var(--border-strong);border-radius:6px;font:17px var(--font-ui, sans-serif)}
.fg-drawing text {fill:var(--text);stroke:none}
.fg-drawing .fg-small {font-size:14px;fill:var(--text-2)}
.fg-box rect {fill:var(--surface-solid);stroke:var(--text-3);stroke-width:1.5}
.fg-box.is-good rect {stroke:var(--ok);fill:color-mix(in srgb,var(--ok) 8%,var(--surface-solid))}
.fg-box.is-bad rect {stroke:var(--bad);stroke-dasharray:5 3}
.fg-wire {fill:none;stroke:var(--text-3);stroke-width:1.5;stroke-linecap:round}
.fg-mark circle,.fg-bar {fill:var(--accent);stroke:var(--canvas);stroke-width:1}
.fg-mark.is-bad circle,.fg-bar.is-bad {fill:var(--bad)}
.fg-mark.is-good circle,.fg-bar.is-good {fill:var(--ok)}
.fg-ring {fill:none;stroke:var(--border-strong);stroke-width:2}
.fg-stats {display:flex;flex-wrap:wrap;gap:8px 20px;font-size:14px;color:var(--text-2)}
.fg-stats strong {font:20px var(--font-mono);color:var(--text)}
.fg-caption {font-size:16px;line-height:1.45;min-height:46px;border-left:3px solid var(--accent);padding-left:12px}
.fg-controls {display:flex;align-items:end;flex-wrap:wrap;gap:10px}
.fg-control {display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:14px;max-width:100%;min-width:0}
.fg-control:has(select),.fg-control:has(input[type=range]) {display:grid;grid-template-columns:minmax(0,1fr) auto;flex:1 1 150px}
.fg-control>span {grid-column:1/-1;color:var(--text-2)}
.fg-control select {grid-column:1/-1;width:100%;min-width:0;height:44px;color:var(--text);background:var(--surface-solid);border:1px solid var(--border-strong);border-radius:4px;padding:6px;font:inherit}
.fg-control input[type=range] {width:100%;min-width:90px;min-height:44px;accent-color:var(--accent)}
.fg-control input[type=checkbox] {width:24px;height:24px;accent-color:var(--accent)}
.fg-control:has(input[type=checkbox]) {min-height:44px;flex-direction:row-reverse;justify-content:end}
.fg-control .sh-btn {min-height:44px;white-space:normal;text-align:left}
.fg-control output {font:14px var(--font-mono)}
.fg-motion {justify-self:start;min-height:44px}
.fg-note {margin:0;font-size:13px;line-height:1.45;color:var(--text-2)}
.sh-lp-card:has(.fg-bench) {gap:14px}
.sh-lp-card:has(.fg-bench)>.sh-lp-text {font-size:15px}
@media(max-width:719px) {.sh-lp-card:has(.fg-bench){padding:16px;min-width:0}.fg-drawing{max-height:none}.fg-stats{gap:6px 14px}.fg-stats strong{font-size:18px}.fg-controls{gap:8px}.fg-control{flex:1 1 auto}.fg-control:has(select),.fg-control:has(input[type=range]){flex-basis:120px}.fg-caption{min-height:0}.fg-note{font-size:12px}}
@media(prefers-reduced-motion:reduce){.fg-bench *{scroll-behavior:auto}}

.fg-bench[data-motion=reduce] * {transition:none;animation:none}

.fg-bench .fg-control[hidden]{display:none}
.fg-mark.fg-owner-0 circle{fill:var(--cat-edge)}
.fg-mark.fg-owner-1 circle{fill:var(--cat-compute)}
.fg-mark.fg-owner-2 circle{fill:var(--cat-data)}
.fg-mark.fg-owner-3 circle{fill:var(--cat-messaging)}
.fg-mark.fg-owner-4 circle{fill:var(--cat-platform)}
.fg-mark.fg-owner-5 circle{fill:var(--cat-ops)}`;

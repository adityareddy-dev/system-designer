// Scoped lesson figure styles, also carried by the optional release bundle.
export const styles = `/* Lesson instruments: cream cards, ink outlines, hard shadows, flat fills. */
.fg-bench {margin:0;display:grid;gap:14px;min-width:0}
.fg-drawing {display:block;width:100%;max-width:600px;max-height:300px;margin:auto;color:var(--ink);background-color:var(--card);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Ccircle cx='8' cy='8' r='1' fill='%23141414' fill-opacity='.2'/%3E%3C/svg%3E");background-size:16px 16px;border:2px solid var(--ink);border-radius:8px;box-shadow:var(--hard);font:17px var(--font-ui, sans-serif)}
.fg-drawing text {fill:var(--ink);stroke:none}
.fg-drawing .fg-small {font:14px var(--font-mono, monospace);fill:var(--text-2)}
.fg-sh {fill:var(--ink);stroke:none}
.fg-box rect:not(.fg-sh) {fill:var(--card);stroke:var(--ink);stroke-width:2.5}
.fg-box.is-good rect:not(.fg-sh) {fill:var(--mint)}
.fg-box.is-bad rect:not(.fg-sh) {fill:var(--tomato);stroke-dasharray:6 3}
.fg-wire {fill:none;stroke:var(--ink);stroke-width:2.5;stroke-linecap:butt;stroke-linejoin:miter}
.fg-mark circle,.fg-bar {fill:var(--blue);stroke:var(--ink);stroke-width:2}
.fg-mark.is-bad circle,.fg-bar.is-bad {fill:var(--tomato)}
.fg-mark.is-good circle,.fg-bar.is-good {fill:var(--mint)}
.fg-ring {fill:none;stroke:var(--ink);stroke-width:2.5}
.fg-stats {display:flex;flex-wrap:wrap;gap:8px 20px;font-size:14px;color:var(--text-2)}
.fg-stats strong {font:700 20px var(--font-mono);color:var(--ink)}
.fg-caption {font-size:16px;line-height:1.45;min-height:46px;background:var(--card);border:2px solid var(--ink);border-radius:6px;box-shadow:var(--shadow-1);padding:8px 12px}
.fg-controls {display:flex;align-items:end;flex-wrap:wrap;gap:10px}
.fg-control {display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:14px;max-width:100%;min-width:0}
.fg-control:has(select),.fg-control:has(input[type=range]) {display:grid;grid-template-columns:minmax(0,1fr) auto;flex:1 1 150px}
.fg-control>span {grid-column:1/-1;color:var(--text-2)}
.fg-control select {grid-column:1/-1;width:100%;min-width:0;height:44px;color:var(--ink);background:var(--card);border:2px solid var(--ink);border-radius:6px;padding:6px;font:inherit}
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
.fg-mark.fg-owner-0 circle{fill:#BFD0FF}
.fg-mark.fg-owner-1 circle{fill:var(--mint)}
.fg-mark.fg-owner-2 circle{fill:var(--yellow)}
.fg-mark.fg-owner-3 circle{fill:#F4B6C8}
.fg-mark.fg-owner-4 circle{fill:#CFC4F5}
.fg-mark.fg-owner-5 circle{fill:#BDEBD3}`;

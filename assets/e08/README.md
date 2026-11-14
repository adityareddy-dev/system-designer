# e08 canvas assets

The selected e08 set supplies these SVGs. The geometry and category/state colours come from its `_lib.js` and `_css.css`:

- `glyphs/`: the original 48 × 48 line glyph for each of the 99 parts.
- `bodies/`: the nine category silhouettes in ok, warn, hot, over and down states. The body viewport is the original `-12 -12 184 184`.
- `traffic/`: the original 19 traffic kinds in eight families.
- `manifest.js`: part/category and traffic metadata from the same set.

The live renderer draws the load bar and status mark separately, at their original body-space coordinates, using measured simulation values. It supplies the rejected rate above overloaded parts. Body and glyph images are rasterised into Pixi textures locally, without loading the asset presentation pages.

The source set's load-bar colour is read before its variable is assigned. The game uses the intended category colour, yellow warning, orange hot, red overload, or grey down instead. The load follows actual utilisation rather than the presentation pages' looping sample values.

On URL shortener, the canvas and dot grid follow the site's tokens. Normal bodies use `var(--card, #fffcf4)`, resolved from the site's card token before rasterisation. Glyph textures are tinted with the site's ink. The load track uses the border token and status outlines use ink. Static reference SVG images resolve those same tokens before display.

Down bodies use light grey `#e2e5e9` instead of the source's `#171f2d`. Their glyph uses the site's muted text token, and the crossed-out stroke uses `#64748b`. The category silhouettes, rims, top bands, warning/hot outlines and red overload hatch retain the source geometry and colours. Source glyph SVGs and traffic SVGs are unchanged. Editor chrome keeps its existing styling.

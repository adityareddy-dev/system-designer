# e08 canvas assets

The selected e08 set supplies these SVGs. The geometry and colours come directly from its `_lib.js` and `_css.css`:

- `glyphs/`: the original 48 × 48 line glyph for each of the 99 parts.
- `bodies/`: the nine category silhouettes in ok, warn, hot, over and down states. The body viewport is the original `-12 -12 184 184`.
- `traffic/`: the original 19 traffic kinds in eight families.
- `manifest.js`: part/category and traffic metadata from the same set.

The live renderer draws the load bar and status mark separately, at their original body-space coordinates, using measured simulation values. It supplies the rejected rate above overloaded parts. Body and glyph images are rasterised into Pixi textures locally, without loading the asset presentation pages.

The source set's load-bar colour is read before its variable is assigned. The game uses the intended category colour, yellow warning, orange hot, red overload, or grey down instead. The load follows actual utilisation rather than the presentation pages' looping sample values.

The p10 canvas uses `#0e1828` with `#1c2a3e` dots every 20 px. The rest of the page keeps the game's existing styling.

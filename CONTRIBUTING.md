# Contributing to System Designer

I welcome new problems and clearer lesson text. A fix to one sentence is useful too.

For a new problem, start with [the guide](docs/ADD_A_PROBLEM.md). You can also pick an issue labelled [good first issue](https://github.com/adityareddy-dev/system-designer/labels/good%20first%20issue).

## Run the site

The site uses plain HTML, CSS and JavaScript modules. Development needs no build step or package install.

```sh
git clone https://github.com/adityareddy-dev/system-designer
cd system-designer
python3 -m http.server 8000
```

Open http://localhost:8000/. Use a static server because browsers block module imports when you open `index.html` from disk.

Use Node 24 for the checks.

## Before a pull request

Run these from the repo folder:

```sh
node sim/selftest.mjs
node tests/content-run.mjs
node tests/content-refs.mjs
```

These check the engine, content and reference designs. There is no CI yet, so run them yourself before opening a pull request.

For a quicker check of one problem:

```sh
node tests/content-run.mjs url-shortener
node tests/content-refs.mjs url-shortener
```

`content-run` still checks the structure of the whole bank. Read its `issues` list as well as the reference design results.

After changing content, regenerate the data and the readable pages, then include what they wrote in your pull request:

```sh
node tools/gen-content.mjs
node tools/gen-site-pages.mjs
node tests/site-pages.mjs
```

Play the changed problem or lesson in the browser. Browser checks such as `tests/ui-checks.mjs` need `puppeteer-core` and Chrome. They start their own local server. Set `CHROME_PATH` if Chrome is not at `/usr/bin/google-chrome`.

## Writing content

- Use plain, short English. Address the player as "you" in a brief.
- Mark rounded real-world figures with "(approx.)". Keep the arithmetic visible.
- Use real company names only as a plain comparison in a problem's `like` line.
- Write original content. Do not copy problems or assets from other games, books or courses.

The [add-a-problem guide](docs/ADD_A_PROBLEM.md) covers registration, calibration and generated files. [DESIGN.md](DESIGN.md) describes the game. [CONTRACT.md](CONTRACT.md) records the module interfaces and content shapes.

For a wording fix, keep lesson steps in their existing order and preserve quiz answer indexes. Accessibility fixes and bug reports are welcome too. In a bug report, include the page and steps needed to repeat it.

## Sending a pull request

Keep each pull request to one problem or one topic. Say what changed and why. Use a short lowercase commit message with an area, such as `problems: add parking garage` or `lessons: simplify caching intro`.

If you want to change the traffic engine, canvas or scoring, open an issue first so I can review the effect on existing problems.

Contributions are released under the project's [MIT license](LICENSE).

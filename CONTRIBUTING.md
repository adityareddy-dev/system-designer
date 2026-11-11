# Contributing to System Designer

If you'd like to help with any of the problems or lesson text, I welcome fixes to any typos you find.

## Choose a task

Choose an issue labelled [good first issue](https://github.com/adityareddy-dev/system-designer/labels/good%20first%20issue), or select [Add a problem](docs/ADD_A_PROBLEM.md) for a template to write your content into.

## Running the site

Clone the repository and serve the folder. Since this is a static site, there is no need for a build process or package install for development.

```sh
git clone https://github.com/adityareddy-dev/system-designer
cd system-designer
python3 -m http.server 8000
```

Open http://localhost:8000/. Since opening `index.html` directly from disk blocks module imports, make sure the web server is running during development.

## Before a pull request

Use Node 24 for testing. From within the repository directory, run these commands:

```sh
node sim/selftest.mjs
node tests/content-run.mjs
node tests/content-refs.mjs
```

Although there is no CI set up yet, run these commands before creating a pull request to make sure all reference designs pass. You can also provide a specific problem id to test that problem individually:

```sh
node tests/content-run.mjs url-shortener
node tests/content-refs.mjs url-shortener
```

`content-run` evaluates the structure of all the problems in the bank. Its `issues` list should be empty upon completion.

After completing a content modification, run these commands and commit the newly created or modified files:

```sh
node tools/gen-content.mjs
node tools/gen-site-pages.mjs
node tests/site-pages.mjs
```

Play your changes in the browser. To run `tests/ui-checks.mjs`, you need both `puppeteer-core` and Chrome installed. This check starts its own local development server. If Chrome is not at `/usr/bin/google-chrome`, define its path with `CHROME_PATH`.

## Creating content

- Use clear, short English.
- Address players as "you" in problem briefs.
- Identify rounded real-world values with "(approx.)" and show the arithmetic.
- Only use real company names for comparisons in a problem's `like` line.
- Create original content. Never copy problems or assets from another game, book or course.

Refer to [DESIGN.md](DESIGN.md) for information about the game itself. Module interfaces and content shapes are documented in [CONTRACT.md](CONTRACT.md).

Always keep the step order and quiz answer indexes when revising lesson text. Accessibility improvements are welcome. Include the page along with steps to reproduce the error in any bug report.

## Pull requests

Keep a pull request to one problem or topic and say what changed and why. For commits, use an area and a short lowercase summary, like `problems: add parking garage` or `lessons: simplify caching intro`.

Before changing the traffic engine, canvas or scoring, open an issue so I can check the effect on existing problems.

Contributions are released under the project's [MIT license](LICENSE).

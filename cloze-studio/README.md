# Cloze Studio

**Turn a lesson text into a printable gap-fill worksheet.**

[راهنمای فارسی](README.fa.md) · [Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)

Cloze Studio is a small, dependency-free tool for language teachers. Paste a text, click the words to remove, and print a worksheet with an optional word bank and a separate answer key.

## What it does

- Select individual word occurrences, including repeated words.
- Keep the original punctuation and paragraph breaks.
- Work with English, Persian and mixed-script text, including Persian half-spaces.
- Switch the interface between English and Persian independently of worksheet labels.
- Add an alphabetized word bank, preserving duplicate answers.
- Generate a numbered answer key on a separate printed page.
- Print or save as PDF through the browser's print dialog.
- Use keyboard-accessible word buttons and a layout that adapts to small screens.

The application has no backend, account system, AI dependency, analytics or external font requests. Text is held in memory in your browser and is not uploaded by the application. Hosting providers may retain ordinary access logs for page requests. Refreshing or closing the page clears your work.

## Try it without installing anything

1. Download the repository ZIP and extract it.
2. Open `dist/index.html` inside this project folder in a modern browser.
3. Try the example, or paste your lesson text and choose the words you want to remove.
4. Open **Print preview**, then **Print / save PDF**.
5. Choose **Save as PDF** or a printer in the browser's dialog. For a clean worksheet, turn off the browser's own headers and footers.

The app opens in Persian. Use **English** in the top bar to change the interface. Changing **Worksheet language** changes printed labels; it does not translate the lesson text. Use **Load example** after choosing a worksheet language to load a sample in that language.

## A small example

Source: `Maya usually walks to the park.`

Choose: `usually` and `park`

Worksheet: `Maya (1) ______ walks to the (2) ______.`

Answer key: `1. usually` · `2. park`

## Development

The shipped application is ordinary HTML, CSS and JavaScript. No installation or build is required. Node.js 20 or newer is needed only to run the development checks:

```sh
npm test
npm run check
```

```text
dist/index.html   Accessible page structure
dist/styles.css   Responsive layout, RTL support and print styles
dist/core.js      Pure Unicode-aware tokenization and worksheet logic
dist/app.js       Browser UI and safe text rendering
tests/           Regression tests for worksheet logic
```

To host it, serve the contents of `dist/` from a static host. Relative asset paths allow hosting under a subdirectory. A local download also works without a server.

## Current limits

- Lesson text is limited to 12,000 characters; editing it clears selections because word positions change.
- Words are selected manually; there is no automatic question writing, translation or language-level assessment.
- Work is not saved between sessions.
- PDF output uses the browser's print facility. Pagination, margins and fonts depend on browser and printer settings.
- Automated checks cover the worksheet engine and JavaScript syntax. Cross-browser visual and print testing has not yet been performed.

## Feedback and contributions

If this tool saves preparation time, a GitHub star helps others discover it. Useful feedback is welcome too: describe the text, language, browser and result you expected. Please use short invented examples instead of learner names or private classroom records.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow. The original sample passages were written for this project. Code is provided under the [MIT license](LICENSE).

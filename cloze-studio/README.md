# Cloze Studio

**Your own worksheet, from questions to a branded printable handout.**

[راهنمای فارسی](README.fa.md) · [What's new in 1.1.0](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)

Cloze Studio is a dependency-free worksheet builder for language teachers. Combine five question types, add an institution or teacher name and logo, choose a page format, and print the complete worksheet with a separate answer key.

## Five question types, one worksheet

| Type | How to create it |
| --- | --- |
| Gap-fill | Paste a text and click individual words to remove. An optional alphabetized word bank preserves duplicate answers. |
| Multiple choice | Write a question and four distinct options, then select the correct answer. |
| True / false | Write each statement and mark its correct value. |
| Matching | Enter at least two prompt–answer pairs. The answer column prints in a stable, different order with letter labels. |
| Short answer | Write a question, a model answer and one to five lines of writing space. |

Switching question types preserves the other sections. Use **Include in worksheet** to exclude a section without deleting its questions. Active sections print in the order shown above, with continuous question numbers and a shared answer key. Incomplete questions must be completed or their section excluded before using the app's print button. A draft warning appears in the paper preview while included questions are incomplete.

The original English and Persian samples can be loaded into each section. Questions are teacher-authored; the app does not use AI to generate or verify them.

## Branding and paper

- Add an institution or teacher name to the worksheet and answer-key headers.
- Load a PNG, JPEG or WebP logo up to 2 MB and 16 megapixels. The browser prepares a copy for the header, with the longest edge limited to 640 pixels. Replace or remove it at any time.
- Choose A4, A5, US Letter or US Legal, in portrait or landscape. These settings update both the preview's shape and the print page-size rule.
- Set English or Persian worksheet labels independently of the interface language. The app supports RTL text and Persian half-spaces.
- Print or save as PDF through the browser. Check paper size, orientation and margins in the print dialog because browser or printer settings can override the app's request.

## Try it without installing anything

1. Download this repository as a ZIP and extract it.
2. Open `dist/index.html` inside this project folder in a modern browser.
3. Add your name or logo, set the paper format, and use the question-type cards to build your sections.
4. Select **Print preview**, then **Print / save PDF**.
5. Select **Save as PDF** or your printer. Disable the browser's own headers and footers for a clean worksheet.

The interface starts in Persian. Use **English** in the top bar to switch. Changing **Worksheet language** does not translate your questions; it changes worksheet labels and direction. Each section has examples in both languages.

## Privacy and session limits

The app has no backend, account system, analytics, remote fonts or API dependency. Lesson text, questions, the institution name and the logo stay in the browser's memory; the application does not upload them. The logo is decoded and prepared locally. Hosting providers may retain ordinary page-request access logs.

Refreshing or closing the page clears the current work, including the logo. Export your worksheet before leaving. The gap-fill text limit is 12,000 characters; editing it clears only the gap-fill word selections. Each other section supports up to 30 questions or pairs.

## Development

The application uses plain HTML, CSS and JavaScript. It needs no package installation or build. Node.js 20 or newer is needed only for checks:

```sh
node --test tests/core.test.cjs
node --check dist/core.js
node --check dist/content.js
node --check dist/app.js
```

The equivalent `npm test` and `npm run check` commands are available.

| File | Purpose |
| --- | --- |
| `dist/index.html` | Page structure and accessible controls |
| `dist/styles.css` | Responsive interface, RTL behavior and print layout |
| `dist/core.js` | Unicode tokenization, question validation, mixed numbering, matching and paper dimensions |
| `dist/content.js` | English/Persian labels, original examples and app version |
| `dist/app.js` | Editing controls, local logo handling and safe text rendering |
| `tests/core.test.cjs` | Sixteen regression tests covering worksheet logic |

To host the app, serve `dist/` from a static host. Relative assets support hosting in a subdirectory, and the downloaded app also opens directly without a server.

Automated checks cover the worksheet engine, example data, static references and JavaScript syntax. Cross-browser visual, logo-upload and physical printing checks have not yet been performed. Final pagination and available print options depend on the browser and printer.

## Feedback and contributions

If this saves preparation time, a GitHub star helps others discover it. When reporting a problem, include the question type, browser, interface language, worksheet language and paper size. Use invented questions instead of learner records.

See [CONTRIBUTING.md](CONTRIBUTING.md). Original sample passages and questions were written for this project. Code is provided under the [MIT license](LICENSE).

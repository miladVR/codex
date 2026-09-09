# Contributing

Cloze Studio focuses on a small classroom task: making reliable gap-fill worksheets from teacher-provided text.

## Report a problem

Open an issue with a short invented sample, reproduction steps, browser and operating system, and expected versus actual behavior. For layout or printing issues, include the interface language, worksheet language, paper size and a screenshot if available. Do not include real learner records.

## Make a change

1. Make a focused branch and keep changes small.
2. Keep the app usable by opening `dist/index.html` directly: avoid modules that require a server, external assets, network requests or unnecessary dependencies.
3. Insert teacher-provided text with DOM text nodes or `textContent`; never treat it as HTML.
4. Preserve English and Persian interface strings, keyboard navigation and RTL behavior.
5. Run `npm test` and `npm run check` from this folder. Add a regression test when fixing a worksheet-engine defect.
6. For interface changes, manually try both languages, a narrow viewport, keyboard use and print preview before opening a pull request.

The engine tests do not replace browser testing. Document any testing limits in your pull request.

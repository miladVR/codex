/* Cloze Studio's dependency-free worksheet engine. MIT License. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ClozeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function tokenize(text) {
    const source = String(text);
    const matcher = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\u200c-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu;
    const tokens = [];
    let cursor = 0;
    let index = 0;
    for (const match of source.matchAll(matcher)) {
      if (match.index > cursor) tokens.push({ text: source.slice(cursor, match.index), word: false });
      tokens.push({ text: match[0], word: true, index: index++ });
      cursor = match.index + match[0].length;
    }
    if (cursor < source.length) tokens.push({ text: source.slice(cursor), word: false });
    return tokens;
  }
  function worksheet(text, selected) {
    const indices = new Set(selected);
    const tokens = tokenize(text);
    const answers = [];
    const segments = tokens.map(token => {
      if (token.word && indices.has(token.index)) {
        const number = answers.length + 1;
        answers.push({ number, text: token.text, index: token.index });
        return { kind: 'gap', number, index: token.index };
      }
      return { kind: 'text', text: token.text };
    });
    return { segments, answers, wordCount: tokens.filter(token => token.word).length };
  }
  function wordBank(answers, locale) {
    return answers.map(answer => answer.text).sort((a, b) => a.localeCompare(b, locale || 'en', { sensitivity: 'base', numeric: true }));
  }
  return Object.freeze({ tokenize, worksheet, wordBank });
});

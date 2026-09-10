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
  const PAPER_SIZES = Object.freeze({
    A4: Object.freeze({ width: 210, height: 297 }),
    A5: Object.freeze({ width: 148, height: 210 }),
    Letter: Object.freeze({ width: 215.9, height: 279.4 }),
    Legal: Object.freeze({ width: 215.9, height: 355.6 })
  });
  function paperSettings(size, orientation) {
    const name = Object.hasOwn(PAPER_SIZES, size) ? size : 'A4';
    const landscape = orientation === 'landscape';
    const paper = PAPER_SIZES[name];
    const width = landscape ? paper.height : paper.width;
    const height = landscape ? paper.width : paper.height;
    return { name, orientation: landscape ? 'landscape' : 'portrait', width, height,
      css: '@page { size: ' + width + 'mm ' + height + 'mm; margin: 14mm; }' };
  }
  function clean(value) { return String(value ?? '').trim(); }
  function validateQuestion(type, question) {
    if (type === 'matching') return clean(question.left) && clean(question.right) ? null : 'pairRequired';
    if (!clean(question.prompt)) return 'promptRequired';
    if (type === 'mcq') {
      if (!Array.isArray(question.options) || question.options.length !== 4 || question.options.some(option => !clean(option))) return 'optionsRequired';
      if (new Set(question.options.map(option => clean(option).toLocaleLowerCase())).size !== 4) return 'distinctOptions';
      if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer > 3) return 'answerRequired';
    } else if (type === 'tf') {
      if (question.answer !== true && question.answer !== false) return 'answerRequired';
    } else if (type === 'short') {
      if (!clean(question.answer)) return 'answerRequired';
    }
    return null;
  }
  // Matching options use a stable rotation. This avoids printing each answer next
  // to its own prompt and prevents the answer key changing during preview/print.
  function matchingSet(pairs, startNumber = 1) {
    const offset = pairs.length > 1 ? Math.ceil(pairs.length / 2) : 0;
    const order = pairs.map((_, index) => (index + offset) % pairs.length);
    const options = order.map((original, index) => ({ label: optionLabel(index), text: clean(pairs[original].right), original }));
    const items = pairs.map((pair, index) => ({ number: startNumber + index, prompt: clean(pair.left),
      optionLabel: options.find(option => option.original === index).label, answer: clean(pair.right) }));
    return { items, options };
  }
  function optionLabel(index) {
    let number = index + 1;
    let label = '';
    while (number > 0) { number--; label = String.fromCharCode(65 + number % 26) + label; number = Math.floor(number / 26); }
    return label;
  }
  function compileExam(input) {
    const enabled = input.enabled || {};
    const sections = [];
    const answers = [];
    const errors = [];
    let next = 1;
    const cloze = worksheet(input.text || '', input.selected || []);
    if (enabled.cloze !== false && cloze.answers.length) {
      sections.push({ type: 'cloze', model: cloze });
      cloze.answers.forEach(answer => answers.push({ number: next++, type: 'cloze', text: answer.text }));
    }
    for (const type of ['mcq', 'tf', 'matching', 'short']) {
      if (enabled[type] === false) continue;
      const rows = input[type] || [];
      const valid = [];
      rows.forEach((question, index) => {
        const code = validateQuestion(type, question);
        if (code) errors.push({ type, index, id: question.id, code });
        else valid.push(question);
      });
      if (type === 'matching' && rows.length === 1 && !errors.some(error => error.type === type)) {
        errors.push({ type, index: 0, id: rows[0].id, code: 'twoPairsRequired' });
      }
      if (type === 'matching' && new Set(valid.map(pair => clean(pair.right).toLocaleLowerCase())).size !== valid.length) {
        errors.push({ type, index: 0, id: valid[0].id, code: 'distinctPairs' });
      }
      if (!valid.length) continue;
      if (type === 'matching') {
        const match = matchingSet(valid, next);
        sections.push({ type, ...match });
        match.items.forEach(item => answers.push({ number: next++, type, text: item.answer, option: item.optionLabel }));
      } else {
        const items = valid.map(question => {
          const number = next++;
          const item = { number, prompt: clean(question.prompt) };
          if (type === 'mcq') {
            item.options = question.options.map(clean);
            answers.push({ number, type, text: item.options[question.answer], option: optionLabel(question.answer) });
          } else if (type === 'tf') answers.push({ number, type, value: question.answer });
          else {
            item.lines = Math.max(1, Math.min(5, Math.trunc(Number(question.lines)) || 2));
            answers.push({ number, type, text: clean(question.answer) });
          }
          return item;
        });
        sections.push({ type, items });
      }
    }
    return { sections, answers, errors, total: answers.length, wordCount: cloze.wordCount };
  }
  return Object.freeze({ tokenize, worksheet, wordBank, PAPER_SIZES, paperSettings, validateQuestion, matchingSet, optionLabel, compileExam });
});

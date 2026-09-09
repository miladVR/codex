const test = require('node:test');
const assert = require('node:assert/strict');
const {tokenize, worksheet, wordBank} = require('../dist/core.js');

test('tokenization preserves punctuation, paragraphs, emoji and mixed scripts exactly', () => {
  const source = 'Hello,   دنیا!\r\n\r\n«می‌روم» — don’t stop. Café e\u0301lan 😊 ۱۲۳';
  assert.equal(tokenize(source).map(token => token.text).join(''),source);
  assert.deepEqual(tokenize(source).filter(token => token.word).map(token => token.text), ['Hello','دنیا','می‌روم','don’t','stop','Café','e\u0301lan','۱۲۳']);
});

test('one occurrence can be removed without removing identical words elsewhere', () => {
  const model = worksheet('The cat saw the cat.',new Set([4]));
  assert.deepEqual(model.answers,[{number:1,text:'cat',index:4}]);
  assert.equal(model.segments.map(segment => segment.kind === 'gap' ? '[1]' : segment.text).join(''),'The cat saw the [1].');
});

test('answer numbering follows reading order, regardless of selection order', () => {
  const model = worksheet('One two three four five.',new Set([4,0,2]));
  assert.deepEqual(model.answers.map(answer => [answer.number,answer.text]),[[1,'One'],[2,'three'],[3,'five']]);
  assert.equal(model.wordCount,5);
});

test('Persian joining characters and diacritics stay within the selected word', () => {
  const source = 'او معمولاً پیام‌ها را می‌خواند؛ و می‌رود.';
  const words = tokenize(source).filter(token => token.word);
  assert.deepEqual(words.map(token => token.text),['او','معمولاً','پیام‌ها','را','می‌خواند','و','می‌رود']);
  const model = worksheet(source,[1,2,4]);
  assert.deepEqual(model.answers.map(answer => answer.text),['معمولاً','پیام‌ها','می‌خواند']);
  assert.equal(model.segments.map(segment => segment.kind === 'gap' ? '_' : segment.text).join(''),'او _ _ را _؛ و می‌رود.');
});

test('word bank preserves duplicate answers and never modifies the answer key', () => {
  const answers = worksheet('pear apple pear banana',[0,1,2,3]).answers;
  assert.deepEqual(wordBank(answers,'en'),['apple','banana','pear','pear']);
  assert.deepEqual(answers.map(answer => answer.text),['pear','apple','pear','banana']);
});

test('empty input, whitespace and obsolete selection indices create no gaps', () => {
  for (const source of ['', '\n\t ', '!?']) {
    const model = worksheet(source,[0,12]);
    assert.equal(model.answers.length,0);
    assert.equal(model.wordCount,0);
    assert.equal(model.segments.map(segment => segment.text).join(''),source);
  }
  assert.equal(worksheet('Only two',[99,-1,0.5,'1']).answers.length,0);
});

test('gap lengths do not reveal the length of the missing answer', () => {
  const model = worksheet('a extraordinary',[0,1]);
  const gaps = model.segments.filter(segment => segment.kind === 'gap');
  assert.deepEqual(Object.keys(gaps[0]),Object.keys(gaps[1]));
  assert.equal(gaps.every(gap => !('text' in gap)),true);
});

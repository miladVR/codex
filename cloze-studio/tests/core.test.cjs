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

const {compileExam,paperSettings,validateQuestion,matchingSet,optionLabel}=require('../dist/core.js');

test('mixed worksheets use continuous numbering and accurate keys across five types',()=>{
  const exam=compileExam({text:'One two three.',selected:[0,2],
    mcq:[{id:'m1',prompt:'Choose two.',options:['one','two','three','four'],answer:1}],
    tf:[{id:'t1',prompt:'Two equals three.',answer:false}],
    matching:[{id:'p1',left:'1',right:'one'},{id:'p2',left:'2',right:'two'}],
    short:[{id:'s1',prompt:'Write one number.',answer:'Any valid number.',lines:3}]
  });
  assert.deepEqual(exam.errors,[]);
  assert.deepEqual(exam.sections.map(section=>section.type),['cloze','mcq','tf','matching','short']);
  assert.deepEqual(exam.answers.map(answer=>answer.number),[1,2,3,4,5,6,7]);
  assert.equal(exam.answers[2].option,'B');
  assert.equal(exam.answers[3].value,false);
  assert.equal(exam.answers[4].option,'B');
  assert.equal(exam.answers[4].text,'one');
  assert.equal(exam.sections.at(-1).items[0].lines,3);
  assert.equal(exam.total,7);
});

test('excluded sections do not affect numbering or block printing with draft errors',()=>{
  const input={text:'One two',selected:[0],enabled:{cloze:false,mcq:false},mcq:[{id:'draft',prompt:''}],tf:[{id:'ready',prompt:'The sky can be blue.',answer:true}]};
  const before=JSON.stringify(input);const exam=compileExam(input);
  assert.equal(exam.total,1);assert.equal(exam.answers[0].number,1);assert.deepEqual(exam.errors,[]);
  assert.equal(JSON.stringify(input),before);
});

test('question validation rejects missing, duplicate and out-of-range answers',()=>{
  assert.equal(validateQuestion('mcq',{prompt:'Choose.',options:['a','b','c','d'],answer:4}),'answerRequired');
  assert.equal(validateQuestion('mcq',{prompt:'Choose.',options:['A',' a ','c','d'],answer:0}),'distinctOptions');
  assert.equal(validateQuestion('mcq',{prompt:'Choose.',options:['a','','c','d'],answer:0}),'optionsRequired');
  assert.equal(validateQuestion('tf',{prompt:'A statement',answer:false}),null);
  assert.equal(validateQuestion('tf',{prompt:'A statement',answer:'false'}),'answerRequired');
  assert.equal(validateQuestion('short',{prompt:'Explain.',answer:'  '}),'answerRequired');
});

test('incomplete questions are reported rather than silently accepted',()=>{
  const exam=compileExam({mcq:[{id:'draft',prompt:'',options:['','','',''],answer:null}],short:[{id:'short',prompt:'Why?',answer:''}]});
  assert.equal(exam.total,0);
  assert.deepEqual(exam.errors.map(error=>[error.id,error.code]),[['draft','promptRequired'],['short','answerRequired']]);
});

test('matching order and keys remain stable and every answer moves from its original row',()=>{
  const pairs=[{left:'one',right:'اول'},{left:'two',right:'دوم'},{left:'three',right:'سوم'}];
  const set=matchingSet(pairs,9);
  assert.deepEqual(set,matchingSet(pairs,9));
  assert.equal(set.options.every((option,index)=>option.original!==index),true);
  for(const item of set.items)assert.equal(set.options.find(option=>option.label===item.optionLabel).text,item.answer);
  assert.deepEqual(set.items.map(item=>item.number),[9,10,11]);
  assert.equal(optionLabel(26),'AA');
});

test('matching requires two complete pairs and unambiguous answer options',()=>{
  assert.equal(compileExam({matching:[{id:'one',left:'x',right:'y'}]}).errors[0].code,'twoPairsRequired');
  assert.equal(compileExam({matching:[{id:'one',left:'x',right:'same'},{id:'two',left:'z',right:' SAME '}]}).errors[0].code,'distinctPairs');
});

test('paper formats specify real dimensions and landscape swaps both axes',()=>{
  for(const [name,width,height] of [['A4',210,297],['A5',148,210],['Letter',215.9,279.4],['Legal',215.9,355.6]]){
    assert.equal(paperSettings(name,'portrait').width,width);
    assert.equal(paperSettings(name,'portrait').height,height);
    assert.equal(paperSettings(name,'landscape').width,height);
    assert.equal(paperSettings(name,'landscape').height,width);
  }
  assert.equal(paperSettings('bad; } body {color:red}','bad').css,'@page { size: 210mm 297mm; margin: 14mm; }');
});

test('student multiple-choice and true-false items contain no correct-answer flags',()=>{
  const exam=compileExam({mcq:[{prompt:'Choose.',options:['a','b','c','d'],answer:2}],tf:[{prompt:'Test.',answer:true}]});
  assert.equal('answer' in exam.sections[0].items[0],false);
  assert.equal('value' in exam.sections[1].items[0],false);
  assert.equal(exam.answers[0].text,'c');assert.equal(exam.answers[1].value,true);
});

test('all English and Persian examples compile without errors',()=>{
  const fs=require('node:fs');const vm=require('node:vm');const context={window:{}};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../dist/content.js'),'utf8'),context);
  const content=JSON.parse(JSON.stringify(context.window.ClozeContent));
  for(const locale of ['en','fa']){
    const example=content.examples[locale];const targets=new Set(example.words);const selected=[];
    tokenize(example.text).forEach(token=>{if(token.word&&targets.has(token.text)){selected.push(token.index);targets.delete(token.text);}});
    const exam=compileExam({...content.questions[locale],text:example.text,selected});
    assert.equal(selected.length,6);assert.deepEqual(exam.errors,[]);assert.equal(exam.total,14);
  }
});

/* Cloze Studio 1.1.0. User content is always rendered with text nodes. */
(function () {
  'use strict';
  const Core = window.ClozeCore;
  const Content = window.ClozeContent;
  const $ = id => document.getElementById(id);
  const TYPES = ['cloze', 'mcq', 'tf', 'matching', 'short'];
  const NAMES = {cloze:'typeCloze',mcq:'typeMcq',tf:'typeTf',matching:'typeMatching',short:'typeShort'};
  const state = {ui:'fa',sheet:'en',title:'',institution:'',logo:'',logoBusy:false,logoRequest:0,paper:'A4',orientation:'portrait',text:'',selected:new Set(),bank:true,key:true,tab:'edit',active:'cloze',enabled:{cloze:true,mcq:true,tf:true,matching:true,short:true},mcq:[],tf:[],matching:[],short:[],nextId:1,triedPrint:false};
  const t = (key, locale) => Content.copy[locale || state.ui][key];
  const number = (value, locale) => new Intl.NumberFormat(locale || state.ui,{useGrouping:false}).format(value);
  function el(tag, className, text) {const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function announce(message) {$('notice').textContent=message;}
  function button(text, className) {const node=el('button',className,text);node.type='button';return node;}
  function currentModel() {return Core.compileExam(state);}
  function applyLanguage() {
    document.documentElement.lang=state.ui;document.documentElement.dir=state.ui==='fa'?'rtl':'ltr';
    document.title=state.ui==='fa'?'Cloze Studio | استودیوی طراحی تمرین':'Cloze Studio — your worksheet studio';
    document.querySelectorAll('[data-i18n]').forEach(node=>{node.textContent=t(node.dataset.i18n);});
    document.querySelectorAll('[data-placeholder]').forEach(node=>{node.placeholder=t(node.dataset.placeholder);});
    $('language-toggle').textContent=state.ui==='fa'?'English':'فارسی';$('language-toggle').lang=state.ui==='fa'?'en':'fa';
    $('view-tabs').setAttribute('aria-label',t('views'));
    $('question-types').setAttribute('aria-label',t('question'));
    document.querySelector('.work-area').setAttribute('aria-label',t('workspaceLabel'));
    $('source-text').lang=state.sheet;$('word-selector').lang=state.sheet;
    $('logo-file').setAttribute('aria-label',t('uploadLogo'));
    $('choose-logo').textContent=t(state.logo?'changeLogo':'uploadLogo');
    $('logo-preview').alt=t('logoAlt');
    $('print').setAttribute('aria-label',t('print'));
  }
  function applyPaper() {
    const paper=Core.paperSettings(state.paper,state.orientation);
    $('paper-rules').textContent=paper.css;
    document.documentElement.style.setProperty('--paper-width',paper.width);
    document.documentElement.style.setProperty('--paper-height',paper.height);
    $('paper-badge').textContent=paper.name+' · '+t(paper.orientation);
    $('preview-dimensions').textContent=paper.name+' · '+paper.width+' × '+paper.height+' mm';
  }
  function renderTokens() {
    const container=$('word-selector');container.replaceChildren();
    if(!state.text.trim()){container.append(el('span','empty-state',t('empty')));return;}
    const fragment=document.createDocumentFragment();
    Core.tokenize(state.text).forEach(token=>{
      if(!token.word){fragment.append(document.createTextNode(token.text));return;}
      const word=button(token.text,'word-token');word.dataset.index=String(token.index);
      word.setAttribute('aria-pressed',String(state.selected.has(token.index)));
      word.setAttribute('aria-label',t(state.selected.has(token.index)?'removeWord':'selectWord')+': '+token.text);fragment.append(word);
    });container.append(fragment);
  }
  function field(label, value, id, fieldName, rows) {
    const wrap=el('div','form-field');const caption=el('label','',label);caption.htmlFor=id;
    const input=el(rows?'textarea':'input');input.id=id;input.dir='auto';input.value=value||'';input.dataset.field=fieldName;
    if(rows){input.rows=rows;input.maxLength=fieldName==='answer'?3000:1000;}else {input.type='text';input.maxLength=350;}
    wrap.append(caption,input);return wrap;
  }
  function selectField(label,id,fieldName,options,value) {
    const wrap=el('div','form-field');const caption=el('label','',label);caption.htmlFor=id;
    const select=el('select');select.id=id;select.dataset.field=fieldName;
    options.forEach(option=>{const node=el('option','',option.label);node.value=String(option.value);select.append(node);});select.value=String(value??'');
    wrap.append(caption,select);return wrap;
  }
  function questionCard(question,index) {
    const type=state.active;
    const card=el('div','question-card');card.dataset.questionId=question.id;
    const head=el('div','question-card-heading');head.append(el('span','question-label',t(type==='matching'?'pair':'question')+' '+number(index+1)));
    const remove=button('×','remove-question');remove.dataset.remove=question.id;remove.setAttribute('aria-label',t(type==='matching'?'deletePair':'deleteQuestion')+' '+number(index+1));head.append(remove);card.append(head);
    if(type==='matching'){
      const pair=el('div','pair-editor');pair.append(field(t('leftLabel'),question.left,question.id+'-left','left',2),field(t('rightLabel'),question.right,question.id+'-right','right',2));card.append(pair);
    }else{
      card.append(field(t(type==='tf'?'statementLabel':'promptLabel'),question.prompt,question.id+'-prompt','prompt',2));
      if(type==='mcq'){
        const options=el('fieldset','options-editor');options.append(el('legend','',t('optionsLabel')));
        question.options.forEach((value,optionIndex)=>{
          const row=el('div','option-editor');const letter=Core.optionLabel(optionIndex);
          const radio=el('input');radio.type='radio';radio.name=question.id+'-correct';radio.value=String(optionIndex);radio.dataset.field='answer';radio.checked=question.answer===optionIndex;radio.setAttribute('aria-label',t('answerLabel')+' '+letter);
          const caption=el('label','option-letter',letter);caption.htmlFor=question.id+'-option-'+optionIndex;
          const input=el('input');input.type='text';input.dir='auto';input.maxLength=350;input.id=caption.htmlFor;input.value=value;input.dataset.field='option';input.dataset.option=String(optionIndex);input.setAttribute('aria-label',t('optionLabel')+' '+letter);
          row.append(radio,caption,input);options.append(row);
        });card.append(options);
      }else if(type==='tf')card.append(selectField(t('answerLabel'),question.id+'-answer','answer',[{value:'',label:t('chooseAnswer')},{value:'true',label:t('trueLabel')},{value:'false',label:t('falseLabel')}],question.answer));
      else{
        card.append(field(t('shortAnswer'),question.answer,question.id+'-answer','answer',2));
        card.append(selectField(t('answerLines'),question.id+'-lines','lines',[1,2,3,4,5].map(value=>({value,label:number(value)+' '+t('line')})),question.lines));
      }
    }
    const error=el('p','question-error');error.dataset.errorFor=question.id;error.hidden=true;card.append(error);return card;
  }
  function renderEditor() {
    const type=state.active;
    document.querySelectorAll('[data-type]').forEach(node=>{node.setAttribute('aria-pressed',String(node.dataset.type===type));});
    $('active-heading').textContent=t(NAMES[type]);$('active-help').textContent=t(type+'Help');
    $('include-type').checked=state.enabled[type];
    $('cloze-editor').hidden=type!=='cloze';$('question-list').hidden=type==='cloze';
    $('add-question').hidden=type==='cloze';$('clear-selection').hidden=type!=='cloze';
    $('load-sample').textContent=t(type==='cloze'?'sampleText':'sample');
    $('add-label').textContent=t(type==='matching'?'addPair':'addQuestion');
    $('add-question').disabled=type!=='cloze'&&state[type].length>=30;
    $('load-sample').disabled=type!=='cloze'&&state[type].length>=30;
    const list=$('question-list');list.replaceChildren();
    if(type!=='cloze'){
      if(!state[type].length){const empty=el('div','empty-question-state');empty.append(el('span','empty-symbol','＋'),el('h3','',t('emptyQuestions')),el('p','',t('emptyQuestionsHint')));list.append(empty);}
      state[type].forEach((question,index)=>list.append(questionCard(question,index)));
    }
  }
  function showValidation(model) {
    $('validation-message').hidden=!state.triedPrint||!model.errors.length;
    $('validation-message').textContent=t('fixQuestions');
    document.querySelectorAll('[data-question-id]').forEach(card=>{
      const error=model.errors.find(item=>item.id===card.dataset.questionId);
      const message=card.querySelector('[data-error-for]');const show=state.triedPrint&&!!error;
      card.classList.toggle('has-error',show);message.hidden=!show;message.textContent=show?t(error.code):'';
    });
  }
  function addQuestion(sample) {
    const type=state.active;if(type==='cloze'||state[type].length>=30)return;
    let question={prompt:'',answer:null};
    if(type==='mcq')question.options=['','','',''];
    if(type==='short'){question.answer='';question.lines=2;}
    if(type==='matching')question={left:'',right:''};
    if(sample)question=JSON.parse(JSON.stringify(sample));
    question.id='q'+state.nextId++;state[type].push(question);
  }
  function loadSample() {
    if(state.active==='cloze'){
      const example=Content.examples[state.sheet];state.text=example.text;state.selected.clear();
      if(!state.title.trim()){state.title=example.title;$('worksheet-title').value=state.title;}
      const targets=new Set(example.words);
      Core.tokenize(state.text).forEach(token=>{if(token.word&&targets.has(token.text)){state.selected.add(token.index);targets.delete(token.text);}});
      $('source-text').value=state.text;renderTokens();announce(t('sampleLoaded'));
    }else{Content.questions[state.sheet][state.active].forEach(sample=>addQuestion(sample));announce(t('sampleAdded'));}
    renderEditor();render();
  }
  function addPaperHeader(paper,isKey) {
    paper.replaceChildren();paper.lang=state.sheet;paper.dir=state.sheet==='fa'?'rtl':'ltr';
    const head=el('div','paper-header');
    if(state.logo){const logo=el('img','paper-logo');logo.src=state.logo;logo.alt=state.institution||t('logoAlt',state.sheet);head.append(logo);}
    const identity=el('div','paper-identity');
    if(state.institution.trim()){const name=el('div','institution-name',state.institution.trim());name.dir='auto';identity.append(name);}
    identity.append(el('p','sheet-kicker',t(isKey?'teacher':'student',state.sheet)));head.append(identity);paper.append(head);
    const title=el('h2','paper-title',state.title.trim()||t('blankTitle',state.sheet));title.dir='auto';paper.append(title);
    if(!isKey){const fields=el('div','student-fields');fields.append(el('span','',t('name',state.sheet)+': '),el('span','',t('date',state.sheet)+': '));paper.append(fields);}
  }
  function addPaperFooter(paper,model) {
    const footer=el('div','sheet-footer');footer.append(el('span','',number(model.total,state.sheet)+' '+t('questions',state.sheet)));
    const brand=el('span','','Cloze Studio · '+Content.version);brand.dir='ltr';footer.append(brand);paper.append(footer);
  }
  function promptItem(item) {
    const node=el('div','printed-question');const prompt=el('p','printed-prompt');
    prompt.append(el('span','question-number',number(item.number,state.sheet)+'.'),el('bdi','',item.prompt));node.append(prompt);return node;
  }
  function clozeSection(section,node) {
    const model=section.model;
    node.append(el('p','sheet-instruction',t(state.bank?'bankInstruction':'instruction',state.sheet)));
    if(state.bank){const bank=el('div','sheet-bank');bank.append(el('strong','',t('wordBank',state.sheet)));const words=el('div','bank-words',Core.wordBank(model.answers,state.sheet).join('  ·  '));words.dir='auto';bank.append(words);node.append(bank);}
    const paragraph=el('div','sheet-text');paragraph.dir='auto';
    model.segments.forEach(segment=>{
      if(segment.kind==='text')paragraph.append(document.createTextNode(segment.text));
      else{const gap=el('span','gap');gap.setAttribute('aria-label',t('gaps',state.sheet)+' '+number(segment.number,state.sheet));gap.append(el('sup','',number(segment.number,state.sheet)),document.createTextNode('\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0'));paragraph.append(gap);}
    });node.append(paragraph);
  }
  function renderSection(section,index) {
    const node=el('section','printed-section');const heading=el('h3','printed-section-heading');
    heading.append(el('span','section-index',number(index+1,state.sheet)),el('span','',t(NAMES[section.type],state.sheet)));node.append(heading);
    if(section.type==='cloze'){clozeSection(section,node);return node;}
    node.append(el('p','sheet-instruction',t(section.type+'Instruction',state.sheet)));
    if(section.type==='matching'){
      const columns=el('div','matching-columns');const prompts=el('div','match-prompts');const options=el('div','match-options');
      prompts.append(el('h4','',t('matchingPrompts',state.sheet)));options.append(el('h4','',t('matchingOptions',state.sheet)));
      section.items.forEach(item=>{const row=promptItem(item);row.append(el('span','matching-blank','_____'));prompts.append(row);});
      section.options.forEach(option=>{const row=el('p','match-option');const letter=el('bdi','option-letter',option.label+'.');row.append(letter,el('bdi','',option.text));options.append(row);});columns.append(prompts,options);node.append(columns);
    }else section.items.forEach(item=>{
      const question=promptItem(item);
      if(section.type==='mcq'){
        const options=el('div','printed-options');item.options.forEach((option,index)=>{const row=el('div','printed-option');row.append(el('bdi','option-letter',Core.optionLabel(index)+'.'),el('bdi','',option));options.append(row);});question.append(options);
      }else if(section.type==='tf'){
        const options=el('div','true-false-options');options.append(el('span','','□ '+t('trueLabel',state.sheet)),el('span','','□ '+t('falseLabel',state.sheet)));question.append(options);
      }else{const space=el('div','answer-space');for(let line=0;line<item.lines;line++)space.append(el('div','answer-line'));question.append(space);}
      node.append(question);
    });return node;
  }
  function renderPapers(model) {
    const student=$('student-sheet');addPaperHeader(student,false);
    if(model.errors.length)student.append(el('p','draft-warning',t('unfinishedPreview',state.sheet)));
    if(model.total)model.sections.forEach((section,index)=>student.append(renderSection(section,index)));
    else student.append(el('p','empty-preview',t('noQuestions',state.sheet)));
    addPaperFooter(student,model);
    const key=$('key-sheet');key.replaceChildren();key.hidden=!state.key||!model.total;
    if(state.key&&model.total){
      addPaperHeader(key,true);key.append(el('p','sheet-instruction',t('keyInstruction',state.sheet)));
      model.sections.forEach(section=>{
        const block=el('section','key-section');block.append(el('h3','printed-section-heading',t(NAMES[section.type],state.sheet)));
        const list=el('ol','answer-list'+(section.type==='short'?' long-answers':''));
        model.answers.filter(answer=>answer.type===section.type).forEach(answer=>{
          const item=el('li');item.value=answer.number;
          if(answer.type==='tf')item.append(el('span','',t(answer.value?'trueLabel':'falseLabel',state.sheet)));
          else{if(answer.option)item.append(el('bdi','key-letter',answer.option+'. '));item.append(el('bdi','',answer.text));}
          list.append(item);
        });block.append(list);key.append(block);
      });addPaperFooter(key,model);
    }
  }
  function render() {
    const model=currentModel();applyPaper();
    $('total-badge').textContent=number(model.total)+' '+t('questions');
    const gapCount=Core.worksheet(state.text,state.selected).answers.length;
    $('gap-count').textContent=number(gapCount)+' '+t('gaps');$('word-count').textContent=number(model.wordCount)+' '+t('words');
    $('editor-count').textContent=state.enabled[state.active]?number(state.active==='cloze'?gapCount:state[state.active].length)+' '+t(state.active==='cloze'?'gaps':state.active==='matching'?'pair':'questions'):t('sectionDisabled');
    $('print').disabled=state.logoBusy||(!model.total&&!model.errors.length);$('clear-selection').disabled=!gapCount;
    TYPES.forEach(type=>{document.querySelector('[data-count="'+type+'"]').textContent=number(type==='cloze'?gapCount:state[type].length);document.querySelector('[data-type="'+type+'"]').classList.toggle('excluded',!state.enabled[type]);});
    renderPapers(model);showValidation(model);
  }
  function setTab(tab,focus) {
    state.tab=tab;['edit','preview'].forEach(name=>{const active=name===tab;$(name+'-tab').setAttribute('aria-selected',String(active));$(name+'-tab').tabIndex=active?0:-1;$(name+'-panel').hidden=!active;});if(focus)$(tab+'-tab').focus();
  }
  function setType(type) {if(!TYPES.includes(type))return;state.active=type;renderEditor();render();announce('');}
  async function loadLogo(file) {
    if(!file)return;
    const request=++state.logoRequest;
    state.logoBusy=false;
    $('logo-file').value='';
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){$('logo-message').textContent=t('logoInvalid');render();return;}
    if(file.size>2*1024*1024){$('logo-message').textContent=t('logoLarge');render();return;}
    state.logoBusy=true;$('logo-message').textContent=t('logoLoading');render();
    const url=URL.createObjectURL(file);
    try{
      const image=new Image();image.src=url;await image.decode();
      if(request!==state.logoRequest)return;
      if(!image.naturalWidth||!image.naturalHeight)throw Error('logoInvalid');
      if(image.naturalWidth*image.naturalHeight>16000000)throw Error('logoDimensions');
      const scale=Math.min(1,640/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      state.logo=canvas.toDataURL('image/png');$('logo-preview').src=state.logo;$('logo-preview').hidden=false;$('logo-placeholder').setAttribute('hidden','');$('remove-logo').hidden=false;$('choose-logo').textContent=t('changeLogo');$('logo-message').textContent=t('logoReady');
    }catch(error){if(request===state.logoRequest)$('logo-message').textContent=t(error.message==='logoDimensions'?'logoDimensions':'logoInvalid');}
    finally{URL.revokeObjectURL(url);if(request===state.logoRequest){state.logoBusy=false;render();}}
  }
  $('word-selector').addEventListener('click',event=>{
    const target=event.target.closest('button[data-index]');if(!target)return;
    const index=Number(target.dataset.index);if(state.selected.has(index))state.selected.delete(index);else state.selected.add(index);
    target.setAttribute('aria-pressed',String(state.selected.has(index)));target.setAttribute('aria-label',t(state.selected.has(index)?'removeWord':'selectWord')+': '+target.textContent);announce('');render();
  });
  $('source-text').addEventListener('input',event=>{state.text=event.target.value;state.selected.clear();renderTokens();render();announce(t('changed'));});
  $('worksheet-title').addEventListener('input',event=>{state.title=event.target.value;render();});
  $('institution').addEventListener('input',event=>{state.institution=event.target.value;render();});
  $('clear-selection').addEventListener('click',()=>{state.selected.clear();renderTokens();render();announce(t('cleared'));});
  $('load-sample').addEventListener('click',loadSample);
  $('sheet-language').addEventListener('change',event=>{state.sheet=event.target.value;applyLanguage();renderTokens();renderEditor();render();announce('');});
  $('paper-size').addEventListener('change',event=>{state.paper=event.target.value;render();});
  $('orientation').addEventListener('change',event=>{state.orientation=event.target.value;render();});
  $('word-bank').addEventListener('change',event=>{state.bank=event.target.checked;render();});
  $('answer-key').addEventListener('change',event=>{state.key=event.target.checked;render();});
  $('language-toggle').addEventListener('click',()=>{state.ui=state.ui==='fa'?'en':'fa';applyLanguage();renderTokens();renderEditor();render();$('logo-message').textContent='';announce('');});
  $('include-type').addEventListener('change',event=>{state.enabled[state.active]=event.target.checked;render();});
  $('question-types').addEventListener('click',event=>{const target=event.target.closest('[data-type]');if(target)setType(target.dataset.type);});
  $('add-question').addEventListener('click',()=>{addQuestion();renderEditor();render();const inputs=$('question-list').querySelectorAll('[data-question-id]');inputs[inputs.length-1]?.querySelector('textarea,input')?.focus();});
  $('question-list').addEventListener('input',event=>{
    const card=event.target.closest('[data-question-id]');if(!card)return;
    const question=state[state.active].find(item=>item.id===card.dataset.questionId);const fieldName=event.target.dataset.field;if(!question||!fieldName)return;
    if(fieldName==='option')question.options[Number(event.target.dataset.option)]=event.target.value;
    else if(fieldName==='answer'&&state.active==='mcq')question.answer=Number(event.target.value);
    else if(fieldName==='answer'&&state.active==='tf')question.answer=event.target.value===''?null:event.target.value==='true';
    else if(fieldName==='lines')question.lines=Number(event.target.value);
    else question[fieldName]=event.target.value;
    render();
  });
  $('question-list').addEventListener('click',event=>{const target=event.target.closest('[data-remove]');if(!target)return;state[state.active]=state[state.active].filter(question=>question.id!==target.dataset.remove);renderEditor();render();$('add-question').focus();});
  $('choose-logo').addEventListener('click',()=>$('logo-file').click());
  $('logo-file').addEventListener('change',event=>loadLogo(event.target.files[0]));
  $('remove-logo').addEventListener('click',()=>{state.logoRequest++;state.logoBusy=false;state.logo='';$('logo-preview').removeAttribute('src');$('logo-preview').hidden=true;$('logo-placeholder').removeAttribute('hidden');$('remove-logo').hidden=true;$('choose-logo').textContent=t('uploadLogo');$('logo-message').textContent=t('logoRemoved');render();});
  $('edit-tab').addEventListener('click',()=>setTab('edit',false));$('preview-tab').addEventListener('click',()=>setTab('preview',false));$('show-preview').addEventListener('click',()=>setTab('preview',true));
  $('view-tabs').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();setTab(event.key==='Home'?'edit':event.key==='End'?'preview':state.tab==='edit'?'preview':'edit',true);}});
  $('print').addEventListener('click',async()=>{
    const model=currentModel();state.triedPrint=true;
    if(model.errors.length){setType(model.errors[0].type);setTab('edit',false);showValidation(model);document.querySelector('[data-question-id="'+model.errors[0].id+'"] textarea')?.focus();return;}
    if(!model.total||state.logoBusy)return;
    render();
    try{await Promise.all(Array.from(document.querySelectorAll('.paper-logo')).map(image=>image.decode()));window.print();}
    catch{announce(t('printImageError'));}
  });
  applyLanguage();loadSample();setTab('edit',false);
})();

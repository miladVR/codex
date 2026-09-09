/* Browser UI. All teacher-provided content is inserted as text, never HTML. */
(function () {
  'use strict';
  const Core = window.ClozeCore;
  const $ = id => document.getElementById(id);
  const copy = {
    fa: {
      skip: 'رفتن به محیط ساخت تمرین', local: 'متن شما در مرورگر می‌ماند', eyebrow: 'میز کار مدرس', heading: 'از متن، تمرین بساز.', intro: 'کلمات را انتخاب کن؛ برگه تمرین و پاسخ‌نامه آماده می‌شوند.', print: 'چاپ / ذخیره PDF', sourceHeading: 'متن و تنظیمات', titleLabel: 'عنوان تمرین', textLabel: 'متن درس', sample: 'متن نمونه', sourceHint: 'با تغییر متن، انتخاب کلمات پاک می‌شود. حداکثر ۱۲٬۰۰۰ نویسه.', sheetLanguage: 'زبان برگه تمرین', wordBank: 'بانک کلمات', bankHint: 'کلمات پاسخ به ترتیب الفبایی', answerKey: 'پاسخ‌نامه جداگانه', keyHint: 'پس از برگه زبان‌آموز چاپ می‌شود', pdfHint: 'برای دریافت PDF، در پنجره چاپ «Save as PDF» را انتخاب کن.', editTab: 'انتخاب کلمات', previewTab: 'پیش‌نمایش چاپ', selectHeading: 'روی کلمات کلیک کن', selectHint: 'هر کلمه آبی، یک جای‌خالی در تمرین است.', clear: 'پاک‌کردن انتخاب‌ها', selectedLegend: 'کلمات انتخاب‌شده', selectedAnswers: 'پاسخ‌های انتخاب‌شده', previewHint: 'پیش‌نمایش محتوا · صفحه‌بندی نهایی در پنجره چاپ مشخص می‌شود.', footer: 'ساخت تمرین، بدون ثبت‌نام و بدون ارسال متن به سرور.', gaps: 'جای‌خالی', words: 'کلمه', empty: 'متن درس را در کادر وارد کن تا کلمات اینجا نمایش داده شوند.', noAnswers: 'برای شروع، یک کلمه از متن انتخاب کن.', cleared: 'انتخاب کلمات پاک شد.', changed: 'متن تغییر کرد. کلمات موردنظر را دوباره انتخاب کن.', sampleLoaded: 'متن نمونه با شش جای‌خالی آماده شد.', selectWord: 'انتخاب کلمه', removeWord: 'برگرداندن کلمه', blankTitle: 'تمرین جای‌خالی', student: 'برگه زبان‌آموز', teacher: 'پاسخ‌نامه مدرس', name: 'نام', date: 'تاریخ', instruction: 'جاهای خالی را با کلمات مناسب کامل کنید.', bankInstruction: 'جاهای خالی را با کلمات بانک کامل کنید. هر کلمه را یک بار استفاده کنید.', keyInstruction: 'شماره هر پاسخ با شماره جای‌خالی در برگه تمرین مطابقت دارد.', noGaps: 'برای آماده‌شدن تمرین، دست‌کم یک کلمه انتخاب کنید.', workspaceLabel: 'محیط ساخت تمرین', views: 'نمایش محیط کار'
    },
    en: {
      skip: 'Skip to worksheet builder', local: 'Your text stays in your browser', eyebrow: 'THE TEACHER’S WORKSPACE', heading: 'Turn a text into a lesson.', intro: 'Choose the words. Your worksheet and answer key are ready.', print: 'Print / save PDF', sourceHeading: 'Text & settings', titleLabel: 'Worksheet title', textLabel: 'Lesson text', sample: 'Load example', sourceHint: 'Editing the text clears your word selections. Maximum 12,000 characters.', sheetLanguage: 'Worksheet language', wordBank: 'Word bank', bankHint: 'List the answers in alphabetical order', answerKey: 'Separate answer key', keyHint: 'Print after the student worksheet', pdfHint: 'To download a PDF, choose “Save as PDF” in your browser’s print window.', editTab: 'Choose words', previewTab: 'Print preview', selectHeading: 'Click the words to remove', selectHint: 'Each blue word becomes a gap in the worksheet.', clear: 'Clear selection', selectedLegend: 'Selected words', selectedAnswers: 'Your selected answers', previewHint: 'Content preview · Final pagination is shown in the print window.', footer: 'Make a worksheet. No account. No text sent to a server.', gaps: 'gaps', words: 'words', empty: 'Paste your lesson text into the text box to see its words here.', noAnswers: 'Choose a word in the text to get started.', cleared: 'Your word selections have been cleared.', changed: 'Text updated. Choose the words you would like to remove.', sampleLoaded: 'Example loaded with six gaps ready to print.', selectWord: 'Select word', removeWord: 'Restore word', blankTitle: 'Gap-fill worksheet', student: 'STUDENT WORKSHEET', teacher: 'TEACHER’S ANSWER KEY', name: 'Name', date: 'Date', instruction: 'Complete the gaps with suitable words.', bankInstruction: 'Complete the gaps using the word bank. Use each word once.', keyInstruction: 'Each answer number matches a gap in the student worksheet.', noGaps: 'Select at least one word to prepare your worksheet.', workspaceLabel: 'Worksheet workspace', views: 'Workspace view'
    }
  };
  const examples = {
    en: {title: 'Small habits, big changes', text: 'Every Friday, Maya leaves her phone at home and walks to the park. She usually meets a friend near the old bridge. They talk about their week, share ideas, and make plans for the weekend.\n\nLast month, Maya started taking a small notebook with her. Instead of checking messages, she writes down things she notices: a new flower, a noisy bird, or a conversation. This simple habit helps her feel calmer. Her friends have noticed the change, and now they sometimes bring notebooks too.', words: ['usually','friend','weekend','notebook','messages','calmer']},
    fa: {title: 'عادت‌های کوچک، تغییرهای بزرگ', text: 'هر جمعه، مینا تلفن خود را در خانه می‌گذارد و به پارک می‌رود. او معمولاً دوستش را کنار پل قدیمی می‌بیند. آن‌ها درباره هفته گذشته صحبت می‌کنند و برای روزهای آینده برنامه می‌ریزند.\n\nماه گذشته، مینا یک دفترچه کوچک خرید. حالا به جای نگاه کردن به پیام‌ها، چیزهای جالبی را که می‌بیند یادداشت می‌کند: یک گل تازه، یک پرنده پرسروصدا یا یک گفت‌وگوی کوتاه. این عادت ساده به او آرامش می‌دهد. دوستانش هم گاهی دفترچه‌های خود را به پارک می‌آورند.', words: ['جمعه','معمولاً','قدیمی','دفترچه','پیام‌ها','آرامش']}
  };
  const state = {ui: 'fa', sheet: 'en', text: '', title: '', selected: new Set(), bank: true, key: true, tab: 'edit'};
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function numeral(value, locale) {return new Intl.NumberFormat(locale || state.ui, {useGrouping: false}).format(value);}
  function announce(message) {$('notice').textContent = message;}
  function applyLanguage() {
    document.documentElement.lang = state.ui;
    document.documentElement.dir = state.ui === 'fa' ? 'rtl' : 'ltr';
    document.title = state.ui === 'fa' ? 'Cloze Studio | سازنده تمرین زبان' : 'Cloze Studio — printable language worksheets';
    document.querySelectorAll('[data-i18n]').forEach(node => {node.textContent = copy[state.ui][node.dataset.i18n];});
    $('language-toggle').textContent = state.ui === 'fa' ? 'English' : 'فارسی';
    $('language-toggle').lang = state.ui === 'fa' ? 'en' : 'fa';
    $('view-tabs').setAttribute('aria-label',copy[state.ui].views);
    document.querySelector('.work-area').setAttribute('aria-label',copy[state.ui].workspaceLabel);
    $('source-text').lang = state.sheet;
    $('word-selector').lang = state.sheet;
  }
  function renderTokens() {
    const container = $('word-selector');
    container.replaceChildren();
    if (!state.text.trim()) {container.append(element('span','empty-state',copy[state.ui].empty));return;}
    const fragment = document.createDocumentFragment();
    Core.tokenize(state.text).forEach(token => {
      if (!token.word) {fragment.append(document.createTextNode(token.text));return;}
      const word = element('button','word-token',token.text);
      word.type = 'button';
      word.dataset.index = String(token.index);
      word.setAttribute('aria-pressed',String(state.selected.has(token.index)));
      word.setAttribute('aria-label',(state.selected.has(token.index) ? copy[state.ui].removeWord : copy[state.ui].selectWord) + ': ' + token.text);
      fragment.append(word);
    });
    container.append(fragment);
  }
  function addPaperHeader(paper, isKey, model) {
    const lang = state.sheet;
    const labels = copy[lang];
    paper.replaceChildren();paper.lang = lang;paper.dir = lang === 'fa' ? 'rtl' : 'ltr';
    const top = element('div','sheet-topline');
    top.append(element('span','',isKey ? labels.teacher : labels.student));
    const brand = element('span','','Cloze Studio');brand.dir = 'ltr';top.append(brand);
    paper.append(top);
    const title = element('h2','',state.title.trim() || labels.blankTitle);title.dir = 'auto';paper.append(title);
    if (!isKey) {
      const fields = element('div','student-fields');
      fields.append(element('span','',labels.name + ': '),element('span','',labels.date + ': '));paper.append(fields);
    }
    paper.append(element('p','sheet-instruction',isKey ? labels.keyInstruction : (state.bank ? labels.bankInstruction : labels.instruction)));
    if (!model.answers.length) paper.append(element('p','empty-preview',labels.noGaps));
  }
  function addPaperFooter(paper, model) {
    const footer = element('div','sheet-footer');
    footer.append(element('span','',numeral(model.answers.length,state.sheet) + ' ' + copy[state.sheet].gaps));
    const brand = element('span','','Cloze Studio · 1.0');brand.dir = 'ltr';footer.append(brand);paper.append(footer);
  }
  function renderPapers(model) {
    const student = $('student-sheet');
    addPaperHeader(student,false,model);
    if (model.answers.length) {
      if (state.bank) {
        const bank = element('div','sheet-bank');
        bank.append(element('strong','',copy[state.sheet].wordBank));
        const words = element('div','bank-words',Core.wordBank(model.answers,state.sheet).join('  ·  '));words.dir = 'auto';bank.append(words);student.append(bank);
      }
      const paragraph = element('div','sheet-text');paragraph.dir = 'auto';
      model.segments.forEach(segment => {
        if (segment.kind === 'text') paragraph.append(document.createTextNode(segment.text));
        else {
          const gap = element('span','gap');
          gap.setAttribute('aria-label',copy[state.sheet].gaps + ' ' + numeral(segment.number,state.sheet));
          gap.append(element('sup','',numeral(segment.number,state.sheet)),document.createTextNode('\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0'));
          paragraph.append(gap);
        }
      });
      student.append(paragraph);
    }
    addPaperFooter(student,model);
    const key = $('key-sheet');key.hidden = !state.key || !model.answers.length;
    key.replaceChildren();
    if (state.key && model.answers.length) {
      addPaperHeader(key,true,model);
      const list = element('ol','answer-list');
      model.answers.forEach(answer => {
        const item = element('li');item.value = answer.number;
        const word = element('bdi','',answer.text);item.append(word);list.append(item);
      });
      key.append(list);addPaperFooter(key,model);
    }
  }
  function render(tokensToo) {
    const model = Core.worksheet(state.text,state.selected);
    if (tokensToo) renderTokens();
    $('gap-count').textContent = numeral(model.answers.length) + ' ' + copy[state.ui].gaps;
    $('word-count').textContent = numeral(model.wordCount) + ' ' + copy[state.ui].words;
    $('print').disabled = !model.answers.length;
    $('clear-selection').disabled = !model.answers.length;
    const selected = $('selected-answers');selected.replaceChildren();
    if (!model.answers.length) selected.append(element('span','muted',copy[state.ui].noAnswers));
    model.answers.forEach(answer => {
      const chip = element('span','answer-chip');
      chip.append(element('span','chip-number',numeral(answer.number)),element('bdi','',answer.text));selected.append(chip);
    });
    renderPapers(model);
  }
  function setTab(tab, focus) {
    state.tab = tab;
    ['edit','preview'].forEach(name => {
      const active = name === tab;
      $(name + '-tab').setAttribute('aria-selected',String(active));
      $(name + '-tab').tabIndex = active ? 0 : -1;
      $(name + '-panel').hidden = !active;
    });
    if (focus) $(tab + '-tab').focus();
  }
  function loadExample() {
    const sample = examples[state.sheet];
    state.text = sample.text;state.title = sample.title;state.selected.clear();
    const targets = new Set(sample.words);
    Core.tokenize(state.text).forEach(token => {
      if (token.word && targets.has(token.text)) {state.selected.add(token.index);targets.delete(token.text);}
    });
    $('source-text').value = state.text;$('worksheet-title').value = state.title;
    render(true);
  }
  $('word-selector').addEventListener('click',event => {
    const target = event.target.closest('button[data-index]');
    if (!target) return;
    const index = Number(target.dataset.index);
    if (state.selected.has(index)) state.selected.delete(index);else state.selected.add(index);
    target.setAttribute('aria-pressed',String(state.selected.has(index)));
    target.setAttribute('aria-label',(state.selected.has(index) ? copy[state.ui].removeWord : copy[state.ui].selectWord) + ': ' + target.textContent);
    announce('');render(false);
  });
  $('source-text').addEventListener('input',event => {state.text = event.target.value;state.selected.clear();announce(copy[state.ui].changed);render(true);});
  $('worksheet-title').addEventListener('input',event => {state.title = event.target.value;render(false);});
  $('clear-selection').addEventListener('click',() => {state.selected.clear();render(true);announce(copy[state.ui].cleared);});
  $('load-sample').addEventListener('click',() => {loadExample();announce(copy[state.ui].sampleLoaded);});
  $('sheet-language').addEventListener('change',event => {state.sheet = event.target.value;applyLanguage();render(true);announce('');});
  $('word-bank').addEventListener('change',event => {state.bank = event.target.checked;render(false);});
  $('answer-key').addEventListener('change',event => {state.key = event.target.checked;render(false);});
  $('language-toggle').addEventListener('click',() => {state.ui = state.ui === 'fa' ? 'en' : 'fa';applyLanguage();render(true);announce('');});
  $('edit-tab').addEventListener('click',() => setTab('edit',false));
  $('preview-tab').addEventListener('click',() => setTab('preview',false));
  $('view-tabs').addEventListener('keydown',event => {
    if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();
      setTab(event.key === 'Home' ? 'edit' : event.key === 'End' ? 'preview' : state.tab === 'edit' ? 'preview' : 'edit',true);
    }
  });
  $('print').addEventListener('click',() => {
    if (!Core.worksheet(state.text,state.selected).answers.length) return;
    render(false);window.print();
  });
  window.addEventListener('beforeprint',() => render(false));
  applyLanguage();loadExample();setTab('edit',false);
})();

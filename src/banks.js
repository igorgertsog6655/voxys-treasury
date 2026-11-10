import {addBankContact,compareBankContacts,moveBank,saveBank,saveBankContact,today,BANK_PROFILE_FIELDS,BANK_REPRESENTATIVE_FIELDS} from './model.js';

const contactFields = [
  ['contactedBy','Кто контактировал',180],
  ['counterparty','С кем контактировали',250],
  ['outcome','Статус / договорённости',3000],
  ['nextSteps','Дальнейшие шаги',3000]
];
const contactColumns=[['date','Дата последнего контакта'],...contactFields.slice(0,3)];

export function createBanksUI({getState,commit,canEdit,isFullySaved,toast,esc,formatDate,icon}) {
  const section=document.getElementById('banks');
  section.innerHTML=`
    <div class="section-heading bank-heading">
      <div><h2>Работа с банками</h2><p>Стадии переговоров, следующие шаги, контактные лица и история общения.</p></div>
      <button id="new-bank" class="primary" type="button">${icon('plus')} Добавить банк</button>
    </div>
    <div class="registry">
      <p class="bank-reorder-hint">Перетащите строку за ⋮⋮, чтобы изменить порядок банков.</p>
      <div class="table-scroll bank-table-viewport" id="bank-table-viewport" tabindex="0" role="region" aria-label="Таблица банков">
        <div id="bank-list"></div>
      </div>
      <label class="bank-scrollbar" id="bank-scrollbar" hidden>
        <span>Горизонтальная прокрутка</span>
        <input id="bank-scroll-range" type="range" min="0" max="0" step="1" value="0">
      </label>
    </div>`;
  document.body.insertAdjacentHTML('beforeend',`
    <dialog id="bank-details" aria-labelledby="bank-title">
      <div id="bank-detail-content"></div>
    </dialog>
    <dialog id="bank-editor" aria-labelledby="bank-editor-title">
      <form id="bank-form">
        <div class="dialog-head"><h2 id="bank-editor-title">Новый банк</h2><button type="button" class="icon-button" data-close="bank-editor" aria-label="Закрыть">${icon('close')}</button></div>
        <div class="dialog-body">
          <label>Название банка<input name="bankName" required maxlength="180"></label>
          <div class="form-grid">
            <label>Стадия<input name="stage" maxlength="180"></label>
            <label>Статус обновлён<input type="date" name="statusDate"></label>
          </div>
          ${BANK_PROFILE_FIELDS.slice(1).map(([key,label,limit])=>`<label>${label}<textarea name="${key}" rows="3" maxlength="${limit}"></textarea></label>`).join('')}
          <section class="detail-section" aria-label="Контактные лица">
            <h3>Контактные лица</h3>
            <div id="bank-representative-editor"></div>
            <button type="button" class="subtle" id="new-bank-representative">${icon('plus')} Добавить контактное лицо</button>
          </section>
          <p class="form-error" role="alert"></p>
        </div>
        <div class="dialog-foot"><button type="button" data-close="bank-editor">Отмена</button><button class="primary" type="submit">Сохранить банк</button></div>
      </form>
    </dialog>
    <dialog id="bank-contact-editor" aria-labelledby="bank-contact-title">
      <form id="bank-contact-form">
        <div class="dialog-head"><div><div class="eyebrow" id="contact-bank-name"></div><h2 id="bank-contact-title">Новый контакт</h2></div><button type="button" class="icon-button" data-close="bank-contact-editor" aria-label="Закрыть">${icon('close')}</button></div>
        <div class="dialog-body">
          <label>Дата контакта<input type="date" name="date" required></label>
          <div class="form-grid">
            <label>Кто контактировал<input name="contactedBy" list="bank-staff" required maxlength="180"></label>
            <label>С кем контактировали<input name="counterparty" list="bank-representatives" required maxlength="250" placeholder="Имя и должность"></label>
          </div>
          <datalist id="bank-staff"></datalist>
          <datalist id="bank-representatives"></datalist>
          <label>Статус / договорённости<textarea name="outcome" rows="4" required maxlength="3000"></textarea></label>
          <label>Дальнейшие шаги<textarea name="nextSteps" rows="3" maxlength="3000"></textarea></label>
          <p class="form-error" role="alert"></p>
        </div>
        <div class="dialog-foot"><button type="button" data-close="bank-contact-editor">Отмена</button><button class="primary" type="submit">Сохранить контакт</button></div>
      </form>
    </dialog>`);

  const details=document.getElementById('bank-details');
  const bankEditor=document.getElementById('bank-editor');
  const contactEditor=document.getElementById('bank-contact-editor');
  const bankForm=bankEditor.querySelector('form');
  const contactForm=contactEditor.querySelector('form');
  const representativeEditor=document.getElementById('bank-representative-editor');
  const bankList=document.getElementById('bank-list');
  const viewport=document.getElementById('bank-table-viewport');
  const scrollBar=document.getElementById('bank-scrollbar');
  const scrollRange=document.getElementById('bank-scroll-range');
  let editedBankId='',contactBankId='';
  let draft=null;

  function syncScrollbar() {
    const max=Math.max(0,viewport.scrollWidth-viewport.clientWidth);
    scrollRange.max=String(max);
    scrollRange.value=String(Math.round(viewport.scrollLeft));
    scrollBar.hidden=max===0;
  }
  scrollRange.addEventListener('input',()=>{viewport.scrollLeft=Number(scrollRange.value);});
  viewport.addEventListener('scroll',syncScrollbar,{passive:true});
  new ResizeObserver(syncScrollbar).observe(viewport);

  function addRepresentative(person={}) {
    representativeEditor.insertAdjacentHTML('beforeend',`
      <div class="bank-representative comment" data-bank-representative>
        <div class="form-grid">${BANK_REPRESENTATIVE_FIELDS.map(([key,label,limit])=>`
          <label>${label}<input name="representative-${key}" maxlength="${limit}" ${key==='name'?'required':''} value="${esc(person[key]||'')}"></label>`).join('')}</div>
        <button type="button" class="subtle" data-remove-bank-representative>Убрать контактное лицо</button>
      </div>`);
  }
  document.getElementById('new-bank-representative').onclick=()=>{
    addRepresentative();
    representativeEditor.lastElementChild.querySelector('input').focus();
  };
  representativeEditor.addEventListener('click',event=>{
    const remove=event.target.closest('[data-remove-bank-representative]');
    remove?.closest('[data-bank-representative]').remove();
  });

  function inlineActions() {
    const disabled=draft.saving?' disabled':'';
    return `<div class="bank-inline-actions">
      <button type="submit" class="primary"${disabled}>Сохранить</button>
      <button type="button" class="subtle" data-bank-inline-cancel${disabled}>Отмена</button>
    </div>`;
  }
  function inlineInput(field,limit,name,value,description='',required=false) {
    const attributes=`name="${name}"${description?` aria-label="${description}"`:''}${required?' required':''}${draft.saving?' readonly':''}`;
    if(field==='date')return `<input type="date" ${attributes} value="${esc(value)}">`;
    if(limit>250)return `<textarea rows="3" maxlength="${limit}" ${attributes}>${esc(value)}</textarea>`;
    return `<input maxlength="${limit}" ${attributes} value="${esc(value)}">`;
  }
  function inlineCell(bank,[field,label,limit],{contact,fallback=''}={}) {
    const description=esc(`${label}: ${bank.name}`);
    if(draft?.id===bank.id&&draft.field===field&&!draft.firstContact){
      return `<td><form class="bank-inline-form">
        ${inlineInput(field,limit,'value',draft.value,description,field==='name'||contactColumns.some(([key])=>key===field))}
        ${inlineActions()}
      </form></td>`;
    }
    const isContact=contact!==undefined;
    const value=isContact?contact?.[field]:bank[field];
    const display=field==='date'?(value?formatDate(value):'Добавить контакт'):(value||'—');
    const editLabel=isContact&&!contact?`Добавить первый контакт: ${description}`:`Изменить поле «${description}»`;
    const edit=`<button type="button" class="bank-inline-edit${field==='name'?' bank-name-pencil':''}" data-bank-inline="${esc(bank.id)}" data-bank-field="${field}"
      data-contact-id="${esc(contact?.id||'')}" aria-label="${editLabel}" title="${editLabel}">
      ${field==='name'?'':`<span class="bank-summary">${esc(display)}</span>`}<span class="bank-inline-icon" aria-hidden="true">${icon('edit')}</span>
    </button>`;
    if(field==='name')return `<td><div class="bank-name-cell">
      <span class="bank-grip" draggable="true" role="button" tabindex="0" data-bank-drag="${esc(bank.id)}"
        aria-label="Переместить банк: ${esc(bank.name)}" title="Перетащить · Alt + ↑ или ↓">⋮⋮</span>
      <button class="bank-name" type="button" data-bank="${esc(bank.id)}">${esc(bank.name)}</button>${edit}
    </div></td>`;
    return `<td>${edit}${!value&&fallback?`<small class="bank-summary muted">Из последнего контакта: ${esc(fallback)}</small>`:''}</td>`;
  }
  function firstContactRow(bank) {
    if(draft?.id!==bank.id||!draft.firstContact)return '';
    return `<tr class="bank-new-contact-row"><td colspan="${1+BANK_PROFILE_FIELDS.length+contactColumns.length}">
      <form class="bank-inline-form bank-new-contact">
        <strong>Первый контакт · ${esc(bank.name)}</strong>
        <div class="form-grid">${contactColumns.map(([key,label,limit])=>`<label>${key==='date'?'Дата контакта':label}
          ${inlineInput(key,limit,key,draft.values[key],'',true)}
        </label>`).join('')}</div>
        ${inlineActions()}
      </form>
    </td></tr>`;
  }

  function render() {
    const activeEditor=document.activeElement?.closest('.bank-inline-form');
    const active=document.activeElement;
    const focusedName=bankList.contains(activeEditor)?active.name:'';
    const selection=focusedName&&active.selectionStart!==null?[active.selectionStart,active.selectionEnd]:null;
    const {banks,bankContacts}=getState();
    const latestByBank=new Map();
    for(const contact of bankContacts){
      const latest=latestByBank.get(contact.bankId);
      if(!latest||compareBankContacts(contact,latest)<=0)latestByBank.set(contact.bankId,contact);
    }
    bankList.innerHTML=banks.length?`
      <table class="bank-table">
        <thead><tr><th>Банк</th>${[...BANK_PROFILE_FIELDS,...contactColumns].map(([,label])=>`<th>${label}</th>`).join('')}</tr></thead>
        <tbody>${banks.map(bank=>{
          const latest=latestByBank.get(bank.id);
          return `<tr data-bank-row="${esc(bank.id)}">
            ${inlineCell(bank,['name','Название банка',180])}
            ${BANK_PROFILE_FIELDS.map(field=>inlineCell(bank,field,{fallback:field[0]==='nextStep'?latest?.nextSteps:''})).join('')}
            ${contactColumns.map(field=>inlineCell(bank,field,{contact:latest??null})).join('')}
          </tr>${firstContactRow(bank)}`;
        }).join('')}</tbody>
      </table>`:`<div class="empty"><span class="module-symbol">${icon('phone')}</span><h3>Добавьте первый банк</h3><p>Откройте карточку банка, чтобы записать итоги звонка или встречи.</p></div>`;
    syncScrollbar();
    const input=focusedName&&bankList.querySelector('.bank-inline-form')?.elements[focusedName];
    if(input){
      input.focus({preventScroll:true});
      if(selection)input.setSelectionRange(...selection);
    }
  }

  function closeInline() {
    const {id,field}=draft;
    draft=null;
    render();
    [...bankList.querySelectorAll('[data-bank-inline]')].find(button=>
      button.dataset.bankInline===id&&button.dataset.bankField===field)?.focus({preventScroll:true});
  }
  const hasUnsaved=()=>Boolean(draft&&(draft.firstContact?
    Object.keys(draft.values).some(key=>draft.values[key]!==draft.original[key]):draft.value!==draft.original));

  let draggedRow=null,dropRow=null;
  function clearDropRow() {
    dropRow?.classList.remove('bank-drop-before','bank-drop-after');
    dropRow=null;
  }
  function endDrag() {
    draggedRow?.classList.remove('bank-row-dragging');
    draggedRow=null;
    clearDropRow();
  }
  function canReorder() {
    if(draft){toast('Сохраните или отмените правку в открытой ячейке.');return false;}
    if(!canEdit()){toast('Дождитесь завершения сохранения.');return false;}
    return true;
  }
  async function reorder(id,target,after,restoreFocus=false) {
    if(!canReorder())return;
    try{
      const state=getState(),next=moveBank(state,id,target,after);
      if(next===state)return;
      await commit(next);
      if(restoreFocus)[...bankList.querySelectorAll('[data-bank-drag]')]
        .find(grip=>grip.dataset.bankDrag===id)?.focus({preventScroll:true});
    }catch(err){toast(err.message);}
  }
  function insertAfter(row,y) {
    const rect=row.getBoundingClientRect();
    return y>rect.top+rect.height/2;
  }
  bankList.addEventListener('dragstart',event=>{
    const grip=event.target.closest('[data-bank-drag]');
    if(!grip)return;
    if(!canReorder()){event.preventDefault();return;}
    draggedRow=grip.closest('[data-bank-row]');
    draggedRow.classList.add('bank-row-dragging');
    event.dataTransfer.effectAllowed='move';
    event.dataTransfer.setData('text/plain',grip.dataset.bankDrag);
  });
  bankList.addEventListener('dragover',event=>{
    if(!draggedRow)return;
    const row=event.target.closest('[data-bank-row]');
    clearDropRow();
    if(!row||row===draggedRow)return;
    event.preventDefault();
    event.dataTransfer.dropEffect='move';
    dropRow=row;
    row.classList.add(insertAfter(row,event.clientY)?'bank-drop-after':'bank-drop-before');
  });
  bankList.addEventListener('dragleave',event=>{
    if(!bankList.contains(event.relatedTarget))clearDropRow();
  });
  bankList.addEventListener('drop',event=>{
    if(!draggedRow)return;
    const row=event.target.closest('[data-bank-row]');
    const id=draggedRow.dataset.bankRow;
    endDrag();
    if(!row||row.dataset.bankRow===id)return;
    event.preventDefault();
    void reorder(id,row.dataset.bankRow,insertAfter(row,event.clientY));
  });
  bankList.addEventListener('dragend',endDrag);
  bankList.addEventListener('keydown',event=>{
    const grip=event.target.closest('[data-bank-drag]');
    if(!grip||!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();
    const row=grip.closest('[data-bank-row]'),down=event.key==='ArrowDown';
    const target=down?row.nextElementSibling:row.previousElementSibling;
    if(target?.dataset.bankRow)void reorder(grip.dataset.bankDrag,target.dataset.bankRow,down,true);
  });
  bankList.addEventListener('click',event=>{
    if(event.target.closest('[data-bank-inline-cancel]')&&draft&&!draft.saving)return closeInline();
    const button=event.target.closest('[data-bank-inline]');
    if(!button)return;
    if(!canEdit())return toast('Редактирование сейчас недоступно. Проверьте статус сохранения.');
    if(hasUnsaved())return toast('Сохраните или отмените правку в открытой ячейке.');
    const state=getState();
    const bank=state.banks.find(item=>item.id===button.dataset.bankInline);
    if(!bank)return;
    const field=button.dataset.bankField;
    const isContact=contactColumns.some(([key])=>key===field);
    const contact=state.bankContacts.find(item=>item.id===button.dataset.contactId&&item.bankId===bank.id);
    if(isContact&&!contact){
      const values={date:today(),contactedBy:'',counterparty:'',outcome:''};
      draft={id:bank.id,field,firstContact:true,original:{...values},values,saving:false};
    }else{
      const value=isContact?contact[field]:bank[field];
      draft={id:bank.id,field,contactId:contact?.id,original:value,value,saving:false};
    }
    render();
    bankList.querySelector('.bank-inline-form')?.elements[draft.firstContact?field:'value']?.focus();
  });
  bankList.addEventListener('input',event=>{
    if(!draft||!event.target.closest('.bank-inline-form'))return;
    if(draft.firstContact)draft.values[event.target.name]=event.target.value;
    else draft.value=event.target.value;
  });
  bankList.addEventListener('keydown',event=>{
    const form=event.target.closest('.bank-inline-form');
    if(!form||!draft||draft.saving)return;
    if(event.key==='Escape'){event.preventDefault();closeInline();}
    if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();form.requestSubmit();}
  });
  bankList.addEventListener('submit',async event=>{
    if(!event.target.matches('.bank-inline-form'))return;
    event.preventDefault();
    if(!draft||draft.saving||!canEdit())return;
    const state=getState();
    const bank=state.banks.find(item=>item.id===draft.id);
    try{
      const contact=state.bankContacts.find(item=>item.id===draft.contactId&&item.bankId===draft.id);
      const record=draft.contactId?contact:bank;
      const stale=draft.firstContact?state.bankContacts.some(item=>item.bankId===draft.id):record?.[draft.field]!==draft.original;
      if(!bank||stale)return toast('Данные изменились. Скопируйте правку, отмените её и откройте актуальное значение.');
      const change={[draft.field]:draft.value};
      let next;
      if(draft.firstContact)next=addBankContact(state,{bankId:bank.id,...draft.values});
      else if(contact)next=saveBankContact(state,{id:contact.id,...change});
      else next=saveBank(state,{id:bank.id,name:bank.name,...change});
      const message=draft.firstContact?'Контакт добавлен':'Поле сохранено';
      if(next!==state){
        draft.saving=true;
        render();
        await commit(next);
      }
      closeInline();
      if(next!==state&&isFullySaved())toast(message);
    }catch(err){
      draft.saving=false;
      render();
      toast(err.message);
    }
  });

  function showDetails(id) {
    const {banks,bankContacts}=getState();
    const bank=banks.find(item=>item.id===id);
    if(!bank)return;
    const history=bankContacts.filter(c=>c.bankId===id).reverse().sort(compareBankContacts);
    document.getElementById('bank-detail-content').innerHTML=`
      <div class="dialog-head">
        <div class="detail-title-wrap"><div class="eyebrow">КАРТОЧКА БАНКА</div><h2 id="bank-title">${esc(bank.name)}</h2></div>
        <button type="button" class="icon-button" data-close="bank-details" aria-label="Закрыть">${icon('close')}</button>
      </div>
      <div class="dialog-body">
        <div class="bank-history-heading">
          <h3>Статус и контакты банка</h3>
          <div class="bank-actions">
            <button id="rename-bank" type="button" class="subtle">${icon('edit')} Редактировать карточку</button>
            <button id="new-bank-contact" type="button" class="primary">${icon('plus')} Добавить контакт</button>
          </div>
        </div>
        <dl class="detail-grid bank-profile">
          ${BANK_PROFILE_FIELDS.map(([key,label])=>`<div><dt>${label}</dt><dd>${esc(bank[key]||'—')}</dd></div>`).join('')}
          <div><dt>Статус обновлён</dt><dd>${bank.statusDate?formatDate(bank.statusDate):'—'}</dd></div>
        </dl>
        <section class="detail-section">
          <h3>Контактные лица <span class="muted">(${bank.representatives.length})</span></h3>
          ${bank.representatives.map(person=>`<article class="comment bank-representative">
            <strong>${esc(person.name)}</strong>
            <dl class="detail-grid">${BANK_REPRESENTATIVE_FIELDS.slice(1).filter(([key])=>person[key]).map(([key,label])=>`<div><dt>${label}</dt><dd>${esc(person[key])}</dd></div>`).join('')}</dl>
          </article>`).join('')||'<p class="muted">Контактные лица не указаны.</p>'}
        </section>
        <h3>История контактов <span class="muted">(${history.length})</span></h3>
        ${history.map(contact=>`
          <article class="comment bank-contact">
            <div class="comment-header"><strong><time datetime="${esc(contact.date)}">${formatDate(contact.date)}</time></strong></div>
            <dl class="detail-grid">${contactFields.map(([key,label])=>`<div><dt>${label}</dt><dd>${esc(contact[key]||'—')}</dd></div>`).join('')}</dl>
          </article>`).join('')||'<p class="muted">Контактов пока нет. Добавьте первую запись после звонка или встречи.</p>'}
      </div>`;
    document.getElementById('rename-bank').onclick=()=>openBankEditor(bank);
    document.getElementById('new-bank-contact').onclick=()=>openContactEditor(bank);
    if(!details.open)details.showModal();
  }

  function openBankEditor(bank) {
    if(!canEdit())return toast('Редактирование сейчас недоступно. Проверьте статус сохранения.');
    editedBankId=bank?.id||'';
    document.getElementById('bank-editor-title').textContent=bank?'Редактировать банк':'Новый банк';
    bankForm.elements.bankName.value=bank?.name||'';
    for(const key of [...BANK_PROFILE_FIELDS.map(([key])=>key),'statusDate'])bankForm.elements[key].value=bank?.[key]||'';
    representativeEditor.replaceChildren();
    for(const person of bank?.representatives||[])addRepresentative(person);
    bankForm.querySelector('.form-error').textContent='';
    bankEditor.showModal();
  }

  function openContactEditor(bank) {
    if(!canEdit())return toast('Редактирование сейчас недоступно. Проверьте статус сохранения.');
    contactBankId=bank.id;
    contactForm.reset();
    contactForm.elements.date.value=today();
    document.getElementById('contact-bank-name').textContent=bank.name;
    document.getElementById('bank-staff').innerHTML=getState().people.filter(person=>person.active)
      .map(person=>`<option value="${esc(person.fullName)}"></option>`).join('');
    document.getElementById('bank-representatives').innerHTML=bank.representatives
      .map(person=>`<option value="${esc(person.name)}"></option>`).join('');
    contactForm.querySelector('.form-error').textContent='';
    contactEditor.showModal();
  }

  function onSave(form,dialog,save,message,afterSave) {
    form.onsubmit=async event=>{
      event.preventDefault();
      const error=form.querySelector('.form-error');
      if(!canEdit()){
        error.textContent='Редактирование сейчас недоступно. Проверьте статус сохранения.';
        return;
      }
      const submit=form.querySelector('[type="submit"]');
      submit.disabled=true;
      error.textContent='';
      try{
        const state=getState();
        const next=save(state,Object.fromEntries(new FormData(form)));
        if(next!==state)await commit(next);
        dialog.close();
        afterSave();
        if(next!==state&&isFullySaved())toast(message);
      }catch(err){
        error.textContent=err.message;
      }finally{
        submit.disabled=false;
      }
    };
  }

  onSave(bankForm,bankEditor,(state,input)=>{
    const representatives=[...representativeEditor.querySelectorAll('[data-bank-representative]')].map(row=>
      Object.fromEntries(BANK_REPRESENTATIVE_FIELDS.map(([key])=>[key,row.querySelector(`[name="representative-${key}"]`).value])));
    const profile=Object.fromEntries(BANK_PROFILE_FIELDS.map(([key])=>[key,input[key]]));
    return saveBank(state,{id:editedBankId,name:input.bankName,...profile,statusDate:input.statusDate,representatives});
  },'Банк сохранён',()=>{
    if(editedBankId)showDetails(editedBankId);
  });
  onSave(contactForm,contactEditor,(state,input)=>addBankContact(state,{...input,bankId:contactBankId}),'Контакт сохранён',()=>{
    showDetails(contactBankId);
  });
  document.getElementById('new-bank').onclick=()=>openBankEditor();
  section.addEventListener('click',event=>{
    const bank=event.target.closest('[data-bank]');
    if(bank)showDetails(bank.dataset.bank);
  });
  return {render,hasUnsaved};
}

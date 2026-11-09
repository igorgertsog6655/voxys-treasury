import {addBankContact,compareBankContacts,saveBank,today} from './model.js';

const contactFields = [
  ['contactedBy','Кто контактировал'],
  ['counterparty','С кем контактировали'],
  ['outcome','Статус / договорённости'],
  ['nextSteps','Дальнейшие шаги']
];

export function createBanksUI({getState,commit,canEdit,isFullySaved,toast,esc,formatDate,icon}) {
  const section=document.getElementById('banks');
  section.innerHTML=`
    <div class="section-heading bank-heading">
      <div><h2>Работа с банками</h2><p>Последний контакт, договорённости и дальнейшие шаги по каждому банку.</p></div>
      <button id="new-bank" class="primary" type="button">${icon('plus')} Добавить банк</button>
    </div>
    <div class="registry" id="bank-list"></div>`;
  document.body.insertAdjacentHTML('beforeend',`
    <dialog id="bank-details" aria-labelledby="bank-title">
      <div id="bank-detail-content"></div>
    </dialog>
    <dialog id="bank-editor" aria-labelledby="bank-editor-title">
      <form id="bank-form">
        <div class="dialog-head"><h2 id="bank-editor-title">Новый банк</h2><button type="button" class="icon-button" data-close="bank-editor" aria-label="Закрыть">${icon('close')}</button></div>
        <div class="dialog-body">
          <label>Название банка<input name="bankName" required maxlength="180"></label>
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
            <label>С кем контактировали<input name="counterparty" required maxlength="250" placeholder="Имя и должность"></label>
          </div>
          <datalist id="bank-staff"></datalist>
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
  let editedBankId='',contactBankId='';

  function render() {
    const {banks,bankContacts}=getState();
    const latestByBank=new Map();
    for(const contact of bankContacts){
      const latest=latestByBank.get(contact.bankId);
      if(!latest||compareBankContacts(contact,latest)<=0)latestByBank.set(contact.bankId,contact);
    }
    document.getElementById('bank-list').innerHTML=banks.length?`
      <div class="table-scroll"><table class="bank-table">
        <thead><tr><th>Банк</th><th>Последний контакт</th>${contactFields.map(([,label])=>`<th>${label}</th>`).join('')}</tr></thead>
        <tbody>${[...banks].sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(bank=>{
          const latest=latestByBank.get(bank.id);
          return `<tr>
            <td><button class="bank-name" type="button" data-bank="${esc(bank.id)}">${esc(bank.name)}</button></td>
            <td>${latest?formatDate(latest.date):'Контактов пока нет'}</td>
            ${contactFields.map(([key])=>`<td><div class="bank-summary">${esc(latest?.[key]||'—')}</div></td>`).join('')}
          </tr>`;
        }).join('')}</tbody>
      </table></div>`:`<div class="empty"><span class="module-symbol">${icon('phone')}</span><h3>Добавьте первый банк</h3><p>Откройте карточку банка, чтобы записать итоги звонка или встречи.</p></div>`;
  }

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
          <h3>История контактов <span class="muted">(${history.length})</span></h3>
          <div class="bank-actions">
            <button id="rename-bank" type="button" class="subtle">${icon('edit')} Переименовать</button>
            <button id="new-bank-contact" type="button" class="primary">${icon('plus')} Добавить контакт</button>
          </div>
        </div>
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
    document.getElementById('bank-editor-title').textContent=bank?'Переименовать банк':'Новый банк';
    bankForm.elements.bankName.value=bank?.name||'';
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

  onSave(bankForm,bankEditor,(state,input)=>saveBank(state,{id:editedBankId,name:input.bankName}),'Банк сохранён',()=>{
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
  return {render};
}

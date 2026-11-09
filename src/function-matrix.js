import {deleteTreasuryFunction,saveTreasuryFunction,setFunctionAssignment} from './model.js';

export function createFunctionMatrix({getState,commit,canEdit,toast,esc,icon,isFullySaved}) {
  const section=document.getElementById('function-matrix');
  if(!section)return {render(){}};
  section.innerHTML=`
    <div class="section-heading matrix-heading">
      <div><h2>Матрица функций казначейства</h2><p>Отметьте всех исполнителей, которые выполняют функцию. Столбцы обновляются по справочнику исполнителей.</p></div>
      <button id="new-treasury-function" type="button" class="primary">${icon('plus')} Добавить функцию</button>
    </div>
    <div class="registry">
      <p id="matrix-people-hint" class="matrix-hint" hidden>Добавьте людей в <a href="#executors">справочник исполнителей</a>, чтобы назначить им функции.</p>
      <div class="table-scroll matrix-scroll" id="matrix-list"></div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend',`
    <dialog id="treasury-function-editor" aria-labelledby="treasury-function-title">
      <form>
        <div class="dialog-head">
          <h2 id="treasury-function-title">Новая функция</h2>
          <button type="button" class="icon-button" data-close="treasury-function-editor" aria-label="Закрыть">${icon('close')}</button>
        </div>
        <div class="dialog-body">
          <label>Название функции<input name="functionName" required maxlength="200"></label>
          <p class="form-error" role="alert"></p>
        </div>
        <div class="dialog-foot">
          <button type="button" data-close="treasury-function-editor">Отмена</button>
          <button type="submit" class="primary">Сохранить функцию</button>
        </div>
      </form>
    </dialog>`);
  const dialog=document.getElementById('treasury-function-editor');
  const form=dialog.querySelector('form');
  const submit=form.querySelector('[type="submit"]');
  const error=form.querySelector('.form-error');
  const list=document.getElementById('matrix-list');
  let editingId='';

  function render() {
    const {people,treasuryFunctions,functionAssignments}=getState();
    const columns=[...people].sort((a,b)=>a.fullName.localeCompare(b.fullName,'ru'));
    const marks=new Map();
    for(const {functionId,personId} of functionAssignments){
      if(!marks.has(functionId))marks.set(functionId,new Set());
      marks.get(functionId).add(personId);
    }
    const focused=list.contains(document.activeElement)?document.activeElement.dataset:null;
    document.getElementById('matrix-people-hint').hidden=columns.length>0;
    list.innerHTML=treasuryFunctions.length?`
      <table class="matrix-table">
        <thead><tr><th scope="col">Функция</th>${columns.map(person=>`
          <th scope="col"><span>${esc(person.fullName)}</span><small>${esc(person.position)}${person.active?'':' · Архив'}</small></th>`).join('')}</tr></thead>
        <tbody>${treasuryFunctions.map(row=>`
          <tr>
            <th scope="row"><div class="matrix-function">
              <span>${esc(row.name)}</span>
              <div class="matrix-actions">
                <button type="button" class="subtle" data-function-edit="${esc(row.id)}" aria-label="Изменить функцию: ${esc(row.name)}">Изменить</button>
                <button type="button" class="subtle" data-function-delete="${esc(row.id)}" aria-label="Удалить функцию: ${esc(row.name)}">Удалить</button>
              </div>
            </div></th>
            ${columns.map(person=>`
              <td><input type="checkbox" data-matrix-function="${esc(row.id)}" data-matrix-person="${esc(person.id)}"
                aria-label="${esc(row.name)} — ${esc(person.fullName)}"${marks.get(row.id)?.has(person.id)?' checked':''}></td>`).join('')}
          </tr>`).join('')}</tbody>
      </table>`:'<div class="empty"><h3>Функций пока нет</h3><p>Добавьте функцию, чтобы назначить исполнителей.</p></div>';
    if(focused?.matrixFunction){
      const checkbox=[...list.querySelectorAll('[data-matrix-function]')].find(input=>
        input.dataset.matrixFunction===focused.matrixFunction&&input.dataset.matrixPerson===focused.matrixPerson);
      checkbox?.focus({preventScroll:true});
    }
  }

  function openEditor(row) {
    if(!canEdit())return toast('Редактирование сейчас недоступно. Проверьте статус сохранения.');
    editingId=row?.id||'';
    document.getElementById('treasury-function-title').textContent=row?'Изменить функцию':'Новая функция';
    form.elements.functionName.value=row?.name||'';
    error.textContent='';
    dialog.showModal();
  }

  document.getElementById('new-treasury-function').onclick=()=>openEditor();
  form.onsubmit=async event=>{
    event.preventDefault();
    if(submit.disabled)return;
    if(!canEdit()){error.textContent='Дождитесь завершения сохранения.';return;}
    submit.disabled=true;
    error.textContent='';
    try{
      const state=getState();
      const next=saveTreasuryFunction(state,{id:editingId,name:form.elements.functionName.value});
      if(next!==state)await commit(next);
      dialog.close();
      if(next!==state&&isFullySaved())toast('Функция сохранена');
    }catch(err){error.textContent=err.message;}
    finally{submit.disabled=false;}
  };

  list.addEventListener('click',async event=>{
    const button=event.target.closest('[data-function-edit], [data-function-delete]');
    if(!button)return;
    const id=button.dataset.functionEdit||button.dataset.functionDelete;
    const row=getState().treasuryFunctions.find(item=>item.id===id);
    if(!row)return;
    if(button.dataset.functionEdit)return openEditor(row);
    if(!canEdit())return toast('Дождитесь завершения сохранения.');
    const hasAssignments=getState().functionAssignments.some(item=>item.functionId===id);
    if(!confirm(`Удалить функцию «${row.name}»?${hasAssignments?' Назначения по ней тоже будут удалены.':''}`))return;
    try{
      await commit(deleteTreasuryFunction(getState(),id));
      if(isFullySaved())toast('Функция удалена');
    }catch(err){toast(err.message);}
  });

  list.addEventListener('change',async event=>{
    const input=event.target.closest('[data-matrix-function]');
    if(!input)return;
    const functionId=input.dataset.matrixFunction,personId=input.dataset.matrixPerson;
    try{
      if(!canEdit())throw Error('Дождитесь завершения сохранения.');
      const state=getState();
      const next=setFunctionAssignment(state,functionId,personId,input.checked);
      if(next!==state)await commit(next);
    }catch(err){
      input.checked=getState().functionAssignments.some(row=>row.functionId===functionId&&row.personId===personId);
      toast(err.message);
    }
  });
  return {render};
}

import {addFunctionSection,deleteFunctionSection,deleteTreasuryFunction,moveTreasuryFunction,saveTreasuryFunction,setFunctionAssignment} from './model.js';
import {createPinnedTableHeader} from './pinned-table-header.js';

export function createFunctionMatrix({getState,commit,canEdit,toast,esc,icon,isFullySaved}) {
  const section=document.getElementById('function-matrix');
  if(!section)return {render(){}};
  section.innerHTML=`
    <div class="section-heading matrix-heading">
      <div><h2>Матрица функций казначейства</h2><p>Отметьте всех исполнителей, которые выполняют функцию. Столбцы обновляются по составу команды.</p></div>
      <div class="matrix-heading-actions">
        <button id="new-function-section" type="button">${icon('plus')} Добавить раздел</button>
        <button id="new-treasury-function" type="button" class="primary">${icon('plus')} Добавить функцию</button>
      </div>
    </div>
    <div class="registry">
      <p class="matrix-hint matrix-sort-hint">Перетащите функцию за ⋮⋮ вверх, вниз или в другой раздел.</p>
      <p id="matrix-people-hint" class="matrix-hint" hidden>Добавьте людей в раздел <a href="#executors">«Команда»</a>, чтобы назначить им функции.</p>
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
          <label><span id="matrix-editor-label">Название функции</span><input name="functionName" required maxlength="200"></label>
          <label id="matrix-section-field">Раздел<select name="sectionId" required></select></label>
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
  const updatePinnedHeader=createPinnedTableHeader(list);
  const newFunction=document.getElementById('new-treasury-function');
  let editingId='';
  let sectionMode=false;
  let dragged=null,dropTarget=null;

  function render() {
    const {people,treasuryFunctions,functionAssignments,functionSections}=getState();
    const columns=[...people].sort((a,b)=>a.fullName.localeCompare(b.fullName,'ru'));
    const marks=new Map();
    for(const {functionId,personId} of functionAssignments){
      if(!marks.has(functionId))marks.set(functionId,new Set());
      marks.get(functionId).add(personId);
    }
    const focused=list.contains(document.activeElement)?document.activeElement.dataset:null;
    newFunction.disabled=!functionSections.length;
    document.getElementById('matrix-people-hint').hidden=columns.length>0;
    list.innerHTML=functionSections.length?`
      <table class="matrix-table">
        <thead><tr><th scope="col">Функция</th>${columns.map(person=>`
          <th scope="col"><span>${esc(person.fullName)}</span><small>${esc(person.position)}${person.active?'':' · Архив'}</small></th>`).join('')}</tr></thead>
        ${functionSections.map(group=>{
          const rows=treasuryFunctions.filter(row=>row.sectionId===group.id);
          return `<tbody data-matrix-section="${esc(group.id)}">
          <tr class="matrix-section-row" data-matrix-section-header>
            <th scope="rowgroup"><div class="matrix-function">
              <span>${esc(group.name)} <small>${rows.length}</small></span>
              ${rows.length?'':`<button type="button" class="icon-button action-icon delete-icon" data-section-delete="${esc(group.id)}"
                title="Удалить раздел: ${esc(group.name)}" aria-label="Удалить раздел: ${esc(group.name)}">${icon('trash')}</button>`}
            </div></th>
            ${columns.length?`<td colspan="${columns.length}">${rows.length?'':'Перетащите функцию сюда'}</td>`:''}
          </tr>
          ${rows.map(row=>`
          <tr data-matrix-row="${esc(row.id)}">
            <th scope="row"><div class="matrix-function">
              <span class="matrix-grip" draggable="true" role="button" tabindex="0" data-matrix-drag="${esc(row.id)}"
                aria-label="Переместить функцию: ${esc(row.name)}" title="Перетащить · Alt + ↑ или ↓">⋮⋮</span>
              <span${marks.has(row.id)?'':' class="matrix-unassigned" title="Нет назначенных исполнителей"'}>${esc(row.name)}</span>
              <div class="matrix-actions">
                <button type="button" class="icon-button action-icon" data-function-edit="${esc(row.id)}"
                  title="Изменить функцию: ${esc(row.name)}" aria-label="Изменить функцию: ${esc(row.name)}">${icon('edit')}</button>
                <button type="button" class="icon-button action-icon delete-icon" data-function-delete="${esc(row.id)}"
                  title="Удалить функцию: ${esc(row.name)}" aria-label="Удалить функцию: ${esc(row.name)}">${icon('trash')}</button>
              </div>
            </div></th>
            ${columns.map(person=>`
              <td><input type="checkbox" data-matrix-function="${esc(row.id)}" data-matrix-person="${esc(person.id)}"
                aria-label="${esc(row.name)} — ${esc(person.fullName)}"${marks.get(row.id)?.has(person.id)?' checked':''}></td>`).join('')}
          </tr>`).join('')}</tbody>`;
        }).join('')}
      </table>`:'<div class="empty"><h3>Разделов пока нет</h3><p>Добавьте раздел, затем создайте в нём функции.</p></div>';
    updatePinnedHeader(list.querySelector('.matrix-table'));
    if(focused?.matrixFunction){
      const checkbox=[...list.querySelectorAll('[data-matrix-function]')].find(input=>
        input.dataset.matrixFunction===focused.matrixFunction&&input.dataset.matrixPerson===focused.matrixPerson);
      checkbox?.focus({preventScroll:true});
    }
    if(focused?.matrixDrag){
      const grip=[...list.querySelectorAll('[data-matrix-drag]')].find(item=>item.dataset.matrixDrag===focused.matrixDrag);
      grip?.focus({preventScroll:true});
    }
  }

  function openEditor(row,{newSection=false}={}) {
    if(!canEdit())return toast('Редактирование сейчас недоступно. Проверьте статус сохранения.');
    editingId=row?.id||'';
    sectionMode=newSection;
    document.getElementById('treasury-function-title').textContent=newSection?'Новый раздел':row?'Изменить функцию':'Новая функция';
    document.getElementById('matrix-editor-label').textContent=newSection?'Название раздела':'Название функции';
    document.getElementById('matrix-section-field').hidden=newSection;
    const sections=getState().functionSections;
    form.elements.sectionId.innerHTML=sections.map(group=>`<option value="${esc(group.id)}">${esc(group.name)}</option>`).join('');
    form.elements.sectionId.value=row?.sectionId||sections[0]?.id||'';
    form.elements.sectionId.disabled=newSection;
    form.elements.functionName.maxLength=newSection?120:200;
    form.elements.functionName.value=row?.name||'';
    submit.textContent=newSection?'Добавить раздел':'Сохранить функцию';
    error.textContent='';
    dialog.showModal();
  }

  newFunction.onclick=()=>openEditor();
  document.getElementById('new-function-section').onclick=()=>openEditor(null,{newSection:true});
  form.onsubmit=async event=>{
    event.preventDefault();
    if(submit.disabled)return;
    if(!canEdit()){error.textContent='Дождитесь завершения сохранения.';return;}
    submit.disabled=true;
    error.textContent='';
    try{
      const state=getState();
      const name=form.elements.functionName.value;
      const next=sectionMode?addFunctionSection(state,name):
        saveTreasuryFunction(state,{id:editingId,name,sectionId:form.elements.sectionId.value});
      if(next!==state)await commit(next);
      dialog.close();
      if(next!==state&&isFullySaved())toast(sectionMode?'Раздел добавлен':'Функция сохранена');
    }catch(err){error.textContent=err.message;}
    finally{submit.disabled=false;}
  };

  list.addEventListener('click',async event=>{
    const sectionButton=event.target.closest('[data-section-delete]');
    if(sectionButton){
      if(!canEdit())return toast('Дождитесь завершения сохранения.');
      const id=sectionButton.dataset.sectionDelete;
      const group=getState().functionSections.find(item=>item.id===id);
      if(!group||!confirm(`Удалить пустой раздел «${group.name}»?`))return;
      try{
        await commit(deleteFunctionSection(getState(),id));
        if(isFullySaved())toast('Раздел удалён');
      }catch(err){toast(err.message);}
      return;
    }
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
  async function move(id,sectionId,targetId,after) {
    if(!canEdit())return toast('Дождитесь завершения сохранения.');
    try{
      const state=getState();
      const next=moveTreasuryFunction(state,id,sectionId,targetId,after);
      if(next!==state)await commit(next);
    }catch(err){toast(err.message);}
  }

  function clearDropTarget() {
    dropTarget?.classList.remove('matrix-drop-before','matrix-drop-after');
    dropTarget=null;
  }
  function endDrag() {
    dragged?.row.classList.remove('matrix-dragging');
    dragged=null;
    clearDropTarget();
  }
  function targetFor(event) {
    const row=event.target.closest('[data-matrix-row], [data-matrix-section-header]');
    const group=row?.closest('[data-matrix-section]');
    if(!group||row===dragged.row)return null;
    const rect=row.getBoundingClientRect();
    return {row,sectionId:group.dataset.matrixSection,targetId:row.dataset.matrixRow||'',after:event.clientY>rect.top+rect.height/2};
  }
  list.addEventListener('dragstart',event=>{
    const grip=event.target.closest('[data-matrix-drag]');
    if(!grip)return;
    if(!canEdit()){event.preventDefault();return;}
    dragged={id:grip.dataset.matrixDrag,row:grip.closest('[data-matrix-row]')};
    event.dataTransfer.effectAllowed='move';
    event.dataTransfer.setData('text/plain',dragged.id);
    dragged.row.classList.add('matrix-dragging');
  });
  list.addEventListener('dragover',event=>{
    if(!dragged)return;
    const target=targetFor(event);
    clearDropTarget();
    if(!target)return;
    event.preventDefault();
    event.dataTransfer.dropEffect='move';
    dropTarget=target.row;
    dropTarget.classList.add(!target.targetId||target.after?'matrix-drop-after':'matrix-drop-before');
  });
  list.addEventListener('dragleave',event=>{
    if(!list.contains(event.relatedTarget))clearDropTarget();
  });
  list.addEventListener('drop',event=>{
    if(!dragged)return;
    const target=targetFor(event),id=dragged.id;
    endDrag();
    if(!target)return;
    event.preventDefault();
    void move(id,target.sectionId,target.targetId,target.after);
  });
  list.addEventListener('dragend',endDrag);
  list.addEventListener('keydown',event=>{
    const grip=event.target.closest('[data-matrix-drag]');
    if(!grip||!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();
    const row=grip.closest('[data-matrix-row]'),down=event.key==='ArrowDown';
    const target=down?row.nextElementSibling:row.previousElementSibling;
    if(target?.dataset.matrixRow)void move(grip.dataset.matrixDrag,row.parentElement.dataset.matrixSection,target.dataset.matrixRow,down);
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

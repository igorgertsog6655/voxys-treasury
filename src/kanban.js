import {saveTask,STATUSES} from './model.js';

export function transitionTask(state,{id,from,status,assignment,author,comment}) {
  const task=state.tasks.find(item=>item.id===id);
  if(!task)throw Error('Задача не найдена.');
  if(task.status!==from)throw Error('Статус задачи уже изменился. Откройте перенос заново.');
  if(!STATUSES.includes(status)||status===from)throw Error('Выберите другой статус.');
  if(!comment.trim())throw Error('Добавьте комментарий к переходу.');
  return saveTask(state,{...task,status,holder:assignment.holder,holderId:assignment.holderId},author,comment);
}

export function createKanbanMoves({root,getState,commit,canEdit,peopleUI,toast,esc,isFullySaved}) {
  document.body.insertAdjacentHTML('beforeend',`
    <dialog id="kanban-move-dialog" aria-labelledby="kanban-move-title">
      <form id="kanban-move-form">
        <div class="dialog-head">
          <h2 id="kanban-move-title">Переместить задачу</h2>
          <button type="button" class="icon-button" data-close="kanban-move-dialog" aria-label="Закрыть">×</button>
        </div>
        <div class="dialog-body">
          <p class="kanban-move-task" id="kanban-move-task"></p>
          <p class="muted" id="kanban-move-from"></p>
          <label>Новый статус<select name="status" required></select></label>
          <label>Текущий исполнитель<select name="holderId"></select><input type="hidden" name="holder"></label>
          <label>Комментарий к переходу <span class="required">*</span><textarea name="comment" required maxlength="15000" rows="3" placeholder="Почему меняется статус и что дальше?"></textarea></label>
          <label>Автор изменения<input name="author" required maxlength="120"></label>
          <p class="form-error" role="alert"></p>
        </div>
        <div class="dialog-foot">
          <button type="button" data-close="kanban-move-dialog">Отмена</button>
          <button type="submit" class="primary">Сохранить переход</button>
        </div>
      </form>
    </dialog>`);
  const dialog=document.getElementById('kanban-move-dialog');
  const form=dialog.querySelector('form');
  const error=form.querySelector('.form-error');
  const submit=form.querySelector('[type="submit"]');
  let pending=null;
  let dragged=null;
  let highlighted=null;

  function open(id,target='') {
    if(!canEdit())return toast('Перенос сейчас недоступен. Проверьте статус сохранения.');
    const task=getState().tasks.find(item=>item.id===id);
    if(!task||dialog.open||target===task.status)return;
    pending={id,from:task.status};
    form.reset();
    document.getElementById('kanban-move-task').textContent=task.title;
    document.getElementById('kanban-move-from').textContent='Текущий статус: '+task.status;
    form.elements.status.innerHTML='<option value="">Выберите статус</option>'+STATUSES
      .filter(status=>status!==task.status).map(status=>`<option>${esc(status)}</option>`).join('');
    form.elements.status.value=target;
    form.elements.holder.value=task.holder;
    peopleUI.fill(form,task,['holder']);
    form.elements.author.value=localStorage.getItem('voxys.author')||'Игорь Герцог';
    error.textContent='';
    dialog.showModal();
    (target?form.elements.holderId:form.elements.status).focus();
  }

  form.onsubmit=async event=>{
    event.preventDefault();
    if(!pending||submit.disabled)return;
    if(!canEdit()){
      error.textContent='Перенос сейчас недоступен. Проверьте статус сохранения.';
      return;
    }
    const {status,author,comment}=form.elements;
    const target=status.value;
    submit.disabled=true;
    error.textContent='';
    try{
      const next=transitionTask(getState(),{
        ...pending,status:target,author:author.value.trim(),comment:comment.value,
        assignment:peopleUI.assignments(form,['holder'])
      });
      await commit(next);
      localStorage.setItem('voxys.author',author.value.trim());
      dialog.close();
      if(isFullySaved())toast(`Задача перемещена в «${target}»`);
    }catch(err){
      error.textContent=err.message;
    }finally{
      submit.disabled=false;
    }
  };

  function highlight(column) {
    if(highlighted===column)return;
    highlighted?.classList.remove('board-drop-target');
    highlighted=column;
    highlighted?.classList.add('board-drop-target');
  }
  function endDrag() {
    dragged?.classList.remove('board-dragging');
    dragged=null;
    highlight(null);
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-kanban-move]');
    if(button)open(button.dataset.kanbanMove);
  });
  root.addEventListener('dragstart',event=>{
    const card=event.target.closest('[data-kanban-card]');
    if(!card)return;
    if(!canEdit()){
      event.preventDefault();
      return;
    }
    dragged=card;
    event.dataTransfer.effectAllowed='move';
    event.dataTransfer.setData('text/plain',card.dataset.kanbanCard);
    card.classList.add('board-dragging');
  });
  root.addEventListener('dragover',event=>{
    if(!dragged)return;
    const column=event.target.closest('[data-kanban-status]');
    if(!column||column.dataset.kanbanStatus===dragged.dataset.kanbanSource){
      highlight(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect='move';
    highlight(column);
  });
  root.addEventListener('dragleave',event=>{
    if(!root.contains(event.relatedTarget))highlight(null);
  });
  root.addEventListener('drop',event=>{
    if(!dragged)return;
    const column=event.target.closest('[data-kanban-status]');
    const id=dragged.dataset.kanbanCard;
    const source=dragged.dataset.kanbanSource;
    endDrag();
    if(column&&column.dataset.kanbanStatus!==source){
      event.preventDefault();
      open(id,column.dataset.kanbanStatus);
    }
  });
  root.addEventListener('dragend',endDrag);
}

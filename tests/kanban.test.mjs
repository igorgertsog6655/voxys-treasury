import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createKanbanMoves} from '../src/kanban.js';
import {blankState,saveTask} from '../src/model.js';

test('Карточка отображается только в одной колонке при переносе, отмене и сохранении',async t=>{
  let state=saveTask(blankState(),{
    title:'Задача 1',status:'Бэклог',priority:'Обычный',owner:'Казначей',holder:'Казначей',
    stage:'',description:'',nextStep:'',due:'',links:[]
  },'Автор');
  const id=state.tasks[0].id;
  const events=()=>({
    handlers:new Map(),
    addEventListener(name,handler){this.handlers.set(name,handler);},
    emit(name,event={}){return this.handlers.get(name)?.(event);}
  });
  const status={...events(),focus(){}},submit={disabled:false},error={textContent:''};
  const form={
    elements:{status,holderId:{focus(){}},holder:{},author:{},comment:{}},
    querySelector:selector=>selector==='.form-error'?error:submit,
    querySelectorAll:()=>[],
    reset(){}
  };
  const dialog={
    ...events(),querySelector:()=>form,open:false,
    showModal(){this.open=true;},
    close(){this.open=false;this.emit('close');}
  };
  const root={...events(),querySelectorAll:()=>[]};
  const labels=new Map([['kanban-move-dialog',dialog],['kanban-move-task',{}],['kanban-move-from',{}]]);
  const previousDocument=globalThis.document;
  const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  globalThis.document={body:{insertAdjacentHTML(){}},getElementById:key=>labels.get(key)};
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem(){}}});
  t.after(()=>{
    if(previousDocument===undefined)delete globalThis.document;
    else globalThis.document=previousDocument;
    if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);
    else delete globalThis.localStorage;
  });
  const renderings=[];
  const kanban=createKanbanMoves({
    root,getState:()=>state,canEdit:()=>true,toast(){},esc:value=>value,isFullySaved:()=>true,
    peopleUI:{fill(){},assignments:()=>({holder:'Казначей',holderId:''})},
    refresh:()=>renderings.push(state.tasks.map(task=>[task.id,kanban.statusFor(task)])),
    commit:async next=>{state=next;}
  });
  const open=()=>root.emit('click',{target:{closest:()=>({dataset:{kanbanMove:id}})}});
  const selectWork=()=>{status.value='В работе';status.emit('change');};
  open();
  selectWork();
  assert.deepEqual(renderings.at(-1),[[id,'В работе']]);
  assert.equal(state.tasks[0].status,'Бэклог');
  dialog.close();
  assert.deepEqual(renderings.at(-1),[[id,'Бэклог']]);

  open();
  selectWork();
  form.elements.comment.value='Перенос подтверждён';
  await form.onsubmit({preventDefault(){}});
  assert.deepEqual(renderings.at(-1),[[id,'В работе']]);
  assert.equal(state.tasks[0].status,'В работе');
  assert.equal(state.comments.length,1);
  assert.equal(error.textContent,'');
});

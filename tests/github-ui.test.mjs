import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubUI} from '../src/github-ui.js';
async function harness(action,{fail=false,automatic=false,cancel=false,dirty=false,loaded={tasks:[{id:'loaded'}],people:[]}}={}){const originals={document:globalThis.document,localStorage:globalThis.localStorage,confirm:globalThis.confirm};const selectors=new Map();const button={disabled:false};const form={elements:{repository:{value:'user/private'},path:{value:'tasks.xlsx'},token:{value:'test-token'},remember:{checked:false}},querySelector:()=>button};for(const key of ['#github-dialog','#github-error','#github-connect','#github-disconnect','#github-refresh'])selectors.set(key,{textContent:'',close(){},showModal(){}});selectors.set('#github-form',form);globalThis.document={body:{insertAdjacentHTML(){}},querySelector:s=>selectors.get(s)};const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};globalThis.confirm=()=>!cancel;let state={tasks:cancel?[{id:'local'}]:[],people:[],banks:[]},remote=null,ui,loadCount=0;const newTask={disabled:false},states=[];const store={config:{repository:'user/private',path:'tasks.xlsx'},load:async()=>{loadCount++;if(fail)throw Error('Ошибка сети');return new Uint8Array([1]);},save:async()=>{}};const services={createStore:()=>store,remember:async()=>{},forget:async()=>{},restore:async()=>automatic?{config:store.config,token:'test-token'}:null};try{ui=createGitHubUI({getState:()=>state,encode:()=>new Uint8Array(),decode:()=>loaded,replaceLocal:async s=>{state=s;},setRemote:s=>{remote=s;},canEdit:()=>true,toast:()=>{},refresh:()=>{newTask.disabled=ui?.isWorking()||false;states.push(newTask.disabled);},hasUnsynced:()=>dirty},services);await action({ui,form,selectors,newTask,states,getRemote:()=>remote,getState:()=>state,getLoadCount:()=>loadCount});}finally{for(const [key,v]of Object.entries(originals)){if(v===undefined)delete globalThis[key];else globalThis[key]=v;}}}
test('После подключения кнопка новой задачи снова доступна',async()=>harness(async({ui,form,newTask,states,getRemote})=>{await form.onsubmit({preventDefault(){},target:form});assert.ok(states.includes(true));assert.equal(ui.isWorking(),false);assert.equal(newTask.disabled,false);assert.ok(getRemote());}));
test('После автоматического восстановления доступа кнопка новой задачи снова доступна',async()=>harness(async({ui,newTask})=>{await ui.restore();assert.equal(ui.isWorking(),false);assert.equal(newTask.disabled,false);},{automatic:true}));
test('Ошибка сети и отмена загрузки не оставляют кнопки заблокированными',async()=>{for(const config of [{fail:true},{cancel:true}])await harness(async({ui,form,newTask})=>{await form.onsubmit({preventDefault(){},target:form});assert.equal(ui.isWorking(),false);assert.equal(newTask.disabled,false);assert.equal(form.querySelector().disabled,false);},config);});

test('Обновление использует сохранённый доступ и загружает все разделы общей книги',async()=>{
  const loaded={tasks:Array.from({length:13},(_,id)=>({id})),people:Array.from({length:4},(_,id)=>({id})),banks:[{id:'bank'}]};
  await harness(async({ui,selectors,getRemote,getState})=>{
    assert.equal(getRemote(),null);
    await selectors.get('#github-refresh').onclick();
    assert.ok(getRemote());
    assert.deepEqual(getState(),loaded);
    assert.equal(ui.isWorking(),false);
  },{automatic:true,loaded});
});
test('Фоновая загрузка и отмена ручного обновления сохраняют локальные изменения',async()=>{
  await harness(async({ui,selectors,getState,getLoadCount})=>{
    await ui.refreshFromGitHub({automatic:true});
    await selectors.get('#github-refresh').onclick();
    assert.deepEqual(getState().tasks,[{id:'local'}]);
    assert.equal(getLoadCount(),0);
  },{automatic:true,dirty:true,cancel:true});
});

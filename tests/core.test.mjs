import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {blankState,hasRecords,saveTask,savePerson,addComment,validateState,safeLink,isDate,saveBank,addBankContact,compareBankContacts,saveTreasuryFunction,deleteTreasuryFunction,setFunctionAssignment} from '../src/model.js';
import {transitionTask} from '../src/kanban.js';
import {addFunctionSection,deleteFunctionSection,moveTreasuryFunction} from '../src/model.js';
import {moveBank,saveBankContact} from '../src/model.js';
import {encodeWorkbook,decodeWorkbook,toWorkbook} from '../src/workbook.js';
const context={console,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,Date,Array};vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../vendor/xlsx.full.min.js',import.meta.url),'utf8'),context);const X=context.XLSX;
const input={title:'Кредитная линия',description:'Согласовать условия',due:'2026-11-12',owner:'Игорь',holder:'Банк',status:'Бэклог',priority:'Высокий',stage:'Первичная заявка',nextStep:'Получить решение',links:['https://example.com/result']};
const create=()=>saveTask(blankState(),input,'Игорь','Первый комментарий');
test('Ручной порядок банков сохраняется в XLSX вместе с привязанными контактами',()=>{
  let state=create();
  for(const name of ['Банк А','Банк Б','Банк В'])state=saveBank(state,{name});
  const [a,b,c]=state.banks;
  state=addBankContact(state,{bankId:c.id,date:'2026-11-10',contactedBy:'Казначей',counterparty:'Менеджер',outcome:'Созвонились'});
  state=moveBank(state,c.id,a.id);
  assert.deepEqual(state.banks.map(bank=>bank.id),[c.id,a.id,b.id]);
  state=moveBank(state,c.id,b.id,true);
  assert.deepEqual(state.banks.map(bank=>bank.id),[a.id,b.id,c.id]);
  state=moveBank(state,b.id,a.id);
  const restored=decodeWorkbook(encodeWorkbook(state,X),X);
  assert.deepEqual(restored.banks.map(bank=>bank.id),[b.id,a.id,c.id]);
  assert.deepEqual(restored.bankContacts,state.bankContacts);
  assert.equal(moveBank(state,b.id,a.id),state);
});
test('Исправление контакта в реестре сохраняет его ID и остальные записи истории',()=>{
  let state=saveBank(create(),{name:'Банк А'});
  const bankId=state.banks[0].id;
  const entry={bankId,date:'2026-11-08',contactedBy:'Казначей',counterparty:'Менеджер',outcome:'Обсудили условия'};
  state=addBankContact(state,entry);
  state=addBankContact(state,{...entry,date:'2026-11-10',nextSteps:'Отправить пакет'});
  const [previous,latest]=state.bankContacts;
  const edited=saveBankContact(state,{id:latest.id,date:'2026-11-07',outcome:'Согласовали условия'});
  assert.equal(edited.bankContacts.length,2);
  assert.deepEqual(edited.bankContacts[0],previous);
  assert.deepEqual(edited.bankContacts[1],{...latest,date:'2026-11-07',outcome:'Согласовали условия'});
  assert.equal([...edited.bankContacts].sort(compareBankContacts)[0].id,previous.id);
  assert.throws(()=>saveBankContact(state,{id:latest.id,outcome:' '}),/Статус/);
  assert.deepEqual(decodeWorkbook(encodeWorkbook(edited,X),X),edited);
});
test('Карточка банка и несколько представителей сохраняются отдельно от истории созвонов',()=>{
  const profile={
    name:'Банк А',stage:'Запрос документов',currentStatus:'Документы получены',nextStep:'Согласовать встречу',
    statusDate:'2026-11-09',representatives:[
      {name:'Первый контакт',position:'Менеджер',phone:'+7 000 000-00-00',email:'first@example.com'},
      {name:'Второй контакт',position:'',phone:'',email:'second@example.com'}
    ]
  };
  let state=saveBank(create(),profile);
  state=saveBank(state,{id:state.banks[0].id,name:'Банк А (офис)'});
  const restored=decodeWorkbook(encodeWorkbook(state,X),X);
  assert.deepEqual(restored,state);
  assert.deepEqual(restored.banks[0].representatives,profile.representatives);
  assert.equal(restored.banks[0].stage,profile.stage);
  assert.deepEqual(restored.bankContacts,[]);
  const old=toWorkbook(state,X);
  old.Sheets['Настройки'].B3.v=7;
  old.Sheets['Банки']=X.utils.aoa_to_sheet([['ID банка','Банк'],[state.banks[0].id,state.banks[0].name]]);
  delete old.Sheets['Контактные лица банков'];
  old.SheetNames=old.SheetNames.filter(name=>name!=='Контактные лица банков');
  const migrated=decodeWorkbook(X.write(old,{type:'array',bookType:'xlsx'}),X);
  assert.equal(migrated.banks[0].id,state.banks[0].id);
  assert.equal(migrated.banks[0].statusDate,'');
  assert.deepEqual(migrated.banks[0].representatives,[]);
});
test('Порядок и раздел функций сохраняются вместе с отметками, непустой раздел нельзя удалить',()=>{
  let state=savePerson(create(),{fullName:'Казначей',email:'groups@example.com',position:'Казначейство'},'Игорь');
  const personId=state.people[0].id;
  state=setFunctionAssignment(state,'cash-position',personId,true);
  assert.throws(()=>deleteFunctionSection(state,'liquidity'),/пустой раздел/);
  state=moveTreasuryFunction(state,'cash-position','liquidity','cash-forecast',true);
  const inLiquidity=s=>s.treasuryFunctions.filter(row=>row.sectionId==='liquidity').map(row=>row.id);
  assert.deepEqual(inLiquidity(state).slice(0,2),['cash-forecast','cash-position']);
  state=moveTreasuryFunction(state,'cash-position','liquidity','cash-forecast');
  assert.deepEqual(inLiquidity(state).slice(0,2),['cash-position','cash-forecast']);
  state=addFunctionSection(state,'Новый раздел');
  const sectionId=state.functionSections.at(-1).id;
  state=moveTreasuryFunction(state,'cash-position',sectionId);
  assert.equal(state.treasuryFunctions.find(row=>row.id==='cash-position').sectionId,sectionId);
  assert.deepEqual(decodeWorkbook(encodeWorkbook(state,X),X),state);
  state=moveTreasuryFunction(state,'cash-position','liquidity');
  state=deleteFunctionSection(state,sectionId);
  assert.ok(!state.functionSections.some(section=>section.id===sectionId));
  assert.deepEqual(state.functionAssignments,[{functionId:'cash-position',personId}]);
});
test('Миграция XLSX версии 6 распределяет прежние функции без потери пользовательских записей',()=>{
  let state=savePerson(create(),{fullName:'Казначей',email:'migration@example.com',position:'Казначейство'},'Игорь');
  state=saveTreasuryFunction(state,{name:'Пользовательская функция'});
  const custom=state.treasuryFunctions.at(-1);
  state=setFunctionAssignment(state,custom.id,state.people[0].id,true);
  const wb=toWorkbook(state,X);
  wb.Sheets['Настройки'].B3.v=6;
  delete wb.Sheets['Разделы функций'];
  wb.SheetNames=wb.SheetNames.filter(name=>name!=='Разделы функций');
  wb.Sheets['Функции казначейства']=X.utils.aoa_to_sheet([
    ['ID функции','Функция казначейства'],...state.treasuryFunctions.map(({id,name})=>[id,name])
  ]);
  const restored=decodeWorkbook(X.write(wb,{type:'array',bookType:'xlsx'}),X);
  assert.ok(restored.functionSections.some(section=>section.id==='other'));
  assert.deepEqual(restored.treasuryFunctions.at(-1),{...custom,sectionId:'other'});
  assert.deepEqual(restored.functionAssignments,state.functionAssignments);
  assert.deepEqual(restored.tasks,state.tasks);
});
test('Матрица сохраняет галочки по ID при переименовании, а удаление функции снимает её назначения',()=>{
  let state=savePerson(create(),{fullName:'Казначей',email:'matrix@example.com',position:'Казначейство'},'Игорь');
  state=saveTreasuryFunction(state,{name:'Согласование лимитов'});
  const person=state.people[0],row=state.treasuryFunctions.at(-1);
  state=setFunctionAssignment(state,row.id,person.id,true);
  state=saveTreasuryFunction(state,{id:row.id,name:'Согласование банковских лимитов'});
  state=savePerson(state,{...person,fullName:'Ведущий казначей'},'Игорь');
  assert.deepEqual(state.functionAssignments,[{functionId:row.id,personId:person.id}]);
  assert.equal(setFunctionAssignment(state,row.id,person.id,true),state);
  assert.throws(()=>setFunctionAssignment(state,row.id,'missing',true),/не найдены/);
  assert.deepEqual(decodeWorkbook(encodeWorkbook(state,X),X),state);
  assert.deepEqual(setFunctionAssignment(state,row.id,person.id,false).functionAssignments,[]);
  state=deleteTreasuryFunction(state,row.id);
  assert.ok(!state.treasuryFunctions.some(item=>item.id===row.id));
  assert.deepEqual(state.functionAssignments,[]);
  assert.equal(state.people.length,1);
});
test('Старый XLSX получает стартовые функции, а пустая матрица остаётся пустой после записи',()=>{
  const state=create(),old=toWorkbook(state,X);
  old.Sheets['Настройки'].B3.v=5;
  for(const name of ['Функции казначейства','Назначения по функциям']){
    delete old.Sheets[name];
    old.SheetNames=old.SheetNames.filter(sheet=>sheet!==name);
  }
  assert.deepEqual(decodeWorkbook(X.write(old,{type:'array',bookType:'xlsx'}),X),state);
  const empty=blankState();
  assert.equal(hasRecords(empty),false);
  empty.treasuryFunctions=[];
  assert.equal(hasRecords(empty),true);
  assert.deepEqual(decodeWorkbook(encodeWorkbook(empty,X),X),empty);
});
test('Канбан назначает исполнителя, сохраняет комментарий и логирует переходы в обе стороны',()=>{
  let state=savePerson(create(),{fullName:'Новый исполнитель',email:'executor@example.com',position:'Казначей'},'Игорь');
  const id=state.tasks[0].id;
  const assignment={holder:state.people[0].fullName,holderId:state.people[0].id};
  const move=(from,status,comment)=>transitionTask(state,{id,from,status,comment,assignment,author:'Игорь'});
  assert.throws(()=>move('Бэклог','В работе','   '),/комментарий/);
  state=move('Бэклог','В работе','Передано в казначейство');
  assert.equal(state.tasks[0].holderId,assignment.holderId);
  assert.equal(state.tasks[0].owner,input.owner);
  state=move('В работе','Завершена','Работа выполнена');
  assert.ok(state.tasks[0].completedAt);
  assert.throws(()=>move('В работе','Бэклог','Устаревшая карточка'),/уже изменился/);
  state=move('Завершена','В работе','Открыта повторно');
  assert.equal(state.tasks[0].completedAt,'');
  state=move('В работе','Бэклог','Возвращена на планирование');
  const restored=decodeWorkbook(encodeWorkbook(state,X),X);
  const statuses=restored.history.filter(entry=>entry.field==='Статус');
  assert.deepEqual(statuses.map(({before,after})=>[before,after]),[
    ['Бэклог','В работе'],['В работе','Завершена'],['Завершена','В работе'],['В работе','Бэклог']
  ]);
  assert.ok(restored.history.some(entry=>entry.field==='У кого сейчас'&&entry.after===assignment.holder));
  assert.equal(restored.comments.at(-1).text,'Возвращена на планирование');
  assert.equal(restored.comments.at(-1).at,statuses.at(-1).at);
  assert.deepEqual(restored,state);
});
test('Банки и вся история контактов сохраняются вместе с задачами в XLSX',()=>{
  let state=saveBank(create(),{name:'Банк А'});
  const bankId=state.banks[0].id;
  const contact={bankId,contactedBy:'Казначейство',counterparty:'Менеджер банка',outcome:'Ждём условия\nЛимит обсуждается',nextSteps:'Запросить предложение'};
  state=addBankContact(state,{...contact,date:'2026-11-09'});
  state=addBankContact(state,{...contact,date:'2026-11-06',outcome:'Первичный звонок'});
  state=saveBank(state,{id:bankId,name:'Банк А (новое название)'});
  const restored=decodeWorkbook(encodeWorkbook(state,X),X);
  assert.deepEqual(restored,state);
  assert.equal([...restored.bankContacts].sort(compareBankContacts)[0].date,'2026-11-09');
  assert.throws(()=>addBankContact(restored,{...contact,date:'2026-11-09',bankId:'missing'}),/Банк не найден/);
});
test('Книга версии 4 без банковских листов открывается с пустым реестром банков',()=>{
  const state=create();
  const wb=toWorkbook(state,X);
  wb.Sheets['Настройки'].B3.v=4;
  for(const name of ['Банки','Контакты с банками']){
    delete wb.Sheets[name];
    wb.SheetNames=wb.SheetNames.filter(sheet=>sheet!==name);
  }
  assert.deepEqual(decodeWorkbook(X.write(wb,{type:'array',bookType:'xlsx'}),X),state);
});
test('Неуточнённый срок остаётся пустым после XLSX-выгрузки и импорта',()=>{const s=saveTask(blankState(),{...input,due:''},'Игорь');const restored=decodeWorkbook(encodeWorkbook(s,X),X);assert.equal(restored.tasks[0].due,'');assert.equal(toWorkbook(s,X).Sheets['Задачи'].C2.v,'');});
test('Создание, смена срока и исполнителя, завершение и возврат сохраняют историю',()=>{let s=create();const id=s.tasks[0].id;assert.equal(s.history.length,1);assert.equal(s.comments.length,1);s=saveTask(s,{...s.tasks[0],due:'2026-11-16',holder:'Казначейство',status:'В работе'},'Игорь','Перенос согласован');assert.equal(s.history.length,4);assert.equal(s.comments.length,2);s=saveTask(s,{...s.tasks[0],status:'Завершена'},'Игорь');assert.ok(s.tasks[0].completedAt);s=saveTask(s,{...s.tasks[0],status:'В работе'},'Игорь');assert.equal(s.tasks[0].completedAt,'');assert.equal(s.tasks[0].id,id);assert.equal(s.tasks.length,1);});
test('Комментарий связан с задачей и не меняет остальные записи',()=>{const s=create(),next=addComment(s,s.tasks[0].id,'Банк','Одобрено');assert.equal(next.comments.length,2);assert.deepEqual(next.tasks,s.tasks);assert.equal(s.comments.length,1);assert.throws(()=>addComment(s,'missing','Банк','Текст'));});
test('XLSX полностью восстанавливает данные, историю, ссылки и комментарии',()=>{let s=create();s=saveTask(s,{...s.tasks[0],title:'=HYPERLINK("https://example.com")',status:'В работе',links:['https://example.com/1','https://example.com/2']},'Анна','<script>alert(1)</script>');const bytes=encodeWorkbook(s,X);assert.equal(new Uint8Array(bytes)[0],80);const restored=decodeWorkbook(bytes,X);assert.deepEqual(JSON.parse(JSON.stringify(restored)),s);const wb=toWorkbook(s,X);assert.equal(wb.Sheets['Задачи'].B2.t,'s');assert.equal(wb.Sheets['Задачи'].B2.f,undefined);assert.equal(wb.Sheets['Задачи'].C2.t,'n');assert.equal(wb.Sheets['Задачи'].C2.z,'dd.mm.yyyy');});
test('Пустая книга поддерживает импорт без потери структуры',()=>{assert.deepEqual(JSON.parse(JSON.stringify(decodeWorkbook(encodeWorkbook(blankState(),X),X))),blankState());});
test('Неверные даты, опасные ссылки, статусы и повторные ID отклоняются',()=>{assert.equal(isDate('2026-02-30'),false);assert.equal(isDate('2028-02-29'),true);assert.equal(safeLink('javascript:alert(1)'),null);assert.equal(safeLink('data:text/html,test'),null);assert.throws(()=>saveTask(blankState(),{...input,due:'2026-02-30'},'Игорь'));assert.throws(()=>saveTask(blankState(),{...input,status:'Неизвестно'},'Игорь'));assert.throws(()=>saveTask(blankState(),{...input,links:['javascript:alert(1)']},'Игорь'));const s=create();s.tasks.push({...s.tasks[0]});assert.throws(()=>validateState(s));});
test('Формулы в импортируемом XLSX не выполняются и отклоняются',()=>{const wb=toWorkbook(create(),X);wb.Sheets['Задачи'].B2={t:'s',v:'cached',f:'HYPERLINK("https://example.com")'};const bytes=X.write(wb,{type:'array',bookType:'xlsx'});assert.throws(()=>decodeWorkbook(bytes,X),/формул/);});
test('Несвязанные ссылки и повреждённые обязательные листы отклоняются',()=>{let wb=toWorkbook(create(),X);wb.Sheets['Результаты'].A2.v='missing';assert.throws(()=>decodeWorkbook(X.write(wb,{type:'array',bookType:'xlsx'}),X),/неизвестной/);wb=toWorkbook(create(),X);delete wb.Sheets['История'];wb.SheetNames=wb.SheetNames.filter(n=>n!=='История');assert.throws(()=>decodeWorkbook(X.write(wb,{type:'array',bookType:'xlsx'}),X),/История/);});
test('Редактирование срока непосредственно в Excel поддерживает формат ДД.ММ.ГГГГ',()=>{const wb=toWorkbook(create(),X);wb.Sheets['Задачи'].C2={t:'s',v:'25.12.2026'};assert.equal(decodeWorkbook(X.write(wb,{type:'array',bookType:'xlsx'}),X).tasks[0].due,'2026-12-25');});



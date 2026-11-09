import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {blankState,saveTask,savePerson,addComment,validateState,safeLink,isDate,saveBank,addBankContact,compareBankContacts} from '../src/model.js';
import {transitionTask} from '../src/kanban.js';
import {encodeWorkbook,decodeWorkbook,toWorkbook} from '../src/workbook.js';
const context={console,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,Date,Array};vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../vendor/xlsx.full.min.js',import.meta.url),'utf8'),context);const X=context.XLSX;
const input={title:'Кредитная линия',description:'Согласовать условия',due:'2026-11-12',owner:'Игорь',holder:'Банк',status:'Бэклог',priority:'Высокий',stage:'Первичная заявка',nextStep:'Получить решение',links:['https://example.com/result']};
const create=()=>saveTask(blankState(),input,'Игорь','Первый комментарий');
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



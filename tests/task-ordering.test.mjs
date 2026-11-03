import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {blankState,saveTask,moveTask,validateState} from '../src/model.js';
import {encodeWorkbook,decodeWorkbook} from '../src/workbook.js';
const task={description:'',questions:'Вопрос',due:'',owner:'Не назначен',holder:'Не назначен',status:'Бэклог',priority:'Обычный',stage:'',nextStep:'',links:[]};
function source(){let s=blankState();for(const title of ['A','B','C','D'])s=saveTask(s,{...task,title},'Игорь');return s;}
test('Задача переносится выше и ниже, порядок уникален и попадает в историю',()=>{let s=source();const [a,b,c,d]=s.tasks.map(t=>t.id);s=moveTask(s,d,a,false,'Игорь');assert.deepEqual(s.tasks.map(t=>t.title),['D','A','B','C']);assert.deepEqual(s.tasks.map(t=>t.sortOrder),[0,1,2,3]);assert.equal(s.history.at(-1).field,'Порядок приоритета в реестре');s=moveTask(s,a,c,true,'Игорь');assert.deepEqual(s.tasks.map(t=>t.title),['D','B','C','A']);assert.equal(s.tasks.at(-1).questions,'Вопрос');const before=s;s=moveTask(s,a,a,false,'Игорь');assert.equal(s,before);});
test('Новая задача добавляется в конец, старые данные получают исходный порядок',()=>{const old=source();old.schema=3;old.tasks.forEach(t=>delete t.sortOrder);let s=validateState(old);assert.deepEqual(s.tasks.map(t=>t.sortOrder),[0,1,2,3]);s=moveTask(s,s.tasks[3].id,s.tasks[0].id,false,'Игорь');s=saveTask(s,{...task,title:'E'},'Игорь');assert.equal(s.tasks.at(-1).sortOrder,4);assert.throws(()=>moveTask(s,'missing',s.tasks[0].id,false,'Игорь'));});
test('Ручной приоритет переносится в XLSX и обратно без изменения других полей',()=>{const ctx={console,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,Date};vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../vendor/xlsx.full.min.js',import.meta.url),'utf8'),ctx);let s=source();s=moveTask(s,s.tasks[2].id,s.tasks[0].id,false,'Игорь');assert.deepEqual(JSON.parse(JSON.stringify(decodeWorkbook(encodeWorkbook(s,ctx.XLSX),ctx.XLSX))),s);});

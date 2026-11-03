import {validateState,blankState} from './model.js';
const taskFields={id:'ID задачи',title:'Задача',due:'Срок',owner:'Основной ответственный',holder:'У кого сейчас',status:'Статус',stage:'Текущий этап',nextStep:'Следующий шаг',priority:'Приоритет',description:'Описание',createdAt:'Создана в',updatedAt:'Изменена в',completedAt:'Завершена в'};
const histFields={id:'ID записи',taskId:'ID задачи',at:'Дата и время',author:'Автор',field:'Поле',before:'Было',after:'Стало'};
const commentFields={id:'ID комментария',taskId:'ID задачи',at:'Дата и время',author:'Автор',text:'Комментарий'};
function sheet(rows,fields,X) {
  const ws=X.utils.aoa_to_sheet([Object.values(fields),...rows.map(r=>Object.keys(fields).map(k=>r[k]??''))]);
  ws['!cols']=Object.keys(fields).map(k=>({wch:['title','description','text','before','after','url'].includes(k)?55:24}));
  ws['!autofilter']={ref:ws['!ref']};
  // Text remains text even when it starts with =, +, - or @. Never create formulas from input.
  return ws;
}
export function toWorkbook(state,X=globalThis.XLSX) {
  validateState(state);const wb=X.utils.book_new();
  const tasks=state.tasks.map(t=>({...t,due:new Date(`${t.due}T00:00:00Z`)}));
  const ws=sheet(tasks,taskFields,X);for(let i=0;i<tasks.length;i++){const c=ws[`C${i+2}`];if(c)c.z='dd.mm.yyyy';}
  X.utils.book_append_sheet(wb,ws,'Задачи');
  X.utils.book_append_sheet(wb,sheet(state.history,histFields,X),'История');
  X.utils.book_append_sheet(wb,sheet(state.comments,commentFields,X),'Комментарии');
  const links=state.tasks.flatMap(t=>t.links.map(url=>({taskId:t.id,url})));
  X.utils.book_append_sheet(wb,sheet(links,{taskId:'ID задачи',url:'Ссылка'},X),'Результаты');
  X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([['Параметр','Значение'],['Формат','VOXYS Treasury'],['Версия',1],['Ревизия',state.revision],['Выгружено',new Date().toISOString()],['Часовой пояс','Asia/Novosibirsk']]),'Настройки');
  return wb;
}
export const encodeWorkbook=(state,X=globalThis.XLSX)=>X.write(toWorkbook(state,X),{bookType:'xlsx',type:'array',compression:true,cellDates:false});
function readRows(wb,name,fields,X) {
  const ws=wb.Sheets[name];if(!ws)throw Error(`В XLSX отсутствует лист «${name}».`);
  const rows=X.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});const header=rows.shift()||[];
  if(Object.values(fields).some(h=>!header.includes(h)))throw Error(`Изменены обязательные заголовки листа «${name}».`);
  return rows.filter(row=>row.some(x=>x!=='')).map(row=>Object.fromEntries(Object.entries(fields).map(([k,h])=>[k,row[header.indexOf(h)]??''])));
}
export function decodeWorkbook(bytes,X=globalThis.XLSX) {
  const wb=X.read(bytes,{type:'array',cellDates:true});
  // Formulas are not evaluated by this application. Refuse them rather than trust cached results.
  for(const ws of Object.values(wb.Sheets))for(const [key,cell]of Object.entries(ws))if(!key.startsWith('!')&&cell.f)throw Error('В файле есть формулы. Замените их значениями перед импортом.');
  const meta=readRows(wb,'Настройки',{key:'Параметр',value:'Значение'},X);const get=k=>meta.find(r=>r.key===k)?.value;
  if(get('Формат')!=='VOXYS Treasury'||Number(get('Версия'))!==1)throw Error('Откройте XLSX, созданный этим приложением (версия 1).');
  const s=blankState();s.revision=Number(get('Ревизия'));
  s.tasks=readRows(wb,'Задачи',taskFields,X).map(t=>{for(const k of Object.keys(t))if(k!=='due')t[k]=String(t[k]);let d=t.due;if(d instanceof Date)d=d.toISOString().slice(0,10);else if(typeof d==='number'){const v=X.SSF.parse_date_code(d);if(!v)throw Error('Некорректный срок.');d=`${v.y}-${String(v.m).padStart(2,'0')}-${String(v.d).padStart(2,'0')}`;}else if(/^\d{2}\.\d{2}\.\d{4}$/.test(d))d=d.split('.').reverse().join('-');return {...t,due:String(d),links:[]};});
  s.history=readRows(wb,'История',histFields,X).map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v instanceof Date?v.toISOString():String(v)])));
  s.comments=readRows(wb,'Комментарии',commentFields,X).map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v instanceof Date?v.toISOString():String(v)])));
  const ids=new Map(s.tasks.map(t=>[t.id,t]));for(const l of readRows(wb,'Результаты',{taskId:'ID задачи',url:'Ссылка'},X)){const t=ids.get(String(l.taskId));if(!t)throw Error('Ссылка относится к неизвестной задаче.');t.links.push(String(l.url));}
  return validateState(s);
}

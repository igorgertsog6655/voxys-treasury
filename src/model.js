export const STATUSES = ['Бэклог', 'В работе', 'Завершена'];
export const PRIORITIES = ['Обычный', 'Высокий', 'Низкий'];
export const FIELDS = {title:'Задача',description:'Описание',questions:'Вопросы для уточнения',due:'Срок',owner:'Основной ответственный',holder:'У кого сейчас',status:'Статус',stage:'Текущий этап',nextStep:'Следующий шаг',priority:'Приоритет',completedAt:'Завершена в'};
const starterFunctions = [
  ['cash-position','Ежедневная позиция по денежным средствам'],
  ['cash-forecast','Прогноз денежных потоков и платёжный календарь'],
  ['payments','Платежи и контроль их согласования'],
  ['receipts','Мониторинг поступлений и сверка банковских выписок'],
  ['liquidity','Управление ликвидностью, резервами и остатками группы'],
  ['intercompany','Перераспределение ликвидности и внутригрупповое финансирование'],
  ['banks','Работа с банками и контроль банковских тарифов'],
  ['bank-accounts','Банковские счета, полномочия и доступы к банк-клиенту'],
  ['bank-funding','Привлечение банковского финансирования и управление лимитами'],
  ['bonds','Выпуск, обслуживание и рефинансирование облигаций'],
  ['debt','Реестр долга и календарь обслуживания'],
  ['covenants','Контроль ковенантов и обязательств перед кредиторами'],
  ['security','Банковские гарантии, залоги и поручительства'],
  ['investments','Размещение временно свободных средств'],
  ['financial-risk','Валютные и процентные риски, хеджирование'],
  ['reporting','Казначейская отчётность и показатели'],
  ['controls','Политики казначейства и внутренний контроль'],
  ['systems','Казначейские системы и автоматизация']
];
const makeStarterFunctions = () => starterFunctions.map(([id,name])=>({id,name}));
const starterSections = [
  ['liquidity','Денежные потоки и ликвидность',['cash-position','cash-forecast','liquidity','intercompany','investments']],
  ['operations','Платежи и банковские операции',['payments','receipts','banks','bank-accounts']],
  ['funding','Финансирование и обслуживание долга',['bank-funding','bonds','debt','covenants','security']],
  ['risks','Финансовые риски',['financial-risk']],
  ['governance','Отчётность, контроль и системы',['reporting','controls','systems']]
];
function groupMatrixFunctions(state) {
  state.functionSections=starterSections.map(([id,name])=>({id,name}));
  const sectionsByFunction=new Map(starterSections.flatMap(([id,,functions])=>functions.map(key=>[key,id])));
  state.treasuryFunctions=state.treasuryFunctions.map(row=>({...row,sectionId:sectionsByFunction.get(row.id)||'other'}));
  if(state.treasuryFunctions.some(row=>row.sectionId==='other'))state.functionSections.push({id:'other',name:'Прочие функции'});
  return state;
}
export const blankState = () => groupMatrixFunctions({
  schema:7,revision:0,tasks:[],history:[],comments:[],people:[],banks:[],bankContacts:[],
  treasuryFunctions:makeStarterFunctions(),functionAssignments:[]
});
export function hasRecords(state) {
  const {treasuryFunctions,functionSections}=state;
  const defaults=blankState();
  const matrixEdited=(treasuryFunctions&&JSON.stringify(treasuryFunctions)!==JSON.stringify(defaults.treasuryFunctions))||
    (functionSections&&JSON.stringify(functionSections)!==JSON.stringify(defaults.functionSections));
  return Boolean(state.tasks.length||state.people.length||state.banks?.length||state.functionAssignments?.length||matrixEdited);
}
export function migrateState(s) {
  const next=structuredClone(s);
  if(next.schema===1){next.schema=2;next.people=[];}
  if(next.schema===2)next.schema=3;
  if(next.schema===3)next.schema=4;
  if(next.schema===4){next.schema=5;next.banks=[];next.bankContacts=[];}
  if(next.schema===5){
    next.schema=6;
    next.treasuryFunctions=makeStarterFunctions();
    next.functionAssignments=[];
  }
  if(next.schema===6&&Array.isArray(next.treasuryFunctions)){
    next.schema=7;
    groupMatrixFunctions(next);
  }
  if(next.schema===7&&Array.isArray(next.tasks))next.tasks.forEach((t,i)=>{
    t.ownerId??='';t.holderId??='';t.questions??='';t.sortOrder??=i;
  });
  return next;
}
export const uid = () => crypto.randomUUID();
export function today() { const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Novosibirsk',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-'); }
export function isDate(s) { return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s; }
export const overdue = t => t.status!=='Завершена' && !!t.due && t.due<today();
export function safeLink(value) { try { const u=new URL(value);return ['https:','http:'].includes(u.protocol) ? u.href : null; } catch { return null; } }
export function validateTask(t) {
  if(!Number.isSafeInteger(t.sortOrder)||t.sortOrder<0)throw Error('Некорректный порядок задачи.');
  if(!t.title?.trim()||!t.owner?.trim()||!t.holder?.trim()) throw Error('Укажите название, основного ответственного и текущего исполнителя.');
  if(typeof t.due!=='string'||(t.due!==''&&!isDate(t.due))) throw Error('Укажите корректный срок задачи.');
  if(!STATUSES.includes(t.status)||!PRIORITIES.includes(t.priority)) throw Error('Неизвестный статус или приоритет.');
  if(!Array.isArray(t.links)||t.links.some(l=>!safeLink(l))) throw Error('Каждая ссылка должна начинаться с https:// или http://.');
  for(const [key,limit] of Object.entries({title:250,description:15000,questions:15000,owner:120,holder:120,stage:500,nextStep:1000})) if(typeof t[key]!=='string'||t[key].length>limit) throw Error(`Проверьте поле «${FIELDS[key]}» (до ${limit} символов).`);
}
export function saveTask(state, input, author, comment='') {
  author=author.trim(); if(!author) throw Error('Укажите автора изменения.');
  if(author.length>120||comment.length>15000) throw Error('Слишком длинное имя автора или комментарий.');
  const next=structuredClone(state), now=new Date().toISOString(), old=next.tasks.find(t=>t.id===input.id);
  const task={...input,sortOrder:input.sortOrder??old?.sortOrder??(Math.max(-1,...next.tasks.map(t=>t.sortOrder??-1))+1),questions:input.questions??old?.questions??'',ownerId:input.ownerId||'',holderId:input.holderId||'',id:old?.id||uid(),createdAt:old?.createdAt||now,updatedAt:now,completedAt:input.status==='Завершена'?(old?.completedAt||now):''};
  for(const key of ['owner','holder'])if(task[key+'Id']){const p=(next.people||[]).find(p=>p.id===task[key+'Id']);if(!p)throw Error('Исполнитель не найден в справочнике.');if(!p.active&&task[key+'Id']!==old?.[key+'Id'])throw Error('Архивного исполнителя нельзя назначить заново.');task[key]=p.fullName;}
  validateTask(task);
  const changes=old ? Object.entries(FIELDS).filter(([k])=>old[k]!==task[k]).map(([k,label])=>({field:label,before:String(old[k]||''),after:String(task[k]||'')})) : [{field:'Создание задачи',before:'',after:`${task.title}\nСтатус: ${task.status}\nСрок: ${task.due}\nОтветственный: ${task.owner}\nУ кого сейчас: ${task.holder}`}];
  if(old&&JSON.stringify(old.links)!==JSON.stringify(task.links)) changes.push({field:'Ссылки на результаты',before:old.links.join('\n'),after:task.links.join('\n')});
  if(old)for(const k of ['ownerId','holderId'])if((old[k]||'')!==task[k])changes.push({field:k==='ownerId'?'Исполнитель: основной ответственный':'Исполнитель: у кого сейчас',before:old[k]||'',after:task[k]});
  if(!changes.length&&!comment.trim()) return state;
  if(old) next.tasks[next.tasks.findIndex(t=>t.id===old.id)]=task;else next.tasks.push(task);
  for(const c of changes) next.history.push({id:uid(),taskId:task.id,at:now,author,...c});
  if(comment.trim()) next.comments.push({id:uid(),taskId:task.id,at:now,author,text:comment.trim()});
  next.revision++; return next;
}
export function addComment(state,taskId,author,text) {if(!state.tasks.some(t=>t.id===taskId)) throw Error('Задача не найдена.');if(!author.trim()||!text.trim()) throw Error('Заполните автора и комментарий.');if(author.length>120||text.length>15000) throw Error('Слишком длинное имя или комментарий.');const next=structuredClone(state);next.comments.push({id:uid(),taskId,at:new Date().toISOString(),author:author.trim(),text:text.trim()});next.revision++;return next;}
export function validateState(s) {
  s=migrateState(s);
  if(s?.schema!==7||!Number.isSafeInteger(s.revision)||s.revision<0||
    !['tasks','history','comments','people','banks','bankContacts','treasuryFunctions','functionAssignments','functionSections'].every(key=>Array.isArray(s[key])))throw Error('Формат данных не поддерживается.');
  const personIds=new Set(),emails=new Set();for(const p of s.people){validatePerson(p);if(!p.id||personIds.has(p.id)||emails.has(p.email.toLowerCase()))throw Error('Повторяющийся ID или электронный адрес исполнителя.');personIds.add(p.id);emails.add(p.email.toLowerCase());}
  for(const t of s.tasks)for(const k of ['ownerId','holderId'])if(t[k]&&!personIds.has(t[k]))throw Error('В задаче указан неизвестный исполнитель.');
  const ids=new Set(),orders=new Set(); for(const t of s.tasks){validateTask(t);if(orders.has(t.sortOrder))throw Error('Повторяющийся порядок задач.');orders.add(t.sortOrder);if(!t.id||ids.has(t.id))throw Error('Пустой или повторяющийся ID задачи.');ids.add(t.id);for(const k of ['createdAt','updatedAt'])if(!t[k]||!Number.isFinite(Date.parse(t[k])))throw Error('Некорректная дата записи.');}
  for(const rows of [s.history,s.comments]){const keys=new Set();for(const r of rows){if(!ids.has(r.taskId)||!r.id||keys.has(r.id)||!r.author||!r.at||!Number.isFinite(Date.parse(r.at)))throw Error('Повреждена история или комментарии.');keys.add(r.id);}}
  for(const h of s.history)for(const k of ['field','before','after'])if(typeof h[k]!=='string')throw Error('Повреждено изменение в истории.');
  for(const c of s.comments)if(typeof c.text!=='string'||!c.text.trim())throw Error('Пустой комментарий.');
  const bankIds=new Set(),bankNames=new Set(),contactIds=new Set();
  for(const bank of s.banks){
    validateBankName(bank.name);
    const name=bank.name.trim().toLocaleLowerCase('ru');
    if(typeof bank.id!=='string'||!bank.id||bankIds.has(bank.id)||bankNames.has(name))throw Error('Повторяется название или ID банка.');
    bankIds.add(bank.id);
    bankNames.add(name);
  }
  for(const contact of s.bankContacts){
    if(typeof contact.id!=='string'||!contact.id||contactIds.has(contact.id)||!bankIds.has(contact.bankId))throw Error('В истории контактов указан неизвестный банк или повторяется ID записи.');
    validateBankContact(contact);
    contactIds.add(contact.id);
  }
  validateFunctionMatrix(s,personIds);
  return s;
}
function validateFunctionMatrix(state,personIds) {
  const sectionIds=new Set(),sectionNames=new Set();
  for(const section of state.functionSections){
    if(typeof section.name!=='string'||!section.name.trim()||section.name.length>120)throw Error('Укажите название раздела (до 120 символов).');
    const name=normalizeFunctionName(section.name);
    if(typeof section.id!=='string'||!section.id||sectionIds.has(section.id)||sectionNames.has(name))throw Error('Повторяется название или ID раздела.');
    sectionIds.add(section.id);
    sectionNames.add(name);
  }
  const functions=new Map(),names=new Set();
  for(const row of state.treasuryFunctions){
    validateFunctionName(row.name);
    if(!sectionIds.has(row.sectionId))throw Error('В функции указан неизвестный раздел.');
    const name=normalizeFunctionName(row.name);
    if(typeof row.id!=='string'||!row.id||functions.has(row.id)||names.has(name))throw Error('Повторяется название или ID функции.');
    functions.set(row.id,new Set());
    names.add(name);
  }
  for(const {functionId,personId} of state.functionAssignments){
    const assigned=functions.get(functionId);
    if(!assigned||!personIds.has(personId))throw Error('В матрице указана неизвестная функция или исполнитель.');
    if(assigned.has(personId))throw Error('Назначение в матрице повторяется.');
    assigned.add(personId);
  }
}
const normalizeFunctionName = name => name.trim().toLocaleLowerCase('ru');
function validateFunctionName(name) {
  if(typeof name!=='string'||!name.trim()||name.length>200)throw Error('Укажите название функции (до 200 символов).');
}
export function saveTreasuryFunction(state,{id,name,sectionId}) {
  const next=validateState(state);
  name=name.trim();
  validateFunctionName(name);
  if(next.treasuryFunctions.some(row=>row.id!==id&&normalizeFunctionName(row.name)===normalizeFunctionName(name)))throw Error('Функция с таким названием уже есть.');
  const row=id?next.treasuryFunctions.find(row=>row.id===id):null;
  if(id&&!row)throw Error('Функция не найдена.');
  sectionId??=row?.sectionId||next.functionSections[0]?.id;
  if(!next.functionSections.some(section=>section.id===sectionId))throw Error('Выберите раздел функции.');
  if(row){
    if(row.name===name&&row.sectionId===sectionId)return state;
    row.name=name;
    if(row.sectionId!==sectionId){
      row.sectionId=sectionId;
      next.treasuryFunctions=next.treasuryFunctions.filter(item=>item.id!==id);
      next.treasuryFunctions.push(row);
    }
  }else{
    next.treasuryFunctions.push({id:uid(),name,sectionId});
  }
  next.revision++;
  return next;
}
export function addFunctionSection(state,name) {
  const next=validateState(state);
  name=name.trim();
  if(!name||name.length>120)throw Error('Укажите название раздела (до 120 символов).');
  if(next.functionSections.some(section=>normalizeFunctionName(section.name)===normalizeFunctionName(name)))throw Error('Раздел с таким названием уже есть.');
  next.functionSections.push({id:uid(),name});
  next.revision++;
  return next;
}
export function deleteFunctionSection(state,id) {
  const next=validateState(state);
  if(!next.functionSections.some(section=>section.id===id))throw Error('Раздел не найден.');
  if(next.treasuryFunctions.some(row=>row.sectionId===id))throw Error('Удалить можно только пустой раздел.');
  next.functionSections=next.functionSections.filter(section=>section.id!==id);
  next.revision++;
  return next;
}
export function moveTreasuryFunction(state,id,sectionId,targetId='',after=false) {
  const next=validateState(state);
  const rows=next.treasuryFunctions;
  const source=rows.findIndex(row=>row.id===id);
  if(source<0||!next.functionSections.some(section=>section.id===sectionId))throw Error('Функция или раздел не найдены.');
  if(targetId&&!rows.some(row=>row.id===targetId&&row.sectionId===sectionId))throw Error('Строка для переноса не найдена.');
  if(id===targetId)return state;
  const [row]=rows.splice(source,1);
  const changedSection=row.sectionId!==sectionId;
  row.sectionId=sectionId;
  const last=rows.findLastIndex(item=>item.sectionId===sectionId);
  const destination=targetId?rows.findIndex(item=>item.id===targetId)+Number(after):(last<0?rows.length:last+1);
  rows.splice(destination,0,row);
  if(!changedSection){
    const previous=state.treasuryFunctions.filter(item=>item.sectionId===sectionId);
    const current=rows.filter(item=>item.sectionId===sectionId);
    if(current.every((item,i)=>item.id===previous[i]?.id))return state;
  }
  next.revision++;
  return next;
}
export function deleteTreasuryFunction(state,id) {
  const next=validateState(state);
  if(!next.treasuryFunctions.some(row=>row.id===id))throw Error('Функция не найдена.');
  next.treasuryFunctions=next.treasuryFunctions.filter(row=>row.id!==id);
  next.functionAssignments=next.functionAssignments.filter(row=>row.functionId!==id);
  next.revision++;
  return next;
}
export function setFunctionAssignment(state,functionId,personId,checked) {
  const next=validateState(state);
  if(!next.treasuryFunctions.some(row=>row.id===functionId)||!next.people.some(person=>person.id===personId))throw Error('Функция или исполнитель не найдены.');
  const index=next.functionAssignments.findIndex(row=>row.functionId===functionId&&row.personId===personId);
  if(checked===(index>=0))return state;
  if(checked)next.functionAssignments.push({functionId,personId});
  else next.functionAssignments.splice(index,1);
  next.revision++;
  return next;
}
export function validatePerson(p){if(typeof p.fullName!=='string'||!p.fullName.trim()||p.fullName.length>180)throw Error('Укажите ФИО (до 180 символов).');if(typeof p.position!=='string'||!p.position.trim()||p.position.length>200)throw Error('Укажите должность (до 200 символов).');if(typeof p.email!=='string'||p.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))throw Error('Укажите корректный электронный адрес.');if(typeof p.active!=='boolean')throw Error('Некорректный статус исполнителя.');}
function validateBankName(name) {
  if(typeof name!=='string'||!name.trim()||name.length>180)throw Error('Укажите название банка (до 180 символов).');
}
function validateBankContact(contact) {
  if(!isDate(contact.date))throw Error('Укажите корректную дату контакта.');
  if(!Number.isFinite(Date.parse(contact.createdAt)))throw Error('Некорректная дата записи контакта.');
  for(const [key,label,limit,required] of [
    ['contactedBy','Кто контактировал',180,true],
    ['counterparty','С кем контактировали',250,true],
    ['outcome','Статус / договорённости',3000,true],
    ['nextSteps','Дальнейшие шаги',3000,false]
  ]){
    const value=contact[key];
    if(typeof value!=='string'||(required&&!value.trim())||value.length>limit)throw Error(`Проверьте поле «${label}» (до ${limit} символов).`);
  }
}
export function saveBank(state,{id,name}) {
  const next=validateState(state);
  name=name.trim();
  validateBankName(name);
  if(next.banks.some(b=>b.id!==id&&b.name.trim().toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')))throw Error('Банк с таким названием уже есть.');
  if(id){
    const bank=next.banks.find(b=>b.id===id);
    if(!bank)throw Error('Банк не найден.');
    if(bank.name===name)return state;
    bank.name=name;
  }else{
    next.banks.push({id:uid(),name});
  }
  next.revision++;
  return next;
}
export function addBankContact(state,input) {
  const next=validateState(state);
  if(!next.banks.some(bank=>bank.id===input.bankId))throw Error('Банк не найден.');
  const contact={
    id:uid(),bankId:input.bankId,date:input.date,
    contactedBy:input.contactedBy.trim(),counterparty:input.counterparty.trim(),
    outcome:input.outcome.trim(),nextSteps:input.nextSteps.trim(),
    createdAt:new Date().toISOString()
  };
  validateBankContact(contact);
  next.bankContacts.push(contact);
  next.revision++;
  return next;
}
export function compareBankContacts(a,b) {
  return b.date.localeCompare(a.date)||Date.parse(b.createdAt)-Date.parse(a.createdAt);
}
export function savePerson(state,input,author){const next=validateState(state),old=next.people.find(p=>p.id===input.id);const p={id:old?.id||uid(),fullName:input.fullName.trim(),email:input.email.trim(),position:input.position.trim(),active:input.active??true};validatePerson(p);if(next.people.some(x=>x.id!==p.id&&x.email.toLowerCase()===p.email.toLowerCase()))throw Error('Исполнитель с таким электронным адресом уже есть.');if(old)next.people[next.people.findIndex(x=>x.id===p.id)]=p;else next.people.push(p);for(const task of [...next.tasks]){const changed={...task};if(task.ownerId===p.id)changed.owner=p.fullName;if(task.holderId===p.id)changed.holder=p.fullName;if(changed.owner!==task.owner||changed.holder!==task.holder){const updated=saveTask(next,changed,author,'ФИО обновлено в справочнике исполнителей.');next.tasks=updated.tasks;next.history=updated.history;next.comments=updated.comments;}}next.revision++;return validateState(next);}


export function moveTask(state,draggedId,targetId,after,author){if(draggedId===targetId)return state;if(!author?.trim())throw Error('Укажите автора изменения.');const next=validateState(state),ordered=[...next.tasks].sort((a,b)=>a.sortOrder-b.sortOrder);const source=ordered.findIndex(t=>t.id===draggedId);if(source<0||!ordered.some(t=>t.id===targetId))throw Error('Задача для переноса не найдена.');const [moved]=ordered.splice(source,1);const destination=ordered.findIndex(t=>t.id===targetId)+(after?1:0);ordered.splice(destination,0,moved);if(source===destination)return state;ordered.forEach((t,i)=>{t.sortOrder=i;});const now=new Date().toISOString();moved.updatedAt=now;next.tasks=ordered;next.history.push({id:uid(),taskId:moved.id,at:now,author:author.trim(),field:'Порядок приоритета в реестре',before:String(source+1),after:String(destination+1)});next.revision++;return next;}


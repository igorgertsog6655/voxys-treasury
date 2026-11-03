export const STATUSES = ['Бэклог', 'В работе', 'Завершена'];
export const PRIORITIES = ['Обычный', 'Высокий', 'Низкий'];
export const FIELDS = {title:'Задача',description:'Описание',due:'Срок',owner:'Основной ответственный',holder:'У кого сейчас',status:'Статус',stage:'Текущий этап',nextStep:'Следующий шаг',priority:'Приоритет',completedAt:'Завершена в'};
export const blankState = () => ({schema:1,revision:0,tasks:[],history:[],comments:[]});
export const uid = () => crypto.randomUUID();
export function today() { const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Novosibirsk',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-'); }
export function isDate(s) { return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s; }
export const overdue = t => t.status!=='Завершена' && t.due<today();
export function safeLink(value) { try { const u=new URL(value);return ['https:','http:'].includes(u.protocol) ? u.href : null; } catch { return null; } }
export function validateTask(t) {
  if(!t.title?.trim()||!t.owner?.trim()||!t.holder?.trim()) throw Error('Укажите название, основного ответственного и текущего исполнителя.');
  if(!isDate(t.due)) throw Error('Укажите корректный срок задачи.');
  if(!STATUSES.includes(t.status)||!PRIORITIES.includes(t.priority)) throw Error('Неизвестный статус или приоритет.');
  if(!Array.isArray(t.links)||t.links.some(l=>!safeLink(l))) throw Error('Каждая ссылка должна начинаться с https:// или http://.');
  for(const [key,limit] of Object.entries({title:250,description:15000,owner:120,holder:120,stage:500,nextStep:1000})) if(typeof t[key]!=='string'||t[key].length>limit) throw Error(`Проверьте поле «${FIELDS[key]}» (до ${limit} символов).`);
}
export function saveTask(state, input, author, comment='') {
  author=author.trim(); if(!author) throw Error('Укажите автора изменения.');
  if(author.length>120||comment.length>15000) throw Error('Слишком длинное имя автора или комментарий.');
  const next=structuredClone(state), now=new Date().toISOString(), old=next.tasks.find(t=>t.id===input.id);
  const task={...input,id:old?.id||uid(),createdAt:old?.createdAt||now,updatedAt:now,completedAt:input.status==='Завершена'?(old?.completedAt||now):''};
  validateTask(task);
  const changes=old ? Object.entries(FIELDS).filter(([k])=>old[k]!==task[k]).map(([k,label])=>({field:label,before:String(old[k]||''),after:String(task[k]||'')})) : [{field:'Создание задачи',before:'',after:`${task.title}\nСтатус: ${task.status}\nСрок: ${task.due}\nОтветственный: ${task.owner}\nУ кого сейчас: ${task.holder}`}];
  if(old&&JSON.stringify(old.links)!==JSON.stringify(task.links)) changes.push({field:'Ссылки на результаты',before:old.links.join('\n'),after:task.links.join('\n')});
  if(!changes.length&&!comment.trim()) return state;
  if(old) next.tasks[next.tasks.findIndex(t=>t.id===old.id)]=task;else next.tasks.push(task);
  for(const c of changes) next.history.push({id:uid(),taskId:task.id,at:now,author,...c});
  if(comment.trim()) next.comments.push({id:uid(),taskId:task.id,at:now,author,text:comment.trim()});
  next.revision++; return next;
}
export function addComment(state,taskId,author,text) {if(!state.tasks.some(t=>t.id===taskId)) throw Error('Задача не найдена.');if(!author.trim()||!text.trim()) throw Error('Заполните автора и комментарий.');if(author.length>120||text.length>15000) throw Error('Слишком длинное имя или комментарий.');const next=structuredClone(state);next.comments.push({id:uid(),taskId,at:new Date().toISOString(),author:author.trim(),text:text.trim()});next.revision++;return next;}
export function validateState(s) {
  if(s?.schema!==1||!Number.isSafeInteger(s.revision)||s.revision<0||!Array.isArray(s.tasks)||!Array.isArray(s.history)||!Array.isArray(s.comments)) throw Error('Формат данных не поддерживается.');
  const ids=new Set(); for(const t of s.tasks){validateTask(t);if(!t.id||ids.has(t.id))throw Error('Пустой или повторяющийся ID задачи.');ids.add(t.id);for(const k of ['createdAt','updatedAt'])if(!t[k]||!Number.isFinite(Date.parse(t[k])))throw Error('Некорректная дата записи.');}
  for(const rows of [s.history,s.comments]){const keys=new Set();for(const r of rows){if(!ids.has(r.taskId)||!r.id||keys.has(r.id)||!r.author||!r.at||!Number.isFinite(Date.parse(r.at)))throw Error('Повреждена история или комментарии.');keys.add(r.id);}}
  for(const h of s.history)for(const k of ['field','before','after'])if(typeof h[k]!=='string')throw Error('Повреждено изменение в истории.');
  for(const c of s.comments)if(typeof c.text!=='string'||!c.text.trim())throw Error('Пустой комментарий.');
  return s;
}

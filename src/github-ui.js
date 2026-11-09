import {hasRecords} from './model.js';
import {GitHubStore} from './github-store.js';
import {rememberConnection,restoreConnection,forgetConnection} from './github-credentials.js';
const $=s=>document.querySelector(s);
export function createGitHubUI({getState,encode,decode,replaceLocal,setRemote,canEdit,toast,refresh,hasUnsynced},services={createStore:(config,token)=>new GitHubStore(config,token),remember:rememberConnection,forget:forgetConnection,restore:restoreConnection}){
  let active=null,working=false;
  document.body.insertAdjacentHTML('beforeend',`<dialog id="github-dialog" aria-labelledby="github-title"><form id="github-form"><div class="dialog-head"><h2 id="github-title">Рабочий XLSX на GitHub</h2><button type="button" class="icon-button" data-close="github-dialog" aria-label="Закрыть">×</button></div><div class="dialog-body"><p>Один закрытый репозиторий и один файл для всех ваших браузеров. Файл загружается при открытии приложения, изменения записываются автоматически.</p><label>Закрытый репозиторий<input name="repository" required value="igorgertsog6655/voxys-treasury-data" autocomplete="off"></label><label>Файл XLSX<input name="path" required value="VOXYS_treasury_tasks.xlsx" autocomplete="off"></label><label>Токен доступа GitHub<input name="token" type="password" required autocomplete="off" spellcheck="false" placeholder="Fine-grained token: Contents — Read and write"></label><label class="archive-toggle"><input name="remember" type="checkbox" checked> Запомнить доступ в этом браузере</label><p class="muted">Выдайте токену доступ только к репозиторию с данными. Он хранится в этом браузере в зашифрованном виде и не включается в XLSX или код сайта. Не отправляйте токен в чат. Файл с задачами в публичный репозиторий не загружается.</p><p id="github-error" class="form-error" role="alert"></p></div><div class="dialog-foot"><button type="button" id="github-disconnect">Отключить и забыть</button><button type="submit" class="primary">Подключить</button></div></form></dialog>`);
  async function connect(config,token,{automatic=false,remember=false}={}){
    if(working||!canEdit())throw Error('Дождитесь завершения текущего сохранения.');working=true;
    try{refresh();const candidate=services.createStore(config,token),bytes=await candidate.load();
      if(bytes){const loaded=decode(bytes);if(hasRecords(getState())&&JSON.stringify(loaded)!==JSON.stringify(getState())){if(automatic&&hasUnsynced()){throw Error('Есть локальные изменения, не записанные на GitHub. Скачайте резервную копию и нажмите «Обновить с GitHub».');}if(!automatic&&!confirm('Загрузить рабочий XLSX с GitHub? Текущий локальный реестр будет заменён. При необходимости сначала скачайте резервную копию.'))return false;}await replaceLocal(loaded);}
      else{if(automatic)throw Error('Рабочий XLSX отсутствует. Подключитесь вручную, чтобы создать его.');if(!confirm(`Файл на GitHub не найден. Создать его из текущего реестра (${getState().tasks.length} задач)?`))return false;await candidate.save(encode(getState()));}
      if(remember)await services.remember(candidate.config,token);else if(!automatic)await services.forget();
      active=candidate;setRemote(candidate);localStorage.removeItem('voxys.github.dirty');localStorage.setItem('voxys.github.config',JSON.stringify(candidate.config));refresh();toast('Подключено к GitHub. XLSX загружен, автосохранение включено.');return true;
    }finally{working=false;refresh();}
  }
  function open(){if(!canEdit())return toast('Дождитесь завершения сохранения.');const form=$('#github-form');try{const config=JSON.parse(localStorage.getItem('voxys.github.config')||'null');if(config){form.elements.repository.value=config.repository;form.elements.path.value=config.path;}}catch{}$('#github-error').textContent='';form.elements.token.value='';$('#github-dialog').showModal();}
  $('#github-connect').onclick=open;
  $('#github-form').onsubmit=async e=>{e.preventDefault();const f=e.target,button=f.querySelector('[type="submit"]');button.disabled=true;try{if(await connect({repository:f.elements.repository.value,path:f.elements.path.value},f.elements.token.value,{remember:f.elements.remember.checked})){$('#github-dialog').close();f.elements.token.value='';}}catch(err){$('#github-error').textContent=err.message;}finally{button.disabled=false;}};
  $('#github-disconnect').onclick=async()=>{if(!canEdit()||working)return;try{await services.forget();active=null;setRemote(null);$('#github-form').elements.token.value='';$('#github-dialog').close();refresh();toast('Подключение забыто. Локальный реестр сохранён.');}catch(err){$('#github-error').textContent=err.message;}};
  async function refreshFromGitHub({automatic=false}={}) {
    if(working||!canEdit()||(automatic&&hasUnsynced()))return;
    working=true;
    let failure='';
    try{
      let candidate=active;
      if(!candidate){
        const saved=await services.restore();
        if(!saved){
          if(!automatic)open();
          return;
        }
        candidate=services.createStore(saved.config,saved.token);
      }
      if(hasUnsynced()&&(automatic||!confirm('Загрузить актуальный XLSX с GitHub и заменить локальные изменения? Если они нужны, сначала скачайте копию.')))return;
      refresh();
      const bytes=await candidate.load();
      if(!bytes)throw Error('Рабочий XLSX не найден на GitHub. Проверьте подключение.');
      const loaded=decode(bytes);
      if(JSON.stringify(loaded)!==JSON.stringify(getState()))await replaceLocal(loaded);
      active=candidate;
      setRemote(candidate);
      localStorage.removeItem('voxys.github.dirty');
      if(!automatic)toast('Загружена свежая версия XLSX с GitHub');
    }catch(err){
      setRemote(null);
      failure='GitHub не подключён: '+err.message;
      toast(failure);
    }finally{
      working=false;
      refresh(failure);
    }
  }
  $('#github-refresh').onclick=()=>refreshFromGitHub();
  return {open,refreshFromGitHub,isWorking:()=>working,async restore(){try{const saved=await services.restore();if(saved)await connect(saved.config,saved.token,{automatic:true});}catch(err){toast('Подключение GitHub: '+err.message);refresh('GitHub не подключён: '+err.message);}}};
}

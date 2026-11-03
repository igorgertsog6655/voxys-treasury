export const MAX_XLSX_BYTES=900_000;
export function validateGitHubConfig(input){
  const repository=String(input.repository||'').trim().replace(/^https:\/\/github\.com\//,'').replace(/\/$/,'').replace(/\.git$/,'');
  if(!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository))throw Error('Укажите репозиторий в формате владелец/название.');
  const path=String(input.path||'VOXYS_treasury_tasks.xlsx').trim();
  if(!path.endsWith('.xlsx')||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..')||/[?#\\\u0000-\u001f]/.test(path))throw Error('Укажите путь к файлу .xlsx внутри репозитория.');
  return {repository,path};
}
export function toBase64(bytes){const array=new Uint8Array(bytes);let text='';for(let i=0;i<array.length;i+=8192)text+=String.fromCharCode(...array.subarray(i,i+8192));return btoa(text);}
export function fromBase64(text){return Uint8Array.from(atob(text.replace(/\s/g,'')),c=>c.charCodeAt(0));}
export class GitHubStore {
  #token;#fetch;#sha=null;#branch='';#loaded=false;
  constructor(config,token,fetcher=globalThis.fetch){this.config=validateGitHubConfig(config);if(!token?.trim())throw Error('Укажите токен доступа GitHub.');this.#token=token.trim();this.#fetch=fetcher;}
  async #request(suffix='',options={}){
    const response=await this.#fetch(`https://api.github.com/repos/${this.config.repository}${suffix}`,{...options,cache:'no-store',redirect:'error',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${this.#token}`,'X-GitHub-Api-Version':'2026-03-10',...(options.body?{'Content-Type':'application/json'}:{})},signal:AbortSignal.timeout(30000)});
    if(response.status===404&&suffix.startsWith('/contents/')&&!options.method)return null;
    if(!response.ok){const messages={401:'GitHub не принял токен. Подключитесь заново.',403:'GitHub запретил доступ. Проверьте права Contents: Read and write и лимит запросов.',404:'Репозиторий не найден или токен не имеет к нему доступа.',409:'Файл изменён в другом браузере. Загрузите свежую версию с GitHub.',422:'GitHub отклонил запись. Проверьте ветку, права и наличие изменений на сервере.'};throw Error(messages[response.status]||`Ошибка GitHub (${response.status}). Изменения остались в браузере.`);}
    return response.json();
  }
  async #verifyPrivate(){const repo=await this.#request();if(repo.private!==true)throw Error('Рабочий XLSX можно хранить только в закрытом (Private) репозитории. Текущий репозиторий публичный.');if(!repo.default_branch)throw Error('Создайте в репозитории README, чтобы появилась основная ветка.');if(this.#branch&&this.#branch!==repo.default_branch)throw Error('Основная ветка изменилась. Подключитесь заново.');this.#branch=repo.default_branch;}
  #path(){return '/contents/'+this.config.path.split('/').map(encodeURIComponent).join('/');}
  async load(){await this.#verifyPrivate();const file=await this.#request(this.#path()+'?ref='+encodeURIComponent(this.#branch));if(!file){this.#sha=null;this.#loaded=true;return null;}if(file.type!=='file'||file.encoding!=='base64'||typeof file.content!=='string'||!file.sha)throw Error('GitHub не вернул содержимое XLSX. Проверьте путь и размер файла.');if(file.size>MAX_XLSX_BYTES)throw Error('Размер рабочего XLSX превышает 900 КБ. Сохраните архив и создайте новый рабочий файл.');this.#sha=file.sha;this.#loaded=true;return fromBase64(file.content);}
  async save(bytes){if(!this.#loaded)throw Error('Сначала загрузите актуальный XLSX с GitHub.');if(new Uint8Array(bytes).byteLength>MAX_XLSX_BYTES)throw Error('Рабочий XLSX превышает 900 КБ. Запись на GitHub остановлена.');await this.#verifyPrivate();const current=await this.#request(this.#path()+'?ref='+encodeURIComponent(this.#branch));if((current?.sha||null)!==this.#sha)throw Error('XLSX изменён в другом браузере. Автозапись остановлена. Сохраните свою копию и загрузите свежую версию с GitHub.');const result=await this.#request(this.#path(),{method:'PUT',body:JSON.stringify({message:'Update treasury workbook',content:toBase64(bytes),branch:this.#branch,...(this.#sha?{sha:this.#sha}:{})})});if(!result?.content?.sha)throw Error('GitHub не подтвердил сохранение XLSX. Переподключитесь и проверьте файл.');this.#sha=result.content.sha;return this.#sha;}
}

export const TEAM_COLORS = [
  ['Мятный','#d9f1e3'], ['Голубой','#dbeeff'], ['Лавандовый','#eae1fa'],
  ['Персиковый','#ffe5d5'], ['Лимонный','#fff1bf'], ['Розовый','#f8deeb'],
  ['Бирюзовый','#d5f2f1'], ['Сиреневый','#efdef4'], ['Фисташковый','#e8efcd'],
  ['Песочный','#f3e7d2'], ['Васильковый','#e0e6ff'], ['Коралловый','#fadfdb']
];

const palette = new Set(TEAM_COLORS.map(([,color])=>color));
export const isTeamColor = color => palette.has(color);
export const defaultTeamColor = index => TEAM_COLORS[index % TEAM_COLORS.length][1];

function normalizeName(name) {
  return String(name??'').toLocaleLowerCase('ru').replaceAll('ё','е').replaceAll('.',' ').trim().replace(/\s+/g,' ');
}

export function teamColors(people) {
  const byId=new Map();
  const byName=new Map();
  const byShortName=new Map();
  people.forEach((person,index)=>{
    const color=isTeamColor(person.color)?person.color:defaultTeamColor(index);
    const name=normalizeName(person.fullName);
    byId.set(person.id,color);
    byName.set(name,byName.has(name)?'':person.id);
    const [surname,firstName,middleName]=name.split(' ');
    if(!firstName)return;
    const initials=[firstName,middleName].filter(Boolean).map(part=>part[0]).join(' ');
    const aliases=new Set([surname,firstName,`${surname} ${firstName}`,`${firstName} ${surname}`,
      `${surname} ${initials}`,`${surname} ${initials.replaceAll(' ','')}`,`${initials} ${surname}`]);
    for(const alias of aliases)byShortName.set(alias,byShortName.has(alias)?'':person.id);
  });
  return (id,name)=>{
    const key=normalizeName(name);
    return byId.get(id||(byName.get(key)??byShortName.get(key)))||'';
  };
}

export function teamColorStyle(color) {
  return isTeamColor(color)?' style="--team-color:'+color+'"':'';
}

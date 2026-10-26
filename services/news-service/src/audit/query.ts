import {AdminError} from '../admin/query';
export const catalog=require('../../../../shared/audit/index.cjs').catalog;
export interface LogQuery {page:number;limit:number;q:string;startDate:string;endDate:string;action:string;entity:string;service:string;outcome:string;sensitivity:string;userId:string;}
const localDay=(now:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function parseLogQuery(raw:Record<string,unknown>,now=new Date()):LogQuery{
 const value=(key:string)=>{const v=raw[key];if(v===undefined||v==='')return '';if(typeof v!=='string'&&typeof v!=='number')throw new AdminError(400,'Filtro inválido');return String(v);};
 const page=Number(value('page')||1),limit=Number(value('limit')||25);
 if(!Number.isSafeInteger(page)||page<1||page>100000||![25,50,100].includes(limit))throw new AdminError(400,'Paginación inválida');
 const today=localDay(now),endDate=value('endDate')||today;
 const startDate=value('startDate')||new Date(Date.parse(today+'T00:00:00Z')-13*86400000).toISOString().slice(0,10);
 for(const date of [startDate,endDate])if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new AdminError(400,'Fecha inválida');
 if(startDate>endDate||Date.parse(endDate)-Date.parse(startDate)>3660*86400000)throw new AdminError(400,'Selecciona un rango válido de hasta diez años');
 const q=value('q').trim();if(q.length>200)throw new AdminError(400,'La búsqueda admite hasta 200 caracteres');
 const allowed:Record<string,string[]>={action:Object.keys(catalog.actions),entity:[...new Set(Object.values(catalog.actions).map((a:any)=>a.entity))] as string[],service:catalog.services,outcome:['started','success','failure','denied'],sensitivity:['normal','sensible']};
 const filters:Record<string,string>={};for(const [key,choices] of Object.entries(allowed)){filters[key]=value(key);if(filters[key]&&!choices.includes(filters[key]))throw new AdminError(400,'Filtro inválido');}
 const userId=value('userId');if(userId&&(!/^[1-9]\d{0,9}$/.test(userId)||Number(userId)>2147483647))throw new AdminError(400,'Usuario inválido');
 return {page,limit,q,startDate,endDate,userId,...filters} as LogQuery;
}
export const effectiveDate='coalesce(l.occurred_at,l.recorded_at)';
export function logFilter(query:LogQuery){
 const clauses=[`${effectiveDate}>=(CAST(:startDate AS date)::timestamp AT TIME ZONE 'America/Mexico_City')`,`${effectiveDate}<((CAST(:endDate AS date)+1)::timestamp AT TIME ZONE 'America/Mexico_City')`];
 const values:Record<string,unknown>={...query};
 for(const key of ['action','entity','service','outcome','sensitivity'] as const)if(query[key])clauses.push(`l.${key}=:${key}`);
 if(query.userId)clauses.push('l.user_id=:userId');
 if(query.q){clauses.push("(l.description ILIKE :search ESCAPE '\\' OR u.nombre ILIKE :search ESCAPE '\\' OR u.email ILIKE :search ESCAPE '\\')");values.search='%'+query.q.replace(/[\\%_]/g,'\\$&')+'%';}
 return {where:clauses.join(' AND '),values};
}

import {QueryTypes,Transaction} from 'sequelize';
import sequelize from '../config/db';
import {AdminError} from '../admin/query';
import {newsValues,normalizeUrl,reasonValue,expectedVersion} from './validation';
const query=(sql:string,values:any,t:Transaction)=>sequelize.query<any>(sql,{replacements:values,type:QueryTypes.SELECT,transaction:t});
async function actorLock(actor:number,t:Transaction){
 const users=await query("SELECT id FROM usuarios WHERE id=:actor AND activo=true AND rol='admin' FOR SHARE",{actor},t);
 if(!users.length)throw new AdminError(403,'Permiso revocado');
}
async function audit(before:any,after:any,actor:number,action:string,reason:string,t:Transaction){
 await query('INSERT INTO news_editorial_events(noticia_id,actor_id,actor_role,action,reason,version,before_data,after_data) VALUES(:id,:actor,\'admin\',:action,:reason,:version,CAST(:before AS jsonb),CAST(:after AS jsonb)) RETURNING id',
 {id:after.id,actor,action,reason,version:after.editorial_version,before:before?JSON.stringify(before):null,after:JSON.stringify(after)},t);
}
async function duplicate(data:any,id:number|null,t:Transaction){
 // One namespace serializes manual creates/edits, without changing importers.
 await query('SELECT pg_advisory_xact_lock(734251,6)',{},t);
 const candidates=await query('SELECT id,titulo,contenido,url FROM noticias WHERE (:id IS NULL OR id<>:id)',{id},t);
 const normalizeText=(v:string)=>v.trim().replace(/\s+/g,' ');
 const found=candidates.find(n=>{if(data.url&&n.url){try{return normalizeUrl(n.url)===data.url;}catch{return false;}}
 return !data.url&&!n.url&&normalizeText(n.titulo)===normalizeText(data.titulo)&&normalizeText(n.contenido)===normalizeText(data.contenido);});
 if(found)throw new AdminError(409,`Ya existe la noticia #${found.id} con esa URL o contenido`);
}
async function references(data:any,t:Transaction){for(const [key,table] of [['fuente_id','fuentes'],['tema_id','temas']])if(data[key]!=null&&!(await query(`SELECT id FROM ${table} WHERE id=:id`,{id:data[key]},t)).length)throw new AdminError(400,'La fuente o tema ya no existe');}
export async function createEditorialNews(input:any,actor:number){
 const data=newsValues(input,true);
 return sequelize.transaction(async t=>{await actorLock(actor,t);await duplicate(data,null,t);await references(data,t);const keys=Object.keys(data);
 const rows=await query(`INSERT INTO noticias(${keys.join(',')},editorial_origin) VALUES(${keys.map(k=>':'+k).join(',')},'manual') RETURNING *`,data,t);
 await audit(null,rows[0],actor,'create','Alta manual',t);return rows[0];});
}
export async function updateEditorialNews(id:number,input:any,actor:number){
 const data=newsValues(input,false),reason=reasonValue(input.reason),version=expectedVersion(input.expected_version);
 return sequelize.transaction(async t=>{
  // Same lock as delivery worker: a withdrawal/edit cannot commit mid-send.
  await query('SELECT pg_advisory_xact_lock(734251,3)',{},t);await actorLock(actor,t);
  await query('SELECT pg_advisory_xact_lock(734251,6)',{},t);
  const before=(await query('SELECT * FROM noticias WHERE id=:id FOR UPDATE',{id},t))[0];if(!before)throw new AdminError(404,'Noticia no encontrada');if(before.editorial_version!==version)throw new AdminError(409,'La noticia cambió. Recarga antes de guardar.');
  await references(data,t);await duplicate({...before,...data},id,t);const keys=Object.keys(data);
  const after=(await query(`UPDATE noticias SET ${keys.map(k=>`${k}=:${k}`).join(',')},updated_at=now() WHERE id=:id RETURNING *`,{...data,id},t))[0];
  if(after.editorial_version!==before.editorial_version)await audit(before,after,actor,'edit',reason,t);return after;
 });
}
export async function transitionEditorialNews(id:number,input:any,actor:number){
 if(!input||!['submit','publish','withdraw','reopen'].includes(input.action))throw new AdminError(400,'Acción inválida');
 const reason=reasonValue(input.reason),version=expectedVersion(input.expected_version),action=input.action;
 const states:Record<string,[string,string]>={submit:['draft','in_review'],publish:['in_review','published'],withdraw:['published','withdrawn'],reopen:['withdrawn','draft']};
 return sequelize.transaction(async t=>{await query('SELECT pg_advisory_xact_lock(734251,3)',{},t);await actorLock(actor,t);
 const before=(await query('SELECT * FROM noticias WHERE id=:id FOR UPDATE',{id},t))[0];if(!before)throw new AdminError(404,'Noticia no encontrada');
 if(before.editorial_version!==version){const last=(await query('SELECT * FROM news_editorial_events WHERE noticia_id=:id ORDER BY id DESC LIMIT 1',{id},t))[0];
  if(before.editorial_version===version+1&&last?.action===action&&last.actor_id===actor&&last.reason===reason&&last.version===before.editorial_version)return before;
  throw new AdminError(409,'La noticia cambió. Recarga antes de continuar.');}
 if(before.editorial_state!==states[action][0])throw new AdminError(409,'Transición editorial no permitida');
 if(action==='publish')newsValues({titulo:before.titulo,contenido:before.contenido,url:before.url},true);
 const review=action==='publish'?',editorial_published_at=now(),editorial_reviewed_by=:actor,editorial_reviewed_at=now(),editorial_reviewed_version=:nextVersion':'';
 const after=(await query(`UPDATE noticias SET editorial_state=:state,updated_at=now()${review} WHERE id=:id RETURNING *`,{id,state:states[action][1],actor,nextVersion:version+1},t))[0];
 await audit(before,after,actor,action,reason,t);return after;});
}
export function availableActions(state:string){return ({draft:['submit'],in_review:['publish'],published:['withdraw'],withdrawn:['reopen']} as Record<string,string[]>)[state]||[];}

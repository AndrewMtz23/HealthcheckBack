const catalog=require('../../contracts/audit/catalog.json');
const schema=require('../../contracts/audit/event.schema.json');
const {isIP}=require('node:net');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function classify(action,outcome){const rule=catalog.actions[action];if(!rule)throw Error('Unknown audit action');return action==='AUTH_LOGIN'&&['failure','denied'].includes(outcome)?'sensible':rule.sensitivity;}
function validate(event){
 try{
  const fail=()=>({ok:false,error:'Invalid audit event'});
  if(!event||typeof event!=='object'||Array.isArray(event))return fail();
  const keys=Object.keys(event);if(keys.length!==schema.required.length||keys.some(k=>!schema.required.includes(k)))return fail();
  const rule=catalog.actions[event.action];if(!rule||rule.entity!==event.entity)return fail();
  if(!uuid.test(event.event_key)||!uuid.test(event.request_id)||!catalog.services.includes(event.service))return fail();
  if(!['success','failure','denied','started'].includes(event.outcome)||!['live','imported'].includes(event.origin))return fail();
  if(!['user','system','anonymous'].includes(event.actor_type)||!['admin','usuario',null].includes(event.actor_role))return fail();
  if(event.actor_type==='user' ? !(event.origin==='imported'&&event.user_id===null)&&(!Number.isSafeInteger(event.user_id)||event.user_id<=0) : event.user_id!==null||event.actor_role!==null)return fail();
  if(event.occurred_at===null ? event.origin!=='imported' : typeof event.occurred_at!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(event.occurred_at)||!Number.isFinite(Date.parse(event.occurred_at)))return fail();
  if(event.occurred_at!==null){const day=event.occurred_at.slice(0,10);if(new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)return fail();}
  for(const [k,max] of [['description',1000],['user_agent',512],['entity_id',128],['source_reference',200]])if(event[k]!==null&&(typeof event[k]!=='string'||[...event[k]].length>max))return fail();
  if(!event.description?.trim())return fail();
  if(event.ip_address!==null&&(typeof event.ip_address!=='string'||!isIP(event.ip_address)))return fail();
  const m=event.metadata;if(!m||typeof m!=='object'||Array.isArray(m)||Buffer.byteLength(JSON.stringify(m),'utf8')>16384)return fail();
  for(const [k,v] of Object.entries(m)){
   if(!rule.metadata.includes(k))return fail();
   if(Array.isArray(v)?v.length>100||v.some(x=>typeof x!=='string'||x.length>128):v!==null&&!['string','number','boolean'].includes(typeof v))return fail();
   if(typeof v==='string'&&v.length>512)return fail();
   if(typeof v==='number'&&!Number.isFinite(v))return fail();
  }
  return {ok:true};
 }catch{return {ok:false,error:'Invalid audit event'};}
}
module.exports={catalog,validate,classify};

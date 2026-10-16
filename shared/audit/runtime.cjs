const {randomUUID,createHmac,timingSafeEqual}=require('node:crypto');
const {isIP}=require('node:net');
const {catalog,validate}=require('./index.cjs');
const contexts=new WeakMap();
const payload=(id,time,ip,ua)=>JSON.stringify(['healthcheck-audit-v1',id,time,ip,ua]);
function signContext(req,secret){
 if(typeof secret!=='string'||secret.length<32)return {};
 const id=randomUUID(),time=String(Date.now()),ip=req.socket?.remoteAddress||'',ua=String(req.headers?.['user-agent']||'').slice(0,512);
 return {'x-audit-id':id,'x-audit-time':time,'x-audit-ip':ip,'x-audit-agent':encodeURIComponent(ua),'x-audit-proof':createHmac('sha256',secret).update(payload(id,time,ip,ua)).digest('hex')};
}
function context(req,secret=process.env.JWT_SECRET||''){
 let network=contexts.get(req);
 if(!network){
  const h=req.headers||{};let ip=req.socket?.remoteAddress||null,ua=String(h['user-agent']||'').slice(0,512)||null,id=randomUUID();
  try{
   const candidate=h['x-audit-id'],time=h['x-audit-time'],agent=decodeURIComponent(h['x-audit-agent']||''),proof=h['x-audit-proof'];
   if(secret.length>=32&&typeof candidate==='string'&&/^[a-f0-9-]{36}$/.test(candidate)&&typeof time==='string'&&Math.abs(Date.now()-Number(time))<=30000&&typeof proof==='string'&&/^[a-f0-9]{64}$/.test(proof)&&isIP(h['x-audit-ip'])&&agent.length<=512){
    const expected=createHmac('sha256',secret).update(payload(candidate,time,h['x-audit-ip'],agent)).digest();
    if(timingSafeEqual(expected,Buffer.from(proof,'hex'))){ip=h['x-audit-ip'];ua=agent||null;id=candidate;}
   }
  }catch{ /* Untrusted headers are ignored; peer address remains authoritative. */ }
  network={request_id:id,ip_address:ip&&isIP(ip)?ip:null,user_agent:ua};contexts.set(req,network);
 }
 const user=req.user;return {...network,user_id:user?.id||null,actor_type:user?.id?'user':'anonymous',actor_role:user?.rol||null};
}
function event(req,service,action,entityId,metadata={},outcome='success',actor){
 const rule=catalog.actions[action];if(!rule)throw Error('Unknown audit action');
 const identity=actor?{...context(req),user_id:actor.id,actor_type:'user',actor_role:actor.rol}:context(req);
 return {event_key:randomUUID(),occurred_at:new Date().toISOString(),...identity,action,entity:rule.entity,entity_id:entityId==null?null:String(entityId),service,outcome,description:rule.label,metadata,origin:'live',source_reference:null};
}
async function write(sequelize,value,transaction){
 if(process.env.AUDIT_ENABLED!=='true')return null;
 if(!validate(value).ok)throw Error('Invalid audit event');
 try {
  const [rows]=await sequelize.query('SELECT record_system_log(CAST(:event AS jsonb))::text AS id',{replacements:{event:JSON.stringify(value)},transaction});
  return rows[0].id;
 } catch {
  // Sequelize errors include bound SQL: keep audit personal data out of stdout.
  throw Error('AUDIT_WRITE_FAILED');
 }
}
module.exports={context,signContext,event,write};

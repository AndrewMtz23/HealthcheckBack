const {event,validate}=(()=>{const runtime=require('../../../../shared/audit/runtime.cjs');return {...runtime,...require('../../../../shared/audit/index.cjs')};})();
async function writeAudit(client,value){
 if(process.env.AUDIT_ENABLED!=='true')return;
 if(!validate(value).ok)throw Error('Invalid audit event');
 try{await client.query('SELECT record_system_log($1::jsonb)',[JSON.stringify(value)]);}catch{throw Error('AUDIT_WRITE_FAILED');}
}
function systemEvent(action,outcome,id=null,metadata={},requestId){
 const value=event({headers:{},socket:{}},'notifications',action,id,metadata,outcome);
 value.actor_type='system';if(requestId)value.request_id=requestId;
 return value;
}
class DeliveryAudit {
 constructor(client){this.client=client;this.started=null;this.count=0;this.failed=0;}
 async start(){if(this.started)return;this.started=systemEvent('DELIVERY_RUN','started');await writeAudit(this.client,this.started);}
 record(state){if(state==='sent')this.count++;else if(state)this.failed++;}
 async finish(failed=false){
  if(!this.started)return;
  await writeAudit(this.client,systemEvent('DELIVERY_RUN',failed||this.failed?'failure':'success',null,{count:this.count,failed_count:this.failed,...(this.count?{transport_status:'accepted_by_smtp'}:{})},this.started.request_id));
 }
}
module.exports={writeAudit,systemEvent,DeliveryAudit};

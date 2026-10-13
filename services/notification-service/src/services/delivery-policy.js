const ZONE = 'America/Mexico_City';
const parts = new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23',minute:'2-digit',second:'2-digit'});
function wall(date) {return Object.fromEntries(parts.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
function localNine(year,month,day) {
  const target=Date.UTC(year,month-1,day,9);let candidate=target;
  for(let i=0;i<3;i++){const p=wall(new Date(candidate));candidate+=target-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);}
  return new Date(candidate);
}
function deliveryWindow(frequency,now) {
  if(frequency==='inmediata'){const until=new Date(Math.floor(now.getTime()/900000)*900000);return {until,from:new Date(until.getTime()-900000)};}
  if(!['diaria','semanal'].includes(frequency))throw Error('Unsupported notification frequency');
  const p=wall(now),date=new Date(Date.UTC(p.year,p.month-1,p.day));
  if(frequency==='semanal')date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));
  let until=localNine(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate());
  const days=frequency==='semanal'?7:1;
  if(until>now){date.setUTCDate(date.getUTCDate()-days);until=localNine(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate());}
  date.setUTCDate(date.getUTCDate()-days);
  return {until,from:localNine(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate())};
}
function retryOutcome(error,attempts) {
  const response=Number(error?.responseCode);
  const temporary=(response>=400&&response<500)||['ECONNREFUSED','ENOTFOUND','EAI_AGAIN'].includes(error?.code);
  if(temporary)return {state:attempts<3?'retry':'failed',delay:attempts===1?900000:3600000,code:'SMTP_TEMPORARY'};
  if((response>=500&&response<600)||error?.code==='EAUTH')return {state:'failed',delay:0,code:'SMTP_REJECTED'};
  return {state:'uncertain',delay:0,code:'SMTP_OUTCOME_UNKNOWN'};
}
module.exports={ZONE,deliveryWindow,retryOutcome};

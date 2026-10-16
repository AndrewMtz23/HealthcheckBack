// Shared loopback topology; only explicitly selected local mode enables manual work.
function localServiceEnv(name,mode='diagnostic',secrets={}){
 if(!['frontend','gateway','auth','news','notifications','ml','link-monitor'].includes(name))throw Error('Unknown local service');
 if(!['diagnostic','local'].includes(mode))throw Error('Unknown launch mode');
 const live=mode==='local';
 if(live && ['JWT_SECRET','ML_GATEWAY_SECRET','LINK_MONITOR_INTERNAL_TOKEN'].some(k=>typeof secrets[k]!=='string'||secrets[k].length<32))throw Error('Missing private local secrets');
 const env={HEALTHCHECK_DIAGNOSTIC:live&&name!=='notifications'?'0':'1',FRONTEND_URL:'http://localhost:3000',ALLOWED_ORIGINS:'http://localhost:3000',AUTH_SERVICE_URL:'http://127.0.0.1:3001',ML_SERVICE_URL:'http://127.0.0.1:5000',NOTIFICATIONS_SERVICE_URL:'http://127.0.0.1:3004',RECOVERY_MAIL_ENABLED:'false',NOTIFICATION_DELIVERY_ENABLED:'false',ML_SCHEDULER_ENABLED:'false',HEALTHCHECK_LOCAL_MANUAL:live?'1':'0'};
 if(name==='frontend')Object.assign(env,{NODE_ENV:'development',NEXT_PUBLIC_API_URL:'http://localhost:4000/api',NEXT_PUBLIC_NEWS_API_URL:'http://localhost:3003/api'});
 if(live&&['auth','news','gateway'].includes(name))env.JWT_SECRET=secrets.JWT_SECRET;
 if(['ml','gateway'].includes(name))env.ML_GATEWAY_SECRET=live?secrets.ML_GATEWAY_SECRET:'phase00-ml-gateway-diagnostic-only-token';
 if(name==='news'||name==='link-monitor')Object.assign(env,{LINK_MONITOR_URL:'http://127.0.0.1:3005',LINK_MONITOR_INTERNAL_TOKEN:live?secrets.LINK_MONITOR_INTERNAL_TOKEN:'phase00-link-monitor-diagnostic-only',LINK_MONITOR_HOST:'127.0.0.1'});
 return env;
}
module.exports={localServiceEnv};

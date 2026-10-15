// Fixed loopback topology for the protected Windows launcher.
function localServiceEnv(name){
 if(!['frontend','gateway','auth','news','notifications','ml','link-monitor'].includes(name))throw Error('Unknown local service');
 const env={HEALTHCHECK_DIAGNOSTIC:'1',FRONTEND_URL:'http://localhost:3000',ALLOWED_ORIGINS:'http://localhost:3000',AUTH_SERVICE_URL:'http://127.0.0.1:3001',ML_SERVICE_URL:'http://127.0.0.1:5000',NOTIFICATIONS_SERVICE_URL:'http://127.0.0.1:3004',RECOVERY_MAIL_ENABLED:'false'};
 if(name==='frontend')Object.assign(env,{NODE_ENV:'development',NEXT_PUBLIC_API_URL:'http://localhost:4000/api',NEXT_PUBLIC_NEWS_API_URL:'http://localhost:3003/api'});
 if(name==='news'||name==='link-monitor')Object.assign(env,{LINK_MONITOR_URL:'http://127.0.0.1:3005',LINK_MONITOR_INTERNAL_TOKEN:'phase00-link-monitor-diagnostic-only',LINK_MONITOR_HOST:'127.0.0.1'});
 return env;
}
module.exports={localServiceEnv};

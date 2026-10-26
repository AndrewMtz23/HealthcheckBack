const {test}=require('node:test');const assert=require('node:assert/strict');
test('local launcher connects browser, gateway, news and monitor consistently',()=>{
 const {localServiceEnv}=require('../scripts/local-service-env.cjs');
 const news=localServiceEnv('news'),monitor=localServiceEnv('link-monitor'),front=localServiceEnv('frontend'),gateway=localServiceEnv('gateway');
 assert.equal(front.NEXT_PUBLIC_API_URL,'http://localhost:4000/api');assert.equal(front.NEXT_PUBLIC_NEWS_API_URL,'http://localhost:3003/api');
 assert.equal(gateway.AUTH_SERVICE_URL,'http://127.0.0.1:3001');assert.equal(gateway.ML_SERVICE_URL,'http://127.0.0.1:5000');assert.equal(gateway.NOTIFICATIONS_SERVICE_URL,'http://127.0.0.1:3004');
 assert.equal(news.LINK_MONITOR_URL,'http://127.0.0.1:3005');assert.equal(news.LINK_MONITOR_INTERNAL_TOKEN,monitor.LINK_MONITOR_INTERNAL_TOKEN);assert.equal(monitor.LINK_MONITOR_HOST,'127.0.0.1');
 for(const env of [news,monitor,front,gateway])assert.equal(env.HEALTHCHECK_DIAGNOSTIC,'1');
 assert.equal(Object.keys(front).some(k=>k.startsWith('NEXT_PUBLIC_')&&k.includes('TOKEN')),false);
});

test('normal local mode enables manual work with private shared tokens and keeps delivery/scheduling off',()=>{
 const {localServiceEnv}=require('../scripts/local-service-env.cjs');
 const secrets={JWT_SECRET:'j'.repeat(48),ML_GATEWAY_SECRET:'m'.repeat(48),LINK_MONITOR_INTERNAL_TOKEN:'l'.repeat(48)};
 for(const name of ['auth','news','gateway','ml','link-monitor']){
  const env=localServiceEnv(name,'local',secrets);
  assert.equal(env.HEALTHCHECK_DIAGNOSTIC,'0');assert.equal(env.ML_SCHEDULER_ENABLED,'false');
  assert.equal(env.RECOVERY_MAIL_ENABLED,'false');assert.equal(env.NOTIFICATION_DELIVERY_ENABLED,'false');
 }
 assert.equal(localServiceEnv('ml','local',secrets).ML_GATEWAY_SECRET,localServiceEnv('gateway','local',secrets).ML_GATEWAY_SECRET);
 assert.equal(localServiceEnv('news','local',secrets).LINK_MONITOR_INTERNAL_TOKEN,localServiceEnv('link-monitor','local',secrets).LINK_MONITOR_INTERNAL_TOKEN);
 assert.equal(localServiceEnv('notifications','local',secrets).HEALTHCHECK_DIAGNOSTIC,'1');
 assert.throws(()=>localServiceEnv('news','local',{}),/secret/i);
 const front=localServiceEnv('frontend','local',secrets);
 assert.equal(front.JWT_SECRET,undefined);assert.equal(front.LINK_MONITOR_INTERNAL_TOKEN,undefined);
 assert.equal(localServiceEnv('news','local',{...secrets,AUDIT_ENABLED:'true'}).AUDIT_ENABLED,'true');
 assert.equal(localServiceEnv('news','diagnostic',{...secrets,AUDIT_ENABLED:'true'}).AUDIT_ENABLED,'false');
});

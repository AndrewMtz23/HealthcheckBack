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

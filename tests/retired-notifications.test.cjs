const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('../services/notification-service/node_modules/express');
test('legacy routes never expose another user or allow delivery, even with a token',async()=>{
 const app=express();app.use('/api',require('../services/notification-service/src/routes'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try {
  for(const [method,path] of [['GET','notifications/notifications/1'],['DELETE','notifications/notifications/1'],['POST','notifications/notifications/send'],['PUT','notifications/preferences/1'],['POST','notifications/notifications/check']]){
   const response=await fetch(`http://127.0.0.1:${server.address().port}/api/${path}`,{method,headers:{Authorization:'Bearer invalid'}});
   assert.equal(response.status,410,`${method} ${path}`);
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
});

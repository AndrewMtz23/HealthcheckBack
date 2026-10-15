const {test}=require('node:test');const assert=require('node:assert/strict');
const express=require('../services/news-service/node_modules/express');
async function listen(app){const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(r=>server.close(r))};}
test('monitor routes enforce live admin authorization and preserve internal credentials',async()=>{
 let role='admin',active=true,body,header;const auth=express();auth.get('/api/auth/profile',(req,res)=>res.json({data:{user:{id:1,email:'admin@example.invalid',rol:role}}}));const a=await listen(auth);
 const monitor=express();monitor.use(express.json());monitor.post('/internal/link-monitor/runs',(req,res)=>{body=req.body;header=req.headers.authorization;res.status(202).json({status:'success',data:{created:true,run:{id:'test-run',state:'queued'}}});});monitor.get('/internal/link-monitor/results',(req,res)=>res.json({status:'success',data:{items:[],total:0}}));const m=await listen(monitor);
 process.env.AUTH_SERVICE_URL=a.url;process.env.LINK_MONITOR_URL=m.url;process.env.LINK_MONITOR_INTERNAL_TOKEN='internal-only';
 const read=require('../services/news-service/dist/admin/read');const original=read.sql;read.sql=async()=>role==='admin'&&active?[{id:1}]:[];
 const app=express();app.use(express.json());app.use('/api/admin',require('../services/news-service/dist/admin/router').default);const api=await listen(app);
 try{
 const url=api.url+'/api/admin/link-monitor/runs';const options={method:'POST',headers:{Authorization:'Bearer fake-session','Content-Type':'application/json'},body:JSON.stringify({requested_by:999,url:'http://localhost'})};
 assert.equal((await fetch(url,{method:'POST'})).status,401);
 const response=await fetch(url,options);assert.equal(response.status,202);assert.deepEqual(body,{requested_by:1});assert.equal(header,'Bearer internal-only');assert.equal((await response.text()).includes('internal-only'),false);
 role='usuario';assert.equal((await fetch(url,options)).status,403);role='admin';active=false;assert.equal((await fetch(url,options)).status,403);active=true;
 assert.equal((await fetch(api.url+'/api/admin/link-monitor/results?limit=101',{headers:options.headers})).status,400);
 assert.equal((await fetch(api.url+'/api/admin/link-monitor/results',{headers:options.headers})).status,200);
 process.env.LINK_MONITOR_URL='http://127.0.0.1:1';assert.equal((await fetch(url,options)).status,503);
 }finally{read.sql=original;await api.close();await a.close();await m.close();}
});

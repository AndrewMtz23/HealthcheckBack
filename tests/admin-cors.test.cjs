const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('../api-gateway/node_modules/express');
const cors=require('../api-gateway/node_modules/cors');
process.env.ALLOWED_ORIGINS='http://localhost:3000';
const options=require('../api-gateway/dist/config/cors').default;

test('browser can preflight admin user PATCH without weakening origin restrictions',async()=>{
 const app=express();app.use(cors(options));
 app.use((error,_req,res,_next)=>res.status(403).end());
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 try{
  const url=`http://127.0.0.1:${server.address().port}/api/auth/admin/users/1`;
  const headers={Origin:'http://localhost:3000','Access-Control-Request-Method':'PATCH','Access-Control-Request-Headers':'authorization,content-type'};
  const response=await fetch(url,{method:'OPTIONS',headers});
  assert.equal(response.status,204);
  assert.equal(response.headers.get('access-control-allow-origin'),headers.Origin);
  assert(response.headers.get('access-control-allow-methods').split(',').includes('PATCH'),'PATCH must be allowed for browser saves');
  const allowed=response.headers.get('access-control-allow-headers').toLowerCase();
  assert(allowed.includes('authorization'));assert(allowed.includes('content-type'));
  const rejected=await fetch(url,{method:'OPTIONS',headers:{...headers,Origin:'https://untrusted.example.invalid'}});
  assert.equal(rejected.status,403);assert.equal(rejected.headers.get('access-control-allow-origin'),null);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

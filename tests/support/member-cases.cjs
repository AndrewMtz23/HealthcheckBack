const assert=require('node:assert/strict');
const jwt=require('../../services/auth-service/node_modules/jsonwebtoken');
module.exports=async function({db,secret,instance,sessions}){
 const token=sessions.get(3);
 const rows=(await db.query("INSERT INTO historial_consultas(usuario_id,noticia_id,fecha_consulta) VALUES(3,2,'2026-10-06 00:00:00'),(3,1,'2026-10-06 23:59:59'),(3,1,'2026-10-07 00:00:00'),(1,2,'2026-10-06 12:00:00') RETURNING id,usuario_id")).rows;
 let checks=0;
 async function call(path='',status=200,method='GET',authenticated=true){
  const response=await fetch(`http://127.0.0.1:13003/api/history${path}`,{method,headers:authenticated?{Authorization:`Bearer ${token}`}:{}});
  assert.equal(response.headers.get('x-healthcheck-test-instance'),instance);assert.equal(response.status,status);checks++;return (await response.json()).data;
 }
 const all=await call();assert.equal(all.total,3,'Multiple classifications must not inflate personal counts');assert.equal(all.history.length,3);
 const day=await call('?startDate=2026-10-06&endDate=2026-10-06');assert.equal(day.total,2,'Include both ends of the calendar day');assert(day.history.every(row=>row.usuario_id===3));
 const classified=day.history.find(row=>row.noticia_id===2);assert.equal(classified.noticia.clasificaciones.length,1);assert.equal(classified.noticia.clasificaciones[0].resultado,'falsa');
 const page=await call('?limit=1&page=2');assert.equal(page.history.length,1);assert.equal(page.totalPages,3);
 await call('?page=-1',400);await call('?limit=1001',400);await call('?startDate=2026-02-30',400);await call('?startDate=2026-10-07&endDate=2026-10-06',400);
 await call('',401,'GET',false);await call(`/${rows.find(row=>row.usuario_id===1).id}`,404,'DELETE');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM historial_consultas WHERE usuario_id=1')).rows[0].n,1);
 console.log(`PASS: ${checks} member history HTTP checks; ownership, dates, counts, pagination, latest classification.`);
};

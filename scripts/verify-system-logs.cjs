async function verifySystemLogs(client){
 const schema=(await client.query('SELECT version FROM system_log_schema ORDER BY version DESC LIMIT 1')).rows[0];
 const counts=(await client.query('SELECT service,origin,count(*)::int AS total FROM system_logs GROUP BY service,origin ORDER BY service,origin')).rows;
 const duplicates=(await client.query('SELECT count(*)::int AS n FROM (SELECT source_reference FROM system_logs WHERE source_reference IS NOT NULL GROUP BY source_reference HAVING count(*)>1) d')).rows[0].n;
 const missing=(await client.query("SELECT count(*)::int AS n FROM system_logs WHERE origin='live' AND occurred_at IS NULL")).rows[0].n;
 return {version:schema?.version,counts,duplicateReferences:duplicates,invalidLiveDates:missing,ok:schema?.version===1&&duplicates===0&&missing===0};
}
module.exports={verifySystemLogs};
if(require.main===module){(async()=>{const {Client}=require('../services/news-service/node_modules/pg'),e=require('./diagnostic-config.cjs').loadLocalConfig(),client=new Client({host:e.DB_HOST,port:Number(e.DB_PORT),database:e.DB_NAME,user:e.DB_USER,password:e.DB_PASSWORD});try{await client.connect();const result=await verifySystemLogs(client);console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;}finally{await client.end();}})().catch(()=>{console.error('Logs verification failed.');process.exitCode=1;});}

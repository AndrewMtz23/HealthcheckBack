const {createHash}=require('node:crypto');
const {catalog,validate}=require('../shared/audit/index.cjs');
const definitions=[
 {table:'historial_consultas',actor:'usuario_id',entity:'noticia_id',date:'fecha_consulta',action:"'NEWS_VIEW'",service:'ml',zoned:false},
 {table:'interacciones_noticia',actor:'usuario_id',entity:'noticia_id',date:'fecha_interaccion',action:"'NEWS_INTERACTION'",service:'news',zoned:false,extra:'tipo_interaccion'},
 {table:'news_editorial_events',actor:'actor_id',entity:'noticia_id',date:'created_at',action:"'NEWS_'||upper(action)",service:'news',zoned:true,extra:'version,actor_role'},
 {table:'source_report_events',actor:'actor_id',entity:'report_id',date:'created_at',action:"'REPORT_RESOLVE'",service:'news',zoned:true,extra:'state'}
];
function stableId(reference){const b=createHash('sha256').update('healthcheck-audit-history:'+reference).digest();b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const h=b.subarray(0,16).toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
async function importHistoricalLogs({client,dryRun=true,batchSize=500,timePolicies={}}){
 if(!client||!Number.isInteger(batchSize)||batchSize<1||batchSize>1000)throw Error('Invalid import configuration');
 const result={inserted:0,skipped:0,candidates:0,uncertainDates:0};
 for(const source of definitions){
  if(!(await client.query('SELECT to_regclass($1) AS name',[source.table])).rows[0].name)continue;
  let cursor='0';
  for(;;){
   const known=source.zoned||timePolicies[source.table]==='UTC';
   const timestamp=known?`to_char(s.${source.date}${source.zoned?" AT TIME ZONE 'UTC'":''},'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`:'NULL::text';
   const rows=(await client.query(`SELECT s.id::text,s.${source.actor} AS original_actor,u.id AS actor,s.${source.entity}::text AS entity_id,s.${source.date}::text AS original_date,${timestamp} AS occurred_at,${source.action} AS action${source.extra?','+source.extra.split(',').map(k=>'s.'+k).join(','):''},EXISTS(SELECT 1 FROM system_logs l WHERE l.source_reference=$3||s.id::text) AS logged FROM ${source.table} s LEFT JOIN usuarios u ON u.id=s.${source.actor} WHERE s.id>$1 ORDER BY s.id LIMIT $2`,[cursor,batchSize,source.table+':'])).rows;
   if(!rows.length)break;
   if(!dryRun)await client.query('BEGIN');
   try{
    for(const row of rows){
     cursor=row.id;if(row.logged){result.skipped++;continue;}
     const rule=catalog.actions[row.action];if(!rule)throw Error('Unsupported historical action');
     const reference=source.table+':'+row.id,identity=stableId(reference),metadata={};
     if(!row.occurred_at){metadata.date_uncertain=true;metadata.original_date=row.original_date;result.uncertainDates++;}
     if(row.version!=null)metadata.version=row.version;
     if(row.state)metadata.state=row.state;
     if(row.tipo_interaccion){metadata.interaction=row.tipo_interaccion;metadata.selected=true;}
     const actorType=row.original_actor!=null||source.zoned?'user':'anonymous';
     const event={event_key:identity,occurred_at:row.occurred_at,user_id:row.actor,actor_type:actorType,actor_role:row.actor_role||null,action:row.action,entity:rule.entity,entity_id:row.entity_id,service:source.service,request_id:identity,outcome:'success',description:rule.label,ip_address:null,user_agent:null,metadata,origin:'imported',source_reference:reference};
     if(!validate(event).ok)throw Error('Invalid historical event');
     result.candidates++;
     if(!dryRun){await client.query('SELECT record_system_log($1::jsonb)',[JSON.stringify(event)]);result.inserted++;}
    }
    if(!dryRun)await client.query('COMMIT');
   }catch(error){if(!dryRun)await client.query('ROLLBACK');throw error;}
  }
 }
 return result;
}
module.exports={importHistoricalLogs,stableId};
if(require.main===module){(async()=>{const {Client}=require('../services/news-service/node_modules/pg'),e=require('./diagnostic-config.cjs').loadLocalConfig(),client=new Client({host:e.DB_HOST,port:Number(e.DB_PORT),database:e.DB_NAME,user:e.DB_USER,password:e.DB_PASSWORD});try{await client.connect();console.log(JSON.stringify(await importHistoricalLogs({client,dryRun:!process.argv.includes('--apply')})));}finally{await client.end();}})().catch(()=>{console.error('Historical import failed; source data was not modified.');process.exitCode=1;});}

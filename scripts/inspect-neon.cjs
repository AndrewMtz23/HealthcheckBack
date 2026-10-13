// Phase 00: catalog only. No business rows, URLs or credentials are printed.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('../services/auth-service/node_modules/pg');
const dotenv = require('../services/auth-service/node_modules/dotenv');
async function main() {
  const [envFile, expectedHost, expectedDatabase, output] = process.argv.slice(2);
  if (!envFile || !expectedHost || !expectedDatabase || !output) throw Object.assign(new Error(),{code:'USAGE_ENVFILE_HOST_DATABASE_OUTPUT'});
  const e = dotenv.parse(fs.readFileSync(envFile));
  if (e.DB_HOST !== expectedHost || e.DB_NAME !== expectedDatabase || !(/\.neon\.tech$/.test(expectedHost) || ['localhost','127.0.0.1'].includes(expectedHost))) throw Object.assign(new Error(),{code:'DESTINATION_NOT_CONFIRMED'});
  const client = new Client({host:e.DB_HOST,port:Number(e.DB_PORT||5432),database:e.DB_NAME,user:e.DB_USER,password:e.DB_PASSWORD,
    ssl:/\.neon\.tech$/.test(expectedHost)?{rejectUnauthorized:true}:false,connectionTimeoutMillis:10000,options:'-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000',application_name:'healthcheck-phase00-readonly'});
  const result={capturedAt:new Date().toISOString(),source:'PostgreSQL catalog; no application records'};
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const identity=(await client.query("SELECT current_database() AS database, current_schema() AS schema, current_setting('search_path') AS search_path, current_setting('TimeZone') AS timezone, current_setting('transaction_read_only') AS read_only, current_setting('server_version') AS version, (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls")).rows[0];
    if(identity.database!==expectedDatabase || identity.read_only!=='on' || (/\.neon\.tech$/.test(expectedHost) && !identity.tls)) throw Object.assign(new Error(),{code:'SESSION_SAFETY_CHECK_FAILED'});
    result.identity=identity;
    const queries={
      columns:`SELECT table_schema,table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default,numeric_precision,numeric_scale,datetime_precision,is_identity,is_generated FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name,ordinal_position`,
      enums:`SELECT n.nspname AS schema,t.typname,e.enumlabel,e.enumsortorder FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace ORDER BY 1,2,4`,
      constraints:`SELECT n.nspname AS schema,c.relname AS table_name,k.conname,k.contype,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2,3`,
      indexes:`SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2,3`,
      extensions:`SELECT extname,extversion FROM pg_extension ORDER BY extname`,
      sequences:`SELECT sequence_schema,sequence_name,data_type,start_value,minimum_value,maximum_value,increment,cycle_option FROM information_schema.sequences ORDER BY 1,2`,
      views:`SELECT schemaname,viewname FROM pg_views WHERE schemaname NOT IN ('pg_catalog','information_schema') UNION ALL SELECT schemaname,matviewname FROM pg_matviews WHERE schemaname NOT IN ('pg_catalog','information_schema')`,
      triggers:`SELECT n.nspname AS schema,c.relname AS table_name,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname NOT IN ('pg_catalog','information_schema')`,
      functions:`SELECT n.nspname AS schema,p.proname,p.prokind,p.provolatile,p.prosecdef,pg_get_function_identity_arguments(p.oid) AS arguments FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema')`,
      permissions:`SELECT table_schema,table_name,privilege_type,is_grantable FROM information_schema.role_table_grants WHERE grantee=current_user ORDER BY 1,2,3`,
      policies:`SELECT schemaname,tablename,policyname,permissive,cmd FROM pg_policies`,
      role:`SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user`
    };
    for(const [name,sql] of Object.entries(queries)) result[name]=(await client.query(sql)).rows;
    result.duplicates={};
    for(const [table,keys] of [['preferencias_usuario','usuario_id'],['notificaciones','usuario_id,noticia_id']]) {
      const exists=(await client.query('SELECT to_regclass($1) IS NOT NULL AS present',[`public.${table}`])).rows[0].present;
      if(exists) result.duplicates[table]=(await client.query(`SELECT count(*) AS duplicate_groups,coalesce(sum(n-1),0) AS excess_rows FROM (SELECT count(*) AS n FROM public.${table} GROUP BY ${keys} HAVING count(*)>1) d`)).rows[0];
    }
    await client.query('ROLLBACK');
    fs.writeFileSync(path.resolve(output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log('Read-only catalog captured; review local output before sharing.');
  } finally { await client.end(); }
}
main().catch(e=>{console.error('Diagnostic failed: '+(e.code||'LOCAL_OR_CONNECTION_ERROR'));process.exitCode=1;});

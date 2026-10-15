const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const e=require('./diagnostic-config.cjs').loadLocalConfig();
const definitions={auth:['services/auth-service',3001,'dist/app.js'],news:['services/news-service',3003,'dist/app.js'],notifications:['services/notification-service',3004,'src/app.js'],gateway:['api-gateway',4000,'dist/app.js'],frontend:['../HealthcheckFront',3000,'node_modules/next/dist/bin/next','dev','-p','3000'],ml:['services/ml-service',5000,'app.py']};
definitions['link-monitor']=['services/link-monitor-service',3005];
const name=process.argv[2],def=definitions[name];if(!def)throw Error('Unknown service');
const [dir,port,...args]=def,cwd=path.resolve(root,dir);
const env={...process.env,...e,HEALTHCHECK_DIAGNOSTIC:'1',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=10000',NODE_ENV:'test',PORT:String(port),JWT_SECRET:'phase00-synthetic-local-only',GOOGLE_CLIENT_ID:'phase00-disabled',GOOGLE_CLIENT_SECRET:'phase00-disabled',OPENAI_API_KEY:'phase00-disabled',MODEL_PATH:'models/bert_health_model',PYTHONUNBUFFERED:'1',AUTH_SERVICE_URL:'http://127.0.0.1:3001',ML_SERVICE_URL:'http://127.0.0.1:5000',NOTIFICATIONS_SERVICE_URL:'http://127.0.0.1:3004'};
// Local interactive auth needs to save ultima_conexion during login/logout.
// Recovery mail must remain disabled in diagnostic launches, even if local
// credentials have been supplied for a later explicitly requested live check.
env.RECOVERY_MAIL_ENABLED='false';
// Approved administrative actions also write through news. External guards remain.
if(name==='auth'||name==='news')env.PGOPTIONS='-c default_transaction_read_only=off -c statement_timeout=10000';
Object.assign(env,require('./local-service-env.cjs').localServiceEnv(name));
const exe=name==='link-monitor'?require('./link-monitor-run.cjs').launchDefinition(root,env,true).exe:name==='ml'?path.join(cwd,'.venv/Scripts/python.exe'):process.execPath;
const child=spawn(exe,args,{cwd,env,stdio:'inherit',windowsHide:true});
child.on('error',()=>{console.error('Diagnostic child could not start');process.exitCode=1;});
child.on('exit',code=>process.exitCode=code??1);

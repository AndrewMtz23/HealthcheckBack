const path=require('node:path');
function launchDefinition(root,env,diagnostic=false){
 const cwd=path.join(root,'services/link-monitor-service');
 return {cwd,exe:path.join(cwd,'bin',process.platform==='win32'?'link-monitor.exe':'link-monitor'),env:{...env,...(diagnostic?{HEALTHCHECK_DIAGNOSTIC:'1',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=10000'}:{})}};
}
if(require.main===module){
 const fs=require('node:fs'),{spawn}=require('node:child_process');const root=path.resolve(__dirname,'..');
 const envFile=path.join(root,'services/link-monitor-service/.env');
 const local=fs.existsSync(envFile)?require('../services/news-service/node_modules/dotenv').parse(fs.readFileSync(envFile)):{};
 const def=launchDefinition(root,{...process.env,...local},process.env.HEALTHCHECK_DIAGNOSTIC==='1');
 if(!fs.existsSync(def.exe)){console.error('Compile link-monitor-service before launching.');process.exitCode=1;}
 else{const child=spawn(def.exe,[],{cwd:def.cwd,env:def.env,stdio:'inherit',windowsHide:true});child.on('error',()=>{console.error('Link monitor could not start');process.exitCode=1;});child.on('exit',code=>process.exitCode=code??1);}
}
module.exports={launchDefinition};

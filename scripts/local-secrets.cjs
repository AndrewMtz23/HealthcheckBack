const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function loadLocalSecrets(root){
 const file=path.join(root,'.env.local-runtime');
 if(!fs.existsSync(file)){
  const text=['JWT_SECRET','ML_GATEWAY_SECRET','LINK_MONITOR_INTERNAL_TOKEN'].map(k=>k+'='+crypto.randomBytes(32).toString('hex')).join('\n')+'\n';
  const temporary=file+'.'+crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(temporary,text,{flag:'wx',mode:0o600});
  try{fs.linkSync(temporary,file);}catch(error){if(error.code!=='EEXIST')throw error;}finally{fs.unlinkSync(temporary);}
 }
 const values=require('../services/auth-service/node_modules/dotenv').parse(fs.readFileSync(file));
 if(['JWT_SECRET','ML_GATEWAY_SECRET','LINK_MONITOR_INTERNAL_TOKEN'].some(k=>typeof values[k]!=='string'||values[k].length<32))throw Error('Invalid private local runtime configuration');
 return values;
}
module.exports={loadLocalSecrets};

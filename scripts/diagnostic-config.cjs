const fs=require('node:fs'),path=require('node:path');
const keys=['DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD'];
function validateLocalConfig(e){
  if(keys.some(k=>typeof e[k]!=='string'||!e[k].trim()) || !['localhost','127.0.0.1'].includes(e.DB_HOST) || e.DB_PORT!=='5432' || e.DB_NAME!=='healtcheckbd') throw Error('Incomplete or unconfirmed local diagnostic target');
  return Object.fromEntries(keys.map(k=>[k,e[k]]));
}
function loadLocalConfig(){return validateLocalConfig(require('../services/auth-service/node_modules/dotenv').parse(fs.readFileSync(path.resolve(__dirname,'../.env.phase00'))));}
module.exports={validateLocalConfig,loadLocalConfig};

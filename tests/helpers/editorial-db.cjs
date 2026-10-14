const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{randomUUID}=require('crypto');
const {Client}=require('../../services/news-service/node_modules/pg');
exports.scratch=async function(){
 const name='editorial_'+randomUUID().replaceAll('-',''),cfg={host:'127.0.0.1',port:Number(process.env.EDITORIAL_TEST_PORT||5543),user:'phase00',password:'unused'};
 Object.assign(process.env,{DB_HOST:cfg.host,DB_PORT:String(cfg.port),DB_USER:cfg.user,DB_PASSWORD:cfg.password,DB_NAME:name,NODE_ENV:'test',NOTIFICATION_DELIVERY_ENABLED:'false',RECOVERY_MAIL_ENABLED:'false',JWT_SECRET:'synthetic-editorial-tests',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:''});
 const control=new Client({...cfg,database:'postgres'});await control.connect();assert.equal(path.resolve((await control.query('show data_directory')).rows[0].data_directory).toLowerCase(),path.resolve(__dirname,'../../../.healthcheck-logs/phase00-pg').toLowerCase());await control.query(`CREATE DATABASE ${name}`);
 const db=new Client({...cfg,database:name});await db.connect();await db.query(fs.readFileSync(path.resolve(__dirname,'../../db.sql'),'utf8'));
 await db.query("INSERT INTO usuarios(id,email,nombre,rol,activo) VALUES(1,'admin@example.invalid','Admin','admin',true),(2,'member@example.invalid','Member','usuario',true); INSERT INTO temas(id,nombre,activo) VALUES(1,'Synthetic',true); INSERT INTO fuentes(id,nombre,url) VALUES(1,'Synthetic','https://example.invalid')");
 return {db,cfg,name,async close(){await db.end();await control.query(`DROP DATABASE ${name}`);await control.end();}};
};

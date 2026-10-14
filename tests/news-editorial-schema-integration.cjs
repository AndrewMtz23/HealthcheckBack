const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{randomUUID}=require('crypto');
const {Client}=require('../services/news-service/node_modules/pg');
test('editorial migration preserves legacy visibility, versions and references and never republishes new drafts',async()=>{
 const cfg={host:'127.0.0.1',port:Number(process.env.EDITORIAL_TEST_PORT||5543),user:'phase00',password:'unused'};
 const control=new Client({...cfg,database:'postgres'}),name='editorial_'+randomUUID().replaceAll('-','');let db,created=false;
 try{await control.connect();assert.equal(path.resolve((await control.query('show data_directory')).rows[0].data_directory).toLowerCase(),path.resolve(__dirname,'../../.healthcheck-logs/phase00-pg').toLowerCase());await control.query(`CREATE DATABASE ${name}`);created=true;db=new Client({...cfg,database:name});await db.connect();
 await db.query(fs.readFileSync(path.resolve(__dirname,'../db.sql'),'utf8').split('-- Editorial schema baseline')[0]);
 await db.query("INSERT INTO noticias(titulo,contenido,url,fecha_publicacion) VALUES('Legacy','Original','https://example.invalid/a','2026-01-01'),('Private','Original',null,null); INSERT INTO clasificacion_noticias(noticia_id,resultado) VALUES(1,'falsa');");
 const filename=path.resolve(__dirname,'../services/news-service/sql/news-editorial.sql');assert(fs.existsSync(filename),'versioned editorial migration must exist');const migration=fs.readFileSync(filename,'utf8');await db.query(migration);
 assert.deepEqual((await db.query('SELECT editorial_state,editorial_origin,content_version FROM noticias ORDER BY id')).rows,[{editorial_state:'published',editorial_origin:'legacy',content_version:1},{editorial_state:'draft',editorial_origin:'legacy',content_version:1}]);
 assert.equal((await db.query('SELECT content_version FROM clasificacion_noticias')).rows[0].content_version,1);
 await db.query("INSERT INTO noticias(titulo,contenido,url,fecha_publicacion) VALUES('New','Text','https://example.invalid/new',now())");await db.query(migration);
 assert.equal((await db.query('SELECT editorial_state FROM noticias WHERE id=3')).rows[0].editorial_state,'draft');
 assert.equal((await db.query('SELECT count(*)::int n FROM noticias')).rows[0].n,3);
 await assert.rejects(db.query("UPDATE noticias SET editorial_state='invented' WHERE id=3"),{code:'23514'});
 assert.equal((await db.query('SELECT count(*)::int n FROM news_editorial_schema')).rows[0].n,1);
 }finally{if(db)await db.end();if(created)await control.query(`DROP DATABASE ${name}`);await control.end();}
});

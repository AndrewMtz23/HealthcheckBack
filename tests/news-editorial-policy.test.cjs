const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
test('visibility never treats publication as human review or a stale analysis as current',()=>{
 const file='../services/news-service/dist/editorial/policy';assert(fs.existsSync(require('path').resolve(__dirname,file+'.js')),'editorial policy must exist');
 const {isPublicNews,currentClassification}=require(file);
 assert.equal(isPublicNews({editorial_state:'published',editorial_origin:'manual'}),true);
 assert.equal(isPublicNews({editorial_state:'published',editorial_origin:'legacy',url:null}),false);
 for(const editorial_state of ['draft','in_review','withdrawn'])assert.equal(isPublicNews({editorial_state}),false);
 assert.equal(currentClassification({content_version:2},[{id:1,content_version:1,resultado:'falsa'}]),null);
 assert.equal(currentClassification({content_version:2},[{id:1,content_version:2,fecha_clasificacion:'2026-01-01',resultado:'falsa'},{id:2,content_version:2,fecha_clasificacion:'2026-01-02',resultado:'dudosa'}]).resultado,'dudosa');
});

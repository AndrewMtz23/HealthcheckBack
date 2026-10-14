const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
test('editorial validation rejects privilege fields and unsafe URLs without conflating distinct URLs',()=>{
 const file=path.resolve(__dirname,'../services/news-service/dist/editorial/validation.js');assert(fs.existsSync(file),'editorial validation must exist');const {newsValues,normalizeUrl}=require(file);
 assert.equal(normalizeUrl('https://EXAMPLE.invalid:443/A?q=1#x'),'https://example.invalid/A?q=1');
 assert.notEqual(normalizeUrl('https://example.invalid/A?q=1'),normalizeUrl('https://example.invalid/a?q=1'));
 for(const input of [{titulo:'',contenido:'x'},{titulo:'x',contenido:'x',editorial_state:'published'},{titulo:'x',contenido:'x',url:'https://u:p@example.invalid'},{titulo:'x',contenido:'x',fecha_publicacion:'nonsense'}])assert.throws(()=>newsValues(input,true));
 assert.equal(newsValues({titulo:' X ',contenido:'Y'},true).titulo,'X');
 assert.throws(()=>newsValues({titulo:'X',contenido:'Y',fecha_publicacion:'2026-02-30'},true));
});

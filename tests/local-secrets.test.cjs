const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {loadLocalSecrets}=require('../scripts/local-secrets.cjs');
test('simultaneous local services share one complete private configuration',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'healthcheck-secrets-'));
 try{
  const modulePath=require.resolve('../scripts/local-secrets.cjs');
  const hashes=await Promise.all(Array.from({length:7},()=>new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['-e',"const s=require(process.argv[1]).loadLocalSecrets(process.argv[2]);console.log(require('node:crypto').createHash('sha256').update(JSON.stringify(s)).digest('hex'))",modulePath,root]);
   let output='';child.stdout.on('data',b=>output+=b);child.on('error',reject);child.on('exit',code=>code===0?resolve(output.trim()):reject(Error('child failed')));
  })));
  assert.equal(new Set(hashes).size,1);assert.equal(hashes[0].length,64);
  const stored=loadLocalSecrets(root);assert.equal(Object.keys(stored).length,3);assert.ok(Object.values(stored).every(v=>v.length===64));
  assert.deepEqual(fs.readdirSync(root),['.env.local-runtime']);
  fs.writeFileSync(path.join(root,'.env.local-runtime'),'JWT_SECRET=short');assert.throws(()=>loadLocalSecrets(root),/Invalid/);
 }finally{for(const file of fs.readdirSync(root))fs.unlinkSync(path.join(root,file));fs.rmdirSync(root);}
});

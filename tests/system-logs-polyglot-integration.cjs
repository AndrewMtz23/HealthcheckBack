const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {scratch}=require('./helpers/editorial-db.cjs');
test('Go and Python use the PostgreSQL contract, preserve idempotency and roll back audit failures',async()=>{
 const ctx=await scratch();
 try{
  await ctx.db.query(fs.readFileSync('services/link-monitor-service/sql/001_link_monitor.sql','utf8'));
  const env={...process.env,AUDIT_ENABLED:'true',AUDIT_TEST_DSN:`postgresql://phase00:unused@127.0.0.1:5543/${ctx.name}`};
  const go=spawnSync(process.env.GO_BINARY||'go',['test','./internal/store','-run','^TestAuditAtomicRuns$','-count=1'],{cwd:path.resolve('services/link-monitor-service'),env,encoding:'utf8',timeout:120000,windowsHide:true});
  assert.equal(go.status,0,go.error?.message||go.stdout+go.stderr);
  const py=spawnSync(path.resolve('services/ml-service/.venv/Scripts/python.exe'),[path.resolve('tests/system_logs_python.py')],{cwd:path.resolve('services/ml-service'),env,encoding:'utf8',timeout:120000,windowsHide:true});
  assert.equal(py.status,0,py.error?.message||py.stdout+py.stderr);
 }finally{await ctx.close();}
});

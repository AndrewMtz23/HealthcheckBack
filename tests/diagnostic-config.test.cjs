const test=require('node:test'),assert=require('node:assert/strict');
const {validateLocalConfig}=require('../scripts/diagnostic-config.cjs');
const good={DB_HOST:'localhost',DB_PORT:'5432',DB_NAME:'healtcheckbd',DB_USER:'synthetic',DB_PASSWORD:'synthetic'};
test('incomplete or wrong local DB target is rejected before connection',()=>{
  for(const key of Object.keys(good)){const value={...good};delete value[key];assert.throws(()=>validateLocalConfig(value));}
  for(const change of [{DB_HOST:'example.invalid'},{DB_PORT:'55432'},{DB_NAME:'other'}])assert.throws(()=>validateLocalConfig({...good,...change}));
  assert.deepEqual(validateLocalConfig({...good,NODE_OPTIONS:'unwanted'}),good);
});

const {test}=require('node:test');const assert=require('node:assert/strict');
test('Go launcher selects a compiled binary and diagnostic mode disables writes',()=>{
 const {launchDefinition}=require('../scripts/link-monitor-run.cjs');
 const d=launchDefinition('C:/app',{PORT:'3005',LINK_MONITOR_INTERNAL_TOKEN:'secret'},true);
 assert.match(d.exe,/bin[\\/]link-monitor\.exe$/);assert.equal(d.env.HEALTHCHECK_DIAGNOSTIC,'1');assert.match(d.env.PGOPTIONS,/default_transaction_read_only=on/);assert.equal(d.env.LINK_MONITOR_INTERNAL_TOKEN,'secret');
});

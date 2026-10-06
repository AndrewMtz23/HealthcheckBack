// Test-only process identity marker, never installed in a production server.
const http=require('node:http');
const original=http.Server.prototype.emit;
http.Server.prototype.emit=function(event,req,res,...rest){
  if(event==='request')res.setHeader('X-Healthcheck-Test-Instance',process.env.HEALTHCHECK_TEST_INSTANCE);
  return original.call(this,event,req,res,...rest);
};

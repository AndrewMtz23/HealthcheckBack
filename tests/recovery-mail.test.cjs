const {test}=require('node:test');const assert=require('node:assert/strict');
const {createRecoveryMail}=require('../services/auth-service/dist/account/mail');
test('SMTP is opt-in and incomplete configuration cannot send',()=>{
 let calls=0;const factory=()=>{calls++;};
 assert.equal(createRecoveryMail({},factory).available,false);
 assert.equal(createRecoveryMail({RECOVERY_MAIL_ENABLED:'true'},factory).available,false);
 assert.equal(createRecoveryMail({RECOVERY_MAIL_ENABLED:'true',HEALTHCHECK_DIAGNOSTIC:'1',RECOVERY_SMTP_HOST:'smtp.example.invalid',RECOVERY_SMTP_USER:'x',RECOVERY_SMTP_PASSWORD:'x',RECOVERY_SMTP_FROM:'x@example.invalid',FRONTEND_URL:'http://localhost:3000'},factory).available,false);
 assert.equal(calls,0);
});
test('SMTP requires TLS and builds a fixed-origin fragment link without logging or remote content',async()=>{
 let options,message;const mail=createRecoveryMail({RECOVERY_MAIL_ENABLED:'true',RECOVERY_SMTP_HOST:'smtp.example.invalid',RECOVERY_SMTP_PORT:'587',RECOVERY_SMTP_USER:'synthetic',RECOVERY_SMTP_PASSWORD:'synthetic',RECOVERY_SMTP_FROM:'HealthCheck <no-reply@example.invalid>',FRONTEND_URL:'https://health.example.invalid'},o=>{options=o;return {sendMail:async m=>{message=m;return {accepted:[m.to],rejected:[]};}};});
 assert.equal(mail.available,true);await mail.send('user@example.invalid','a'.repeat(64));
 assert.equal(options.requireTLS,true);assert.equal(options.tls.rejectUnauthorized,true);
 assert.equal(options.disableFileAccess,true);assert.equal(options.disableUrlAccess,true);
 assert.match(message.text,/https:\/\/health.example.invalid\/reset-password#token=a{64}/);
 assert.equal(message.to,'user@example.invalid');assert(!message.html);
});

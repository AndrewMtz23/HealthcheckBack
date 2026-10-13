const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=path.resolve(__dirname,'../services/notification-service/src');
function notifier(sendMail){
 const logs=[],module={exports:{}};const config={transporter:{sendMail},emailDefaults:{from:'synthetic@example.invalid'}};
 vm.runInNewContext(fs.readFileSync(path.join(base,'services/notification/email.notifier.js'),'utf8'),{module,exports:module.exports,process:{env:{}},require(name){if(name.includes('interface'))return class{};if(name.includes('config'))return name.endsWith('/email')?config:{emailConfig:config};if(name.includes('logger'))return {error:(...args)=>logs.push(args)};throw Error(name);}});
 return {api:new module.exports(),logs};
}
test('one rejected recipient preserves prior successes and does not stop later recipients',async()=>{
 const calls=[];const {api,logs}=notifier(async mail=>{calls.push(mail.to);if(mail.to==='two@example.invalid')throw Error('SECRET smtp credentials');return {accepted:[mail.to],rejected:[]};});
 const sent=await api.sendBulk([1,2,3].map((id)=>({id,email:['one','two','three'][id-1]+'@example.invalid',nombre:'Synthetic',titulo:'Synthetic',mensaje:'Synthetic',tipo:'email'})));
 assert.deepEqual(Array.from(sent),[1,3]);assert.equal(calls.length,3);assert(!JSON.stringify(logs).includes('SECRET'));
});
test('untrusted names, titles and bodies are escaped and rejected SMTP delivery is not success',async()=>{
 let message;const {api}=notifier(async mail=>{message=mail;return {accepted:[],rejected:[mail.to]};});
 assert.equal(await api.send({email:'one@example.invalid',nombre:'<img src=x>'},{titulo:'<script>x</script>',mensaje:'<a href="https://evil.invalid">x</a>'}),false);
 assert(!message.html.includes('<script>'));assert(!message.html.includes('<img src=x>'));assert(message.html.includes('&lt;a'));
});
test('durable delivery groups the actual topic name and retains the stable message id',async()=>{
 let mail;const {api}=notifier(async value=>{mail=value;return {accepted:[value.to],rejected:[]};});
 await api.sendDelivery({email:'synthetic@example.invalid',nombre:'Synthetic'},[{id:1,titulo:'Notice',mensaje:'Synthetic',tema_nombre:'Heart & health'}],'<synthetic-message@example.invalid>');
 assert.equal(mail.messageId,'<synthetic-message@example.invalid>');assert.match(mail.html,/>Heart &amp; health<\/h3>/);assert(!mail.html.includes('>General</h3>'));
});
test('system announcement emails escape plain text and use an individual stable message ID',async()=>{
 let mail;const {api}=notifier(async value=>{mail=value;return {accepted:[value.to],rejected:[]};});
 await api.sendAnnouncement({email:'synthetic@example.invalid'}, {title:'<Maintenance>',body:'Line one\n<script>alert(1)</script>'},'<announcement-1@example.invalid>');
 assert.equal(mail.to,'synthetic@example.invalid');assert.equal(mail.messageId,'<announcement-1@example.invalid>');
 assert(!mail.html.includes('<script>'));assert(mail.html.includes('&lt;script&gt;'));assert(mail.text.includes('<script>'));assert(!mail.html.includes('cc:'));
});

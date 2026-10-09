const {test}=require('node:test'),assert=require('node:assert/strict');
const {registerValidationRules,validate}=require('../services/auth-service/dist/middleware/validation');
test('registration rejects weak or bcrypt-truncated passwords without reflecting them',async()=>{
 for(const contrasena of ['secret7','é'.repeat(37)]) {
  const req={body:{email:'synthetic@example.invalid',nombre:'Synthetic',contrasena}},result={};
  for(const rule of registerValidationRules)await rule.run(req);
  const res={status(code){result.status=code;return this;},json(body){result.body=body;}};
  validate(req,res,()=>{result.status=200;});assert.equal(result.status,400);assert(!JSON.stringify(result.body).includes(contrasena));
 }
});

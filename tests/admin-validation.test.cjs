const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateUser,protectAdmin}=require('../services/auth-service/dist/admin/validation');
test('admin image accepts URLs and removal, rejects unsafe values',()=>{
 assert.equal(validateUser({imagen_url:'https://example.test/avatar.png'}).imagen_url,'https://example.test/avatar.png');
 assert.equal(validateUser({imagen_url:''}).imagen_url,null);
 assert.equal(validateUser({imagen_url:null}).imagen_url,null);
 assert.deepEqual(validateUser({}),{});
 for(const imagen_url of ['javascript:alert(1)','data:image/png;base64,abc','https://user:pass@example.test/a',123,'https://example.test/'+ 'a'.repeat(2048)])
  assert.throws(()=>validateUser({imagen_url}),error=>error.status===400);
});
test('user validation rejects invalid role and short password',()=>{
 assert.throws(()=>validateUser({nombre:'Test',email:'test@example.test',rol:'owner',contrasena:'12345678'},true));
 assert.throws(()=>validateUser({nombre:'Test',email:'test@example.test',contrasena:'123'},true));
 assert.deepEqual(validateUser({nombre:' Test ',email:'TEST@example.test',rol:'usuario'},false),{nombre:'Test',email:'test@example.test',rol:'usuario'});
});
test('admin cannot deactivate or demote self or last active admin',()=>{
 assert.throws(()=>protectAdmin(1,{id:1,rol:'admin',activo:true},{activo:false},2));
 assert.throws(()=>protectAdmin(1,{id:2,rol:'admin',activo:true},{rol:'usuario'},1));
 assert.doesNotThrow(()=>protectAdmin(1,{id:2,rol:'admin',activo:true},{activo:false},2));
});

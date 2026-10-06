const {test}=require('node:test');const assert=require('node:assert/strict');
const {validateProfile,validatePreferences}=require('../services/auth-service/dist/profile/validation');
test('profile accepts only permitted fields and safe image URLs',()=>{
 assert.deepEqual(validateProfile({nombre:' Lilith ',imagen_url:'https://example.test/avatar.png',rol:'admin'}),{nombre:'Lilith',imagen_url:'https://example.test/avatar.png'});
 for(const url of ['javascript:alert(1)','data:image/png;base64,abc','https://user:secret@example.test/a'])assert.throws(()=>validateProfile({imagen_url:url}));
 assert.equal(validateProfile({imagen_url:''}).imagen_url,null);assert.throws(()=>validateProfile({nombre:' '}));
});
test('notification preferences validate all enums and subscription type',()=>{
 assert.throws(()=>validatePreferences({recibir_notificaciones:'false',frecuencia_notificaciones:'diaria',tipo_notificacion:'email'}));
 assert.throws(()=>validatePreferences({recibir_notificaciones:true,frecuencia_notificaciones:'hourly',tipo_notificacion:'email'}));
 assert.equal(validatePreferences({recibir_notificaciones:false,frecuencia_notificaciones:'semanal',tipo_notificacion:'sms'}).tipo_notificacion,'sms');
});

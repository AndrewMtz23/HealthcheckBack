const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.JWT_SECRET='synthetic-oauth-session-secret';
process.env.FRONTEND_URL='http://localhost:3000';
const {googleCallback}=require('../services/auth-service/dist/controllers/authController');
test('OAuth callback refuses inactive users and puts active session only in fragment',()=>{
 let location;const headers={};
 const res={redirect:value=>{location=value;},setHeader:(key,value)=>{headers[key]=value;}};
 googleCallback({user:{id:950,activo:false,rol:'usuario'}},res);
 assert.match(location,/error=cuenta-inactiva/);assert(!location.includes('token'));
 googleCallback({user:{id:951,activo:true,rol:'usuario',email:'synthetic@example.invalid'}},res);
 const url=new URL(location);
 assert.equal(url.search,'');assert(url.hash.startsWith('#token='));
 assert.equal(headers['Cache-Control'],'no-store');assert.equal(headers['Referrer-Policy'],'no-referrer');
});

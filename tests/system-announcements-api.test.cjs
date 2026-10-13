const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateAnnouncementDraft,AnnouncementError}=require('../services/auth-service/dist/admin/announcementValidation');
const valid={title:'Mantenimiento',body:'Interrupción breve',kind:'mantenimiento',publish_at:null,expires_at:'2026-11-01T18:00:00Z',maintenance_start_at:'2026-10-20T03:00:00Z',maintenance_end_at:'2026-10-20T04:00:00Z'};
test('announcement draft validates bounded plain text and UTC date order',()=>{
 const result=validateAnnouncementDraft(valid,new Date('2026-10-12T00:00:00Z'));
 assert.equal(result.title,'Mantenimiento');assert.equal(result.kind,'mantenimiento');
 assert.throws(()=>validateAnnouncementDraft({...valid,title:' '},new Date()),e=>e instanceof AnnouncementError&&e.status===400);
 assert.throws(()=>validateAnnouncementDraft({...valid,body:'x'.repeat(10001)},new Date()),e=>e.status===400);
 assert.throws(()=>validateAnnouncementDraft({...valid,kind:'<b>mantenimiento</b>'},new Date()),e=>e.status===400);
 assert.throws(()=>validateAnnouncementDraft({...valid,maintenance_end_at:'2026-10-20T02:00:00Z'},new Date()),e=>e.status===400);
});
test('announcement validation rejects non-object and invalid dates',()=>{
 assert.throws(()=>validateAnnouncementDraft(null,new Date()),e=>e.status===400);
 assert.throws(()=>validateAnnouncementDraft({...valid,publish_at:'mañana'},new Date()),e=>e.status===400);
});

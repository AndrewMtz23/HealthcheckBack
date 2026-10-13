import { Router, Request, Response, NextFunction } from 'express';
import { QueryTypes } from 'sequelize';
import User from '../models/User';
import sequelize from '../config/db';
import { authenticate } from '../middleware/auth';
import { AnnouncementError, validateAnnouncementDraft } from './announcementValidation';
import { createAnnouncementAdminAuthorization } from './announcementAuthorization';

const router = Router();
const run = (fn:(req:Request,res:Response)=>Promise<void>) => (req:Request,res:Response,next:NextFunction) => { fn(req,res).catch(next); };
const idOf = (req:Request) => { const id=Number(req.params.id); if(!Number.isSafeInteger(id)||id<1) throw new AnnouncementError(400,'ID inválido'); return id; };
const listSql = `SELECT a.*, json_build_object('queued',coalesce(sum(t.total) FILTER (WHERE t.state='queued'),0),'retry',coalesce(sum(t.total) FILTER (WHERE t.state='retry'),0),'sending',coalesce(sum(t.total) FILTER (WHERE t.state='sending'),0),'sent',coalesce(sum(t.total) FILTER (WHERE t.state='sent'),0),'failed',coalesce(sum(t.total) FILTER (WHERE t.state='failed'),0),'uncertain',coalesce(sum(t.total) FILTER (WHERE t.state='uncertain'),0),'cancelled',coalesce(sum(t.total) FILTER (WHERE t.state='cancelled'),0)) AS delivery_counts FROM system_announcements a LEFT JOIN system_announcement_email_totals t ON t.announcement_id=a.id`;
router.use(authenticate);
router.use(createAnnouncementAdminAuthorization(id => User.findByPk(id, { attributes: ['id', 'rol', 'activo'] })));
router.get('/',run(async(req,res)=>{
 const page=Math.max(1,Number(req.query.page||1)),limit=Math.min(50,Math.max(1,Number(req.query.limit||20)));
 if(!Number.isSafeInteger(page)||page>100000||!Number.isSafeInteger(limit))throw new AnnouncementError(400,'Paginación inválida');
 const items=await sequelize.query<any>(`${listSql} GROUP BY a.id ORDER BY a.created_at DESC,a.id DESC LIMIT :limit OFFSET :offset`,{replacements:{limit,offset:(page-1)*limit},type:QueryTypes.SELECT});
 const totals=await sequelize.query<any>('SELECT count(*)::int AS total FROM system_announcements',{type:QueryTypes.SELECT});
 res.json({status:'success',data:{items,total:totals[0].total,page,limit,totalPages:Math.ceil(totals[0].total/limit)}});
}));
router.get('/:id/preview',run(async(req,res)=>{const id=idOf(req);const notice=await sequelize.query<any>(`SELECT status FROM system_announcements WHERE id=:id`,{replacements:{id},type:QueryTypes.SELECT});if(!notice.length)throw new AnnouncementError(404,'Aviso no encontrado');const rows=await sequelize.query<any>(`SELECT count(*)::int AS eligible_accounts FROM usuarios WHERE activo=true AND email IS NOT NULL AND btrim(email)<>''`,{type:QueryTypes.SELECT});res.json({status:'success',data:{id,eligibleAccounts:rows[0].eligible_accounts}});}));
router.post('/',run(async(req,res)=>{
 const input=validateAnnouncementDraft(req.body);
 const rows=await sequelize.transaction(async transaction=>{const actor=await User.findByPk(res.locals.adminId,{transaction,lock:transaction.LOCK.UPDATE});if(!actor?.activo||actor.rol!=='admin')throw new AnnouncementError(403,'Permiso revocado');return sequelize.query<any>(`INSERT INTO system_announcements(title,body,kind,status,publish_at,expires_at,maintenance_start_at,maintenance_end_at,created_by) VALUES(:title,:body,:kind,'draft',:publish_at,:expires_at,:maintenance_start_at,:maintenance_end_at,:adminId) RETURNING *`,{replacements:{...input,adminId:res.locals.adminId},transaction,type:QueryTypes.SELECT});});
 res.status(201).json({status:'success',data:rows[0]});
}));
router.patch('/:id',run(async(req,res)=>{
 const id=idOf(req),input=validateAnnouncementDraft(req.body);let rows:any[]=[];
 await sequelize.transaction(async transaction=>{
  const actor=await User.findByPk(res.locals.adminId,{transaction,lock:transaction.LOCK.UPDATE});if(!actor?.activo||actor.rol!=='admin')throw new AnnouncementError(403,'Permiso revocado');
  rows=await sequelize.query<any>(`UPDATE system_announcements SET title=:title,body=:body,kind=:kind,publish_at=:publish_at,expires_at=:expires_at,maintenance_start_at=:maintenance_start_at,maintenance_end_at=:maintenance_end_at WHERE id=:id AND status='draft' RETURNING *`,{replacements:{...input,id},transaction,type:QueryTypes.SELECT});
 });if(!rows.length)throw new AnnouncementError(409,'Solo se pueden editar borradores');res.json({status:'success',data:rows[0]});
}));
router.post('/:id/schedule',run(async(req,res)=>{
 const id=idOf(req),raw=req.body?.publish_at,publish_at=typeof raw==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)?new Date(raw):null;if(!publish_at||!Number.isFinite(publish_at.getTime())||publish_at<=new Date())throw new AnnouncementError(400,'La fecha de publicación debe ser futura e incluir zona horaria');
 let rows:any[]=[];await sequelize.transaction(async transaction=>{const actor=await User.findByPk(res.locals.adminId,{transaction,lock:transaction.LOCK.UPDATE});if(!actor?.activo||actor.rol!=='admin')throw new AnnouncementError(403,'Permiso revocado');rows=await sequelize.query<any>(`UPDATE system_announcements SET status='scheduled',publish_at=:publish_at WHERE id=:id AND status='draft' AND (expires_at IS NULL OR expires_at>:publish_at) RETURNING *`,{replacements:{id,publish_at:publish_at.toISOString()},transaction,type:QueryTypes.SELECT});});if(!rows.length)throw new AnnouncementError(409,'El borrador no puede programarse');res.json({status:'success',data:rows[0]});
}));
router.post('/:id/publish',run(async(req,res)=>{
 const id=idOf(req);let rows:any[]=[];
 await sequelize.transaction(async transaction=>{
  const actor=await User.findByPk(res.locals.adminId,{transaction,lock:transaction.LOCK.UPDATE});if(!actor?.activo||actor.rol!=='admin')throw new AnnouncementError(403,'Permiso revocado');
  const found=await sequelize.query<any>(`SELECT * FROM system_announcements WHERE id=:id FOR UPDATE`,{replacements:{id},transaction,type:QueryTypes.SELECT});if(!found.length)throw new AnnouncementError(404,'Aviso no encontrado');
  if(found[0].status==='published'){rows=found;return;}if(!['draft','scheduled'].includes(found[0].status))throw new AnnouncementError(409,'El aviso no se puede publicar');if(found[0].publish_at&&new Date(found[0].publish_at)>new Date())throw new AnnouncementError(409,'El aviso aún no llega a su hora programada');if(found[0].expires_at&&new Date(found[0].expires_at)<=new Date())throw new AnnouncementError(409,'El aviso ya venció');
  rows=await sequelize.query<any>(`UPDATE system_announcements SET status='published',published_at=now(),publish_at=COALESCE(publish_at,now()) WHERE id=:id RETURNING *`,{replacements:{id},transaction,type:QueryTypes.SELECT});
  await sequelize.query(`INSERT INTO system_announcement_audience(announcement_id,usuario_id,email_eligible) SELECT :id,id,(email IS NOT NULL AND btrim(email)<>'') FROM usuarios WHERE activo=true ON CONFLICT DO NOTHING`,{replacements:{id},transaction});
  const count=await sequelize.query<any>(`SELECT count(*)::int AS total,count(*) FILTER (WHERE email_eligible)::int AS email_total FROM system_announcement_audience WHERE announcement_id=:id`,{replacements:{id},transaction,type:QueryTypes.SELECT});
  await sequelize.query(`UPDATE system_announcements SET audience_count=:total WHERE id=:id`,{replacements:{id,total:count[0].total},transaction});rows[0].audience_count=count[0].total;
  await sequelize.query(`INSERT INTO system_announcement_emails(announcement_id,usuario_id) SELECT announcement_id,usuario_id FROM system_announcement_audience WHERE announcement_id=:id AND email_eligible ON CONFLICT DO NOTHING`,{replacements:{id},transaction});
 });res.json({status:'success',data:rows[0]});
}));
router.post('/:id/withdraw',run(async(req,res)=>{
 const id=idOf(req);let rows:any[]=[];
 await sequelize.transaction(async transaction=>{
  const actor=await User.findByPk(res.locals.adminId,{transaction,lock:transaction.LOCK.UPDATE});if(!actor?.activo||actor.rol!=='admin')throw new AnnouncementError(403,'Permiso revocado');
  rows=await sequelize.query<any>(`UPDATE system_announcements SET status='withdrawn',withdrawn_at=now() WHERE id=:id AND status IN ('draft','scheduled','published') RETURNING *`,{replacements:{id},transaction,type:QueryTypes.SELECT});
  if(rows.length)await sequelize.query(`UPDATE system_announcement_emails SET state='cancelled',updated_at=now() WHERE announcement_id=:id AND state IN ('queued','retry')`,{replacements:{id},transaction});
 });if(!rows.length)throw new AnnouncementError(404,'Aviso no encontrado o ya retirado');res.json({status:'success',data:rows[0]});
}));
router.use((error:any,_req:Request,res:Response,_next:NextFunction)=>{ res.status(error instanceof AnnouncementError?error.status:500).json({status:'error',message:error instanceof AnnouncementError?error.message:'No se pudo completar la operación.'}); });
export default router;

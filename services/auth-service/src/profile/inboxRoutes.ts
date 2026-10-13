import { Router, Request, Response, NextFunction } from 'express';
import { QueryTypes } from 'sequelize';
import sequelize from '../config/db';
import { authenticate } from '../middleware/auth';
import { ProfileError } from './validation';
import { notificationDelivery } from './notificationDelivery';

const router=Router();const run=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{fn(req,res).catch(next);};
const who=(req:Request)=>Number((req.user as any)?.id);const q=(sql:string,replacements:any={})=>sequelize.query<any>(sql,{replacements,type:QueryTypes.SELECT});
router.use(['/inbox','/system-announcements'],authenticate);
router.get('/inbox',run(async(req,res)=>{
 const page=Number(req.query.page||1),limit=Math.min(50,Number(req.query.limit||5));if(!Number.isSafeInteger(page)||page<1||page>100000||!Number.isSafeInteger(limit)||limit<1)throw new ProfileError(400,'Paginación inválida');const id=who(req);
 const delivery=await notificationDelivery();
 const deliveryState=delivery.schema_ready?"CASE WHEN n.tipo='sms' THEN 'retired' WHEN di.excluded THEN 'cancelled' WHEN d.id IS NOT NULL THEN d.state WHEN n.enviada THEN 'sent' ELSE 'legacy' END":"CASE WHEN n.tipo='sms' THEN 'retired' WHEN n.enviada THEN 'sent' ELSE 'legacy' END";
 const deliveryJoins=delivery.schema_ready?'LEFT JOIN notification_delivery_items di ON di.notification_id=n.id AND di.usuario_id=n.usuario_id LEFT JOIN notification_deliveries d ON d.id=di.delivery_id AND d.usuario_id=n.usuario_id':'';
 const items=await q(`SELECT * FROM (
   SELECT 'system'::text AS source,a.id,a.title,a.body,a.kind,a.published_at AS created_at,r.read_at,em.state AS delivery_state,a.expires_at
   FROM system_announcements a JOIN system_announcement_audience au ON au.announcement_id=a.id AND au.usuario_id=:id LEFT JOIN system_announcement_reads r ON r.announcement_id=a.id AND r.usuario_id=:id LEFT JOIN system_announcement_emails em ON em.announcement_id=a.id AND em.usuario_id=:id
   WHERE a.status IN ('published','expired') AND a.published_at>now()-interval '90 days' AND (a.expires_at IS NULL OR a.expires_at>now()-interval '90 days')
   UNION ALL
   SELECT 'news'::text,n.id,n.titulo AS title,coalesce(left(no.contenido,10000),n.mensaje,'') AS body,'informativo'::text AS kind,n.fecha_creacion AT TIME ZONE 'UTC' AS created_at,NULL::timestamptz AS read_at,
     ${deliveryState} AS delivery_state,NULL::timestamptz AS expires_at
   FROM notificaciones n LEFT JOIN noticias no ON no.id=n.noticia_id ${deliveryJoins} WHERE n.usuario_id=:id
 ) notices ORDER BY created_at DESC,id DESC LIMIT :limit OFFSET :offset`,{id,limit,offset:(page-1)*limit});
 const totals=await q(`SELECT (SELECT count(*)::int FROM system_announcements a JOIN system_announcement_audience au ON au.announcement_id=a.id AND au.usuario_id=:id WHERE a.status IN ('published','expired') AND a.published_at>now()-interval '90 days' AND (a.expires_at IS NULL OR a.expires_at>now()-interval '90 days'))+(SELECT count(*)::int FROM notificaciones WHERE usuario_id=:id) AS total,(SELECT count(*)::int FROM system_announcements a JOIN system_announcement_audience au ON au.announcement_id=a.id AND au.usuario_id=:id LEFT JOIN system_announcement_reads r ON r.announcement_id=a.id AND r.usuario_id=:id WHERE a.status IN ('published','expired') AND a.published_at>now()-interval '90 days' AND (a.expires_at IS NULL OR a.expires_at>now()) AND r.read_at IS NULL) AS unread_count`,{id});
 res.json({status:'success',data:{items,total:totals[0].total,page,totalPages:Math.ceil(totals[0].total/limit),unread_count:totals[0].unread_count}});
}));
router.get('/system-announcements/active',run(async(req,res)=>{const items=await q(`SELECT a.id,a.title,a.body,a.kind,a.published_at AS created_at,a.maintenance_start_at,a.maintenance_end_at FROM system_announcements a JOIN system_announcement_audience au ON au.announcement_id=a.id AND au.usuario_id=:id WHERE a.status='published' AND a.kind='mantenimiento' AND a.maintenance_start_at<=now() AND a.maintenance_end_at>now() AND (a.expires_at IS NULL OR a.expires_at>now()) ORDER BY a.maintenance_start_at`,{id:who(req)});res.json({status:'success',data:items});}));
router.post('/system-announcements/:id/read',run(async(req,res)=>{const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw new ProfileError(400,'ID inválido');const rows=await q(`INSERT INTO system_announcement_reads(announcement_id,usuario_id) SELECT a.id,:userId FROM system_announcements a JOIN system_announcement_audience au ON au.announcement_id=a.id AND au.usuario_id=:userId WHERE a.id=:id AND a.status IN ('published','expired') ON CONFLICT(announcement_id,usuario_id) DO UPDATE SET read_at=system_announcement_reads.read_at RETURNING read_at`,{id,userId:who(req)});if(!rows.length)throw new ProfileError(404,'Aviso no encontrado');res.json({status:'success',data:{read_at:rows[0].read_at}});}));
router.use((error:any,_req:Request,res:Response,_next:NextFunction)=>{ res.status(error instanceof ProfileError?error.status:500).json({status:'error',message:error instanceof ProfileError?error.message:'No se pudo completar la operación.'}); });
export default router;

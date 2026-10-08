import {Router,Request,Response,NextFunction} from 'express';
import {QueryTypes} from 'sequelize';
import sequelize from '../config/db';
import {authenticate} from '../middleware/auth';
import {ProfileError,validatePreferences} from './validation';
const router=Router();
const run=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{fn(req,res).catch(next);};
const idOf=(req:Request)=>(req.user as {id:number}).id;
const query=(sql:string,replacements:any={})=>sequelize.query<any>(sql,{replacements,type:QueryTypes.SELECT});
const positive=(value:unknown)=>{const id=Number(value);if(!Number.isSafeInteger(id)||id<1)throw new ProfileError(400,'Identificador inválido');return id;};
async function preferences(id:number){
 const [prefs,topics]=await Promise.all([query('SELECT id,recibir_notificaciones,frecuencia_notificaciones,tipo_notificacion FROM preferencias_usuario WHERE usuario_id=:id ORDER BY id DESC LIMIT 1',{id}),query('SELECT pt.id,t.id AS tema_id,t.nombre AS tema_nombre,t.activo FROM preferencias_usuario_temas pt JOIN temas t ON t.id=pt.tema_id WHERE pt.usuario_id=:id ORDER BY t.nombre',{id})]);
 return {preferences:prefs[0]||{id:null,recibir_notificaciones:false,frecuencia_notificaciones:'diaria',tipo_notificacion:'email'},topics,delivery_enabled:process.env.HEALTHCHECK_DIAGNOSTIC!=='1'};
}
router.use(authenticate);
router.get('/preferences',run(async(req,res)=>{res.json({status:'success',data:await preferences(idOf(req))});}));
router.put('/preferences',run(async(req,res)=>{
 const data=validatePreferences(req.body),id=idOf(req);
 await sequelize.transaction(async transaction=>{
  await sequelize.query('SELECT id FROM usuarios WHERE id=:id FOR UPDATE',{replacements:{id},transaction});
  const existing=await sequelize.query('SELECT id FROM preferencias_usuario WHERE usuario_id=:id',{replacements:{id},type:QueryTypes.SELECT,transaction});
  const sql=existing.length?'UPDATE preferencias_usuario SET recibir_notificaciones=:recibir_notificaciones,frecuencia_notificaciones=:frecuencia_notificaciones,tipo_notificacion=:tipo_notificacion,updated_at=now() WHERE usuario_id=:id':'INSERT INTO preferencias_usuario(usuario_id,recibir_notificaciones,frecuencia_notificaciones,tipo_notificacion) VALUES(:id,:recibir_notificaciones,:frecuencia_notificaciones,:tipo_notificacion)';
  await sequelize.query(sql,{replacements:{...data,id},transaction});
 });res.json({status:'success',data:await preferences(id)});
}));
router.get('/topics',run(async(_req,res)=>{res.json({status:'success',data:await query('SELECT id,nombre,descripcion FROM temas WHERE activo=true ORDER BY nombre')});}));
router.post('/topics',run(async(req,res)=>{
 const topic=positive(req.body.tema_id),id=idOf(req);
 const rows=await query('INSERT INTO preferencias_usuario_temas(usuario_id,tema_id) SELECT :id,id FROM temas WHERE id=:topic AND activo=true ON CONFLICT(usuario_id,tema_id) DO UPDATE SET tema_id=EXCLUDED.tema_id RETURNING id',{id,topic});
 if(!rows.length)throw new ProfileError(404,'El tema ya no está disponible');res.json({status:'success',data:await preferences(id)});
}));
router.delete('/topics/:topicId',run(async(req,res)=>{await sequelize.query('DELETE FROM preferencias_usuario_temas WHERE usuario_id=:id AND tema_id=:topic',{replacements:{id:idOf(req),topic:positive(req.params.topicId)}});res.json({status:'success',data:await preferences(idOf(req))});}));
router.get('/notifications',run(async(req,res)=>{
 const page=positive(req.query.page||1),limit=positive(req.query.limit||10);if(page>100000||limit>50)throw new ProfileError(400,'Paginación inválida');const values={id:idOf(req),limit,offset:(page-1)*limit};
 const [items,total]=await Promise.all([query('SELECT n.id,n.titulo,n.mensaje,n.tipo,n.enviada,n.fecha_creacion,n.fecha_envio,n.noticia_id,no.titulo AS noticia_titulo FROM notificaciones n LEFT JOIN noticias no ON no.id=n.noticia_id WHERE n.usuario_id=:id ORDER BY n.fecha_creacion DESC,n.id DESC LIMIT :limit OFFSET :offset',values),query('SELECT count(*)::int AS total FROM notificaciones WHERE usuario_id=:id',values)]);
 res.json({status:'success',data:{items,total:total[0].total,page,totalPages:Math.ceil(total[0].total/limit),delivery_enabled:process.env.HEALTHCHECK_DIAGNOSTIC!=='1'}});
}));
router.delete('/notifications/:notificationId',run(async(req,res)=>{const rows=await query('DELETE FROM notificaciones WHERE id=:notificationId AND usuario_id=:id RETURNING id',{notificationId:positive(req.params.notificationId),id:idOf(req)});if(!rows.length)throw new ProfileError(404,'Notificación no encontrada');res.json({status:'success',data:{deleted:true}});}));
router.use((error:any,_req:Request,res:Response,_next:NextFunction)=>{res.status(error instanceof ProfileError?error.status:500).json({status:'error',message:error instanceof ProfileError?error.message:'No se pudo completar la operación. Intenta nuevamente.'});});
export default router;

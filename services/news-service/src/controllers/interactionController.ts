import sequelize from '../config/db';
import {writeAudit} from '../audit/writer';
import {publicNews,isPublicNews} from '../editorial/policy';
import { Request, Response } from 'express';
import Interaction from '../models/Interaction';
import News from '../models/News';

/**
 * Crea o actualiza una interacción de usuario con una noticia
 */
export const createOrUpdateInteraction = async (req: Request, res: Response): Promise<void> => {
 try {
  if(!req.user){res.status(401).json({status:'error',message:'Usuario no autenticado'});return;}
  const actor=req.user,noticia_id=Number(req.body.noticia_id),tipo_interaccion=req.body.tipo_interaccion;
  if(!Number.isSafeInteger(noticia_id)||noticia_id<1||!['marcar_confiable','marcar_dudosa','compartir'].includes(tipo_interaccion)){
   res.status(400).json({status:'error',message:'Datos de interaccion invalidos'});return;
  }
  const result=await sequelize.transaction(async transaction=>{
   // Serialize toggles and repeated shares for this user/news pair.
   await sequelize.query('SELECT pg_advisory_xact_lock(:user,:news)',{replacements:{user:actor.id,news:noticia_id},transaction});
   const news=await News.findByPk(noticia_id,{transaction,lock:transaction.LOCK.SHARE});
   if(!news||!isPublicNews(news.toJSON()))return null;
   const existing=await Interaction.findOne({where:{usuario_id:actor.id,noticia_id,tipo_interaccion},transaction});
   if(existing&&tipo_interaccion==='compartir')return {action:'already_shared'};
   if(existing){
    await existing.destroy({transaction});
    await writeAudit(req,actor,'NEWS_INTERACTION',noticia_id,{interaction:tipo_interaccion,selected:false},transaction);
    return {action:'removed'};
   }
   if(tipo_interaccion!=='compartir')await Interaction.destroy({where:{usuario_id:actor.id,noticia_id,tipo_interaccion:tipo_interaccion==='marcar_confiable'?'marcar_dudosa':'marcar_confiable'},transaction});
   const interaction=await Interaction.create({usuario_id:actor.id,noticia_id,tipo_interaccion},{transaction});
   await writeAudit(req,actor,'NEWS_INTERACTION',noticia_id,{interaction:tipo_interaccion,selected:true},transaction,`interacciones_noticia:${interaction.id}`);
   return {action:'created',data:{interaction}};
  });
  if(!result){res.status(404).json({status:'error',message:'Noticia no encontrada'});return;}
  res.status(result.action==='created'?201:200).json({status:'success',...result});
 }catch{res.status(500).json({status:'error',message:'No se pudo procesar la interaccion'});}
};

/**
 * Obtiene las interacciones de un usuario
 */
export const getUserInteractions = async (req: Request, res: Response): Promise<void> => {
  try {
    // Verificar autenticación
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Usuario no autenticado'
      });
      return;
    }

    const usuario_id = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    // Obtener interacciones del usuario con información básica de las noticias
    const { count, rows } = await Interaction.findAndCountAll({
      where: { usuario_id },
      limit,
      offset,
      order: [['fecha_interaccion', 'DESC']],
      include: [
        {
          model: News,
          as: 'noticia',
          attributes: ['id', 'titulo', 'url', 'fecha_publicacion','editorial_state','editorial_origin','content_version']
        }
      ]
    });

    res.status(200).json({
      status: 'success',
      data: {
        total: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        interactions: rows.map(row=>{const r:any=row.toJSON();return {...r,noticia:r.noticia?publicNews(r.noticia):{available:false}};})
      }
    });
  } catch (error) {
    console.error('Error al obtener interacciones del usuario:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener interacciones'
    });
  }
};

/**
 * Obtiene el estado de interacción de un usuario con una noticia específica
 */
export const getInteractionStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    // Verificar autenticación
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Usuario no autenticado'
      });
      return;
    }

    const usuario_id = req.user.id;
    const noticia_id = parseInt(req.params.noticiaId);
    const visible=await News.findByPk(noticia_id);if(!visible||!isPublicNews(visible.toJSON())){res.status(404).json({status:'error',message:'Noticia no disponible'});return;}

    // Obtener todas las interacciones del usuario con esta noticia
    const interactions = await Interaction.findAll({
      where: {
        usuario_id,
        noticia_id
      },
      attributes: ['tipo_interaccion']
    });

    // Crear un objeto con el estado de cada tipo de interacción
    const interactionTypes = ['marcar_confiable', 'marcar_dudosa', 'compartir'];
    const status = interactionTypes.reduce((acc: Record<string, boolean>, type) => {
      acc[type] = interactions.some(i => i.tipo_interaccion === type);
      return acc;
    }, {});

    res.status(200).json({
      status: 'success',
      data: {
        noticia_id,
        interactions: status
      }
    });
  } catch (error) {
    console.error('Error al obtener estado de interacción:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener estado de interacción'
    });
  }
};

// Actualización para getInteractionCounts en interactionController.ts

export const getInteractionCounts = async (req: Request, res: Response): Promise<void> => {
  try {
    const noticiaId = parseInt(req.params.noticiaId);
    const visible=await News.findByPk(noticiaId);if(!visible||!isPublicNews(visible.toJSON())){res.status(404).json({status:'error',message:'Noticia no disponible'});return;}

    // Contar likes, dislikes y shares
    const [likesCount, dislikesCount, sharesCount] = await Promise.all([
      Interaction.count({
        where: {
          noticia_id: noticiaId,
          tipo_interaccion: 'marcar_confiable'
        }
      }),
      Interaction.count({
        where: {
          noticia_id: noticiaId,
          tipo_interaccion: 'marcar_dudosa'
        }
      }),
      Interaction.count({
        where: {
          noticia_id: noticiaId,
          tipo_interaccion: 'compartir'
        }
      })
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        likes: likesCount,
        dislikes: dislikesCount,
        shares: sharesCount
      }
    });
  } catch (error) {
    console.error('Error al obtener conteo de interacciones:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error al obtener conteo de interacciones'
    });
  }
};

export default {
  createOrUpdateInteraction,
  getUserInteractions,
  getInteractionStatus,
  getInteractionCounts
};
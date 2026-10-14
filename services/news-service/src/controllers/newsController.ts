import {Request,Response} from 'express';
import {publicList,publicDetail} from '../editorial/publicRead';
import {AdminError,positiveId} from '../admin/query';
export function publicError(error:unknown,res:Response){const status=error instanceof AdminError?error.status:500;res.status(status).json({status:'error',message:error instanceof AdminError?error.message:'No se pudo consultar las noticias'});}
export const getNewsFeed=async(req:Request,res:Response):Promise<void>=>{try{res.json({status:'success',data:await publicList(req.query)});}catch(e){publicError(e,res);}};
export const getNewsById=async(req:Request,res:Response):Promise<void>=>{try{res.json({status:'success',data:{news:await publicDetail(positiveId(req.params.id))}});}catch(e){publicError(e,res);}};
export default {getNewsFeed,getNewsById};

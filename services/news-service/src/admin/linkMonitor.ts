import {Router} from 'express';
import {getMonitorResults,getMonitorRun,startMonitorRun,resultStatuses} from '../services/linkMonitorClient';
export const linkMonitorRouter=Router();
linkMonitorRouter.post('/runs',async(req,res)=>{
 if(process.env.HEALTHCHECK_DIAGNOSTIC==='1'){res.status(503).json({status:'error',message:'Las revisiones externas están desactivadas en modo diagnóstico.'});return;}
 try{const data=await startMonitorRun(req.user!.id);res.status(data.created?202:200).json({status:'success',data});}
 catch{res.status(503).json({status:'error',message:'El monitor no está disponible. Intenta de nuevo más tarde.'});}
});
linkMonitorRouter.get('/runs/current',async(_req,res)=>{try{res.json({status:'success',data:await getMonitorRun()});}catch{res.status(503).json({status:'error',message:'No se pudo consultar el monitor.'});}});
linkMonitorRouter.get('/results',async(req,res)=>{
 const integer=(value:unknown,fallback:number,max:number)=>value===undefined?fallback:typeof value==='string'&&/^\d+$/.test(value)&&Number(value)>=1&&Number(value)<=max?Number(value):null;
 const page=integer(req.query.page,1,1000000),limit=integer(req.query.limit,25,100),status=req.query.status??'';
 if(page===null||limit===null||typeof status!=='string'||(status!==''&&!resultStatuses.includes(status as typeof resultStatuses[number]))){res.status(400).json({status:'error',message:'Filtros de revisión inválidos.'});return;}
 try{res.json({status:'success',data:await getMonitorResults({page,limit,status})});}catch{res.status(503).json({status:'error',message:'No se pudieron consultar los resultados.'});}
});

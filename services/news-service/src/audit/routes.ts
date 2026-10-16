import {Router,Request,Response,NextFunction} from 'express';
import sequelize from '../config/db';
import {AdminError} from '../admin/query';
import {catalog,parseLogQuery} from './query';
import {listLogs,summarizeLogs,trendLogs,getLog,logRows} from './read';
import {writeAudit} from './writer';
import {workbookBuffer} from './export';
const router=Router();
const run=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{fn(req,res).catch(next);};
// Mounted inside the current-admin middleware; never exposed through a public route.
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
router.get('/catalog',(_req,res)=>{res.json({status:'success',data:catalog});});
router.get('/',run(async(req,res)=>{res.json({status:'success',data:await listLogs(parseLogQuery(req.query))});}));
router.get('/summary',run(async(req,res)=>{res.json({status:'success',data:await summarizeLogs(parseLogQuery(req.query))});}));
router.get('/trend',run(async(req,res)=>{res.json({status:'success',data:await trendLogs(parseLogQuery(req.query))});}));
router.get('/export',run(async(req,res)=>{
 const query=parseLogQuery(req.query),rows=await logRows(query,5001),buffer=await workbookBuffer(rows);
 await sequelize.transaction(t=>writeAudit(req,req.user!,'LOG_EXPORT',null,{count:rows.length},t));
 res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 res.setHeader('Content-Disposition',`attachment; filename="HealthCheck-Logs-${query.startDate}-${query.endDate}.xlsx"`);
 res.send(buffer);
}));
router.get('/:id',run(async(req,res)=>{
 const id=String(req.params.id);if(!/^[1-9]\d{0,18}$/.test(id)||BigInt(id)>BigInt('9223372036854775807'))throw new AdminError(400,'ID inválido');
 const result=await sequelize.transaction(async t=>{
  const log=await getLog(id,t);if(!log)throw new AdminError(404,'Registro no encontrado');
  await writeAudit(req,req.user!,'LOG_DETAIL_VIEW',id,{log_id:id},t);return log;
 });
 res.json({status:'success',data:result});
}));
export default router;

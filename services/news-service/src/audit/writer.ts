import {Request} from 'express';
import {Transaction} from 'sequelize';
import sequelize from '../config/db';
const runtime=require('../../../../shared/audit/runtime.cjs');
export async function writeAudit(req:Request|undefined,actor:{id:number;rol:string},action:string,id:unknown,metadata:Record<string,unknown>,transaction:Transaction,reference?:string){
 const event=runtime.event(req||{headers:{},socket:{}},'news',action,id,metadata,'success',actor);
 event.source_reference=reference||null;
 return runtime.write(sequelize,event,transaction);
}

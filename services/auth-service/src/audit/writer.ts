import {Request} from 'express';
import {Transaction} from 'sequelize';
import sequelize from '../config/db';
const runtime=require('../../../../shared/audit/runtime.cjs');
export async function audit(req:Request,action:string,id:unknown,metadata:Record<string,unknown>={},transaction?:Transaction,outcome='success',actor?:{id:number;rol:string}):Promise<string|null>{
 return runtime.write(sequelize,runtime.event(req,'auth',action,id,metadata,outcome,actor),transaction);
}
export async function auditAttempt(req:Request,action:string):Promise<void>{
 try{await audit(req,action,null,{reason_code:'credentials_rejected'},undefined,'failure');}
 catch{console.error('AUDIT_WRITE_FAILED: rejected authentication attempt');}
}

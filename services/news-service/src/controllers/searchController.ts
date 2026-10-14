import {Request,Response} from 'express';
import {publicList} from '../editorial/publicRead';
import {publicError} from './newsController';
export const searchNews=async(req:Request,res:Response):Promise<void>=>{try{const {news,...data}=await publicList(req.query);res.json({status:'success',data:{...data,results:news}});}catch(e){publicError(e,res);}};
export default {searchNews};

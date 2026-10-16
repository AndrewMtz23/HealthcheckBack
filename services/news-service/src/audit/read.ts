import {QueryTypes,Transaction} from 'sequelize';
import sequelize from '../config/db';
import {LogQuery,logFilter,effectiveDate} from './query';
const from='FROM system_logs l LEFT JOIN usuarios u ON u.id=l.user_id';
const columns=`l.id::text,l.occurred_at,l.recorded_at,${effectiveDate} AS effective_at,l.user_id,l.actor_type,l.actor_role,l.action,l.entity,l.entity_id,l.service,l.request_id,l.outcome,l.description,l.sensitivity,l.catalog_version,l.origin,l.source_reference,u.nombre AS user_name,u.email AS user_email,u.imagen_url AS user_photo`;
export const sql=(query:string,replacements:Record<string,unknown>={},transaction?:Transaction)=>sequelize.query<any>(query,{replacements,type:QueryTypes.SELECT,transaction});
export async function logRows(query:LogQuery,limit:number,offset=0,transaction?:Transaction){const {where,values}=logFilter(query);return sql(`SELECT ${columns} ${from} WHERE ${where} ORDER BY ${effectiveDate} DESC,l.id DESC LIMIT :take OFFSET :skip`,{...values,take:limit,skip:offset},transaction);}
export async function listLogs(query:LogQuery){
 return sequelize.transaction({isolationLevel:Transaction.ISOLATION_LEVELS.REPEATABLE_READ},async transaction=>{
  const {where,values}=logFilter(query),counts=await sql(`SELECT count(*)::int AS total ${from} WHERE ${where}`,values,transaction);
  return {items:await logRows(query,query.limit,(query.page-1)*query.limit,transaction),total:counts[0].total,page:query.page,limit:query.limit,totalPages:Math.ceil(counts[0].total/query.limit),calculatedAt:new Date().toISOString()};
 });
}
export async function summarizeLogs(query:LogQuery){
 const {where,values}=logFilter(query);
 const rows=await sql(`WITH filtered AS (SELECT l.*,(${effectiveDate} AT TIME ZONE 'America/Mexico_City')::date AS local_day ${from} WHERE ${where})
 SELECT count(*)::int AS total,count(*) FILTER(WHERE local_day=(now() AT TIME ZONE 'America/Mexico_City')::date)::int AS "todayCount",count(*) FILTER(WHERE sensitivity='sensible')::int AS "sensitiveCount",count(DISTINCT user_id) FILTER(WHERE local_day=(now() AT TIME ZONE 'America/Mexico_City')::date)::int AS "uniqueActorsToday",(SELECT entity FROM filtered GROUP BY entity ORDER BY count(*) DESC,entity LIMIT 1) AS "topEntity" FROM filtered`,values);
 return {...rows[0],calculatedAt:new Date().toISOString()};
}
export async function trendLogs(query:LogQuery){
 const {where,values}=logFilter(query);
 const rows=await sql(`WITH filtered AS (SELECT l.action,(${effectiveDate} AT TIME ZONE 'America/Mexico_City')::date AS day ${from} WHERE ${where}),top AS (SELECT action,count(*) AS total FROM filtered GROUP BY action ORDER BY total DESC,action LIMIT 6),days AS (SELECT generate_series(CAST(:startDate AS date),CAST(:endDate AS date),'1 day')::date AS day)
 SELECT to_char(days.day,'YYYY-MM-DD') AS day,top.action,count(filtered.action)::int AS count,top.total::int FROM days CROSS JOIN top LEFT JOIN filtered ON filtered.day=days.day AND filtered.action=top.action GROUP BY days.day,top.action,top.total ORDER BY days.day,top.total DESC,top.action`,values);
 return {topActions:[...new Set(rows.map(row=>row.action))],series:rows,calculatedAt:new Date().toISOString()};
}
export async function getLog(id:string,transaction?:Transaction){return (await sql(`SELECT ${columns},l.ip_address::text,l.user_agent,l.metadata ${from} WHERE l.id=:id`,{id},transaction))[0]||null;}

export type RunState = 'queued'|'running'|'completed'|'interrupted'|'failed';
export interface MonitorRun {id:string;state:RunState;created_at:string;started_at:string|null;finished_at:string|null;heartbeat_at:string|null;total_urls:number;processed_urls:number;skipped_news:number;error_code:string|null}
export interface StartResult {run:MonitorRun;created:boolean}
export const resultStatuses = ['available','not_found','restricted','rate_limited','site_error','connection_failed','uncheckable','stale','unchecked'] as const;
export interface ResultsQuery {page:number;limit:number;status:string}
export interface CheckResult {status:string;http_status:number|null;final_url:string;redirect_count:number;checked_at:string;duration_ms:number;error_code?:string}
export interface ResultRow {news_id:number;title:string;current_url:string;checked_url:string|null;freshness:'current'|'stale'|'unchecked';pending:boolean;result:CheckResult|null}
export interface ResultsPage {items:ResultRow[];page:number;limit:number;total:number;summary:Record<string,number>}
export class MonitorUnavailable extends Error {constructor(){super('El monitor no está disponible. Intenta de nuevo más tarde.');}}
async function request<T>(path:string,body?:unknown):Promise<T>{
 const base=process.env.LINK_MONITOR_URL||'http://127.0.0.1:3005';const token=process.env.LINK_MONITOR_INTERNAL_TOKEN;
 if(!token)throw new MonitorUnavailable();
 try{
  const response=await fetch(base.replace(/\/$/,'')+'/internal/link-monitor'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(5000),cache:'no-store'});
  if(!response.ok||!response.body)throw new MonitorUnavailable();
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024)throw new MonitorUnavailable();chunks.push(value);}}finally{await reader.cancel();}
  const payload=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {status?:string;data?:T};if(payload.status!=='success'||payload.data===undefined)throw new MonitorUnavailable();return payload.data;
 }catch{throw new MonitorUnavailable();}
}
export const startMonitorRun=(actorId:number)=>request<StartResult>('/runs',{requested_by:actorId});
export const getMonitorRun=()=>request<MonitorRun|null>('/runs/current');
export const getMonitorResults=(query:ResultsQuery)=>request<ResultsPage>('/results?'+new URLSearchParams({page:String(query.page),limit:String(query.limit),status:query.status}));

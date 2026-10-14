import {QueryTypes} from 'sequelize';
import sequelize from '../config/db';
import {parseQuery,positiveId,AdminError} from '../admin/query';
import {publicNews,isPublicNews} from './policy';
const sql=(text:string,replacements:any={})=>sequelize.query<any>(text,{replacements,type:QueryTypes.SELECT});
const joins=`LEFT JOIN temas t ON t.id=n.tema_id LEFT JOIN fuentes f ON f.id=n.fuente_id
 LEFT JOIN LATERAL (SELECT * FROM clasificacion_noticias WHERE noticia_id=n.id AND content_version=n.content_version ORDER BY fecha_clasificacion DESC NULLS LAST,id DESC LIMIT 1) c ON true`;
const projection=`n.*,jsonb_build_object('id',t.id,'nombre',t.nombre) AS tema,
 jsonb_build_object('id',f.id,'nombre',f.nombre,'url',f.url,'confiabilidad',f.confiabilidad) AS fuente,
 COALESCE((SELECT jsonb_agg(x ORDER BY x.fecha_clasificacion DESC NULLS LAST,x.id DESC) FROM
 (SELECT cc.*,jsonb_build_object('nombre',m.nombre,'version',m.version,'precision',m.precision,'recall',m.recall,'f1_score',m.f1_score) AS modelo FROM clasificacion_noticias cc LEFT JOIN modelos_ml m ON m.id=cc.modelo_id WHERE cc.noticia_id=n.id AND (cc.content_version=n.content_version OR c.id IS NULL) ORDER BY cc.fecha_clasificacion DESC NULLS LAST,cc.id DESC LIMIT 20) x),'[]'::jsonb) AS clasificaciones`;
export async function publicList(input:any){
 const p=parseQuery({...input,limit:input.limit||10,startDate:input.fechaInicio||input.startDate,endDate:input.fechaFin||input.endDate});
 const values:any={...p};const where=['news_is_public(n)'];
 if(input.q)where.push('(n.titulo ILIKE :q OR n.contenido ILIKE :q)');
 for(const [key,col] of [['temaId','tema_id'],['fuenteId','fuente_id']])if(input[key]){values[key]=positiveId(input[key]);where.push(`n.${col}=:${key}`);}
 if(input.clasificacion){if(!['verdadera','falsa','dudosa','sin_clasificar'].includes(input.clasificacion))throw new AdminError(400,'Clasificación inválida');if(input.clasificacion==='sin_clasificar')where.push('c.id IS NULL');else{values.resultado=input.clasificacion;where.push('c.resultado::text=:resultado');}}
 if(p.startDate)where.push('n.fecha_publicacion>=CAST(:startDate AS date)');if(p.endDate)where.push("n.fecha_publicacion<CAST(:endDate AS date)+interval '1 day'");
 const from=`FROM noticias n ${joins} WHERE ${where.join(' AND ')}`;
 const total=(await sql(`SELECT count(*)::int total ${from}`,values))[0].total;
 const rows=await sql(`SELECT ${projection} ${from} ORDER BY COALESCE(n.editorial_published_at,n.fecha_publicacion AT TIME ZONE 'UTC') DESC NULLS LAST,n.id DESC LIMIT :limit OFFSET :offset`,values);
 return {total,currentPage:p.page,totalPages:Math.ceil(total/p.limit),news:rows.map(publicNews)};
}
export async function publicDetail(id:number){const row=(await sql(`SELECT ${projection} FROM noticias n ${joins} WHERE n.id=:id`,{id}))[0];
 if(!row)throw new AdminError(404,'Noticia no encontrada');if(row.editorial_state==='withdrawn')throw new AdminError(410,'Esta noticia ya no está disponible');if(!isPublicNews(row))throw new AdminError(404,'Noticia no encontrada');return publicNews(row);}

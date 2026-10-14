import {AdminError} from '../admin/query';
export function normalizeUrl(value: string): string {
 try {const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||value.length>2048)throw Error();u.hash='';return u.href;}
 catch {throw new AdminError(400,'URL http/https inválida o con credenciales');}
}
export function reasonValue(value: unknown): string {
 if(typeof value!=='string'||!value.trim()||value.length>2000)throw new AdminError(400,'Escribe un motivo de hasta 2000 caracteres');return value.trim();
}
export function expectedVersion(value: unknown): number {
 if(!Number.isSafeInteger(value)||Number(value)<1)throw new AdminError(400,'Versión inválida');return Number(value);
}
export function newsValues(input: any,create: boolean): Record<string,any> {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new AdminError(400,'Datos inválidos');
 const fields=['titulo','contenido','url','fuente_id','tema_id','fecha_publicacion'];
 if(Object.keys(input).some(k=>![...fields,'reason','expected_version'].includes(k)))throw new AdminError(400,'Campo editorial no permitido');
 const out:Record<string,any>={};
 for(const k of fields)if(input[k]!==undefined)out[k]=input[k];
 for(const [key,max] of [['titulo',500],['contenido',100000]] as const)if(create||key in out){if(typeof out[key]!=='string'||!out[key].trim()||out[key].length>max)throw new AdminError(400,`${key}: texto requerido (máximo ${max})`);out[key]=out[key].trim();}
 if('url' in out){if(out.url===null||out.url==='')out.url=null;else if(typeof out.url==='string')out.url=normalizeUrl(out.url);else throw new AdminError(400,'URL inválida');}
 for(const key of ['fuente_id','tema_id'])if(key in out&&out[key]!==null&&(!Number.isSafeInteger(out[key])||out[key]<1))throw new AdminError(400,'Fuente o tema inválido');
 if('fecha_publicacion' in out&&out.fecha_publicacion!==null){if(typeof out.fecha_publicacion!=='string'||!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(out.fecha_publicacion)||!Number.isFinite(Date.parse(out.fecha_publicacion))||new Date(out.fecha_publicacion.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)!==out.fecha_publicacion.slice(0,10))throw new AdminError(400,'Fecha inválida');out.fecha_publicacion=new Date(out.fecha_publicacion).toISOString();}
 if(!Object.keys(out).length)throw new AdminError(400,'No hay cambios');return out;
}

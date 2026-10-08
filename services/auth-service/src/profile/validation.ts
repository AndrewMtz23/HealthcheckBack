export class ProfileError extends Error {constructor(public status:number,message:string){super(message);}}
export function validateProfile(body:any){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new ProfileError(400,'Datos de perfil inválidos');
 const data:any={};
 if(body.nombre!==undefined){if(typeof body.nombre!=='string'||!body.nombre.trim()||body.nombre.trim().length>120)throw new ProfileError(400,'Escribe un nombre de hasta 120 caracteres');data.nombre=body.nombre.trim();}
 if(body.telefono!==undefined){if(typeof body.telefono!=='string'||body.telefono.length>40)throw new ProfileError(400,'El teléfono debe tener hasta 40 caracteres');data.telefono=body.telefono.trim();}
 if(body.imagen_url!==undefined){const value=body.imagen_url;if(value===null||value==='')data.imagen_url=null;else{try{if(typeof value!=='string'||value.length>2048)throw new Error();const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error();data.imagen_url=url.href;}catch{throw new ProfileError(400,'La imagen debe ser una URL http o https válida, sin credenciales (máximo 2048 caracteres)');}}}
 return data;
}
export function validatePreferences(body:any){
 if(!body||typeof body.recibir_notificaciones!=='boolean'||!['diaria','semanal','inmediata'].includes(body.frecuencia_notificaciones)||body.tipo_notificacion!=='email')throw new ProfileError(400,'Selecciona una frecuencia válida. El único canal disponible es correo electrónico.');
 return {recibir_notificaciones:body.recibir_notificaciones,frecuencia_notificaciones:body.frecuencia_notificaciones,tipo_notificacion:body.tipo_notificacion};
}

import { validateProfile, ProfileError } from '../profile/validation';
export class AdminError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export function validateUser(body: any, create = false): any {
    if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new AdminError(400, 'Datos inválidos');
    const data: any = {};
    for (const key of ['nombre', 'email', 'telefono', 'contrasena', 'rol', 'activo'])
        if (body[key] !== undefined)
            data[key] = body[key];
    for (const key of ['nombre', 'email'])
        if (create || data[key] !== undefined) {
            if (typeof data[key] !== 'string' || !data[key].trim() || data[key].length > 255)
                throw new AdminError(400, `${key}: valor requerido (máximo 255 caracteres)`);
            data[key] = data[key].trim();
        }
    if (data.email !== undefined) {
        data.email = data.email.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
            throw new AdminError(400, 'Email inválido');
    }
    if (data.rol !== undefined && !['admin', 'usuario'].includes(data.rol))
        throw new AdminError(400, 'Rol inválido');
    if (data.activo !== undefined && typeof data.activo !== 'boolean')
        throw new AdminError(400, 'Estado inválido');
    if (data.telefono !== undefined && (typeof data.telefono !== 'string' || data.telefono.length > 40))
        throw new AdminError(400, 'Teléfono inválido');
    if (create || data.contrasena !== undefined) {
        if (typeof data.contrasena !== 'string' || data.contrasena.length < 8 || Buffer.byteLength(data.contrasena) > 72)
            throw new AdminError(400, 'Contraseña: entre 8 caracteres y 72 bytes');
    }
    if (body.imagen_url !== undefined) {
        try { data.imagen_url = validateProfile({ imagen_url: body.imagen_url }).imagen_url; }
        catch (error) { if (error instanceof ProfileError) throw new AdminError(error.status, error.message); throw error; }
    }
    return data;
}
export function protectAdmin(actor: number, target: {
    id: number;
    rol: string;
    activo: boolean;
}, data: any, activeAdmins: number) {
    const removes = data.rol === 'usuario' || data.activo === false;
    if (target.id === actor && removes)
        throw new AdminError(409, 'No puedes desactivar tu cuenta ni quitarte el rol de administrador');
    if (target.rol === 'admin' && target.activo && removes && activeAdmins <= 1)
        throw new AdminError(409, 'Debe permanecer un administrador activo');
}

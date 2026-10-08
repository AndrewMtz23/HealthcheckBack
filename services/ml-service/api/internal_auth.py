"""Only the gateway may attest a current session to ML; clients cannot supply identity."""
import hmac
import os
from flask import g, jsonify, request


def require_gateway(admin=False):
    if request.method == 'OPTIONS':
        return None
    expected = os.environ.get('ML_GATEWAY_SECRET', '')
    if len(expected) < 32:
        return jsonify(status='error', message='Servicio no configurado'), 503
    supplied = request.headers.get('X-Gateway-Secret', '')
    identity = request.headers.get('X-User-Id', '')
    role = request.headers.get('X-User-Role', '')
    if (not hmac.compare_digest(expected.encode(), supplied.encode())
            or not identity.isascii() or not identity.isdecimal()
            or len(identity) > 10 or not 0 < int(identity) <= 2147483647
            or role not in ('admin', 'usuario')):
        return jsonify(status='error', message='Origen o sesión no autorizados'), 403
    if admin and role != 'admin':
        return jsonify(status='error', message='Se requiere administrador'), 403
    g.user_id = int(identity)
    return None

"""Public liveness only: does not imply an active model or authorize ML operations."""
import os
from flask import Blueprint, jsonify

health_bp = Blueprint('health', __name__)

@health_bp.get('/health')
def health():
    response = jsonify(status='success', service='ml', diagnostic=os.environ.get('HEALTHCHECK_DIAGNOSTIC') == '1')
    response.headers['Cache-Control'] = 'no-store'
    return response

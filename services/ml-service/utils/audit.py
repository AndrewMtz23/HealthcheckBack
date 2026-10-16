"""Audit events share the caller's database transaction; never include content."""
import hashlib
import hmac
import ipaddress
import json
import os
import time
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from urllib.parse import unquote
from flask import g, has_request_context, request, make_response
from sqlalchemy import text
from database.db import db

CATALOG = json.loads((Path(__file__).resolve().parents[3] / 'contracts/audit/catalog.json').read_text(encoding='utf-8'))


def enabled():
    return os.environ.get('AUDIT_ENABLED') == 'true'


def context():
    if not has_request_context():
        return dict(request_id=str(uuid.uuid4()), user_id=None, actor_type='system', actor_role=None, ip_address=None, user_agent=None)
    if not hasattr(g, 'audit_network'):
        ip, agent, identity = request.remote_addr, request.user_agent.string[:512] or None, str(uuid.uuid4())
        try:
            ipaddress.ip_address(ip)
        except ValueError:
            ip = None
        try:
            headers = request.headers
            candidate, stamp = headers['X-Audit-Id'], headers['X-Audit-Time']
            peer, ua = headers['X-Audit-IP'], unquote(headers['X-Audit-Agent'])
            uuid.UUID(candidate)
            ipaddress.ip_address(peer)
            secret = os.environ.get('ML_GATEWAY_SECRET','')
            payload = json.dumps(['healthcheck-audit-v1',candidate,stamp,peer,ua], separators=(',',':'), ensure_ascii=False).encode()
            proof = hmac.new(secret.encode(),payload,hashlib.sha256).hexdigest()
            if len(secret)>=32 and abs(time.time()*1000-int(stamp))<=30000 and len(ua)<=512 and hmac.compare_digest(proof,headers['X-Audit-Proof']):
                ip, agent, identity = peer, ua or None, candidate
        except (KeyError, ValueError, TypeError):
            pass
        g.audit_network = dict(request_id=identity,ip_address=ip,user_agent=agent)
    user_id = getattr(g,'user_id',None)
    return dict(g.audit_network,user_id=user_id,actor_type='user' if user_id else 'anonymous',actor_role=getattr(g,'user_role',None) if user_id else None)


def make_event(action, outcome, entity_id=None, metadata=None):
    rule = CATALOG['actions'][action]
    return dict(context(),event_key=str(uuid.uuid4()),occurred_at=datetime.now(timezone.utc).isoformat(),action=action,entity=rule['entity'],entity_id=str(entity_id) if entity_id is not None else None,service='ml',outcome=outcome,description=rule['label'],metadata=metadata or {},origin='live',source_reference=None)


def write_audit(event, session):
    if not enabled():
        return None
    if set(event['metadata'])-set(CATALOG['actions'][event['action']]['metadata']):
        raise ValueError('Invalid audit metadata')
    try:
        return session.execute(text('SELECT record_system_log(CAST(:event AS jsonb))::text'), {'event':json.dumps(event)}).scalar()
    except Exception:
        raise RuntimeError('AUDIT_WRITE_FAILED') from None


def consultation(user_id, news_id, history_id):
    if not enabled():
        return
    event=make_event('NEWS_VIEW','success',news_id)
    # Background callers have a database identity, never one supplied by a browser.
    if event['user_id'] != user_id:
        role=db.session.execute(text('SELECT rol FROM usuarios WHERE id=:id'),{'id':user_id}).scalar()
        event.update(user_id=user_id,actor_type='user',actor_role=role)
    event['source_reference']=f'historial_consultas:{history_id}'
    write_audit(event,db.session)


def finish_job(entity_id=None, metadata=None):
    """Called before committing a persisted result; the wrapper handles failures."""
    if enabled() and has_request_context() and getattr(g,'audit_action',None) and not getattr(g,'audit_finished',False):
        write_audit(make_event(g.audit_action,'success',entity_id,metadata),db.session)
        g.audit_finished=True


def audited_job(action):
    def decorate(fn):
        @wraps(fn)
        def wrapped(*args,**kwargs):
            if not enabled():
                return fn(*args,**kwargs)
            g.audit_action, g.audit_finished = action, False
            write_audit(make_event(action,'started'),db.session)
            db.session.commit()
            try:
                result=fn(*args,**kwargs)
                success=make_response(result).status_code<400
                if not success:
                    db.session.rollback()
                    g.audit_finished=False
                if not g.audit_finished:
                    write_audit(make_event(action,'success' if success else 'failure'),db.session)
                    db.session.commit()
                return result
            except Exception:
                db.session.rollback()
                try:
                    write_audit(make_event(action,'failure'),db.session)
                    db.session.commit()
                except Exception:
                    db.session.rollback()
                raise
        return wrapped
    return decorate


def background_scraping(fn):
    @wraps(fn)
    def wrapped(app):
        with app.app_context():
            start=make_event('SCRAPING_RUN','started')
            try:
                write_audit(start,db.session)
                db.session.commit()
                count=fn(app)
                end=make_event('SCRAPING_RUN','success',metadata={'count':count or 0})
            except Exception:
                db.session.rollback()
                end=make_event('SCRAPING_RUN','failure')
            end['request_id']=start['request_id']
            try:
                write_audit(end,db.session)
                db.session.commit()
            except Exception:
                db.session.rollback()
                app.logger.error('AUDIT_WRITE_FAILED: background scraping')
    return wrapped

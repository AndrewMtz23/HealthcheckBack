const {retryOutcome}=require('./delivery-policy');

class AnnouncementDeliveryWorker {
  constructor({pool,send,now=()=>new Date(),frontendUrl='http://localhost:3000'}) { this.pool=pool;this.send=send;this.now=now;this.frontendUrl=frontendUrl; }
  async runOnce({deliver=true}={}) {
    const client=await this.pool.connect();let locked=false;
    try {
      const schema=(await client.query("SELECT to_regclass('system_announcements') AS announcements,to_regclass('system_announcement_audience') AS audience,to_regclass('system_announcement_reads') AS reads,to_regclass('system_announcement_emails') AS emails,to_regclass('system_announcement_email_totals') AS totals")).rows[0];
      if(!schema.announcements||!schema.audience||!schema.reads||!schema.emails||!schema.totals)return {ready:false};
      locked=(await client.query('SELECT pg_try_advisory_lock(734251,7) AS locked')).rows[0].locked;
      if(!locked)return {ready:true,busy:true};
      await client.query("UPDATE system_announcement_emails SET state='uncertain',error_code='WORKER_INTERRUPTED',updated_at=now() WHERE state='sending'");
      await this.publishDue(client);
      if(deliver) {
        for(;;) {
          const row=(await client.query("UPDATE system_announcement_emails SET state='sending',attempts=attempts+1,updated_at=now() WHERE (announcement_id,usuario_id)=(SELECT e.announcement_id,e.usuario_id FROM system_announcement_emails e JOIN system_announcements a ON a.id=e.announcement_id WHERE e.state IN ('queued','retry') AND e.available_at<=now() AND a.status='published' AND (a.expires_at IS NULL OR a.expires_at>now()) ORDER BY e.available_at,e.announcement_id,e.usuario_id FOR UPDATE OF e SKIP LOCKED LIMIT 1) RETURNING *")).rows[0];
          if(!row)break; await this.deliverOne(client,row);
        }
      }
      return {ready:true,busy:false};
    } finally { try{await client.query('ROLLBACK');if(locked)await client.query('SELECT pg_advisory_unlock(734251,7)');client.release();}catch(error){client.release(error);} }
  }
  async publishDue(client) {
    await client.query('BEGIN');
    try {
      const expired=(await client.query("UPDATE system_announcements SET status='expired' WHERE status IN ('published','scheduled') AND expires_at<=now() RETURNING id")).rows.map(row=>row.id);
      if(expired.length)await client.query("UPDATE system_announcement_emails SET state='cancelled',error_code='ANNOUNCEMENT_EXPIRED',updated_at=now() WHERE announcement_id=ANY($1::bigint[]) AND state IN ('queued','retry')",[expired]);
      await client.query("DELETE FROM system_announcement_reads r USING system_announcements a WHERE a.id=r.announcement_id AND a.expires_at IS NOT NULL AND a.expires_at<=now()-interval '90 days'");
      await client.query("DELETE FROM system_announcement_audience au USING system_announcements a WHERE a.id=au.announcement_id AND a.expires_at IS NOT NULL AND a.expires_at<=now()-interval '90 days'");
      await client.query("DELETE FROM system_announcement_emails e USING system_announcements a WHERE a.id=e.announcement_id AND a.published_at<=now()-interval '12 months'");
      const due=(await client.query("SELECT id FROM system_announcements WHERE status='scheduled' AND publish_at<=now() AND (expires_at IS NULL OR expires_at>now()) ORDER BY publish_at,id FOR UPDATE")).rows;
      for(const {id} of due) {
        const published=(await client.query("UPDATE system_announcements SET status='published',published_at=now() WHERE id=$1 AND status='scheduled' RETURNING id",[id])).rows[0];
        if(published){await client.query("INSERT INTO system_announcement_audience(announcement_id,usuario_id,email_eligible) SELECT $1,id,(email IS NOT NULL AND btrim(email)<>'') FROM usuarios WHERE activo=true ON CONFLICT DO NOTHING",[id]);const count=(await client.query('SELECT count(*)::int AS total FROM system_announcement_audience WHERE announcement_id=$1',[id])).rows[0];await client.query('UPDATE system_announcements SET audience_count=$2 WHERE id=$1',[id,count.total]);await client.query("INSERT INTO system_announcement_emails(announcement_id,usuario_id) SELECT announcement_id,usuario_id FROM system_announcement_audience WHERE announcement_id=$1 AND email_eligible ON CONFLICT DO NOTHING",[id]);}
      }
      await client.query('COMMIT');
    } catch(error){await client.query('ROLLBACK');throw error;}
  }
  async deliverOne(client,row) {
    await client.query('BEGIN');
    try {
      const current=(await client.query("SELECT u.id,u.nombre,u.email,u.activo,a.title,a.body,a.status,a.expires_at FROM usuarios u JOIN system_announcements a ON a.id=$1 WHERE u.id=$2 FOR UPDATE OF u,a",[row.announcement_id,row.usuario_id])).rows[0];
      if(!current?.activo||!current.email||current.status!=='published'||(current.expires_at&&new Date(current.expires_at)<=this.now())) {
        await client.query("UPDATE system_announcement_emails SET state='cancelled',error_code='ACCOUNT_OR_ANNOUNCEMENT_INACTIVE',updated_at=now() WHERE announcement_id=$1 AND usuario_id=$2",[row.announcement_id,row.usuario_id]);await client.query('COMMIT');return;
      }
      let outcome;
      try {
        const result=await this.send({id:current.id,nombre:current.nombre,email:current.email},current,`<healthcheck-announcement-${row.announcement_id}-${row.usuario_id}@notifications.healthcheck.invalid>`);
        if(!result?.accepted?.length||result.rejected?.length)throw {responseCode:550};
        outcome={state:'sent',code:null,delay:0};
      } catch(error){outcome=retryOutcome(error,row.attempts);}
      const available=new Date(this.now().getTime()+outcome.delay);
      await client.query('UPDATE system_announcement_emails SET state=$3,error_code=$4,available_at=$5,sent_at=$6,updated_at=now() WHERE announcement_id=$1 AND usuario_id=$2',[row.announcement_id,row.usuario_id,outcome.state,outcome.code,available,outcome.state==='sent'?this.now():null]);
      await client.query('COMMIT');
    } catch(error){try{await client.query('ROLLBACK');}catch{} throw error;}
  }
}
module.exports={AnnouncementDeliveryWorker};

const {deliveryWindow,retryOutcome}=require('./delivery-policy');
const LATEST_PREF=`SELECT * FROM preferencias_usuario WHERE usuario_id=$1 ORDER BY id DESC LIMIT 1`;
class DeliveryWorker {
  constructor({pool,send,now=()=>new Date()}) {this.pool=pool;this.send=send;this.now=now;}
  async runOnce({deliver=true}={}) {
    const client=await this.pool.connect();let locked=false;
    try {
      const schema=(await client.query("SELECT to_regclass('notification_deliveries') AS deliveries,to_regclass('notification_delivery_items') AS items,to_regclass('notification_delivery_cursors') AS cursors")).rows[0];
      if(!schema.deliveries||!schema.items||!schema.cursors)return {ready:false};
      locked=(await client.query('SELECT pg_try_advisory_lock(734251,3) AS locked')).rows[0].locked;
      if(!locked)return {ready:true,busy:true};
      // A prior worker released its session lock while sending. Its SMTP
      // outcome cannot be inferred from SQL: hold for manual reconciliation.
      await client.query("UPDATE notification_deliveries SET state='uncertain',error_code='WORKER_INTERRUPTED' WHERE state='sending'");
      await this.generate(client,this.now());
      if(deliver) {
        const dueBefore=this.now();
        // Paginate memory use, not delivery cadence. All jobs already due at
        // this tick are drained; retries created here wait for a later tick.
        for(;;) {
          const due=(await client.query("SELECT * FROM notification_deliveries WHERE state IN ('pending','retry') AND available_at <= $1 ORDER BY available_at,id LIMIT 20",[dueBefore])).rows;
          if(!due.length)break;
          for(const delivery of due)await this.deliver(client,delivery);
        }
      }
      return {ready:true,busy:false};
    } finally {
      // Never return a session with a transaction or advisory lock to the pool.
      try {await client.query('ROLLBACK');if(locked)await client.query('SELECT pg_advisory_unlock(734251,3)');client.release();}
      catch(error){client.release(error);}
    }
  }
  async generate(client,now) {
    const users=(await client.query(`SELECT u.id FROM usuarios u JOIN LATERAL (${LATEST_PREF.replace('$1','u.id')}) p ON true WHERE u.activo=true AND p.recibir_notificaciones=true AND p.tipo_notificacion='email' ORDER BY u.id`)).rows;
    for(const {id} of users) {
      await client.query('BEGIN');
      try {
        const user=(await client.query('SELECT * FROM usuarios WHERE id=$1 FOR UPDATE',[id])).rows[0];
        const pref=(await client.query(LATEST_PREF,[id])).rows[0];
        if(!this.eligible(user,pref)){await client.query('COMMIT');continue;}
        let {from,until}=deliveryWindow(pref.frecuencia_notificaciones,now);
        const cursor=(await client.query('SELECT last_slot FROM notification_delivery_cursors WHERE usuario_id=$1 AND frequency=$2',[id,pref.frecuencia_notificaciones])).rows[0];
        if(cursor)from=cursor.last_slot;
        if(from>=until){await client.query('COMMIT');continue;}
        // Legacy timestamps follow the application's UTC storage convention.
        const existing=(await client.query('SELECT id FROM notification_deliveries WHERE usuario_id=$1 AND frequency=$2 AND slot=$3',[id,pref.frecuencia_notificaciones,until])).rowCount;
        if(existing){await client.query('COMMIT');continue;}
        const news=(await client.query(`SELECT n.id,n.titulo,n.content_version,t.nombre AS tema_nombre FROM noticias n
          JOIN temas t ON t.id=n.tema_id AND t.activo=true
          JOIN preferencias_usuario_temas pt ON pt.tema_id=t.id AND pt.usuario_id=$1
          JOIN LATERAL (SELECT resultado,fecha_clasificacion FROM clasificacion_noticias WHERE noticia_id=n.id AND content_version=n.content_version ORDER BY fecha_clasificacion DESC,id DESC LIMIT 1) c ON true
          WHERE news_is_public(n) AND c.resultado='falsa' AND GREATEST(n.editorial_published_at,c.fecha_clasificacion AT TIME ZONE 'UTC') > $2
          AND GREATEST(n.editorial_published_at,c.fecha_clasificacion AT TIME ZONE 'UTC') <= $3
          AND NOT EXISTS(SELECT 1 FROM notificaciones WHERE usuario_id=$1 AND noticia_id=n.id)
          AND NOT EXISTS(SELECT 1 FROM notification_delivery_items WHERE usuario_id=$1 AND noticia_id=n.id)
          ORDER BY c.fecha_clasificacion,n.id`,[id,from,until])).rows;
        await client.query('INSERT INTO notification_delivery_cursors(usuario_id,frequency,last_slot) VALUES($1,$2,$3) ON CONFLICT(usuario_id,frequency) DO UPDATE SET last_slot=EXCLUDED.last_slot',[id,pref.frecuencia_notificaciones,until]);
        if(!news.length){await client.query('COMMIT');continue;}
        const delivery=(await client.query('INSERT INTO notification_deliveries(usuario_id,frequency,slot,available_at) VALUES($1,$2,$3,$3) RETURNING id',[id,pref.frecuencia_notificaciones,until])).rows[0];
        for(const item of news) {
          const notification=(await client.query(`INSERT INTO notificaciones(usuario_id,noticia_id,titulo,mensaje,tipo,enviada,fecha_creacion) VALUES($1,$2,$3,$4,'email',false,$5) RETURNING id`,[id,item.id,`Alerta: ${item.tema_nombre}`,`El análisis automático señaló posible desinformación en: ${item.titulo}. Consulta el análisis y sus fuentes.`,now.toISOString()])).rows[0];
          await client.query('INSERT INTO notification_delivery_items(delivery_id,usuario_id,noticia_id,notification_id,content_version) VALUES($1,$2,$3,$4,$5)',[delivery.id,id,item.id,notification.id,item.content_version]);
        }
        await client.query('COMMIT');
      } catch(error){await client.query('ROLLBACK');throw error;}
    }
  }
  eligible(user,pref,frequency) {return !!user?.activo&&!!user.email&&!!pref?.recibir_notificaciones&&pref.tipo_notificacion==='email'&&(!frequency||frequency===pref.frecuencia_notificaciones);}
  async current(client,delivery) {
    const user=(await client.query('SELECT * FROM usuarios WHERE id=$1 FOR UPDATE',[delivery.usuario_id])).rows[0];
    const pref=(await client.query(LATEST_PREF,[delivery.usuario_id])).rows[0];
    if(!this.eligible(user,pref,delivery.frequency))return {user,items:[]};
    const items=(await client.query(`SELECT i.id AS item_id,n.id,n.titulo,n.mensaje,n.noticia_id,t.nombre AS tema_nombre
      FROM notification_delivery_items i JOIN notificaciones n ON n.id=i.notification_id AND n.tipo='email'
      JOIN noticias no ON no.id=i.noticia_id JOIN temas t ON t.id=no.tema_id AND t.activo=true
      JOIN preferencias_usuario_temas pt ON pt.usuario_id=i.usuario_id AND pt.tema_id=t.id
      JOIN LATERAL (SELECT resultado FROM clasificacion_noticias WHERE noticia_id=no.id AND content_version=no.content_version ORDER BY fecha_clasificacion DESC,id DESC LIMIT 1) c ON c.resultado='falsa'
      WHERE news_is_public(no) AND i.content_version=no.content_version AND i.delivery_id=$1 AND i.excluded=false ORDER BY i.id`,[delivery.id])).rows;
    return {user,items};
  }
  async deliver(client,delivery) {
    // Record the intention durably BEFORE SMTP. A crash after this commit
    // never produces an automatic retry with an unknown provider outcome.
    const claimed=await client.query("UPDATE notification_deliveries SET state='sending',attempts=attempts+1 WHERE id=$1 AND state IN ('pending','retry') RETURNING id",[delivery.id]);
    if(!claimed.rowCount)return;
    await client.query('BEGIN');
    try {
      // Serialize account/preference writes through the user row during the
      // bounded SMTP call. A cancellation already committed wins this check.
      const {user,items}=await this.current(client,delivery);
      await client.query('UPDATE notification_delivery_items SET excluded=true WHERE delivery_id=$1 AND NOT(id=ANY($2::bigint[]))',[delivery.id,items.map(i=>i.item_id)]);
      if(!items.length){await client.query("UPDATE notification_deliveries SET state='cancelled',error_code='PREFERENCE_OR_CONTENT_CHANGED' WHERE id=$1",[delivery.id]);await client.query('COMMIT');return;}
      let outcome;
      try {
        const result=await this.send(user,items,`<healthcheck-delivery-${delivery.id}@notifications.healthcheck.invalid>`);
        if(!result?.accepted?.length || result?.rejected?.length)throw {responseCode:550};
        outcome={state:'sent',delay:0,code:null};
      } catch(error){outcome=retryOutcome(error,delivery.attempts+1);}
      const now=this.now();
      await client.query('UPDATE notification_deliveries SET state=$2,error_code=$3,available_at=$4,sent_at=$5 WHERE id=$1',[delivery.id,outcome.state,outcome.code,new Date(now.getTime()+outcome.delay),outcome.state==='sent'?now:null]);
      if(outcome.state==='sent')await client.query('UPDATE notificaciones SET enviada=true,fecha_envio=$2 WHERE id=ANY($1::int[])',[items.map(i=>i.id),now.toISOString()]);
      await client.query('COMMIT');
    } catch(error){await client.query('ROLLBACK');throw error;}
  }
}
module.exports={DeliveryWorker};

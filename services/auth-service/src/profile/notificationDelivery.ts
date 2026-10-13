import sequelize from '../config/db';
import {QueryTypes} from 'sequelize';

export async function notificationDelivery() {
  const [schema] = await sequelize.query<{ready:boolean}>("SELECT to_regclass('notification_deliveries') IS NOT NULL AND to_regclass('notification_delivery_items') IS NOT NULL AND to_regclass('notification_delivery_cursors') IS NOT NULL AS ready",{type:QueryTypes.SELECT});
  let enabled=false;
  if(schema.ready && process.env.NOTIFICATION_DELIVERY_ENABLED==='true' && process.env.HEALTHCHECK_DIAGNOSTIC!=='1' && process.env.NODE_ENV!=='test') {
    try {
      const base=process.env.NOTIFICATIONS_SERVICE_URL || 'http://127.0.0.1:3004';
      const response=await fetch(new URL('/',base),{signal:AbortSignal.timeout(1000)});
      const health=await response.json() as {delivery?:{enabled?:boolean;ready?:boolean;last_run?:string}};
      const last=Date.parse(health.delivery?.last_run || '');
      enabled=response.ok&&health.delivery?.enabled===true&&health.delivery?.ready===true&&Number.isFinite(last)&&Date.now()-last<20*60*1000;
    } catch { /* Unavailable worker means delivery is paused, never profile failure. */ }
  }
  return {schema_ready:schema.ready,delivery_enabled:enabled};
}

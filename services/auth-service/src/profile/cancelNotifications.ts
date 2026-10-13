import {QueryTypes,Transaction} from 'sequelize';
import sequelize from '../config/db';

// Caller holds the account row lock. Only unclaimed deliveries can be
// cancelled: sending/uncertain may already have been accepted by SMTP.
export async function cancelNotifications(id:number,transaction:Transaction,topic?:number) {
 const [schema]=await sequelize.query<{ready:boolean}>("SELECT to_regclass('notification_deliveries') IS NOT NULL AND to_regclass('notification_delivery_items') IS NOT NULL AS ready",{type:QueryTypes.SELECT,transaction});
 if(!schema.ready)return;
 await sequelize.query(`UPDATE notification_delivery_items i SET excluded=true
  FROM notification_deliveries d,noticias n
  WHERE i.delivery_id=d.id AND i.noticia_id=n.id AND i.usuario_id=:id
  AND d.state IN ('pending','retry') ${topic===undefined?'':'AND n.tema_id=:topic'}`,
  {replacements:{id,topic:topic??null},transaction});
 await sequelize.query(`UPDATE notification_deliveries d SET state='cancelled',error_code='PREFERENCE_OR_CONTENT_CHANGED'
  WHERE d.usuario_id=:id AND d.state IN ('pending','retry')
  AND NOT EXISTS(SELECT 1 FROM notification_delivery_items i WHERE i.delivery_id=d.id AND i.excluded=false)`,{replacements:{id},transaction});
}

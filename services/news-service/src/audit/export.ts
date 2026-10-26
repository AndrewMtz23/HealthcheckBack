import ExcelJS from 'exceljs';
import {AdminError} from '../admin/query';
export async function workbookBuffer(rows:Record<string,any>[]):Promise<Buffer>{
 if(rows.length>5000)throw new AdminError(422,'Hay más de 5,000 registros. Reduce el rango o añade filtros para exportar.');
 const book=new ExcelJS.Workbook();book.creator='HealthCheck';
 const sheet=book.addWorksheet('Logs',{views:[{state:'frozen',ySplit:1}]});
 const columns=[['ID','id'],['Fecha UTC','occurred_at'],['Registrado UTC','recorded_at'],['Usuario','user_name'],['Correo','user_email'],['Actor','actor_type'],['Sensibilidad','sensitivity'],['Acción','action'],['Entidad','entity'],['Registro','entity_id'],['Servicio','service'],['Resultado','outcome'],['Descripción','description'],['Origen','origin']];
 sheet.columns=columns.map(([header,key])=>({header,key,width:key==='description'?60:24}));
 for(const row of rows){const values:Record<string,string>={};for(const [,key] of columns){const value=row[key];values[key]=value instanceof Date?value.toISOString():value==null?'':String(value);}sheet.addRow(values);}
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF2563EB'}};
 sheet.autoFilter={from:'A1',to:'N1'};
 return Buffer.from(await book.xlsx.writeBuffer());
}

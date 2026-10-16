const {test}=require('node:test'),assert=require('node:assert/strict');
const ExcelJS=require('../services/news-service/node_modules/exceljs');
const {workbookBuffer}=require('../services/news-service/dist/audit/export');
test('XLSX keeps formula-like strings as text and rejects 5001 rows',async()=>{
 const row={id:'1',description:'=HYPERLINK("https://example.invalid")',user_name:'+formula',user_email:'@name'};
 const buffer=await workbookBuffer(Array.from({length:5000},()=>row));
 const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);const sheet=book.worksheets[0];assert.equal(sheet.rowCount,5001);
 const cells=sheet.getRow(2).values;assert(cells.includes(row.description));
 sheet.getRow(2).eachCell(cell=>assert.notEqual(cell.type,ExcelJS.ValueType.Formula));
 await assert.rejects(()=>workbookBuffer(Array.from({length:5001},()=>row)),e=>e.status===422);
});

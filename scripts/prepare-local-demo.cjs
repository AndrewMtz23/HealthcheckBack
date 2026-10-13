// Explicitly authorized local phase-00 repair and synthetic news; never Neon.
const { Client } = require('../services/auth-service/node_modules/pg');
const { loadLocalConfig } = require('./diagnostic-config.cjs');

async function main() {
  const e = loadLocalConfig();
  const client = new Client({
    host: e.DB_HOST, port: Number(e.DB_PORT), database: e.DB_NAME,
    user: e.DB_USER, password: e.DB_PASSWORD,
    options: '-c statement_timeout=15000 -c lock_timeout=3000',
  });
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('healthcheck-local-demo'))");
    const identity = (await client.query('SELECT current_database() AS db')).rows[0];
    if (identity.db !== 'healtcheckbd') throw Error('Unexpected database');
    await client.query('ALTER TABLE public.noticias ADD COLUMN IF NOT EXISTS fecha_analisis TIMESTAMP');
    const column = (await client.query("SELECT data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='noticias' AND column_name='fecha_analisis'")).rows[0];
    if (column.data_type !== 'timestamp without time zone' || column.is_nullable !== 'YES') throw Error('Unexpected fecha_analisis definition');
    await client.query("ALTER TYPE public.resultado_enum ADD VALUE IF NOT EXISTS 'dudosa'");
    const items = [
      ['demo-1', '[DEMO] Noticia de prueba para explorar HealthCheck', null],
      ['demo-2', '[DEMO] Ejemplo de una clasificación positiva', 'verdadera'],
      ['demo-3', '[DEMO] Ejemplo de una clasificación negativa', 'falsa'],
    ];
    let inserted = 0;
    for (const [slug, title, label] of items) {
      const url = `https://example.invalid/healthcheck-demo/${slug}`;
      const existing = await client.query('SELECT id FROM public.noticias WHERE url=$1', [url]);
      if (existing.rowCount) continue; // Never overwrite an existing record.
      const row = (await client.query(
        'INSERT INTO public.noticias(titulo,contenido,url,fecha_publicacion,fecha_analisis) VALUES($1,$2,$3,CURRENT_TIMESTAMP,NULL) RETURNING id',
        [title, 'Contenido sintético de demostración para verificar el listado y el detalle. No es una noticia real, no contiene recomendaciones médicas y no fue analizado por BERT. Las etiquetas asociadas son ficticias.', url],
      )).rows[0];
      if (label) await client.query(
        'INSERT INTO public.clasificacion_noticias(noticia_id,resultado,confianza,explicacion) VALUES($1,$2,NULL,$3)',
        [row.id, label, 'Etiqueta sintética para probar la interfaz; no representa una verificación real ni una predicción del modelo.'],
      );
      inserted++;
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ database: 'healtcheckbd', insertedDemoNews: inserted, existingRecordsUnchanged: true }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Local demo preparation failed: ' + (error.code || error.message));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
main();

export type EditorialState = 'draft' | 'in_review' | 'published' | 'withdrawn';
export function isPublicNews(news: any): boolean {
 return news?.editorial_state === 'published' && (news.editorial_origin !== 'legacy' || (!!news.url?.trim() && !!news.fecha_publicacion));
}
export function currentClassification(news: any, classifications: any[]): any | null {
 return classifications.filter(c => c.content_version === news.content_version).sort((a,b) =>
  (Date.parse(b.fecha_clasificacion)||0)-(Date.parse(a.fecha_clasificacion)||0)||Number(b.id)-Number(a.id))[0] || null;
}
export function publicNews(news: any): any {
 const n = typeof news.toJSON === 'function' ? news.toJSON() : news;
 if (!isPublicNews(n)) return {id:n.id,available:false};
 const {editorial_reviewed_by,editorial_reviewed_at,editorial_reviewed_version,editorial_version,...safe}=n;
 const classifications=n.clasificaciones||[];
 const current=currentClassification(n,classifications);
 return {...safe,available:true,human_reviewed:!!editorial_reviewed_at && editorial_reviewed_version===editorial_version,
  analysis_status:current?'current':classifications.length?'outdated':'none',clasificaciones:current?[current]:[]};
}

/** Personal history may show the original imported analysis to its owner only.
 * Editorial edits and withdrawals continue to follow public visibility rules.
 */
export function historyNews(news: any, historyOwner: number, viewer: number): any {
 const n = typeof news.toJSON === 'function' ? news.toJSON() : news;
 if (isPublicNews(n)) return publicNews(n);
 const current = currentClassification(n, n.clasificaciones || []);
 if (!viewer || historyOwner !== viewer || n.editorial_state !== 'draft' ||
     n.editorial_origin !== 'imported' || n.editorial_version !== 1 ||
     n.content_version !== 1 || !current) return {id:n.id,available:false};
 return {id:n.id,titulo:n.titulo,contenido:n.contenido,url:n.url,
  fecha_publicacion:n.fecha_publicacion,tema:n.tema,fuente:n.fuente,
  available:true,private_analysis:true,human_reviewed:false,
  analysis_status:'current',clasificaciones:[current]};
}

// Registre des sources d'offres.
// Chaque source de veille expose : id, prefix, label, description, extract(text), jobUrl(id), fetchJob(id), search(params).
import * as linkedin from './linkedin.js';
import * as hellowork from './hellowork.js';
import * as euraxess from './euraxess.js';
import * as web from './web.js';

export { sleep, classifyType } from './util.js';

/** Sources utilisables pour la veille automatique */
export const SEARCH_SOURCES = [linkedin, hellowork, euraxess];
const ALL = [...SEARCH_SOURCES, web];

export const sourceById = (id) => SEARCH_SOURCES.find((s) => s.id === id);

/** Retrouve la source et l'identifiant à partir d'un external_id ("li:123", "hw:456", "url:https://…") */
export function parseExternal(ext = '') {
  const i = ext.indexOf(':');
  const source = ALL.find((s) => s.prefix === ext.slice(0, i));
  return source ? { source, id: ext.slice(i + 1), ext } : null;
}

/** Toutes les offres référencées dans un texte libre (liens de n'importe quel site, email d'alerte, IDs LinkedIn). */
export function extractRefs(text = '') {
  const refs = [];
  const seen = new Set();
  const push = (source, id) => {
    const ext = `${source.prefix}:${id}`;
    if (seen.has(ext)) return;
    seen.add(ext);
    refs.push({ source, id, ext });
  };
  for (const s of SEARCH_SOURCES) for (const id of s.extract(text)) push(s, id);
  for (const url of web.extractUrls(text)) {
    if (SEARCH_SOURCES.some((s) => s.extract(url).length)) continue;
    // liens LinkedIn qui ne sont pas des offres (profils, recherches sans offre…) : ignorés
    if (/linkedin\.com/i.test(url)) continue;
    const norm = web.normalize(url);
    if (norm) push(web, norm);
  }
  return refs;
}

/** Champs complets d'une offre pour une référence. */
export async function fetchRef(ref) {
  const offer = await ref.source.fetchJob(ref.id);
  const isWeb = ref.source === web;
  return {
    ...offer,
    url: isWeb ? ref.id : ref.source.jobUrl(ref.id),
    source: isWeb ? web.siteName(ref.id) : ref.source.label,
    external_id: ref.ext,
  };
}

export const sourceList = () => SEARCH_SOURCES.map(({ id, label, description }) => ({ id, label, description }));

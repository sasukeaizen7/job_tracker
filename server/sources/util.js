// Outils communs aux sources d'offres
import * as cheerio from 'cheerio';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

export async function get(url, { label = 'Le site', lang = 'fr-FR,fr;q=0.9,en;q=0.8' } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': lang, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 429) throw new Error(`${label} limite les requêtes (429) — réessaie plus tard`);
  if (res.status === 403) throw new Error(`${label} bloque l'accès automatique (403)`);
  if (!res.ok) throw new Error(`${label} a répondu HTTP ${res.status}`);
  return res.text();
}

export function htmlToText(html = '') {
  const h = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|ul|ol|h\d)>/gi, '\n');
  return cheerio
    .load(h)
    .text()
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Devine la catégorie à partir d'un intitulé. */
export function classifyType(text = '') {
  const t = text.toLowerCase();
  if (/(alternance|alternant|apprenti|apprentissage|work[- ]study|contrat pro)/.test(t)) return 'alternance';
  if (/(\bph\.?d\b|thèse|\bthese\b|doctorat|doctoral|doctorant|cifre)/.test(t)) return 'phd';
  if (/(\bstage\b|stagiaire|\bintern\b|internship)/.test(t)) return 'stage';
  return 'emploi';
}

export function detectRemote(text = '') {
  if (/(hybrid|hybride)/i.test(text)) return 'Hybride';
  if (/(remote|télétravail|teletravail|à distance)/i.test(text)) return 'Télétravail';
  return null;
}

const isoDay = (d) => (Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10));

/** "3 days ago", "il y a 5 jours", "hier"… → AAAA-MM-JJ approximatif */
export function relativeToDate(text = '') {
  const t = text.toLowerCase();
  if (/aujourd|today|heure|hour|minute/.test(t) && !/\d+\s*(jour|day|semaine|week|mois|month)/.test(t)) return isoDay(new Date());
  if (/hier|yesterday/.test(t)) return isoDay(new Date(Date.now() - 864e5));
  const m = /(\d+)\s*\+?\s*(jours?|days?|semaines?|weeks?|mois|months?|ans?|years?)/.exec(t);
  if (!m) return null;
  const unit = m[2].startsWith('j') || m[2].startsWith('d') ? 1 : m[2].startsWith('s') || m[2].startsWith('w') ? 7 : m[2].startsWith('m') ? 30 : 365;
  return isoDay(new Date(Date.now() - Number(m[1]) * unit * 864e5));
}

/** "8 October 2026", "6 Nov 2026 - 23:59", "03/10/2026", ISO… → AAAA-MM-JJ */
export function parseDate(text = '') {
  if (!text) return null;
  const fr = /(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  const iso = /(\d{4}-\d{2}-\d{2})/.exec(text);
  if (iso) return iso[1];
  const d = new Date(text.split(' - ')[0].trim() + ' 12:00 UTC');
  return isoDay(d);
}

/** Cherche un objet schema.org JobPosting dans les balises JSON-LD d'une page. */
export function findJobPosting($) {
  let found = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    try {
      const data = JSON.parse($(el).contents().text());
      const queue = [data].flat();
      while (queue.length && !found) {
        const x = queue.shift();
        if (!x || typeof x !== 'object') continue;
        const type = [x['@type']].flat();
        if (type.includes('JobPosting')) found = x;
        else if (x['@graph']) queue.push(...[x['@graph']].flat());
      }
    } catch {
      /* JSON-LD invalide : ignoré */
    }
  });
  return found;
}

export function jobPostingToOffer(jp) {
  const place = [jp.jobLocation].flat()[0]?.address || {};
  const salary = jp.baseSalary?.value;
  const salaryText =
    salary && (salary.minValue || salary.value)
      ? `${salary.minValue ?? salary.value}${salary.maxValue ? '–' + salary.maxValue : ''} ${jp.baseSalary.currency || ''} ${salary.unitText ? '/ ' + salary.unitText.toLowerCase() : ''}`.trim()
      : null;
  return {
    title: clean(cheerio.load(String(jp.title || '')).text()),
    company: clean(typeof jp.hiringOrganization === 'string' ? jp.hiringOrganization : jp.hiringOrganization?.name),
    location: [place.addressLocality, place.addressRegion, typeof place.addressCountry === 'string' ? place.addressCountry : place.addressCountry?.name]
      .filter(Boolean)
      .join(', ') || null,
    description: jp.description ? htmlToText(String(jp.description)) : null,
    contract: [jp.employmentType].flat().filter(Boolean).join(', ') || null,
    posted_at: parseDate(jp.datePosted || ''),
    deadline: parseDate(jp.validThrough || ''),
    salary: salaryText,
    remote: jp.jobLocationType === 'TELECOMMUTE' ? 'Télétravail' : null,
  };
}

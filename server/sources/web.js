// Import générique depuis n'importe quel lien d'offre (Welcome to the Jungle, ABG, sites carrières…).
// Utilise les données structurées schema.org JobPosting quand la page en contient, sinon les balises Open Graph.
import * as cheerio from 'cheerio';
import { classifyType, clean, findJobPosting, get, jobPostingToOffer } from './util.js';

export const id = 'web';
export const prefix = 'url';
export const label = 'Lien web';

const SITE_NAMES = [
  [/welcometothejungle/, 'Welcome to the Jungle'],
  [/indeed\./, 'Indeed'],
  [/abg\.asso\.fr/, 'ABG'],
  [/adum\.fr/, 'ADUM'],
  [/apec\.fr/, 'APEC'],
  [/francetravail|pole-emploi/, 'France Travail'],
  [/labonnealternance/, 'La bonne alternance'],
  [/jobteaser/, 'JobTeaser'],
  [/academicpositions/, 'Academic Positions'],
  [/findaphd/, 'FindAPhD'],
  [/glassdoor/, 'Glassdoor'],
  [/cnrs\.fr/, 'CNRS'],
  [/inria\.fr/, 'Inria'],
  [/cea\.fr/, 'CEA'],
  [/doctorat\.gouv|theses\.fr/, 'Doctorat.gouv'],
  [/lever\.co/, 'Lever (site carrière)'],
  [/greenhouse\.io/, 'Greenhouse (site carrière)'],
  [/myworkdayjobs/, 'Workday (site carrière)'],
  [/smartrecruiters/, 'SmartRecruiters (site carrière)'],
  [/teamtailor/, 'Teamtailor (site carrière)'],
];

export function siteName(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return SITE_NAMES.find(([re]) => re.test(host))?.[1] || host;
  } catch {
    return 'Web';
  }
}

/** URL nettoyée (sans ancre ni paramètres de tracking) — sert d'identifiant. */
export function normalize(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref|refId|trk|tracking|src|from)/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}

export function extractUrls(text = '') {
  return [...new Set((String(text).match(/https?:\/\/[^\s"'<>]+/g) || []).map((u) => u.replace(/[).,;]+$/, '')))];
}

export async function fetchJob(url) {
  const $ = cheerio.load(await get(url, { label: siteName(url) }));
  const jp = findJobPosting($);
  const offer = jp ? jobPostingToOffer(jp) : {};
  offer.title ||= clean($('meta[property="og:title"]').attr('content')) || clean($('title').text());
  offer.description ||= clean($('meta[property="og:description"]').attr('content') || $('meta[name=description]').attr('content')) || null;
  if (!offer.title) throw new Error('Impossible de lire cette page');
  offer.type = classifyType(`${offer.title} ${offer.contract || ''}`);
  return offer;
}

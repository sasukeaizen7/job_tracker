// EURAXESS (Commission européenne) : thèses, postdocs et postes de recherche en Europe.
import * as cheerio from 'cheerio';
import { classifyType, clean, get as httpGet, htmlToText, parseDate, sleep } from './util.js';

export const id = 'euraxess';
export const prefix = 'eu';
export const label = 'EURAXESS';
export const description = 'Thèses, postdocs, recherche — Europe';

const BASE = 'https://euraxess.ec.europa.eu';
const get = (url) => httpGet(url, { label: 'EURAXESS', lang: 'en-US,en;q=0.9' });

// Le filtre "type de poste" selon la catégorie de la veille
const POSITIONS = { phd: 'php_positions', stage: 'master_positions' };
const RANGE_DAYS = { r86400: 1, r604800: 7, r2592000: 30 };

let countries = null; // { "france": "793", ... }

async function countryId(location) {
  if (!location) return null;
  if (!countries) {
    const $ = cheerio.load(await get(`${BASE}/jobs/search`));
    countries = {};
    $('select[name="job_country[]"] option').each((_, o) => {
      const v = $(o).attr('value');
      if (v) countries[clean($(o).text()).toLowerCase()] = v;
    });
  }
  const key = location.toLowerCase().split(',').pop().trim();
  return countries[key] || null;
}

export function extract(text = '') {
  return [...new Set([...String(text).matchAll(/euraxess\.ec\.europa\.eu\/jobs\/(\d+)/gi)].map((m) => m[1]))];
}

export const jobUrl = (jobId) => `${BASE}/jobs/${jobId}`;

export async function fetchJob(jobId) {
  const $ = cheerio.load(await get(jobUrl(jobId)));
  const title = clean($('meta[property="og:title"]').attr('content')) || clean($('h1').text()).replace(/^Job offer/, '');
  if (!title) throw new Error('Offre EURAXESS introuvable ou expirée');

  const info = {};
  $('dt').each((_, dt) => {
    const k = clean($(dt).text());
    if (!(k in info)) info[k] = clean($(dt).next('dd').text());
  });

  const descHeading = $('h2').filter((_, h) => /Offer Description/i.test($(h).text())).first();
  const description = descHeading.length ? htmlToText(descHeading.next().html() || '') : null;
  const profile = info['Researcher Profile'] || '';
  const titleType = classifyType(title);

  return {
    title,
    company: info['Organisation/Company'] || info['Company/Institute'] || null,
    location: [info['City'], info['Country']].filter(Boolean).join(', ') || null,
    contract: [info['Type of Contract'], info['Job Status'], profile].filter(Boolean).join(' · ') || null,
    deadline: parseDate(info['Application Deadline'] || ''),
    description,
    // R1 = chercheur en début de carrière (doctorant)
    type: titleType === 'emploi' && /\(R1\)/.test(profile) ? 'phd' : titleType,
  };
}

export async function search({ keywords, location, time_range, type, max_pages = 3 }) {
  const out = [];
  const seen = new Set();
  const maxAge = RANGE_DAYS[time_range];
  const minDate = maxAge ? new Date(Date.now() - maxAge * 864e5).toISOString().slice(0, 10) : null;

  const p = new URLSearchParams({ keywords: keywords || '' });
  const filters = [];
  const country = await countryId(location);
  if (country) filters.push(`job_country:${country}`);
  if (POSITIONS[type]) filters.push(`positions:${POSITIONS[type]}`);
  filters.forEach((f, i) => p.set(`f[${i}]`, f));

  // EURAXESS affiche 10 offres par page, des plus récentes aux plus anciennes
  for (let page = 0; page < Math.min(Number(max_pages) || 1, 10) * 2; page++) {
    if (page > 0) p.set('page', String(page));
    let html;
    try {
      html = await get(`${BASE}/jobs/search?${p}`);
    } catch (e) {
      if (page > 0) break;
      throw e;
    }

    const $ = cheerio.load(html);
    let n = 0;
    let tooOld = false;
    $('h3.ecl-content-block__title a[href^="/jobs/"]').each((_, a) => {
      const jobId = /^\/jobs\/(\d+)$/.exec($(a).attr('href'))?.[1];
      if (!jobId) return;
      n++;
      const block = $(a).closest('.ecl-content-block');
      const meta = block.find('.ecl-content-block__primary-meta-item');
      const posted = parseDate(/Posted on:\s*(.+)/.exec(meta.text())?.[1] || '');
      if (minDate && posted && posted < minDate) {
        tooOld = true;
        return;
      }
      if (seen.has(jobId)) return;
      seen.add(jobId);
      const where = clean(block.find('.id-Work-Locations .ecl-text-standard').first().text()).replace(/^Number of offers:\s*\d+,\s*/, '');
      out.push({
        id: jobId,
        title: clean($(a).text()),
        company: clean(meta.first().text()),
        location: where.split(',')[0] || null,
        posted_at: posted,
        url: jobUrl(jobId),
      });
    });
    if (n === 0 || tooOld) break;
    await sleep(1200);
  }
  return out;
}

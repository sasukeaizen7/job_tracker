// LinkedIn : pages publiques "guest" (sans connexion), volume volontairement faible.
import * as cheerio from 'cheerio';
import { classifyType, clean, detectRemote, get as httpGet, htmlToText, relativeToDate, sleep } from './util.js';

export const id = 'linkedin';
export const prefix = 'li';
export const label = 'LinkedIn';
export const description = 'Toutes offres, monde entier';

const BASE = 'https://www.linkedin.com/jobs-guest/jobs/api';
const get = (url) => httpGet(url, { label: 'LinkedIn', lang: 'en-US,en;q=0.9,fr;q=0.8' });

/** Identifiants d'offres LinkedIn dans un texte (URLs, email d'alerte, IDs bruts). */
export function extract(text = '') {
  const ids = new Set();
  const re = /(?:linkedin\.com\/(?:comm\/)?jobs\/view\/(?:[^\s\/?#"'<>]*-)?|currentJobId=|jobPosting(?::|%3A))(\d{6,})/gi;
  for (const m of String(text).matchAll(re)) ids.add(m[1]);
  for (const m of String(text).matchAll(/(?:^|\s)(\d{9,11})(?=\s|$)/g)) ids.add(m[1]);
  return [...ids];
}

export const jobUrl = (jobId) => `https://www.linkedin.com/jobs/view/${jobId}/`;

export async function fetchJob(jobId) {
  const $ = cheerio.load(await get(`${BASE}/jobPosting/${jobId}`));
  const title = clean($('.top-card-layout__title, .topcard__title').first().text());
  if (!title) throw new Error('Offre LinkedIn introuvable ou expirée');

  const criteria = {};
  $('.description__job-criteria-item').each((_, el) => {
    criteria[clean($(el).find('.description__job-criteria-subheader').text())] = clean(
      $(el).find('.description__job-criteria-text').text(),
    );
  });
  const criterion = (re) => Object.entries(criteria).find(([k]) => re.test(k))?.[1] || '';
  const employment = criterion(/employment|emploi/i);
  const location = clean($('.topcard__flavor--bullet').first().text());
  const applicants = clean($('.num-applicants__caption, .num-applicants__figure').first().text());

  let type = classifyType(title);
  if (type === 'emploi' && /intern|stage/i.test(employment)) type = 'stage';

  return {
    title,
    company: clean($('.topcard__org-name-link').first().text()) || clean($('.topcard__flavor').first().text()) || null,
    location: location || null,
    description: htmlToText($('.show-more-less-html__markup').first().html() || '') || null,
    contract: [employment, criterion(/seniority|niveau/i)].filter(Boolean).join(' · ') || null,
    remote: detectRemote(`${title} ${location}`),
    posted_at: relativeToDate(clean($('.posted-time-ago__text').first().text())),
    notes: applicants ? `LinkedIn : ${applicants}` : null,
    type,
  };
}

export async function search({ keywords, location, time_range, job_type, work_type, max_pages = 3 }) {
  const out = [];
  const seen = new Set();
  let start = 0;
  for (let page = 0; page < Math.min(Number(max_pages) || 1, 10); page++) {
    const p = new URLSearchParams({ keywords: keywords || '', location: location || '', sortBy: 'DD', start: String(start) });
    if (time_range) p.set('f_TPR', time_range);
    if (job_type) p.set('f_JT', job_type);
    if (work_type) p.set('f_WT', work_type);

    let html;
    try {
      html = await get(`${BASE}/seeMoreJobPostings/search?${p}`);
    } catch (e) {
      if (page > 0) break; // fin des résultats ou limitation : on garde ce qu'on a
      throw e;
    }

    const $ = cheerio.load(html);
    let n = 0;
    $('li').each((_, li) => {
      const card = $(li);
      const urn = card.find('[data-entity-urn]').attr('data-entity-urn') || '';
      const link = card.find('a.base-card__full-link, a[href*="/jobs/view/"]').first().attr('href') || '';
      const jobId = /(\d{6,})$/.exec(urn)?.[1] || extract(link)[0];
      if (!jobId) return;
      n++;
      if (seen.has(jobId)) return;
      seen.add(jobId);
      out.push({
        id: jobId,
        title: clean(card.find('.base-search-card__title').text()),
        company: clean(card.find('.base-search-card__subtitle').text()),
        location: clean(card.find('.job-search-card__location').text()),
        posted_at: card.find('time').attr('datetime') || null,
        url: jobUrl(jobId),
      });
    });
    if (n === 0) break;
    start += n;
    await sleep(1500);
  }
  return out;
}

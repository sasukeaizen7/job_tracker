// HelloWork : emplois, alternances et stages en France.
import * as cheerio from 'cheerio';
import { classifyType, clean, detectRemote, get as httpGet, parseDate, relativeToDate, sleep } from './util.js';

export const id = 'hellowork';
export const prefix = 'hw';
export const label = 'HelloWork';
export const description = 'Emploi, alternance, stage — France';

const BASE = 'https://www.hellowork.com/fr-fr';
const get = (url) => httpGet(url, { label: 'HelloWork' });

// Filtre "date de publication" de HelloWork
const DATE_FILTER = { r86400: 'd', r604800: 'w', r2592000: 'm' };
// Filtre "contrat" de HelloWork selon la catégorie de la veille
const CONTRACT_FILTER = { alternance: 'Alternance', stage: 'Stage' };

export function extract(text = '') {
  return [...new Set([...String(text).matchAll(/hellowork\.com\/[a-z-]+\/emplois\/(\d+)\.html/gi)].map((m) => m[1]))];
}

export const jobUrl = (jobId) => `${BASE}/emplois/${jobId}.html`;

export async function fetchJob(jobId) {
  const $ = cheerio.load(await get(jobUrl(jobId)));
  const titleEl = $('[data-cy=jobTitle]').first();
  const title = clean(titleEl.text());
  if (!title) throw new Error('Offre HelloWork introuvable ou expirée');

  const panel = $('#offer-panel');
  const tags = titleEl
    .closest('section, #offer-panel')
    .find('ul')
    .first()
    .find('li')
    .map((_, li) => clean($(li).text()))
    .get();

  const sections = [];
  panel.find('h2').each((_, h) => {
    const heading = clean($(h).text());
    if (!/missions|profil|infos|poste/i.test(heading)) return;
    const body = clean($(h).parent().text().replace($(h).text(), ''));
    if (body) sections.push(`${heading}\n${body}`);
  });

  const contract = tags.find((t) => /CDI|CDD|Alternance|Stage|Intérim|Freelance|Indépendant/i.test(t));
  const titleAndContract = `${title} ${contract || ''}`;
  return {
    title,
    company: clean(titleEl.next('a').text()) || null,
    location: tags[0] || null,
    contract: tags.slice(1, 3).join(' · ') || null,
    description: sections.join('\n\n') || clean($('meta[name=description]').attr('content')) || null,
    salary: tags.find((t) => /€/.test(t)) || null,
    remote: detectRemote(tags.join(' ')),
    posted_at: parseDate(/Publiée le ([\d/]+)/.exec(panel.text())?.[1] || ''),
    type: classifyType(titleAndContract),
  };
}

export async function search({ keywords, location, time_range, type, max_pages = 3 }) {
  const out = [];
  const seen = new Set();
  for (let page = 1; page <= Math.min(Number(max_pages) || 1, 10); page++) {
    const p = new URLSearchParams({ k: keywords || '', l: location || '' });
    if (DATE_FILTER[time_range]) p.set('d', DATE_FILTER[time_range]);
    if (CONTRACT_FILTER[type]) p.set('c', CONTRACT_FILTER[type]);
    if (page > 1) p.set('p', String(page));

    let html;
    try {
      html = await get(`${BASE}/emploi/recherche.html?${p}`);
    } catch (e) {
      if (page > 1) break;
      throw e;
    }

    const $ = cheerio.load(html);
    let n = 0;
    $('[data-cy=serpCard]').each((_, el) => {
      const card = $(el);
      const link = card.find('a[data-cy=offerTitle]').first();
      const jobId = /emplois\/(\d+)\.html/.exec(link.attr('href') || '')?.[1];
      if (!jobId) return;
      n++;
      if (seen.has(jobId)) return;
      seen.add(jobId);
      const ps = link.find('p');
      out.push({
        id: jobId,
        title: clean(ps.eq(0).text()),
        company: clean(ps.eq(1).text()),
        location: clean(card.find('[data-cy=localisationCard]').first().text()),
        posted_at: relativeToDate(clean(card.find('.text-grey-500').last().text())),
        url: jobUrl(jobId),
      });
    });
    if (n === 0) break;
    await sleep(1500);
  }
  return out;
}

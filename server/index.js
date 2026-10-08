import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, now, today } from './db.js';
import * as sources from './sources/index.js';

const PORT = Number(process.env.PORT) || 5174;
const AUTO_REFRESH_HOURS = Number(process.env.AUTO_REFRESH_HOURS ?? 6);

const STATUSES = {
  a_postuler: 'À postuler',
  postule: 'Postulé',
  entretien: 'Entretien',
  offre: 'Offre reçue',
  refuse: 'Refusé',
  abandonne: 'Abandonné',
};
const OFFER_FIELDS = [
  'title', 'company', 'location', 'type', 'contract', 'url', 'source', 'external_id', 'description', 'salary',
  'remote', 'status', 'priority', 'deadline', 'applied_at', 'posted_at', 'contact', 'notes', 'tags',
];
const SEARCH_FIELDS = ['name', 'source', 'keywords', 'location', 'time_range', 'job_type', 'work_type', 'type', 'max_pages', 'enabled'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function pick(body, fields) {
  const o = {};
  for (const f of fields) {
    if (body?.[f] === undefined) continue;
    const v = body[f];
    o[f] = v === '' ? null : typeof v === 'boolean' ? Number(v) : v;
  }
  return o;
}

const insertSql = (table, o) => {
  const keys = Object.keys(o);
  return `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((k) => '$' + k).join(', ')})`;
};
const updateSql = (table, o) => `UPDATE ${table} SET ${Object.keys(o).map((k) => `${k} = $${k}`).join(', ')} WHERE id = $id`;

// ---------- Offres ----------

const getOffer = (id) => db.prepare('SELECT * FROM offers WHERE id = ?').get(Number(id));
const offerByExternal = (ext) => db.prepare('SELECT * FROM offers WHERE external_id = ?').get(ext);

function addEvent(offerId, kind, message) {
  const r = db
    .prepare('INSERT INTO events (offer_id, kind, message, created_at) VALUES (?, ?, ?, ?)')
    .run(Number(offerId), kind, message, now());
  return db.prepare('SELECT * FROM events WHERE id = ?').get(r.lastInsertRowid);
}

function createOffer(data, message = 'Offre ajoutée') {
  const o = pick(data, OFFER_FIELDS);
  if (!o.title?.trim()) throw new HttpError(400, 'Le titre est obligatoire');
  o.type ||= 'emploi';
  o.status = STATUSES[o.status] ? o.status : 'a_postuler';
  o.priority ??= 2;
  if (['postule', 'entretien', 'offre', 'refuse'].includes(o.status) && !o.applied_at) o.applied_at = today();
  o.created_at = o.updated_at = now();
  const { lastInsertRowid } = db.prepare(insertSql('offers', o)).run(o);
  addEvent(lastInsertRowid, 'created', message);
  if (o.external_id) db.prepare("UPDATE inbox SET state = 'added' WHERE external_id = ?").run(o.external_id);
  return getOffer(lastInsertRowid);
}

async function importRef(ref, extra = {}) {
  const existing = offerByExternal(ref.ext);
  if (existing) return { status: 'exists', offer: existing };
  const fields = await sources.fetchRef(ref);
  for (const [k, v] of Object.entries(extra)) if (v) fields[k] = v;
  return { status: 'created', offer: createOffer(fields, `Importée depuis ${fields.source}`) };
}

// ---------- Veille (recherches sauvegardées) ----------

let running = null;

async function runSearch(s) {
  try {
    const source = sources.sourceById(s.source);
    if (!source) throw new Error(`Source inconnue : ${s.source}`);
    const jobs = await source.search(s);
    const ins = db.prepare(
      `INSERT OR IGNORE INTO inbox (external_id, search_id, title, company, location, url, posted_at, state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
    );
    let fresh = 0;
    for (const j of jobs) {
      const ext = `${source.prefix}:${j.id}`;
      if (offerByExternal(ext)) continue;
      fresh += Number(ins.run(ext, s.id, j.title, j.company, j.location, j.url, j.posted_at, now()).changes);
    }
    db.prepare('UPDATE searches SET last_run = ?, last_found = ?, last_new = ?, last_error = NULL WHERE id = ?').run(
      now(), jobs.length, fresh, s.id,
    );
    return { id: s.id, name: s.name, found: jobs.length, new: fresh };
  } catch (e) {
    db.prepare('UPDATE searches SET last_run = ?, last_error = ? WHERE id = ?').run(now(), e.message, s.id);
    return { id: s.id, name: s.name, error: e.message };
  }
}

function runSearches(list) {
  if (running) return running;
  running = (async () => {
    const results = [];
    for (const [i, s] of list.entries()) {
      if (i > 0) await sources.sleep(2500);
      results.push(await runSearch(s));
    }
    return results;
  })().finally(() => {
    running = null;
  });
  return running;
}

// ---------- API ----------

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/api/offers', (req, res) => {
  res.json(
    db.prepare('SELECT id, title, company, location, type, contract, url, source, external_id, salary, remote, status, priority, deadline, applied_at, posted_at, contact, tags, created_at, updated_at FROM offers ORDER BY updated_at DESC').all(),
  );
});

app.get('/api/offers/:id', (req, res) => {
  const offer = getOffer(req.params.id);
  if (!offer) throw new HttpError(404, 'Offre introuvable');
  offer.events = db.prepare('SELECT * FROM events WHERE offer_id = ? ORDER BY id DESC').all(offer.id);
  res.json(offer);
});

app.post('/api/offers', (req, res) => {
  if (req.body.external_id) {
    const existing = offerByExternal(req.body.external_id);
    if (existing) throw new HttpError(409, `Cette offre est déjà suivie (« ${existing.title} »)`);
  }
  res.status(201).json(createOffer(req.body));
});

app.patch('/api/offers/:id', (req, res) => {
  const cur = getOffer(req.params.id);
  if (!cur) throw new HttpError(404, 'Offre introuvable');
  const o = pick(req.body, OFFER_FIELDS);
  if ('title' in o && !o.title?.trim()) throw new HttpError(400, 'Le titre est obligatoire');
  if (o.status && !STATUSES[o.status]) throw new HttpError(400, 'Statut inconnu');
  if (o.status && o.status !== cur.status) {
    addEvent(cur.id, 'status', `${STATUSES[cur.status]} → ${STATUSES[o.status]}`);
    if (['postule', 'entretien', 'offre'].includes(o.status) && !cur.applied_at && !o.applied_at) o.applied_at = today();
  }
  o.updated_at = now();
  db.prepare(updateSql('offers', o)).run({ ...o, id: cur.id });
  res.json(getOffer(cur.id));
});

app.delete('/api/offers/:id', (req, res) => {
  const cur = getOffer(req.params.id);
  if (cur?.external_id) db.prepare("UPDATE inbox SET state = 'dismissed' WHERE external_id = ?").run(cur.external_id);
  db.prepare('DELETE FROM offers WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

app.post('/api/offers/:id/events', (req, res) => {
  if (!getOffer(req.params.id)) throw new HttpError(404, 'Offre introuvable');
  const message = String(req.body.message || '').trim();
  if (!message) throw new HttpError(400, 'Note vide');
  db.prepare('UPDATE offers SET updated_at = ? WHERE id = ?').run(now(), Number(req.params.id));
  res.status(201).json(addEvent(req.params.id, 'note', message));
});

app.delete('/api/events/:id', (req, res) => {
  db.prepare("DELETE FROM events WHERE id = ? AND kind = 'note'").run(Number(req.params.id));
  res.status(204).end();
});

app.get('/api/sources', (req, res) => res.json(sources.sourceList()));

// Import : liens d'offres (LinkedIn, HelloWork, EURAXESS ou tout autre site), email d'alerte, IDs LinkedIn
app.post('/api/import', async (req, res) => {
  const refs = sources.extractRefs(req.body.text).slice(0, 50);
  if (!refs.length) throw new HttpError(400, "Aucun lien d'offre trouvé dans le texte");
  const results = [];
  for (const [i, ref] of refs.entries()) {
    try {
      if (i > 0 && !offerByExternal(ref.ext)) await sources.sleep(1000);
      results.push({ id: ref.ext, ...(await importRef(ref, { type: req.body.type })) });
    } catch (e) {
      results.push({ id: ref.ext, status: 'error', error: e.message });
    }
  }
  res.json({ results });
});

// Prévisualisation (remplir le formulaire depuis une URL)
app.post('/api/preview', async (req, res) => {
  const [ref] = sources.extractRefs(req.body.url);
  if (!ref) throw new HttpError(400, "Ce lien n'est pas une offre reconnue");
  res.json(await sources.fetchRef(ref));
});

app.get('/api/searches', (req, res) => {
  res.json(
    db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM inbox i WHERE i.search_id = s.id AND i.state = 'new') AS pending
                FROM searches s ORDER BY s.id`).all(),
  );
});

app.post('/api/searches', (req, res) => {
  const o = pick(req.body, SEARCH_FIELDS);
  o.source ||= 'linkedin';
  const source = sources.sourceById(o.source);
  if (!source) throw new HttpError(400, 'Source inconnue');
  o.keywords = o.keywords?.trim() || '';
  if (!o.keywords && !o.location?.trim()) throw new HttpError(400, 'Indique au moins des mots-clés ou un lieu');
  o.name ||= `${o.keywords || o.location} (${source.label})`;
  o.created_at = now();
  const { lastInsertRowid } = db.prepare(insertSql('searches', o)).run(o);
  res.status(201).json(db.prepare('SELECT * FROM searches WHERE id = ?').get(lastInsertRowid));
});

app.patch('/api/searches/:id', (req, res) => {
  const o = pick(req.body, SEARCH_FIELDS);
  if (Object.keys(o).length) db.prepare(updateSql('searches', o)).run({ ...o, id: Number(req.params.id) });
  res.json(db.prepare('SELECT * FROM searches WHERE id = ?').get(Number(req.params.id)));
});

app.delete('/api/searches/:id', (req, res) => {
  db.prepare("DELETE FROM inbox WHERE search_id = ? AND state = 'new'").run(Number(req.params.id));
  db.prepare('DELETE FROM searches WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

app.post('/api/searches/:id/run', async (req, res) => {
  const s = db.prepare('SELECT * FROM searches WHERE id = ?').get(Number(req.params.id));
  if (!s) throw new HttpError(404, 'Recherche introuvable');
  res.json(await runSearches([s]));
});

app.post('/api/searches/run-all', async (req, res) => {
  res.json(await runSearches(db.prepare('SELECT * FROM searches WHERE enabled = 1').all()));
});

app.get('/api/inbox', (req, res) => {
  res.json(
    db.prepare(`SELECT i.*, s.name AS search_name FROM inbox i LEFT JOIN searches s ON s.id = i.search_id
                WHERE i.state = 'new' ORDER BY i.posted_at DESC, i.id DESC LIMIT 1000`).all(),
  );
});

app.get('/api/inbox/count', (req, res) => {
  res.json(db.prepare("SELECT COUNT(*) AS count FROM inbox WHERE state = 'new'").get());
});

app.post('/api/inbox/:id/add', async (req, res) => {
  const item = db.prepare('SELECT * FROM inbox WHERE id = ?').get(Number(req.params.id));
  if (!item) throw new HttpError(404, 'Élément introuvable');
  const search = item.search_id && db.prepare('SELECT * FROM searches WHERE id = ?').get(item.search_id);
  const extra = { type: search?.type, posted_at: item.posted_at };
  const ref = sources.parseExternal(item.external_id);
  let result;
  try {
    if (!ref) throw new Error('Source inconnue');
    result = await importRef(ref, extra);
  } catch {
    // Détails indisponibles : on garde le résumé de la carte
    result = {
      status: 'created',
      offer: createOffer(
        {
          title: item.title, company: item.company, location: item.location, url: item.url,
          source: ref?.source.label || 'Veille', external_id: item.external_id, posted_at: item.posted_at,
          type: extra.type || sources.classifyType(item.title),
        },
        'Ajoutée depuis la veille',
      ),
    };
  }
  db.prepare("UPDATE inbox SET state = 'added' WHERE id = ?").run(item.id);
  res.json(result);
});

app.post('/api/inbox/:id/dismiss', (req, res) => {
  db.prepare("UPDATE inbox SET state = 'dismissed' WHERE id = ?").run(Number(req.params.id));
  res.status(204).end();
});

app.post('/api/inbox/dismiss-all', (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : null;
  if (ids) {
    const st = db.prepare("UPDATE inbox SET state = 'dismissed' WHERE id = ?");
    for (const id of ids) st.run(id);
  } else db.prepare("UPDATE inbox SET state = 'dismissed' WHERE state = 'new'").run();
  res.status(204).end();
});

app.get('/api/export.csv', (req, res) => {
  const cols = ['id', 'title', 'company', 'location', 'type', 'status', 'priority', 'contract', 'remote', 'salary',
    'deadline', 'applied_at', 'posted_at', 'url', 'source', 'contact', 'tags', 'notes', 'created_at', 'updated_at'];
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = db.prepare('SELECT * FROM offers ORDER BY created_at').all();
  const csv = '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="candidatures-${today()}.csv"`);
  res.send(csv);
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue' }));

// Front compilé (npm start)
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Erreur serveur' });
});

app.listen(PORT, () => {
  console.log(`Tracker prêt : http://localhost:${PORT}`);
});

// Rafraîchissement automatique de la veille
if (AUTO_REFRESH_HOURS > 0) {
  const ms = AUTO_REFRESH_HOURS * 3600e3;
  const tick = () => {
    const due = db
      .prepare('SELECT * FROM searches WHERE enabled = 1 AND (last_run IS NULL OR last_run < ?)')
      .all(new Date(Date.now() - ms).toISOString());
    if (!due.length || running) return;
    runSearches(due).then((r) => {
      const fresh = r.reduce((n, x) => n + (x.new || 0), 0);
      console.log(`[veille] ${r.length} recherche(s) actualisée(s), ${fresh} nouvelle(s) offre(s)`);
    });
  };
  setTimeout(tick, 15_000);
  setInterval(tick, 15 * 60e3);
}

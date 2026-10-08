import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, sourceLabel, sourceOfExternal, SOURCES, timeAgo, toast, TYPES, typeLabel } from '../lib.js';

const TIME_RANGES = [
  ['r86400', '24 dernières heures'],
  ['r604800', '7 derniers jours'],
  ['r2592000', '30 derniers jours'],
  ['', 'Toutes dates'],
];
const JOB_TYPES = [
  ['', 'Tous contrats'],
  ['F', 'Temps plein'],
  ['P', 'Temps partiel'],
  ['C', 'CDD / Contrat'],
  ['T', 'Temporaire'],
  ['I', 'Stage'],
  ['O', 'Autre'],
];
const WORK_TYPES = [
  ['', 'Tous modes'],
  ['1', 'Sur site'],
  ['2', 'Télétravail'],
  ['3', 'Hybride'],
];
const SOURCE_HELP = {
  linkedin: 'Toutes offres, monde entier. Mots-clés avec OR et guillemets acceptés.',
  hellowork: 'Emploi, alternance et stage en France. La catégorie Alternance / Stage filtre le type de contrat.',
  euraxess: 'Thèses, postdocs et postes de recherche en Europe. Lieu = pays (ex. France). La catégorie Thèse filtre les offres PhD.',
};
const PRESETS = [
  { label: 'Thèses · EURAXESS', source: 'euraxess', keywords: '', location: 'France', type: 'phd', time_range: 'r2592000' },
  { label: 'Thèses · LinkedIn', source: 'linkedin', keywords: 'PhD OR thèse OR doctorat OR doctoral', type: 'phd' },
  { label: 'Alternances · HelloWork', source: 'hellowork', keywords: '', type: 'alternance' },
  { label: 'Alternances · LinkedIn', source: 'linkedin', keywords: 'alternance OR apprentissage', type: 'alternance' },
  { label: 'Stages · HelloWork', source: 'hellowork', keywords: '', type: 'stage' },
  { label: 'Emplois · LinkedIn', source: 'linkedin', keywords: '', type: 'emploi', job_type: 'F' },
];
const NEW_SEARCH = {
  source: 'linkedin', name: '', keywords: '', location: 'France', time_range: 'r604800', job_type: '', work_type: '', type: '', max_pages: 3,
};

export default function Watch({ onChanged, onOpen }) {
  const [searches, setSearches] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [form, setForm] = useState(null);
  const [running, setRunning] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(new Set());

  const load = useCallback(async () => {
    try {
      const [s, i] = await Promise.all([api.get('/searches'), api.get('/inbox')]);
      setSearches(s);
      setInbox(i);
    } catch (e) {
      toast(e.message, 'error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const bind = (k) => ({ value: form[k] ?? '', onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })) });

  async function saveSearch(e) {
    e.preventDefault();
    try {
      const body = { ...form, max_pages: Number(form.max_pages) };
      const saved = form.id ? await api.patch(`/searches/${form.id}`, body) : await api.post('/searches', body);
      setForm(null);
      await load();
      if (!form.id) run(saved.id);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function run(id) {
    setRunning(id ?? 'all');
    try {
      const results = id ? await api.post(`/searches/${id}/run`) : await api.post('/searches/run-all');
      const fresh = results.reduce((n, r) => n + (r.new || 0), 0);
      const errors = results.filter((r) => r.error);
      if (errors.length) toast(`${errors[0].name} : ${errors[0].error}`, 'error');
      else toast(`${fresh} nouvelle(s) offre(s) trouvée(s)`);
      await load();
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setRunning(null);
    }
  }

  async function removeSearch(s) {
    if (!confirm(`Supprimer la veille « ${s.name} » et ses offres non traitées ?`)) return;
    await api.del(`/searches/${s.id}`);
    if (filter === String(s.id)) setFilter('all');
    await load();
    onChanged();
  }

  async function toggle(s) {
    await api.patch(`/searches/${s.id}`, { enabled: s.enabled ? 0 : 1 });
    load();
  }

  async function add(item) {
    setAdding((set) => new Set(set).add(item.id));
    try {
      const r = await api.post(`/inbox/${item.id}/add`);
      setInbox((list) => list.filter((i) => i.id !== item.id));
      toast(r.status === 'exists' ? 'Déjà suivie' : `« ${r.offer.title} » ajoutée ✓`);
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setAdding((set) => {
        const next = new Set(set);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function dismiss(item) {
    setInbox((list) => list.filter((i) => i.id !== item.id));
    await api.post(`/inbox/${item.id}/dismiss`);
    onChanged();
  }

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inbox.filter(
      (i) =>
        (filter === 'all' || String(i.search_id) === filter) &&
        (!needle || [i.title, i.company, i.location].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [inbox, filter, q]);

  async function dismissVisible() {
    if (!confirm(`Ignorer les ${visible.length} offres affichées ?`)) return;
    await api.post('/inbox/dismiss-all', { ids: visible.map((i) => i.id) });
    await load();
    onChanged();
  }

  return (
    <div className="watch">
      <div className="watch-side">
        <div className="panel">
          <div className="panel-head">
            <h3>Mes veilles</h3>
            <button className="btn small" onClick={() => run()} disabled={!!running || !searches.length}>
              {running === 'all' ? 'Recherche…' : '↻ Tout actualiser'}
            </button>
          </div>
          <p className="muted small">
            Recherches sauvegardées sur LinkedIn, HelloWork et EURAXESS, actualisées automatiquement toutes les 6 h tant que
            l’app tourne.
          </p>

          <ul className="searches">
            {searches.map((s) => (
              <li key={s.id} className={s.enabled ? '' : 'disabled'}>
                <div className="search-main" onClick={() => setFilter(String(s.id))}>
                  <span className={`source-tag src-${s.source}`}>{sourceLabel(s.source)}</span>
                  <strong>{s.name}</strong>
                  {s.pending > 0 && <span className="pill">{s.pending}</span>}
                  <div className="muted small">
                    {s.keywords ? `« ${s.keywords} »` : 'Tous mots-clés'}
                    {s.location ? ` · ${s.location}` : ''}
                    {s.type ? ` · ${typeLabel(s.type)}` : ''}
                  </div>
                  <div className="muted small">
                    {s.last_run ? `Actualisée ${timeAgo(s.last_run)} · ${s.last_found ?? 0} résultats` : 'Jamais lancée'}
                  </div>
                  {s.last_error && <div className="error small">⚠ {s.last_error}</div>}
                </div>
                <div className="search-actions">
                  <button className="btn small" onClick={() => run(s.id)} disabled={!!running}>
                    {running === s.id ? '…' : '↻'}
                  </button>
                  <button className="btn small" onClick={() => setForm(s)} title="Modifier">
                    ✎
                  </button>
                  <button className="btn small" onClick={() => toggle(s)} title={s.enabled ? 'Mettre en pause' : 'Réactiver'}>
                    {s.enabled ? '⏸' : '▶'}
                  </button>
                  <button className="btn small danger ghost" onClick={() => removeSearch(s)} title="Supprimer">
                    🗑
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {!form && (
            <>
              <button className="btn primary block" onClick={() => setForm({ ...NEW_SEARCH })}>
                + Nouvelle veille
              </button>
              <div className="presets">
                <span className="muted small">Modèles rapides :</span>
                {PRESETS.map(({ label, ...p }) => (
                  <button key={label} className={`chip type-${p.type}`} onClick={() => setForm({ ...NEW_SEARCH, ...p })}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {form && (
            <form className="search-form" onSubmit={saveSearch}>
              <div className="segmented" role="radiogroup" aria-label="Source">
                {SOURCES.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    role="radio"
                    aria-checked={form.source === s.id}
                    className={form.source === s.id ? 'on' : ''}
                    onClick={() => setForm((f) => ({ ...f, source: s.id }))}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="muted small">{SOURCE_HELP[form.source]}</p>
              <label>
                Mots-clés
                <input
                  autoFocus
                  placeholder={form.source === 'euraxess' ? 'ex. machine learning, chimie…' : 'ex. data scientist, développeur…'}
                  {...bind('keywords')}
                />
              </label>
              <label>
                Nom
                <input placeholder="ex. Thèses IA" {...bind('name')} />
              </label>
              <label>
                {form.source === 'euraxess' ? 'Pays' : 'Lieu'}
                <input
                  placeholder={form.source === 'euraxess' ? 'France, Germany, Switzerland…' : 'France, Paris, Lyon…'}
                  {...bind('location')}
                />
              </label>
              <div className="row">
                <label>
                  Publiée
                  <select {...bind('time_range')}>
                    {TIME_RANGES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Pages (×10)
                  <input type="number" min="1" max="10" {...bind('max_pages')} />
                </label>
              </div>
              {form.source === 'linkedin' && (
              <div className="row">
                <label>
                  Contrat LinkedIn
                  <select {...bind('job_type')}>
                    {JOB_TYPES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Mode
                  <select {...bind('work_type')}>
                    {WORK_TYPES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              )}
              <label>
                Classer les offres comme
                <select {...bind('type')}>
                  <option value="">Détection automatique</option>
                  {TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="row end">
                <button type="button" className="btn" onClick={() => setForm(null)}>
                  Annuler
                </button>
                <button className="btn primary">{form.id ? 'Enregistrer' : 'Créer et lancer'}</button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="watch-main">
        <div className="inbox-head">
          <h3>
            Nouvelles offres <span className="muted">({visible.length})</span>
          </h3>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Toutes les veilles</option>
            {searches.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
          <input className="search" placeholder="Filtrer…" value={q} onChange={(e) => setQ(e.target.value)} />
          {visible.length > 0 && (
            <button className="btn small ghost" onClick={dismissVisible}>
              Tout ignorer
            </button>
          )}
        </div>

        {!visible.length && (
          <div className="empty">
            {searches.length
              ? 'Aucune nouvelle offre. Lance une actualisation ou crée une autre veille.'
              : 'Crée ta première veille (ex. « Thèses · EURAXESS » ou « Alternances · HelloWork ») pour récupérer automatiquement les nouvelles offres.'}
          </div>
        )}

        <ul className="inbox">
          {visible.map((i) => (
            <li key={i.id}>
              <div className="inbox-main">
                <a href={i.url} target="_blank" rel="noreferrer" className="strong">
                  {i.title}
                </a>
                <div className="muted">
                  {i.company} · {i.location}
                </div>
                <div className="muted small">
                  <span className={`source-tag src-${sourceOfExternal(i.external_id)?.id}`}>
                    {sourceOfExternal(i.external_id)?.label}
                  </span>
                  {i.posted_at ? `Publiée ${timeAgo(i.posted_at)}` : ''} {i.search_name ? `· ${i.search_name}` : ''}
                </div>
              </div>
              <div className="inbox-actions">
                <button className="btn small primary" onClick={() => add(i)} disabled={adding.has(i.id)}>
                  {adding.has(i.id) ? '…' : '+ Suivre'}
                </button>
                <button className="btn small ghost" onClick={() => dismiss(i)}>
                  Ignorer
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api, fmtDate, PRIORITIES, STATUSES, toast, TYPES } from '../lib.js';

const EMPTY = { title: '', company: '', location: '', type: 'emploi', status: 'a_postuler', priority: 2, source: '' };

export default function OfferModal({ offer, onClose, onChanged }) {
  const isNew = !offer.id;
  const [form, setForm] = useState({ ...EMPTY, ...offer });
  const [events, setEvents] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('details');

  useEffect(() => {
    if (isNew) return;
    api
      .get(`/offers/${offer.id}`)
      .then((d) => {
        setForm(d);
        setEvents(d.events);
      })
      .catch((e) => toast(e.message, 'error'));
  }, [offer.id, isNew]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const bind = (k) => ({ value: form[k] ?? '', onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })) });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (isNew) await api.post('/offers', form);
      else await api.patch(`/offers/${offer.id}`, form);
      toast(isNew ? 'Offre ajoutée ✓' : 'Modifications enregistrées ✓');
      onChanged();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function fillFromLink() {
    if (!form.url) return toast('Colle d’abord le lien de l’offre', 'error');
    setBusy(true);
    try {
      const data = await api.post('/preview', { url: form.url });
      setForm((f) => {
        const next = { ...f };
        for (const [k, v] of Object.entries(data)) if (v && !f[k]) next[k] = v;
        next.external_id = data.external_id;
        next.url = data.url;
        next.source = data.source;
        if (f.type === 'emploi') next.type = data.type;
        return next;
      });
      toast(`Champs remplis depuis ${data.source} ✓`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function addNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    try {
      const ev = await api.post(`/offers/${offer.id}/events`, { message: note });
      setEvents((list) => [ev, ...list]);
      setNote('');
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function deleteNote(id) {
    await api.del(`/events/${id}`);
    setEvents((list) => list.filter((ev) => ev.id !== id));
  }

  async function remove() {
    if (!confirm(`Supprimer « ${form.title} » ? Cette action est définitive.`)) return;
    try {
      await api.del(`/offers/${offer.id}`);
      toast('Offre supprimée');
      onChanged();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={save}>
        <header className="modal-head">
          <div>
            <h2>{isNew ? 'Nouvelle offre' : form.title}</h2>
            {!isNew && (
              <p className="muted">
                {form.company} {form.location && `· ${form.location}`}
              </p>
            )}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        {!isNew && (
          <div className="tabs">
            {[
              ['details', 'Détails'],
              ['description', 'Annonce'],
              ['timeline', `Suivi (${events.length})`],
            ].map(([id, label]) => (
              <button type="button" key={id} className={'tab' + (view === id ? ' on' : '')} onClick={() => setView(id)}>
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="modal-body">
          {view === 'details' && (
            <div className="form-grid">
              <label className="span-2">
                Lien de l’annonce
                <div className="row">
                  <input type="url" placeholder="LinkedIn, HelloWork, EURAXESS, Welcome to the Jungle…" {...bind('url')} />
                  <button type="button" className="btn" onClick={fillFromLink} disabled={busy}>
                    {busy ? 'Lecture…' : 'Remplir depuis le lien'}
                  </button>
                </div>
              </label>
              <label className="span-2">
                Intitulé du poste *
                <input required autoFocus={isNew} {...bind('title')} />
              </label>
              <label>
                Entreprise / Labo / École
                <input {...bind('company')} />
              </label>
              <label>
                Lieu
                <input {...bind('location')} />
              </label>
              <label>
                Type
                <select {...bind('type')}>
                  {TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Statut
                <select {...bind('status')}>
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priorité
                <select {...bind('priority')}>
                  {PRIORITIES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Contrat / rythme
                <input placeholder="CDI, 3j/2j, 36 mois…" {...bind('contract')} />
              </label>
              <label>
                Date limite de candidature
                <input type="date" {...bind('deadline')} />
              </label>
              <label>
                Date de candidature
                <input type="date" {...bind('applied_at')} />
              </label>
              <label>
                Télétravail
                <select {...bind('remote')}>
                  <option value="">—</option>
                  <option>Sur site</option>
                  <option>Hybride</option>
                  <option>Télétravail</option>
                </select>
              </label>
              <label>
                Salaire / financement
                <input placeholder="45k€, contrat doctoral, CIFRE…" {...bind('salary')} />
              </label>
              <label>
                Contact (recruteur, directeur de thèse…)
                <input {...bind('contact')} />
              </label>
              <label>
                Source
                <input list="sources" {...bind('source')} />
                <datalist id="sources">
                  {['LinkedIn', 'HelloWork', 'EURAXESS', 'Welcome to the Jungle', 'Indeed', 'ABG', 'ADUM', 'APEC', 'France Travail', 'JobTeaser', 'Site entreprise', 'Réseau', 'Candidature spontanée', 'Autre'].map(
                    (s) => (
                      <option key={s} value={s} />
                    ),
                  )}
                </datalist>
              </label>
              <label className="span-2">
                Tags (séparés par des virgules)
                <input placeholder="data, IA, Paris" {...bind('tags')} />
              </label>
              <label className="span-2">
                Notes
                <textarea rows={4} {...bind('notes')} />
              </label>
              {isNew && (
                <label className="span-2">
                  Description de l’annonce
                  <textarea rows={4} {...bind('description')} />
                </label>
              )}
            </div>
          )}

          {view === 'description' && (
            <div>
              <textarea className="description" rows={18} placeholder="Colle ici le texte de l’annonce" {...bind('description')} />
              {form.url && (
                <a className="btn" href={form.url} target="_blank" rel="noreferrer">
                  Ouvrir l’annonce ↗
                </a>
              )}
            </div>
          )}

          {view === 'timeline' && (
            <div className="timeline-wrap">
              <div className="row">
                <input
                  placeholder="Ajouter une note : relance envoyée, entretien RH le 12/10…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addNote(e)}
                />
                <button type="button" className="btn primary" onClick={addNote}>
                  Ajouter
                </button>
              </div>
              <ol className="timeline">
                {events.map((ev) => (
                  <li key={ev.id} className={`ev-${ev.kind}`}>
                    <span className="ev-date">{fmtDate(ev.created_at)}</span>
                    <span className="ev-msg">{ev.message}</span>
                    {ev.kind === 'note' && (
                      <button type="button" className="link-btn" onClick={() => deleteNote(ev.id)}>
                        supprimer
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <footer className="modal-foot">
          {!isNew && (
            <button type="button" className="btn danger ghost" onClick={remove}>
              Supprimer
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" disabled={busy}>
            {isNew ? 'Ajouter' : 'Enregistrer'}
          </button>
        </footer>
      </form>
    </div>
  );
}

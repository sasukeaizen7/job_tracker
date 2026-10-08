import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, toast, TYPES } from './lib.js';
import Dashboard from './components/Dashboard.jsx';
import Board from './components/Board.jsx';
import OfferList from './components/OfferList.jsx';
import Watch from './components/Watch.jsx';
import Import from './components/Import.jsx';
import OfferModal from './components/OfferModal.jsx';
import Toaster from './components/Toaster.jsx';

const TABS = [
  { id: 'dashboard', label: 'Tableau de bord', icon: '◧' },
  { id: 'board', label: 'Kanban', icon: '▥' },
  { id: 'list', label: 'Liste', icon: '☰' },
  { id: 'watch', label: 'Veille', icon: '◉' },
  { id: 'import', label: 'Importer / Exporter', icon: '⇅' },
];

export default function App() {
  const [tab, setTab] = useState(() => (TABS.some((t) => t.id === location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard'));
  const [offers, setOffers] = useState([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');

  const load = useCallback(async () => {
    try {
      const [list, inbox] = await Promise.all([api.get('/offers'), api.get('/inbox/count')]);
      setOffers(list);
      setInboxCount(inbox.count);
    } catch (e) {
      toast(e.message, 'error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    history.replaceState(null, '', location.pathname + location.search + '#' + tab);
  }, [tab]);

  // Paramètres envoyés par le bouton favori : ?add=<lien de l'offre>&title=<titre de la page>
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const add = p.get('add');
    if (!add) return;
    history.replaceState(null, '', location.pathname + location.hash);
    // Si la page ne peut pas être lue (site protégé…), on ouvre le formulaire pré-rempli
    const manual = (msg) => {
      if (msg) toast(`${msg} — complète la fiche à la main`, 'error');
      setEditing({ url: /^https?:/.test(add) ? add : '', title: p.get('title') || '', source: '' });
    };
    toast('Import de l’offre…');
    api
      .post('/import', { text: add })
      .then(({ results: [r] }) => {
        if (!r?.offer) return manual(r?.error || 'Import impossible');
        toast(r.status === 'exists' ? 'Offre déjà suivie' : 'Offre importée ✓');
        load();
        setEditing(r.offer);
      })
      .catch((e) => manual(e.message));
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return offers.filter(
      (o) =>
        (type === 'all' || o.type === type) &&
        (!needle ||
          [o.title, o.company, o.location, o.tags, o.contact].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [offers, q, type]);

  async function patchOffer(id, changes) {
    setOffers((list) => list.map((o) => (o.id === id ? { ...o, ...changes } : o)));
    try {
      const saved = await api.patch(`/offers/${id}`, changes);
      setOffers((list) => list.map((o) => (o.id === id ? saved : o)));
    } catch (e) {
      toast(e.message, 'error');
      load();
    }
  }

  const showFilters = tab === 'board' || tab === 'list';

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">🎯</span>
          <div>
            <strong>Candidatures</strong>
            <small>Emploi · PhD · Alternance</small>
          </div>
        </div>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={'nav-item' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
              <span className="nav-icon">{t.icon}</span>
              <span>{t.label}</span>
              {t.id === 'watch' && inboxCount > 0 && <span className="pill">{inboxCount}</span>}
              {(t.id === 'board' || t.id === 'list') && <span className="nav-count">{offers.length}</span>}
            </button>
          ))}
        </nav>
        <button className="btn primary block" onClick={() => setEditing({})}>
          + Nouvelle offre
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <h1>{TABS.find((t) => t.id === tab).label}</h1>
          {showFilters && (
            <div className="filters">
              <input
                className="search"
                placeholder="Rechercher titre, entreprise, ville, tag…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className="chips">
                {[{ id: 'all', label: 'Tous' }, ...TYPES].map((t) => (
                  <button
                    key={t.id}
                    className={'chip' + (type === t.id ? ' on' : '') + (t.id !== 'all' ? ` type-${t.id}` : '')}
                    onClick={() => setType(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </header>

        <section className="content">
          {tab === 'dashboard' && (
            <Dashboard offers={offers} inboxCount={inboxCount} onOpen={setEditing} goTo={setTab} onNew={() => setEditing({})} />
          )}
          {tab === 'board' && (
            <Board offers={filtered} onOpen={setEditing} onMove={(id, status) => patchOffer(id, { status })} />
          )}
          {tab === 'list' && <OfferList offers={filtered} onOpen={setEditing} onPatch={patchOffer} />}
          {tab === 'watch' && <Watch onChanged={load} onOpen={setEditing} />}
          {tab === 'import' && <Import onChanged={load} onOpen={setEditing} />}
        </section>
      </main>

      {editing && <OfferModal offer={editing} onClose={() => setEditing(null)} onChanged={load} />}
      <Toaster />
    </div>
  );
}

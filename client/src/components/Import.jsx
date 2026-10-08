import { useEffect, useRef, useState } from 'react';
import { api, toast, TYPES } from '../lib.js';

const LABELS = { created: 'Importée', exists: 'Déjà suivie', error: 'Erreur' };

export default function Import({ onChanged, onOpen }) {
  const [text, setText] = useState('');
  const [type, setType] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]);
  const bookmarklet = useRef(null);

  // React bloque les href "javascript:" : on l'assigne directement au DOM
  useEffect(() => {
    const origin = location.origin;
    const code = `javascript:(()=>{window.open('${origin}/?add='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank')})()`;
    bookmarklet.current?.setAttribute('href', code);
  }, []);

  async function runImport() {
    setBusy(true);
    setResults([]);
    try {
      const r = await api.post('/import', { text, type: type || undefined });
      setResults(r.results);
      const created = r.results.filter((x) => x.status === 'created').length;
      toast(`${created} offre(s) importée(s)`);
      if (created) setText('');
      onChanged();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="import">
      <div className="panel">
        <h3>Importer des offres</h3>
        <p className="muted">
          Colle un ou plusieurs liens d’offres — <strong>LinkedIn, HelloWork, EURAXESS</strong>, Welcome to the Jungle, ABG,
          sites carrières… — ou directement le contenu d’un <strong>email d’alerte</strong> : tous les liens sont détectés
          (50 max à la fois).
        </p>
        <textarea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'https://www.linkedin.com/jobs/view/4012345678/\nhttps://www.hellowork.com/fr-fr/emplois/82957719.html\nhttps://euraxess.ec.europa.eu/jobs/471568\n…'}
        />
        <div className="row">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Type : détection automatique</option>
            {TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                Type : {t.label}
              </option>
            ))}
          </select>
          <span className="spacer" />
          <button className="btn primary" onClick={runImport} disabled={busy || !text.trim()}>
            {busy ? 'Import en cours…' : 'Importer'}
          </button>
        </div>
        {results.length > 0 && (
          <ul className="results">
            {results.map((r) => (
              <li key={r.id} className={r.status}>
                <span className={`result-tag ${r.status}`}>{LABELS[r.status]}</span>
                {r.offer ? (
                  <button className="link-btn" onClick={() => onOpen(r.offer)}>
                    {r.offer.title} — {r.offer.company}
                  </button>
                ) : (
                  <span className="ellipsis">
                    {r.id.replace(/^url:/, '')} : {r.error}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <h3>Bouton « Ajouter au tracker »</h3>
        <p className="muted">
          Glisse ce bouton dans ta barre de favoris. Sur une offre (LinkedIn, HelloWork, EURAXESS ou n’importe quel site
          d’emploi), clique dessus : l’offre est ajoutée au tracker en un clic. Si le site ne se laisse pas lire, la fiche
          s’ouvre pré-remplie avec le lien et le titre.
        </p>
        <a ref={bookmarklet} className="bookmarklet" onClick={(e) => e.preventDefault()} draggable>
          🎯 Ajouter au tracker
        </a>
        <p className="muted small">L’application doit être lancée sur cette adresse ({location.origin}) pour que le bouton fonctionne.</p>
      </div>

      <div className="panel">
        <h3>Exporter</h3>
        <p className="muted">Toutes tes candidatures au format CSV (compatible Excel / Google Sheets).</p>
        <a className="btn" href="/api/export.csv">
          ⬇ Télécharger le CSV
        </a>
      </div>
    </div>
  );
}

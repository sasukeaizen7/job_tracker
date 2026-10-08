import { useMemo } from 'react';
import { APPLIED, daysSince, daysUntil, fmtDate, STATUSES, TYPES } from '../lib.js';
import { Deadline, TypeBadge } from './Badges.jsx';

function monday(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div className="hbar" key={r.label} title={`${r.label} : ${r.value}`}>
          <span className="hbar-label">{r.label}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="hbar-value">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({ offers, inboxCount, onOpen, goTo, onNew }) {
  const s = useMemo(() => {
    const applied = offers.filter((o) => APPLIED.includes(o.status) || (o.status === 'abandonne' && o.applied_at));
    const answered = applied.filter((o) => ['entretien', 'offre', 'refuse'].includes(o.status));
    const followUps = offers
      .filter((o) => o.status === 'postule' && o.applied_at && daysSince(o.applied_at) >= 10 && daysSince(o.updated_at) >= 7)
      .sort((a, b) => a.applied_at.localeCompare(b.applied_at));
    const deadlines = offers
      .filter((o) => ['a_postuler', 'postule'].includes(o.status) && o.deadline && daysUntil(o.deadline) >= 0 && daysUntil(o.deadline) <= 21)
      .sort((a, b) => a.deadline.localeCompare(b.deadline));

    const thisWeek = monday(new Date());
    const weeks = Array.from({ length: 10 }, (_, i) => {
      const start = new Date(thisWeek);
      start.setDate(start.getDate() - 7 * (9 - i));
      return { start, value: 0 };
    });
    for (const o of applied) {
      if (!o.applied_at) continue;
      const t = monday(o.applied_at + 'T00:00:00').getTime();
      const w = weeks.find((w) => w.start.getTime() === t);
      if (w) w.value++;
    }

    return {
      applied,
      rate: applied.length ? Math.round((answered.length / applied.length) * 100) : 0,
      interviews: offers.filter((o) => ['entretien', 'offre'].includes(o.status)).length,
      received: offers.filter((o) => o.status === 'offre').length,
      toApply: offers.filter((o) => o.status === 'a_postuler').length,
      followUps,
      deadlines,
      weeks,
      byStatus: STATUSES.map((st) => ({ label: st.label, value: offers.filter((o) => o.status === st.id).length })),
      byType: TYPES.map((t) => ({
        ...t,
        total: offers.filter((o) => o.type === t.id).length,
        applied: applied.filter((o) => o.type === t.id).length,
      })),
    };
  }, [offers]);

  if (!offers.length) {
    return (
      <div className="welcome">
        <h2>Bienvenue 👋</h2>
        <p>Commence à suivre tes candidatures Emploi, Thèse et Alternance :</p>
        <div className="welcome-actions">
          <button className="btn primary" onClick={() => goTo('watch')}>
            ◉ Créer une veille (LinkedIn, HelloWork, EURAXESS)
          </button>
          <button className="btn" onClick={() => goTo('import')}>
            ⇅ Importer des liens d’offres
          </button>
          <button className="btn" onClick={onNew}>
            + Ajouter une offre à la main
          </button>
        </div>
      </div>
    );
  }

  const weekMax = Math.max(1, ...s.weeks.map((w) => w.value));

  return (
    <div className="dashboard">
      <div className="kpis">
        <Kpi label="Offres suivies" value={offers.length} sub={`${s.toApply} à postuler`} />
        <Kpi label="Candidatures envoyées" value={s.applied.length} />
        <Kpi label="Taux de réponse" value={`${s.rate} %`} sub="entretien, offre ou refus" />
        <Kpi label="Entretiens" value={s.interviews} />
        <Kpi label="Offres reçues" value={s.received} />
        <Kpi label="Nouvelles offres (veille)" value={inboxCount} onClick={() => goTo('watch')} sub="Voir la veille →" />
      </div>

      <div className="grid">
        <div className="panel">
          <h3>Pipeline</h3>
          <Bars rows={s.byStatus} />
        </div>

        <div className="panel">
          <h3>Par type</h3>
          <table className="mini-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Suivies</th>
                <th>Candidatures</th>
              </tr>
            </thead>
            <tbody>
              {s.byType.map((t) => (
                <tr key={t.id}>
                  <td>
                    <TypeBadge type={t.id} />
                  </td>
                  <td>{t.total}</td>
                  <td>{t.applied}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel span-2">
          <h3>Candidatures par semaine</h3>
          <div className="vbars">
            {s.weeks.map((w) => {
              const label = w.start.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
              return (
                <div className="vbar" key={label} title={`Semaine du ${label} : ${w.value} candidature(s)`}>
                  <span className="vbar-value">{w.value || ''}</span>
                  <span className="vbar-track">
                    <span className="vbar-fill" style={{ height: `${(w.value / weekMax) * 100}%` }} />
                  </span>
                  <span className="vbar-label">{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <h3>À relancer</h3>
          <p className="muted small">Postulé il y a 10 jours ou plus, sans nouvelle depuis une semaine.</p>
          <ul className="item-list">
            {s.followUps.map((o) => (
              <li key={o.id} onClick={() => onOpen(o)}>
                <div>
                  <strong>{o.title}</strong>
                  <span className="muted"> · {o.company}</span>
                </div>
                <span className="muted small">postulé le {fmtDate(o.applied_at)}</span>
              </li>
            ))}
            {!s.followUps.length && <li className="muted none">Rien à relancer 👍</li>}
          </ul>
        </div>

        <div className="panel">
          <h3>Dates limites (3 semaines)</h3>
          <ul className="item-list">
            {s.deadlines.map((o) => (
              <li key={o.id} onClick={() => onOpen(o)}>
                <div>
                  <strong>{o.title}</strong>
                  <span className="muted"> · {o.company}</span>
                </div>
                <Deadline date={o.deadline} />
              </li>
            ))}
            {!s.deadlines.length && <li className="muted none">Aucune date limite proche</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, onClick }) {
  return (
    <div className={'kpi' + (onClick ? ' clickable' : '')} onClick={onClick}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

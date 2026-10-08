import { useMemo, useState } from 'react';
import { fmtDate, PRIORITIES, STATUSES } from '../lib.js';
import { Deadline, TypeBadge } from './Badges.jsx';

const COLUMNS = [
  { key: 'title', label: 'Poste' },
  { key: 'company', label: 'Organisation' },
  { key: 'type', label: 'Type' },
  { key: 'location', label: 'Lieu' },
  { key: 'status', label: 'Statut' },
  { key: 'priority', label: 'Priorité' },
  { key: 'deadline', label: 'Date limite' },
  { key: 'applied_at', label: 'Candidature' },
  { key: 'created_at', label: 'Ajoutée' },
];

export default function OfferList({ offers, onOpen, onPatch }) {
  const [sort, setSort] = useState({ key: 'created_at', dir: -1 });

  const rows = useMemo(() => {
    const order = STATUSES.map((s) => s.id);
    const val = (o) => (sort.key === 'status' ? order.indexOf(o.status) : o[sort.key] ?? '');
    return [...offers].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x === y) return 0;
      if (x === '') return 1;
      if (y === '') return -1;
      return (x > y ? 1 : -1) * sort.dir;
    });
  }, [offers, sort]);

  if (!offers.length) return <div className="empty">Aucune offre ne correspond.</div>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : 1 }))}
                aria-sort={sort.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}
              >
                {c.label}
                {sort.key === c.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} onClick={() => onOpen(o)}>
              <td className="strong">{o.title}</td>
              <td>{o.company}</td>
              <td>
                <TypeBadge type={o.type} />
              </td>
              <td className="muted">{o.location?.split(',')[0]}</td>
              <td onClick={(e) => e.stopPropagation()}>
                <select
                  className={`status-select status-${o.status}`}
                  value={o.status}
                  onChange={(e) => onPatch(o.id, { status: e.target.value })}
                >
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <select value={o.priority} onChange={(e) => onPatch(o.id, { priority: Number(e.target.value) })}>
                  {PRIORITIES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {o.deadline && (
                  <>
                    {fmtDate(o.deadline)} <Deadline date={o.deadline} />
                  </>
                )}
              </td>
              <td className="muted">{fmtDate(o.applied_at)}</td>
              <td className="muted">{fmtDate(o.created_at)}</td>
              <td onClick={(e) => e.stopPropagation()}>
                {o.url && (
                  <a href={o.url} target="_blank" rel="noreferrer" className="icon-link" title="Ouvrir l’annonce">
                    ↗
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

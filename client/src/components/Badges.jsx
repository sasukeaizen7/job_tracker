import { daysUntil, fmtDate, statusLabel, typeLabel } from '../lib.js';

export const TypeBadge = ({ type }) => <span className={`badge type-${type}`}>{typeLabel(type)}</span>;

export const StatusBadge = ({ status }) => (
  <span className={`badge status status-${status}`}>
    <i className="dot" />
    {statusLabel(status)}
  </span>
);

export function Priority({ value }) {
  if (Number(value) !== 3) return null;
  return (
    <span className="prio" title="Priorité haute">
      ★ Prioritaire
    </span>
  );
}

export function Deadline({ date }) {
  if (!date) return null;
  const n = daysUntil(date);
  const cls = n < 0 ? 'past' : n <= 3 ? 'urgent' : n <= 10 ? 'soon' : '';
  const text = n < 0 ? 'Expirée' : n === 0 ? "Aujourd'hui" : n === 1 ? 'Demain' : `J-${n}`;
  return (
    <span className={`deadline ${cls}`} title={`Date limite : ${fmtDate(date)}`}>
      ⏱ {text}
    </span>
  );
}

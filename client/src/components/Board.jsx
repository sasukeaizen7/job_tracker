import { useState } from 'react';
import { STATUSES, timeAgo } from '../lib.js';
import { Deadline, Priority, TypeBadge } from './Badges.jsx';

export default function Board({ offers, onOpen, onMove }) {
  const [over, setOver] = useState(null);

  return (
    <div className="board">
      {STATUSES.map((s) => {
        const items = offers
          .filter((o) => o.status === s.id)
          .sort((a, b) => b.priority - a.priority || b.updated_at.localeCompare(a.updated_at));
        return (
          <div
            key={s.id}
            className={'column' + (over === s.id ? ' over' : '')}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(s.id);
            }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = Number(e.dataTransfer.getData('text/plain'));
              const offer = offers.find((o) => o.id === id);
              if (offer && offer.status !== s.id) onMove(id, s.id);
            }}
          >
            <div className="column-head">
              <span className={`badge status status-${s.id}`}>
                <i className="dot" />
                {s.label}
              </span>
              <span className="count">{items.length}</span>
            </div>
            <div className="column-body">
              {items.map((o) => (
                <article
                  key={o.id}
                  className="card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', String(o.id))}
                  onClick={() => onOpen(o)}
                >
                  <div className="card-top">
                    <TypeBadge type={o.type} />
                    <Priority value={o.priority} />
                  </div>
                  <h3>{o.title}</h3>
                  <p className="muted">
                    {o.company || '—'}
                    {o.location ? ` · ${o.location.split(',')[0]}` : ''}
                  </p>
                  <div className="card-foot">
                    <Deadline date={o.deadline} />
                    <span className="muted small">
                      {o.applied_at ? `Postulé ${timeAgo(o.applied_at)}` : `Ajouté ${timeAgo(o.created_at)}`}
                    </span>
                  </div>
                </article>
              ))}
              {!items.length && <div className="empty-col">Glisse une offre ici</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

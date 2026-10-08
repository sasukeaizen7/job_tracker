// API, constantes et utilitaires partagés

async function req(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
  return data;
}

export const api = {
  get: (u) => req('GET', u),
  post: (u, b) => req('POST', u, b || {}),
  patch: (u, b) => req('PATCH', u, b),
  del: (u) => req('DELETE', u),
};

export const toast = (msg, kind = 'ok') => window.dispatchEvent(new CustomEvent('toast', { detail: { msg, kind } }));

export const STATUSES = [
  { id: 'a_postuler', label: 'À postuler' },
  { id: 'postule', label: 'Postulé' },
  { id: 'entretien', label: 'Entretien' },
  { id: 'offre', label: 'Offre reçue' },
  { id: 'refuse', label: 'Refusé' },
  { id: 'abandonne', label: 'Abandonné' },
];
export const TYPES = [
  { id: 'emploi', label: 'Emploi' },
  { id: 'phd', label: 'Thèse / PhD' },
  { id: 'alternance', label: 'Alternance' },
  { id: 'stage', label: 'Stage' },
];
export const PRIORITIES = [
  { id: 1, label: 'Basse' },
  { id: 2, label: 'Normale' },
  { id: 3, label: 'Haute' },
];
export const SOURCES = [
  { id: 'linkedin', prefix: 'li', label: 'LinkedIn' },
  { id: 'hellowork', prefix: 'hw', label: 'HelloWork' },
  { id: 'euraxess', prefix: 'eu', label: 'EURAXESS' },
];
export const sourceLabel = (id) => SOURCES.find((s) => s.id === id)?.label || id;
export const sourceOfExternal = (ext = '') => SOURCES.find((s) => ext.startsWith(s.prefix + ':'));

export const APPLIED = ['postule', 'entretien', 'offre', 'refuse'];

export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label || id;
export const typeLabel = (id) => TYPES.find((t) => t.id === id)?.label || id;

const toDate = (d) => new Date(d.length === 10 ? d + 'T00:00:00' : d);
const startOfToday = () => new Date(new Date().toDateString());

export const fmtDate = (d) =>
  d ? toDate(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
export const daysUntil = (d) => (d ? Math.round((toDate(d) - startOfToday()) / 864e5) : null);
export const daysSince = (d) => (d ? Math.floor((Date.now() - toDate(d)) / 864e5) : null);
export function timeAgo(d) {
  const n = daysSince(d);
  if (n == null) return '';
  if (n <= 0) return "aujourd'hui";
  if (n === 1) return 'hier';
  if (n < 30) return `il y a ${n} j`;
  if (n < 365) return `il y a ${Math.floor(n / 30)} mois`;
  return `il y a ${Math.floor(n / 365)} an${n >= 730 ? 's' : ''}`;
}

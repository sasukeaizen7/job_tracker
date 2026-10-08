import { useEffect, useState } from 'react';

let nextId = 1;

export default function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const onToast = (e) => {
      const id = nextId++;
      setItems((list) => [...list, { id, ...e.detail }]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), e.detail.kind === 'error' ? 6000 : 3000);
    };
    window.addEventListener('toast', onToast);
    return () => window.removeEventListener('toast', onToast);
  }, []);
  return (
    <div className="toaster" role="status">
      {items.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>
          {t.kind === 'error' ? '⚠ ' : ''}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

import { useEffect, useState } from 'react';

export function useHorloge(intervalMs = 30_000): string {
  const [texte, setTexte] = useState(() => formater(new Date()));

  useEffect(() => {
    setTexte(formater(new Date()));
    const iv = setInterval(() => setTexte(formater(new Date())), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);

  return texte;
}

function formater(date: Date): string {
  const jour = date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const heure = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${jour} — ${heure}`;
}

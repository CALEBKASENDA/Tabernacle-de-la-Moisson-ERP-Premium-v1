import { traduireErreur } from '../i18n/fr';

export function formatAuthError(status: number, bodyText: string, transportFailed: boolean): string {
  if (transportFailed) {
    if (typeof window !== 'undefined') {
      const { protocol, hostname } = window.location;
      if (protocol === 'tauri:' || hostname === 'tauri.localhost') {
        return 'Impossible de joindre l\'API interne. Fermez Tabernacle complètement puis relancez-le depuis le menu Démarrer.';
      }
    }
    return 'Impossible de joindre l\'API. Vérifiez que l\'application est démarrée (icône ou raccourci Tabernacle).';
  }
  if (!bodyText.trim()) {
    if (status === 503) {
      return 'L\'application démarre encore. Patientez quelques secondes puis réessayez.';
    }
    if (status === 502 || status === 504 || status === 0) {
      return 'Serveur API indisponible. Relancez Tabernacle de la Moisson ERP.';
    }
    return `Réponse vide du serveur (HTTP ${status})`;
  }

  let json: { error?: string };
  try {
    json = JSON.parse(bodyText) as { error?: string };
  } catch {
    return status >= 200 && status < 300
      ? 'Réponse serveur invalide'
      : `Erreur serveur (HTTP ${status})`;
  }

  if (status >= 200 && status < 300) {
    return 'Réponse serveur invalide';
  }

  const msg = json.error?.trim();
  if (status === 401 && msg) {
    return traduireErreur(msg);
  }
  if (msg && msg !== 'Internal Server Error') {
    return traduireErreur(msg);
  }
  if (status === 401) {
    return 'Identifiants invalides';
  }
  return `Erreur HTTP ${status}`;
}

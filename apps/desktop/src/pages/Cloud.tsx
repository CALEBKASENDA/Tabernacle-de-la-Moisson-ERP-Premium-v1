import { useCallback, useEffect, useState } from 'react';
import { api, type CloudPageData, type PortableExportLogEntry, type RemoteHealthResult } from '../api/client';
import { useAuth } from '../context/AuthContext';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(2)} Mo`;
}

const DEPLOY_STEPS = [
  {
    title: 'Créer une VM cloud',
    body: 'Ubuntu 22.04+, 1 vCPU, 2 Go RAM (Hetzner, DigitalOcean, OVH, AWS…). Notez l’IP publique.',
  },
  {
    title: 'Configurer le DNS',
    body: 'Enregistrement A : erp.votre-domaine.com → IP de la VM. Attendre la propagation.',
  },
  {
    title: 'Copier le projet sur la VM',
    body: 'ssh root@IP puis git clone ou scp du dossier Tabernacle ERP.',
  },
  {
    title: 'Configurer .env',
    body: 'DOMAIN, ACME_EMAIL, TABERNACLE_BOOTSTRAP_EMAIL/PASSWORD/NAME (obligatoires en production).',
  },
  {
    title: 'Lancer l’installation',
    body: 'sudo bash deploy/install-vm.sh — installe Docker, pare-feu, HTTPS et sauvegarde cron.',
  },
  {
    title: 'Accès mondial',
    body: 'Ouvrez https://erp.votre-domaine.com depuis n’importe où. Changez le mot de passe admin.',
  },
];

export function Cloud() {
  const { hasPermission, isSuperAdmin } = useAuth();
  const canConfigure = isSuperAdmin();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cloudData, setCloudData] = useState<CloudPageData | null>(null);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [publicLabel, setPublicLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<RemoteHealthResult | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [portablePath, setPortablePath] = useState('');
  const [exportingPortable, setExportingPortable] = useState(false);
  const [importingPortable, setImportingPortable] = useState(false);
  const [drives, setDrives] = useState<string[]>([]);
  const [selectedDrive, setSelectedDrive] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [portableHistory, setPortableHistory] = useState<PortableExportLogEntry[]>([]);

  const load = useCallback(async () => {
    setError('');
    try {
      const [cloudRes, localRes, drivesRes, historyRes] = await Promise.all([
        api.getCloudStatus(),
        api.getSystemLocal(),
        canConfigure ? api.getSystemDrives().catch(() => ({ data: [] as string[] })) : Promise.resolve({ data: [] as string[] }),
        canConfigure ? api.getPortableHistory().catch(() => ({ data: [] as PortableExportLogEntry[] })) : Promise.resolve({ data: [] as PortableExportLogEntry[] }),
      ]);
      setCloudData({
        ...cloudRes.data,
        local: localRes.data,
      });
      setDrives(drivesRes.data);
      if (drivesRes.data[0] && !selectedDrive) setSelectedDrive(drivesRes.data[0]);
      setPortableHistory(historyRes.data);
      setRemoteUrl(cloudRes.data.config.remoteUrl ?? '');
      setPublicLabel(cloudRes.data.config.publicLabel ?? '');
      setNotes(cloudRes.data.config.notes ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [canConfigure]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBrowseFolder = async () => {
    try {
      const res = await api.browseSystemFolder(portablePath || selectedDrive);
      if (res.data.path) setPortablePath(res.data.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parcours annulé');
    }
  };

  const handleSyncPush = async () => {
    setSyncing(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.pushCloudSync();
      setSuccess(res.data.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync échouée');
    } finally {
      setSyncing(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canConfigure) return;
    setError('');
    setSuccess('');
    try {
      await api.updateCloudConfig({ remoteUrl, publicLabel, notes });
      setSuccess('Configuration cloud enregistrée');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const url = remoteUrl.trim() || cloudData?.deployment.publicUrl || '';
      const res = await api.testRemoteCloud(url || undefined);
      setTestResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test échoué');
    } finally {
      setTesting(false);
    }
  };

  const handleBackup = async () => {
    if (!canConfigure) return;
    setBackingUp(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.createSystemBackup();
      setSuccess(`Sauvegarde créée : ${res.data.fileName} (${formatBytes(res.data.bytes)})`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sauvegarde échouée');
    } finally {
      setBackingUp(false);
    }
  };

  const handleExportPortable = async () => {
    if (!canConfigure || !portablePath.trim()) return;
    setExportingPortable(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.exportPortableData(portablePath.trim());
      setSuccess(
        `Export portable créé : ${res.data.packagePath} (${formatBytes(res.data.bytes)}) — vous pouvez utiliser cette clé sur un autre PC.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export impossible');
    } finally {
      setExportingPortable(false);
    }
  };

  const handleImportPortable = async () => {
    if (!canConfigure || !portablePath.trim()) return;
    setImportingPortable(true);
    setError('');
    setSuccess('');
    try {
      const check = await api.validatePortableData(portablePath.trim());
      if (!check.data.ok) {
        setError(check.data.errors.join(' ; '));
        return;
      }
      const res = await api.importPortableData(portablePath.trim());
      setSuccess(res.data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import impossible');
    } finally {
      setImportingPortable(false);
    }
  };

  const openUrl = (url: string) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="page-header">
        <h2>Cloud et accès distant</h2>
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      </div>
    );
  }

  const deployment = cloudData?.deployment;
  const isCloudServer = deployment?.deploymentMode === 'cloud-server';
  const accessUrl =
    deployment?.publicUrl ||
    cloudData?.config.remoteUrl ||
    (isCloudServer ? null : `http://127.0.0.1:${cloudData?.local?.port ?? 3847}`);

  return (
    <>
      <div className="page-header">
        <h2>Cloud et accès distant</h2>
        <p className="page-subtitle">
          Déployez sur un VPS pour utiliser l&apos;ERP partout dans le monde, ou configurez l&apos;URL de votre serveur cloud.
        </p>
      </div>

      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      <div className="cards" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="card-label">Mode de déploiement</div>
          <div className="card-value cloud-mode-badge">
            <span className={`cloud-status-dot ${isCloudServer ? 'online' : 'local'}`} />
            {isCloudServer ? 'Serveur cloud / VPS' : 'Local (poste de travail)'}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Accès réseau</div>
          <div className="card-value" style={{ fontSize: '0.95rem' }}>
            {deployment?.networkAccessible ? 'Mondial (0.0.0.0)' : 'Local uniquement'}
          </div>
        </div>
        <div className="card">
          <div className="card-label">HTTPS</div>
          <div className="card-value" style={{ fontSize: '0.95rem' }}>
            {deployment?.httpsEnabled ? 'Actif (Let\'s Encrypt)' : 'Non configuré'}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Base de données</div>
          <div className="card-value" style={{ fontSize: '0.95rem' }}>
            {cloudData?.local?.databaseExists
              ? formatBytes(cloudData.local.databaseBytes)
              : '—'}
          </div>
        </div>
      </div>

      {isCloudServer && deployment?.publicUrl && (
        <div className="panel cloud-banner" style={{ marginBottom: '1.5rem' }}>
          <h3>Serveur cloud actif</h3>
          <p>
            Cette instance est hébergée sur un VPS. Les utilisateurs peuvent se connecter depuis n&apos;importe où via :
          </p>
          <div className="cloud-url-row">
            <code className="cloud-url-display">{deployment.publicUrl}</code>
            <button type="button" className="btn btn-primary" onClick={() => openUrl(deployment.publicUrl!)}>
              Ouvrir l&apos;ERP
            </button>
          </div>
          {deployment.domain && (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
              Domaine : {deployment.domain}
            </p>
          )}
        </div>
      )}

      <div className="panel" style={{ marginBottom: '1.5rem' }}>
        <h3>URL du serveur distant</h3>
        <p style={{ color: 'var(--muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
          {isCloudServer
            ? 'URL publique de ce serveur (lecture seule si vous êtes déjà sur le VPS).'
            : 'Indiquez l’adresse de votre ERP hébergé sur un VPS (ex. https://erp.votre-eglise.org) pour tester la connexion et y accéder rapidement.'}
        </p>

        <form onSubmit={handleSave} className="form-grid" style={{ maxWidth: 640 }}>
          <div className="form-group">
            <label>URL publique du VPS</label>
            <input
              type="url"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="https://erp.votre-domaine.com"
              disabled={!canConfigure || isCloudServer}
            />
          </div>
          <div className="form-group">
            <label>Libellé (optionnel)</label>
            <input
              type="text"
              value={publicLabel}
              onChange={(e) => setPublicLabel(e.target.value)}
              placeholder="ERP Tabernacle — production"
              disabled={!canConfigure || isCloudServer}
            />
          </div>
          <div className="form-group">
            <label>Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Hébergeur, IP, contacts…"
              disabled={!canConfigure || isCloudServer}
            />
          </div>
          <div className="cloud-actions-row">
            {canConfigure && !isCloudServer && (
              <button type="submit" className="btn btn-primary">Enregistrer</button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleTest}
              disabled={testing || (!remoteUrl.trim() && !deployment?.publicUrl)}
            >
              {testing ? 'Test en cours…' : 'Tester la connexion'}
            </button>
            {accessUrl && (
              <button type="button" className="btn btn-ghost" onClick={() => openUrl(accessUrl)}>
                Ouvrir dans le navigateur
              </button>
            )}
          </div>
        </form>

        {testResult && (
          <div className={`cloud-test-result ${testResult.ok ? 'ok' : 'fail'}`}>
            <strong>{testResult.ok ? 'Connexion OK' : 'Connexion échouée'}</strong>
            <span>{testResult.message}</span>
            {testResult.latencyMs != null && <span>{testResult.latencyMs} ms</span>}
            <span className="cloud-test-url">{testResult.url}</span>
          </div>
        )}

        {cloudData?.config.lastRemoteCheckAt && (
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
            Dernier test : {new Date(cloudData.config.lastRemoteCheckAt).toLocaleString('fr-FR')}
            {' — '}
            {cloudData.config.lastRemoteCheckOk ? 'succès' : 'échec'}
          </p>
        )}

        {!canConfigure && !isCloudServer && (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
            Seuls les administrateurs peuvent modifier l&apos;URL distante.
          </p>
        )}
      </div>

      {!isCloudServer && canConfigure && (
        <div className="panel" style={{ marginBottom: '1.5rem' }}>
          <h3>Synchronisation cloud</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Envoie les événements en attente ({cloudData?.pendingSyncEvents ?? 0}) vers l&apos;URL cloud configurée.
          </p>
          <button type="button" className="btn btn-primary" onClick={handleSyncPush} disabled={syncing}>
            {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
          </button>
        </div>
      )}

      {!isCloudServer && canConfigure && (
        <div className="panel" style={{ marginBottom: '1.5rem' }}>
          <h3>Clé USB — continuer sur un autre PC</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Les données sont dans le dossier d&apos;installation (<code>{cloudData?.local?.dataDir}</code>).
          </p>
          <div className="form-grid" style={{ maxWidth: 640, marginTop: '1rem' }}>
            {drives.length > 0 && (
              <div className="form-group">
                <label>Lecteur</label>
                <select value={selectedDrive} onChange={(e) => { setSelectedDrive(e.target.value); setPortablePath(e.target.value); }}>
                  {drives.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Chemin USB ou dossier</label>
              <div className="cloud-actions-row">
                <input
                  type="text"
                  value={portablePath}
                  onChange={(e) => setPortablePath(e.target.value)}
                  placeholder="E:\TabernacleERP-Portable"
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn btn-ghost" onClick={handleBrowseFolder}>Parcourir…</button>
              </div>
            </div>
            <div className="cloud-actions-row">
              <button type="button" className="btn btn-primary" onClick={handleExportPortable} disabled={exportingPortable || !portablePath.trim()}>
                {exportingPortable ? 'Export…' : 'Exporter vers la clé USB'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleImportPortable} disabled={importingPortable || !portablePath.trim()}>
                {importingPortable ? 'Import…' : 'Importer depuis la clé USB'}
              </button>
            </div>
          </div>
          {portableHistory.length > 0 && (
            <ul className="security-checklist" style={{ marginTop: '1rem' }}>
              {portableHistory.slice(0, 5).map((h) => (
                <li key={h.id}>{h.direction === 'export' ? 'Export' : 'Import'} — {new Date(h.at).toLocaleString('fr-FR')} — <code>{h.packagePath}</code></li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="panel" style={{ marginBottom: '1.5rem' }}>
        <h3>Sauvegarde des données</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          {cloudData?.local?.description}
        </p>
        <ul className="security-checklist" style={{ marginTop: '1rem' }}>
          <li>Fichier principal : <code>{cloudData?.local?.databaseFile}</code></li>
          <li>
            Sauvegardes locales : {cloudData?.backups.count ?? 0} fichier(s)
            {cloudData?.backups.latestFile && ` — dernière : ${cloudData.backups.latestFile}`}
          </li>
          {cloudData?.autoBackupEnabled !== false && (
            <li>Sauvegarde automatique quotidienne active (rétention 14 jours)</li>
          )}
          {(cloudData?.pendingSyncEvents ?? 0) > 0 && (
            <li>Événements de synchronisation en attente : {cloudData?.pendingSyncEvents}</li>
          )}
          {isCloudServer && (
            <li>Sur VPS : sauvegarde automatique quotidienne via cron (deploy/install-vm.sh)</li>
          )}
        </ul>
        {canConfigure && (
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '1rem' }}
            onClick={handleBackup}
            disabled={backingUp || !cloudData?.local?.databaseExists}
          >
            {backingUp ? 'Sauvegarde…' : 'Créer une sauvegarde maintenant'}
          </button>
        )}
      </div>

      {!isCloudServer && (
        <div className="panel">
          <h3>Déployer sur un VPS (accès mondial 24/7)</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
            Hébergez l&apos;ERP sur une machine virtuelle (Hetzner, OVH, DigitalOcean, AWS…).
            Même interface, HTTPS automatique, utilisable depuis n&apos;importe quel navigateur.
          </p>
          <ol className="deploy-steps">
            {DEPLOY_STEPS.map((step, i) => (
              <li key={step.title}>
                <strong>{i + 1}. {step.title}</strong>
                <span>{step.body}</span>
              </li>
            ))}
          </ol>
          <div className="cloud-deploy-commands">
            <p><strong>Commandes sur la VM :</strong></p>
            <pre>{`sudo bash deploy/install-vm.sh
docker compose --profile production up -d
docker compose logs -f app`}</pre>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '1rem' }}>
            Documentation complète : <code>deploy/README.md</code> et <code>docs/10-deploy-vm-en-ligne.md</code>
          </p>
        </div>
      )}
    </>
  );
}

export function Help() {
  return (
    <>
      <div className="page-header">
        <h2>Aide &amp; guide utilisateur</h2>
        <p className="page-subtitle">Mode d&apos;emploi rapide pour trésoriers, comptables et administrateurs.</p>
      </div>

      <div className="panel">
        <h3>Démarrage</h3>
        <ul className="security-checklist">
          <li>Connectez-vous avec votre courriel et mot de passe.</li>
          <li>Super administrateur : changez d&apos;église via la liste « Église active » en haut ou dans le menu latéral.</li>
          <li>Configurez le taux USD/CDF du jour avant les saisies en CDF.</li>
          <li>Activez la répartition par fonds (Paramétrage → Fonds dédiés) si votre église suit plusieurs fonds.</li>
        </ul>
      </div>

      <div className="panel">
        <h3>Opérations financières</h3>
        <ul className="security-checklist">
          <li>Créez recettes, dépenses, mouvements caisse et banque dans Opérations.</li>
          <li>Joignez une pièce justificative (PDF, image) lors de la modification d&apos;une opération.</li>
          <li>Les périodes clôturées sont verrouillées — aucune modification possible.</li>
          <li>La suppression demande un motif et envoie l&apos;opération en corbeille (super admin).</li>
        </ul>
      </div>

      <div className="panel">
        <h3>Utilisateurs &amp; permissions</h3>
        <ul className="security-checklist">
          <li>Administration → Utilisateurs : créez des comptes et assignez églises, rôles et fonctionnalités.</li>
          <li>Vous pouvez créer un rôle personnalisé avec un jeu de permissions sur mesure.</li>
          <li>Réinitialisez le mot de passe d&apos;un utilisateur depuis la fiche utilisateur.</li>
        </ul>
      </div>

      <div className="panel">
        <h3>Sauvegardes, clé USB &amp; synchronisation</h3>
        <ul className="security-checklist">
          <li>Données dans le dossier d&apos;installation : <code>data\</code> (base SQLite, pièces jointes, sauvegardes).</li>
          <li>Export / import clé USB : Administration → Cloud, ou Menu Démarrer → Exporter / Importer depuis clé USB.</li>
          <li>Sauvegarde automatique quotidienne locale (14 derniers fichiers conservés).</li>
          <li>Sauvegarde manuelle : Administration → Cloud → « Créer une sauvegarde ».</li>
          <li>Chaque modification génère un événement de sync (journal prêt pour le cloud futur).</li>
        </ul>
      </div>

      <div className="panel">
        <h3>Sécurité des données</h3>
        <ul className="security-checklist">
          <li>SQLCipher : définissez <code>TABERNACLE_DB_KEY</code> dans <code>config\.env</code> pour chiffrer la base.</li>
          <li>Les sauvegardes incluent un hash SHA-256 pour vérifier l&apos;intégrité.</li>
          <li>Protégez l&apos;accès Windows et effectuez des exports USB réguliers.</li>
        </ul>
      </div>
    </>
  );
}

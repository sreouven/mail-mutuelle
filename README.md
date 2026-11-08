# Mail Mutuelle

Extension Chrome (Manifest V3) pour les secrétariats de centres de santé : depuis le dossier patient d'un logiciel médical web (compatible Desmos), elle ouvre en un clic un email Gmail prérempli pour la mutuelle ou le patient, ou préremplit le formulaire « Nouveau devis » d'un CRM.

- Lecture du dossier : nom, prénom, date de naissance, NIR (clé vérifiée), mutuelle, email, civilité.
- Modèles de messages et annuaire des mutuelles modifiables sans code.
- Rien n'est envoyé automatiquement ; aucun serveur, aucune donnée patient transmise à l'éditeur.
- Configuration imposable sur tout un parc via la console Google (voir `extension/schema.json`).

Code de l'extension : dossier `extension/`. Installation manuelle : `chrome://extensions` > Mode développeur > Charger l'extension non empaquetée > dossier `extension`.

Outil indépendant, non affilié à Intellio (Desmos) ni à Google. L'envoi de données de santé par email relève de la politique RGPD de chaque établissement.

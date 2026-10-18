## Pourquoi cette démo

Cette démo répond à une question simple : **jusqu'où peut-on aller, et à quelle vitesse, quand on part d'une base qui fait déjà le travail ingrat ?**

Tout ce que vous voyez dans Helio a été mis en place en une journée. Ce n'est pas un exploit de développeur : c'est la conséquence d'un choix d'architecture. Le DMS fournit d'entrée ce que chaque projet client finit par réécrire — et le projet n'a plus qu'à décrire son métier.

> [!NOTE]
> Chaque écran Helio est déclaré en TypeScript côté serveur, avec les blocs génériques du DMS. Aucune ligne de Vue n'a été écrite pour ces pages.

## Ce que le DMS fournit avant la première ligne

Quand vous démarrez un projet, ces briques sont déjà là, configurées et cohérentes entre elles :

- **Comptes et sécurité** — connexion, invitations, double authentification, sessions, mots de passe oubliés.
- **Rôles et permissions** — chaque page, chaque bloc, chaque bouton est une permission que l'éditeur de rôles sait afficher.
- **Multi-espace de travail** — plusieurs clients sur une même plateforme, données cloisonnées.
- **Tableaux complets** — filtres, recherche, tri, vues enregistrées, sélection groupée, export, archives, panneau latéral, affichage en cartes sur téléphone.
- **Formulaires** — validation, champs dépendants, adresses, relations, brouillon, ajout en ligne.
- **Tableaux de bord** — indicateurs, graphiques, périodes et comparaisons, temps réel.
- **Notifications, paramètres, langues, thème clair et sombre, recherche globale, palette de commandes.**

Le projet, lui, ne déclare que ce qui lui est propre : ses données, ses écrans, ses règles. C'est pour ça qu'une journée suffit.

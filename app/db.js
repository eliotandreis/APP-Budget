// Schéma identique à app/db.py côté PC — les deux doivent rester synchronisés,
// puisqu'ils lisent/écrivent le même fichier sur Google Drive.

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS comptes (
    id INTEGER PRIMARY KEY,
    nom TEXT NOT NULL,
    type TEXT NOT NULL,
    solde_initial REAL NOT NULL DEFAULT 0,
    devise TEXT NOT NULL DEFAULT 'EUR',
    date_creation TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    nom TEXT NOT NULL,
    type TEXT NOT NULL,
    categorie_parente_id INTEGER REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY,
    compte_id INTEGER NOT NULL REFERENCES comptes(id),
    date TEXT NOT NULL,
    montant REAL NOT NULL,
    libelle TEXT NOT NULL,
    categorie_id INTEGER REFERENCES categories(id),
    notes TEXT,
    import_hash TEXT,
    date_creation TEXT NOT NULL,
    date_modification TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS regles_categorisation (
    id INTEGER PRIMARY KEY,
    mot_cle TEXT NOT NULL,
    categorie_id INTEGER NOT NULL REFERENCES categories(id),
    priorite INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY,
    categorie_id INTEGER NOT NULL REFERENCES categories(id),
    mois TEXT NOT NULL,
    montant_alloue REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
    cle TEXT PRIMARY KEY,
    valeur TEXT
);
`;

/** Ouvre une base à partir de bytes existants, ou en crée une vierge si null. */
export function ouvrirDb(SQL, bytes) {
  const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  db.run(SCHEMA_SQL);
  db.run(
    "INSERT INTO meta (cle, valeur) VALUES ('schema_version', '1') " +
    "ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur"
  );
  return db;
}

/** SELECT paramétré -> tableau d'objets. */
export function requeter(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const lignes = [];
  while (stmt.step()) lignes.push(stmt.getAsObject());
  stmt.free();
  return lignes;
}

/** INSERT/UPDATE/DELETE paramétré. */
export function executer(db, sql, params = []) {
  db.run(sql, params);
}

/** Retourne les bytes actuels de la base (à envoyer vers Drive / IndexedDB). */
export function exporterBytes(db) {
  return db.export();
}

// ---------- Requêtes métier (miroir simplifié de app/routes.py) ----------

export function listerComptes(db) {
  const comptes = requeter(db, "SELECT * FROM comptes ORDER BY nom");
  return comptes.map((c) => {
    const [{ s }] = requeter(
      db, "SELECT COALESCE(SUM(montant), 0) AS s FROM transactions WHERE compte_id = ?", [c.id]
    );
    return { ...c, solde_actuel: c.solde_initial + s };
  });
}

export function listerCategories(db) {
  return requeter(db, "SELECT * FROM categories ORDER BY type, nom");
}

export function listerTransactionsRecentes(db, limite = 30) {
  return requeter(
    db, "SELECT * FROM transactions ORDER BY date DESC, id DESC LIMIT ?", [limite]
  );
}

export function ajouterTransaction(db, { compte_id, date, montant, libelle, categorie_id, notes }) {
  const maintenant = new Date().toISOString();
  executer(
    db,
    "INSERT INTO transactions (compte_id, date, montant, libelle, categorie_id, notes, " +
    "date_creation, date_modification) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [compte_id, date, montant, libelle, categorie_id || null, notes || null, maintenant, maintenant]
  );
}

export function tableauDeBord(db, mois) {
  const comptes = listerComptes(db);
  const [{ depenses }] = requeter(
    db, "SELECT COALESCE(SUM(montant), 0) AS depenses FROM transactions WHERE montant < 0 AND date LIKE ?",
    [`${mois}%`]
  );
  const [{ revenus }] = requeter(
    db, "SELECT COALESCE(SUM(montant), 0) AS revenus FROM transactions WHERE montant > 0 AND date LIKE ?",
    [`${mois}%`]
  );
  return { comptes, total_depenses: depenses, total_revenus: revenus };
}

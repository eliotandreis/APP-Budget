import * as DB from "./db.js";
import * as Drive from "./drive.js";
import { idbGet, idbSet } from "./storage.js";

let SQL = null;
let db = null;
let driveState = null; // { fileId, folderId, modifiedTime }

const $ = (id) => document.getElementById(id);

function euros(n) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
}

function toast(msg, isError = false) {
  const el = document.createElement("div");
  el.className = "toast";
  if (isError) el.style.background = "#dc2626";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function moisActuel() {
  return new Date().toISOString().slice(0, 7);
}

// ---------- Rendu ----------

function rendreDashboard() {
  if (!db) return;
  const dash = DB.tableauDeBord(db, moisActuel());

  $("soldes").innerHTML = dash.comptes.map((c) => `
    <div class="card">
      <div class="label">${c.nom}</div>
      <div class="stat">${euros(c.solde_actuel)}</div>
    </div>
  `).join("") || '<p class="label">Aucun compte (crée-les depuis l\'app PC).</p>';

  $("total-depenses").textContent = euros(dash.total_depenses);
  $("total-revenus").textContent = euros(dash.total_revenus);
}

function rendreSelects() {
  const comptes = DB.listerComptes(db);
  const categories = DB.listerCategories(db);
  $("select-compte").innerHTML = comptes.map((c) => `<option value="${c.id}">${c.nom}</option>`).join("");
  $("select-categorie").innerHTML =
    '<option value="">(aucune)</option>' +
    categories.map((c) => `<option value="${c.id}">${c.nom}</option>`).join("");
}

function rendreTransactions() {
  const txs = DB.listerTransactionsRecentes(db, 30);
  const comptes = DB.listerComptes(db);
  const categories = DB.listerCategories(db);
  const nomCompte = (id) => comptes.find((c) => c.id === id)?.nom || "?";
  const nomCategorie = (id) => categories.find((c) => c.id === id)?.nom || "—";

  $("transactions-liste").innerHTML = txs.map((t) => `
    <div class="ligne-tx">
      <div>
        <strong>${t.libelle}</strong><br>
        <span class="label">${t.date} · ${nomCompte(t.compte_id)} · ${nomCategorie(t.categorie_id)}</span>
      </div>
      <div class="montant ${t.montant < 0 ? "negatif" : "positif"}">${euros(t.montant)}</div>
    </div>
  `).join("") || '<p class="label">Aucune transaction.</p>';
}

function rendreTout() {
  rendreDashboard();
  rendreSelects();
  rendreTransactions();
  $("zone-app").classList.remove("hidden");
  $("zone-connexion").classList.add("hidden");
}

// ---------- Sauvegarde (locale + Drive) ----------

async function sauvegarder() {
  const bytes = DB.exporterBytes(db);
  await idbSet("db_bytes", bytes);

  if (!driveState) return; // pas encore connecté à Drive (ne devrait pas arriver ici)

  try {
    const nouveauModifiedTime = await Drive.televerser(driveState.fileId, bytes, driveState.modifiedTime);
    driveState.modifiedTime = nouveauModifiedTime;
    await idbSet("drive_state", driveState);
    $("statut-synchro").textContent = "Synchronisé avec Drive à " + new Date().toLocaleTimeString("fr-FR");
  } catch (err) {
    if (err instanceof Drive.ConflitDrive) {
      toast(err.message, true);
    } else {
      toast("Enregistré en local, envoi vers Drive échoué : " + err.message, true);
    }
  }
}

// ---------- Connexion Drive ----------

async function connecterDrive() {
  try {
    await Drive.demanderAcces();
  } catch (err) {
    toast(err.message, true);
    return;
  }

  try {
    const bytesLocaux = await idbGet("db_bytes");
    const dbVierge = bytesLocaux ? null : DB.exporterBytes(DB.ouvrirDb(SQL, null));

    const resultat = await Drive.telecharger(dbVierge);
    db = DB.ouvrirDb(SQL, resultat.bytes);
    driveState = { fileId: resultat.fileId, folderId: resultat.folderId, modifiedTime: resultat.modifiedTime };

    await idbSet("db_bytes", resultat.bytes);
    await idbSet("drive_state", driveState);

    toast("Connecté à Google Drive");
    rendreTout();
  } catch (err) {
    toast("Échec de connexion à Drive : " + err.message, true);
  }
}

// ---------- Initialisation ----------

async function init() {
  SQL = await initSqlJs({ locateFile: (f) => `vendor/${f}` });

  try {
    await Drive.initGoogleAuth();
  } catch (err) {
    console.error(err);
  }

  // Affichage immédiat depuis le cache local, même avant connexion Drive
  const bytesCache = await idbGet("db_bytes");
  const etatCache = await idbGet("drive_state");
  if (bytesCache) {
    db = DB.ouvrirDb(SQL, bytesCache);
    driveState = etatCache || null;
    rendreTout();
    if (driveState) $("statut-synchro").textContent = "Dernière synchro connue : " + driveState.modifiedTime;
  }

  $("btn-connecter-drive").addEventListener("click", connecterDrive);

  $("form-transaction").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!db) { toast("Connecte-toi à Drive d'abord.", true); return; }
    const fd = new FormData(e.target);
    DB.ajouterTransaction(db, {
      compte_id: parseInt(fd.get("compte_id")),
      date: fd.get("date"),
      montant: parseFloat(fd.get("montant")),
      libelle: fd.get("libelle"),
      categorie_id: fd.get("categorie_id") ? parseInt(fd.get("categorie_id")) : null,
    });
    e.target.reset();
    rendreDashboard();
    rendreTransactions();
    toast("Transaction ajoutée");
    await sauvegarder();
  });
}

init();

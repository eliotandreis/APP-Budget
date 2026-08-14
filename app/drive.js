// Connexion à Google Drive depuis le navigateur, via Google Identity Services (GIS)
// pour l'auth, et des appels REST directs à l'API Drive (pas de client Python ici).
// Miroir simplifié de app/drive_sync.py côté PC.

import { CLIENT_ID, GOOGLE_DRIVE_FOLDER_NAME, GOOGLE_DRIVE_FILE_NAME } from "../config.js";

const SCOPES = "https://www.googleapis.com/auth/drive.file";
const API_BASE = "https://www.googleapis.com/drive/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const MIME_SQLITE = "application/x-sqlite3";
const MIME_FOLDER = "application/vnd.google-apps.folder";

let tokenClient = null;
let accessToken = null;

export class ConflitDrive extends Error {}

/** Initialise le client GIS. À appeler une fois au chargement de la page. */
export function initGoogleAuth() {
  return new Promise((resolve, reject) => {
    if (!window.google || !window.google.accounts) {
      reject(new Error("Google Identity Services ne s'est pas chargé (vérifie ta connexion)."));
      return;
    }
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: () => {}, // remplacé à chaque appel de demanderAcces()
    });
    resolve();
  });
}

/** Déclenche la fenêtre de consentement Google (doit être appelé depuis un clic utilisateur). */
export function demanderAcces() {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) {
        reject(new Error(`Autorisation refusée ou échouée : ${resp.error}`));
        return;
      }
      accessToken = resp.access_token;
      resolve();
    };
    // prompt: '' laisse Google décider (silencieux si déjà autorisé récemment)
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

export function estConnecte() {
  return !!accessToken;
}

async function driveFetch(url, options = {}) {
  if (!accessToken) throw new Error("Non connecté à Google Drive.");
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const texte = await res.text();
    throw new Error(`Erreur Drive API (${res.status}) : ${texte}`);
  }
  return res;
}

async function trouverOuCreerDossier() {
  const q = encodeURIComponent(
    `name = '${GOOGLE_DRIVE_FOLDER_NAME}' and mimeType = '${MIME_FOLDER}' and trashed = false`
  );
  const res = await driveFetch(`${API_BASE}/files?q=${q}&fields=files(id,name)`);
  const data = await res.json();
  if (data.files && data.files.length > 0) return data.files[0].id;

  const creation = await driveFetch(`${API_BASE}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: GOOGLE_DRIVE_FOLDER_NAME, mimeType: MIME_FOLDER }),
  });
  const dossier = await creation.json();
  return dossier.id;
}

async function trouverFichier(dossierId) {
  const q = encodeURIComponent(
    `name = '${GOOGLE_DRIVE_FILE_NAME}' and '${dossierId}' in parents and trashed = false`
  );
  const res = await driveFetch(`${API_BASE}/files?q=${q}&fields=files(id,name,modifiedTime)`);
  const data = await res.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
}

/**
 * Télécharge le fichier depuis Drive. Si aucun fichier n'existe encore, en crée un
 * avec les bytes fournis (base vierge initialisée côté appelant).
 * Retourne { bytes, fileId, folderId, modifiedTime }.
 */
export async function telecharger(bytesVierges) {
  const folderId = await trouverOuCreerDossier();
  let fichier = await trouverFichier(folderId);

  if (!fichier) {
    const creation = await driveFetch(`${API_BASE}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: GOOGLE_DRIVE_FILE_NAME, parents: [folderId] }),
    });
    fichier = await creation.json();
    await driveFetch(`${UPLOAD_BASE}/files/${fichier.id}?uploadType=media`, {
      method: "PATCH",
      headers: { "Content-Type": MIME_SQLITE },
      body: bytesVierges,
    });
    const meta = await (await driveFetch(`${API_BASE}/files/${fichier.id}?fields=modifiedTime`)).json();
    return { bytes: bytesVierges, fileId: fichier.id, folderId, modifiedTime: meta.modifiedTime };
  }

  const reponse = await driveFetch(`${API_BASE}/files/${fichier.id}?alt=media`);
  const bytes = new Uint8Array(await reponse.arrayBuffer());
  return { bytes, fileId: fichier.id, folderId, modifiedTime: fichier.modifiedTime };
}

/**
 * Envoie les bytes vers Drive, après vérification qu'aucun autre appareil n'a écrit
 * entre-temps (compare modifiedTime connu vs actuel). Lève ConflitDrive sinon.
 */
export async function televerser(fileId, bytes, modifiedTimeConnu) {
  const actuel = await (
    await driveFetch(`${API_BASE}/files/${fileId}?fields=modifiedTime`)
  ).json();

  if (actuel.modifiedTime !== modifiedTimeConnu) {
    throw new ConflitDrive(
      "Le fichier a été modifié ailleurs (PC ou autre appareil) depuis le dernier " +
      "téléchargement. Recharge l'application avant de refaire ta modification."
    );
  }

  const res = await driveFetch(`${UPLOAD_BASE}/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: { "Content-Type": MIME_SQLITE },
    body: bytes,
  });
  const mis_a_jour = await res.json();
  return mis_a_jour.modifiedTime;
}

// Cache local sur le téléphone (IndexedDB), pour un affichage immédiat même hors-ligne
// et pour ne pas perdre les modifications si l'envoi vers Drive échoue temporairement.

const DB_NAME = "budget-app-cache";
const STORE = "kv";

function ouvrirIndexedDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet(cle) {
  const db = await ouvrirIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(cle);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(cle, valeur) {
  const db = await ouvrirIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(valeur, cle);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

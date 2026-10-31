// Envoltorio mínimo de IndexedDB: ciudades, seguimiento y caché en el dispositivo.
const DB_NAME = 'saturno';
const VERSION = 1;
let dbPromise = null;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cities')) db.createObjectStore('cities', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('tracking')) db.createObjectStore('tracking', { keyPath: 'bizId' });
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('La base de datos local está bloqueada por otra pestaña.'));
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transacción cancelada'));
  });
}

export const idb = {
  get: (store, key) => run(store, 'readonly', (s) => s.get(key)),
  all: (store) => run(store, 'readonly', (s) => s.getAll()),
  put: (store, value) => run(store, 'readwrite', (s) => s.put(value)).then(() => value),
  delete: (store, key) => run(store, 'readwrite', (s) => s.delete(key)),
};

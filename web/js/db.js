'use strict';

const DB = (() => {
  const DB_NAME    = 'GlassFaceDB';
  const DB_VERSION = 1;
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('persons')) {
          const ps = db.createObjectStore('persons', { keyPath: 'id', autoIncrement: true });
          ps.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains('descriptors')) {
          const ds = db.createObjectStore('descriptors', { keyPath: 'id', autoIncrement: true });
          ds.createIndex('personId', 'personId', { unique: false });
        }
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  function tx(store, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = Array.isArray(store) ? store.map(n => t.objectStore(n)) : t.objectStore(store);
      const req = fn(s, t);
      if (req && req.onsuccess !== undefined) {
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
      } else {
        t.oncomplete = () => resolve();
        t.onerror    = e => reject(e.target.error);
      }
    }));
  }

  // ── Persons ────────────────────────────────────────────────── //
  function getAllPersons() {
    return tx('persons', 'readonly', s => s.getAll());
  }

  function getPerson(id) {
    return tx('persons', 'readonly', s => s.get(id));
  }

  function savePerson(person) {
    // person = { name, title, company, phone, email, notes, photoDataUrl }
    return tx('persons', 'readwrite', s => s.put(person));
  }

  function deletePerson(id) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(['persons', 'descriptors'], 'readwrite');
      t.objectStore('persons').delete(id);
      const idx = t.objectStore('descriptors').index('personId');
      const req = idx.openCursor(IDBKeyRange.only(id));
      req.onsuccess = e => {
        const cur = e.target.result;
        if (cur) { cur.delete(); cur.continue(); }
      };
      t.oncomplete = resolve;
      t.onerror    = e => reject(e.target.error);
    }));
  }

  // ── Descriptors ────────────────────────────────────────────── //
  function saveDescriptor(personId, descriptor) {
    // descriptor is Float32Array — store as regular Array for IDB compatibility
    return tx('descriptors', 'readwrite', s => s.put({
      personId,
      descriptor: Array.from(descriptor)
    }));
  }

  function getDescriptorsByPerson(personId) {
    return tx('descriptors', 'readonly', s => s.index('personId').getAll(personId));
  }

  /** Returns [{personId, descriptor: Float32Array}] for all enrolled people */
  function getAllDescriptors() {
    return tx('descriptors', 'readonly', s => s.getAll()).then(rows =>
      rows.map(r => ({ ...r, descriptor: new Float32Array(r.descriptor) }))
    );
  }

  return { getAllPersons, getPerson, savePerson, deletePerson, saveDescriptor, getDescriptorsByPerson, getAllDescriptors };
})();

class Cache {
  constructor() { this._store = new Map(); }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) { this._store.delete(key); return null; }
    return entry.value;
  }

  set(key, value, ttlMs = 3600000) {
    this._store.set(key, { value, expires: Date.now() + ttlMs });
  }

  delete(key) { this._store.delete(key); }
  clear() { this._store.clear(); }
  get size() { return this._store.size; }
}

module.exports = Cache;

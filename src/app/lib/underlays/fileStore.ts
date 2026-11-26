/** PDF bytes for underlays, in their own IndexedDB database keyed by SHA-256. Projects reference files by hash and never embed them. */
const DB_NAME = 'pysees-underlays', STORE = 'files'
export interface StoredPdf { hash: string; name: string; bytes: ArrayBuffer }

let dbPromise: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  return dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'hash' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { dbPromise = null; reject(req.error) }
  })
}

function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const req = op(d.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Stores a PDF (a no-op if the same bytes are already there) and returns its hash. */
export async function putPdf(bytes: ArrayBuffer, name: string): Promise<string> {
  const hash = await sha256Hex(bytes)
  if (!(await run('readonly', (s) => s.getKey(hash)))) await run('readwrite', (s) => s.put({ hash, name, bytes } satisfies StoredPdf))
  return hash
}

export const getPdf = (hash: string): Promise<StoredPdf | undefined> => run('readonly', (s) => s.get(hash) as IDBRequest<StoredPdf | undefined>)

// Tile sets the player imported, kept in IndexedDB; ones the browser won't keep last until the page closes.

const DATABASE = "nethack-tile-sets";
const STORE = "sheets";

const thisVisitOnly = new Map<string, Blob>();

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

let database: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DATABASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => {
      // the browser can close it, as when site data is cleared, and a closed one would fail every later call
      r.result.onclose = r.result.onversionchange = () => {
        database = null;
        r.result.close();
      };
      resolve(r.result);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error("blocked"));
  }).catch((e) => {
    database = null;
    throw e;
  });
  return database;
}

async function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await open()).transaction(STORE, mode).objectStore(STORE);
}

/** The imported sets' file names, sorted as a person would. */
export async function importedTileSets(): Promise<string[]> {
  let kept: string[] = [];
  try {
    kept = (await request((await store("readonly")).getAllKeys())).map(String);
  } catch {}
  const names = new Set([...kept, ...thisVisitOnly.keys()]);
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

/** Whether the set lasts only until the page closes. */
export function keptThisVisitOnly(name: string): boolean {
  return thisVisitOnly.has(name);
}

/** True if the browser keeps it; false if it lasts only until the page closes. */
export async function keepTileSet(name: string, file: Blob): Promise<boolean> {
  try {
    const sheets = await store("readwrite");
    // the put can succeed and the transaction still fail for want of space
    await new Promise<void>((resolve, reject) => {
      sheets.transaction.oncomplete = () => resolve();
      sheets.transaction.onerror = sheets.transaction.onabort = () => reject(sheets.transaction.error);
      sheets.put(file, name);
    });
    thisVisitOnly.delete(name);
    return true;
  } catch {
    thisVisitOnly.set(name, file);
    return false;
  }
}

/** Undefined if the browser doesn't have it; it rejects if the browser couldn't be asked. */
export async function tileSetFile(name: string): Promise<Blob | undefined> {
  const here = thisVisitOnly.get(name);
  if (here) return here;
  return (await request((await store("readonly")).get(name))) as Blob | undefined;
}

export async function forgetTileSet(name: string): Promise<void> {
  thisVisitOnly.delete(name);
  try {
    await request((await store("readwrite")).delete(name));
  } catch {}
}

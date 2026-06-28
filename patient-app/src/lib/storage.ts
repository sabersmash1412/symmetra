import { ALGORITHM_VERSION, FauMetric } from "@/src/lib/facs";

export type SyncStatus = "local" | "synced" | "queued" | "failed";

export type DailySession = {
  id: string;
  userId: string | null;
  dateKey: string;
  createdAt: string;
  durationMs: number;
  overallSymmetryScore: number;
  qualityScore: number;
  videoBlobId: string | null;
  videoPath: string | null;
  videoUrl?: string | null;
  algorithmVersion: string;
  notes: string | null;
  metrics: FauMetric[];
  syncStatus: SyncStatus;
};

export type StoredVideo = {
  id: string;
  sessionId: string;
  blob: Blob;
  mimeType: string;
  createdAt: string;
};

const DB_NAME = "symmetra-patient";
const DB_VERSION = 1;
const SESSION_STORE = "dailySessions";
const VIDEO_STORE = "videos";

export function createSessionDraft(input: {
  userId: string | null;
  durationMs: number;
  overallSymmetryScore: number;
  qualityScore: number;
  metrics: FauMetric[];
  videoBlobId?: string | null;
  notes?: string | null;
}): DailySession {
  const createdAt = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    userId: input.userId,
    dateKey: createdAt.slice(0, 10),
    createdAt,
    durationMs: input.durationMs,
    overallSymmetryScore: input.overallSymmetryScore,
    qualityScore: input.qualityScore,
    videoBlobId: input.videoBlobId ?? null,
    videoPath: null,
    algorithmVersion: ALGORITHM_VERSION,
    notes: input.notes ?? null,
    metrics: input.metrics,
    syncStatus: "local"
  };
}

export async function saveLocalSession(session: DailySession) {
  const db = await openDb();
  await putValue(db, SESSION_STORE, session);
}

export async function listLocalSessions() {
  const db = await openDb();
  const sessions = await getAllValues<DailySession>(db, SESSION_STORE);
  return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getLocalSession(id: string) {
  const db = await openDb();
  return getValue<DailySession>(db, SESSION_STORE, id);
}

export async function saveLocalVideo(video: StoredVideo) {
  const db = await openDb();
  await putValue(db, VIDEO_STORE, video);
}

export async function getLocalVideo(id: string) {
  const db = await openDb();
  return getValue<StoredVideo>(db, VIDEO_STORE, id);
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        db.createObjectStore(VIDEO_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putValue<T>(db: IDBDatabase, storeName: string, value: T) {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function getValue<T>(db: IDBDatabase, storeName: string, id: string) {
  return new Promise<T | null>((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(id);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

function getAllValues<T>(db: IDBDatabase, storeName: string) {
  return new Promise<T[]>((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve((request.result as T[]) ?? []);
    request.onerror = () => reject(request.error);
  });
}

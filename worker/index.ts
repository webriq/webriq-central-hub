import { openDB } from 'idb';

declare const self: ServiceWorkerGlobalScope;
export {};

interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
  readonly lastChance: boolean;
}

interface QueuedTask {
  url: string;
  body: unknown;
  timestamp: number;
}

const DB_NAME = 'hub-offline-queue';
const STORE_NAME = 'tasks';

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { autoIncrement: true });
      }
    },
  });
}

async function queueTaskForLater(request: Request): Promise<Response> {
   
  const body = await request.clone().json();
  const db = await getDB();
  await db.add(STORE_NAME, {
    url: request.url,
    body,
    timestamp: Date.now(),
  } satisfies QueuedTask);
  return new Response(JSON.stringify({ queued: true, offline: true }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function replayQueue(): Promise<void> {
  const db = await getDB();
  const allKeys = await db.getAllKeys(STORE_NAME);
  const allTasks = await db.getAll(STORE_NAME);

  for (let i = 0; i < allTasks.length; i++) {
    const task = allTasks[i] as QueuedTask;
    try {
      const response = await fetch(task.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task.body),
      });
      if (response.ok) {
        await db.delete(STORE_NAME, allKeys[i]);
      }
    } catch {
      // Remain queued — retry on next online/sync event
    }
  }
}

self.addEventListener('fetch', (event: FetchEvent) => {
  if (
    event.request.method === 'POST' &&
    event.request.url.includes('/api/orchestrate') &&
    !self.navigator.onLine
  ) {
    event.respondWith(queueTaskForLater(event.request));
  }
});

self.addEventListener('sync', (event: Event) => {
  const syncEvent = event as unknown as SyncEvent;
  if (syncEvent.tag === 'replay-orchestrate') {
    syncEvent.waitUntil(replayQueue());
  }
});

self.addEventListener('online', () => {
  replayQueue().catch(() => {});
});

// Push notifications (task 064) had no receiving-side handler until now — sendPushNotification()
// succeeded at the network layer but nothing ever displayed on the device. Payload shape matches
// PushPayload in src/lib/push/index.ts: { title, body, url? }.
self.addEventListener('push', (event: PushEvent) => {
  let data: { title?: string; body?: string; url?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: 'Notification', body: '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'WebriQ Central Hub', {
      body: data.body ?? '',
      icon: '/logo.png',
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (!url) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url === url);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});

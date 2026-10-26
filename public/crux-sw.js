// CRUX service worker: shows chart-alert and standing-order notifications pushed by the Crux relay, even with Crux
// closed, and opens the token's page when one is tapped. It does nothing else (no caching, no offline pages).
self.addEventListener("push", (event) => {
  let msg = { title: "CRUX", body: "", url: "/" };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {
    // A malformed push still shows something.
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: "/icon-1024.png",
      badge: "/icon-1024.png",
      data: { url: msg.url },
      tag: msg.title,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
      for (const t of tabs) {
        if (t.url === url && "focus" in t) return t.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});

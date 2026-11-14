// Service worker (V7): the site installs as an app and shows an offline page when there is no connection.
// Pages and the API always come from the network (never stale); only the offline page and icons are cached.
// It also shows "your video is ready" notifications posted by the page (V26).
const CACHE='studio-shell-v1';
const SHELL=['/offline.html','/favicon.svg','/icons/icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
 const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
 if(r.mode==='navigate'){e.respondWith(fetch(r).catch(()=>caches.match('/offline.html')));return;}
 if(SHELL.includes(new URL(r.url).pathname))e.respondWith(caches.match(r).then(hit=>hit||fetch(r)));
});
self.addEventListener('notificationclick',e=>{e.notification.close();const url=e.notification.data?.url||'/creations';e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{const open=list.find(c=>new URL(c.url).pathname===url);return open?open.focus():self.clients.openWindow(url);}));});

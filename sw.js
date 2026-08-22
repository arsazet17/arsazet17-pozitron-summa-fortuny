const C='summa-fortuny-v2-fixed-forecast';
const STATIC=[
  './',
  './index.html',
  './styles.css',
  './app.js',
  './engine.js',
  './manifest.webmanifest'
];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(C).then(c=>c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==C).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);

  if(url.pathname.includes('/data/')){
    e.respondWith(
      fetch(e.request,{cache:'no-store'})
        .catch(()=>caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(r=>r||fetch(e.request))
  );
});

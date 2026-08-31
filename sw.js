const C='summa-fortuny-v1.2.1';

const STATIC=[
  './?v=1.2.1',
  './index.html?v=1.2.1',
  './styles.css?v=1.2.1',
  './results-history.css?v=1.2.1',
  './update-app.css?v=1.2.1',
  './app.js?v=1.2.1',
  './hard-range-ui.js?v=1.2.1',
  './results-history.js?v=1.2.1',
  './update-app.js?v=1.2.1',
  './engine.js?v=1.2.1',
  './manifest.webmanifest?v=1.2.1'
];

self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(C)
      .then(c=>Promise.all(STATIC.map(u=>fetch(u,{cache:'no-store'}).then(r=>{
        if(r.ok) return c.put(u,r.clone());
      }).catch(()=>{}))))
  );
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(
        keys
          .filter(k=>k.startsWith('summa-fortuny-') && k!==C)
          .map(k=>caches.delete(k))
      ))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;

  const url=new URL(e.request.url);
  if(url.origin!==self.location.origin) return;

  // Всегда сначала сеть. Кэш — только аварийный offline fallback.
  e.respondWith(
    fetch(e.request,{cache:'no-store'})
      .then(resp=>{
        if(resp.ok){
          const copy=resp.clone();
          caches.open(C).then(c=>c.put(e.request,copy)).catch(()=>{});
        }
        return resp;
      })
      .catch(async()=>{
        const hit=await caches.match(e.request);
        if(hit) return hit;

        if(e.request.mode==='navigate'){
          return caches.match('./index.html?v=1.2.1')
              || caches.match('./?v=1.2.1');
        }

        throw new Error('offline and no cache');
      })
  );
});

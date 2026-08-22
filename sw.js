const C='summa-fortuny-v1.1.0';
const STATIC=[
  './',
  './index.html',
  './styles.css',
  './results-history.css',
  './update-app.css',
  './app.js',
  './results-history.js',
  './update-app.js',
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

  // HTML is network-first so pressing the update bell can immediately see a new release.
  if(e.request.mode==='navigate' || url.pathname.endsWith('/index.html')){
    e.respondWith(
      fetch(e.request,{cache:'no-store'})
        .then(r=>{
          const copy=r.clone();
          caches.open(C).then(c=>c.put('./index.html',copy)).catch(()=>{});
          return r;
        })
        .catch(()=>caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{
      if(e.request.method==='GET' && resp.ok){
        const copy=resp.clone();
        caches.open(C).then(c=>c.put(e.request,copy)).catch(()=>{});
      }
      return resp;
    }))
  );
});

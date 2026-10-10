const CACHE='mei-filtres-v2';
const ASSETS=['./','./index.html','./style.css','./app.js','./engine.js','./charts.js','./compute.js','./manifest.webmanifest','./icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mei-filtres-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  const known=ASSETS.some(asset=>new URL(asset,self.registration.scope).pathname===url.pathname);
  if(!known&&event.request.mode!=='navigate')return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;
  }).catch(async()=>await caches.match(event.request,{ignoreSearch:true})||(event.request.mode==='navigate'?await caches.match('./index.html'):Response.error())));
});

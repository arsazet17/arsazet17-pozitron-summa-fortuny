
const APP_VERSION='1.1.0';

const btn=document.getElementById('updateAppBtn');
const versionEl=document.getElementById('appVersion');

if(versionEl) versionEl.textContent='v'+APP_VERSION;

function toast(text,kind=''){
  let el=document.getElementById('appUpdateToast');
  if(!el){
    el=document.createElement('div');
    el.id='appUpdateToast';
    el.className='app-update-toast';
    document.body.appendChild(el);
  }
  el.className='app-update-toast '+kind;
  el.textContent=text;
  requestAnimationFrame(()=>el.classList.add('show'));
}

async function forceUpdate(){
  if(!btn || btn.dataset.busy==='1') return;
  btn.dataset.busy='1';
  btn.classList.add('updating');
  toast('🔄 Обновляю приложение…');

  try{
    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.update().catch(()=>{})));
    }

    if('caches' in window){
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>k.startsWith('summa-fortuny-')).map(k=>caches.delete(k)));
    }

    await fetch('./index.html?update='+Date.now(),{cache:'no-store'});
    toast('✅ Обновление загружено. Перезапускаю…','ok');

    setTimeout(()=>{
      const url=new URL(location.href);
      url.searchParams.set('v',Date.now());
      location.replace(url.toString());
    },650);
  }catch(err){
    console.error(err);
    toast('⚠️ Не удалось обновить. Проверь интернет.','error');
    btn.dataset.busy='0';
    btn.classList.remove('updating');
  }
}

btn?.addEventListener('click',forceUpdate);

'use strict';
function createWardrobe({video, play, reveal, blocked}) {
  const offset = 148.6485;
  const fps = 60000 / 1001;
  const catalog = window.wardrobeCatalog;
  const root = document.querySelector('#wardrobe');
  const view = document.querySelector('#game-view');
  const picker = document.querySelector('#wr-picker');
  const palette = document.querySelector('#wr-options');
  const variants = root.querySelector('.wr-variants');
  const info = document.querySelector('#wr-info');
  const freeze = document.querySelector('#wr-freeze');
  const ambient = document.querySelector('#wr-ambient');
  const status = document.querySelector('#wr-status');
  const button = name => root.querySelector('[data-wardrobe="' + name + '"]');
  const findGroup = id => catalog.find(g => g.id === id);
  const filmed = group => group.options.filter(o => o.windows.length);
  const profile = 'gamerlito.wardrobe.equipment.v1';
  let records = {};
  try { records = JSON.parse(sessionStorage.getItem(profile) || '{}') || {}; } catch {}
  const persist = () => { try { sessionStorage.setItem(profile, JSON.stringify(records)); } catch {} };
  let active = false, held = false, pending = false, seeking = false;
  let group, item, which = 0, jacket = false, aisle = false;
  let start = 0, end = 0, generation = 0, callback = null, timer, messageTimer;
  let portrait = false, margin = false, lastAmbient = 0;
  const sourceWidth = 1920, sourceHeight = 1080;
  const sourceFocus = {outfit:.56, tops:.60, pants:.57, masks:.66, dresses:.56, jewelry:.53, boots:.51, heels:.51, slides:.51};
  ambient.width = 256; ambient.height = 144;
  video.parentElement.prepend(ambient);

  function resize() {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(w / 16, h / 9);
    const values = {left:(w-ratio*16)/2, top:(h-ratio*9)/2, w:ratio*16, h:ratio*9};
    for (const [name,value] of Object.entries(values)) {
      root.style.setProperty('--'+name, value+'px');
      view.style.setProperty('--wr-'+name, value+'px');
    }
    portrait = w / h <= 1.2;
    margin = !portrait && (values.left > 1 || values.top > 1);
    ambient.hidden = !active || !margin;
    const visibleFraction = (w/h)/(16/9);
    const target = sourceFocus[group?.id] ?? .57;
    const focus = portrait ? 100*Math.min(1,Math.max(0,(target-visibleFraction/2)/(1-visibleFraction))) : 50;
    view.style.setProperty('--wr-focus',focus+'%');
    const panelW = Math.min(w*.82, 485);
    const area = infoRect();
    root.style.setProperty('--info-w',panelW+'px');
    root.style.setProperty('--panel',(panelW*area.h/area.w)+'px');
    root.style.setProperty('--chip-step',(panelW*120/area.w)+'px');
    root.style.setProperty('--chip-size',(panelW*116/area.w)+'px');
    root.style.setProperty('--chip-bottom',(panelW*(area.y+area.h-975)/area.w)+'px');
    paint(true);
  }
  function infoRect() {
    return group?.id === 'outfit' ? {x:25,y:802,w:790,h:222} : {x:32,y:654,w:727,h:345};
  }
  function drawCrop(canvas, sx, sy, sw, sh) {
    const ctx=canvas.getContext('2d');
    if (ctx) ctx.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  }
  function paint(force) {
    if (!active || video.readyState < 2 || seeking || video.seeking) return;
    if (margin && (force || performance.now()-lastAmbient>160)) {
      drawCrop(ambient,0,0,video.videoWidth,video.videoHeight); lastAmbient=performance.now();
    }
    if (!aisle && portrait) {
      const area=infoRect();
      if (info.width!==area.w || info.height!==area.h) {info.width=area.w; info.height=area.h;}
      drawCrop(info,area.x,area.y,area.w,area.h);
    }
  }
  function toast(text) {
    clearTimeout(messageTimer); status.textContent=text;
    messageTimer=setTimeout(()=>{status.textContent='';},1700);
  }
  function cancelBoundary() {
    clearTimeout(timer);
    if(callback!==null && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(callback);
    callback=null;
  }
  function boundary() {
    if(!active || held || seeking || pending || video.paused || video.seeking) return;
    const last=end - Math.min(2/fps,(end-start)/4);
    if(video.currentTime < last-0.002) { arm(); return; }
    if(aisle && root.dataset.entryAuto==='yes') {
      select(catalog[0],filmed(catalog[0])[0],1);
      return;
    }
    held=true; cancelBoundary(); video.pause();
    root.dataset.motion='held';
    if(video.currentTime>end-0.008) video.currentTime=last;
    paint(true);
  }
  function arm() {
    cancelBoundary();
    if(!active || held || seeking || pending || video.paused || video.seeking) return;
    const remaining=(end - Math.min(2/fps,(end-start)/4) - video.currentTime)/video.playbackRate;
    timer=setTimeout(boundary,Math.max(5,remaining*1000));
    if(video.requestVideoFrameCallback) {
      const frame=()=>{
        callback=null;
        if(!active || video.paused || seeking) return;
        paint(false);
        if(video.currentTime >= end - Math.min(2/fps,(end-start)/4)) boundary();
        else callback=video.requestVideoFrameCallback(frame);
      };
      callback=video.requestVideoFrameCallback(frame);
    }
  }
  function ready() {
    if(!active || !seeking || video.seeking || Math.abs(video.currentTime-start)>.12) return;
    seeking=false; pending=false;
    const token=generation;
    function expose() {
      if(token!==generation || !active || pending || seeking) return;
      reveal(); freeze.hidden=true; paint(true);
    }
    if(video.readyState>=2) expose();
    else video.addEventListener('loadeddata',expose,{once:true});
    resume();
  }
  function seek() {
    if(!active || !pending || !video.readyState) return;
    pending=false; seeking=true;
    if(Math.abs(video.currentTime-start)<0.008 && !video.seeking) ready();
    else video.currentTime=start;
  }
  function clip(range) {
    const keep = active && !video.hidden && !video.seeking && video.readyState>=2 && video.style.opacity==='1' && freeze.hidden;
    if(keep) {
      freeze.width=video.videoWidth; freeze.height=video.videoHeight;
      drawCrop(freeze,0,0,video.videoWidth,video.videoHeight); freeze.hidden=false;
    }
    generation++; cancelBoundary(); video.pause();
    start=range[0]-offset; end=range[1]-offset;
    root.dataset.from=range[0]; root.dataset.to=range[1]; root.dataset.motion='playing';
    held=false; pending=true; seeking=false;
    seek();
  }
  function showPalette() {
    const first=item?.firstVisible?.[which] ?? item?.firstVisible?.[0] ?? 0;
    const list=group.options.slice(first,first+6);
    palette.replaceChildren();
    if(group.id!=='outfit') {
      for (const option of list) {
        const b=document.createElement('button');
        b.type='button'; b.dataset.option=option.index;
        b.setAttribute('aria-label',option.name || 'Variante sin toma en el video');
        b.setAttribute('aria-pressed',String(item===option));
        b.title=option.name || 'Sin toma en el video';
        b.disabled=!option.windows.length;
        palette.append(b);
      }
    }
    variants.hidden=filmed(group).length<2;
    if(!variants.hidden && !portrait) {
      variants.style.setProperty('left','calc(var(--left) + var(--w)*'+(.022+Math.min(group.options.length,6)*.06255)+')');
    }
    const j=button('jacket');
    j.hidden=!item.jacketWindows?.length;
    j.textContent=jacket?'Quitar chaqueta':'Chaqueta';
    j.setAttribute('aria-label',jacket?'Quitar chaqueta':'Mostrar chaqueta'); j.setAttribute('aria-pressed',String(jacket));
    for(const b of picker.children) b.setAttribute('aria-current',String(b.dataset.category===group.id));
  }
  function closeMenu(resumeMotion=true) {
    picker.hidden=true; button('categories').setAttribute('aria-expanded','false');
    if(resumeMotion) resume();
  }
  function openMenu() {
    if(!picker.hidden){closeMenu();return;}
    video.pause(); picker.hidden=false; button('categories').setAttribute('aria-expanded','true');
  }
  function select(nextGroup,nextItem,windowIndex=0,withJacket=false) {
    if(!nextGroup || !nextItem?.windows.length) return;
    group=nextGroup; item=nextItem; aisle=false;
    jacket=Boolean(withJacket && item.jacketWindows?.length);
    const windows=jacket ? item.jacketWindows : item.windows;
    which=Math.max(0,Math.min(windows.length-1,windowIndex));
    const saved=records[group.id];
    const wearing=saved?.worn===item.index && Boolean(saved?.jacket)===jacket;
    root.dataset.mode=wearing?'equipped':'browse';
    root.dataset.category=group.id; root.dataset.option=item.index; root.dataset.jacket=String(jacket);
    root.setAttribute('aria-label','Vestuario de Lucía — '+item.name);
    closeMenu(false); showPalette(); resize(); clip(windows[which]);
  }
  function openGroup(id) {
    const g=findGroup(id);
    if(!g) return;
    const saved=records[g.id] || {};
    const candidate=g.options.find(o=>o.index===saved.worn && o.windows.length);
    select(g,candidate || filmed(g)[0],0,Boolean(candidate && saved.jacket));
  }
  function next(amount) {
    const list=filmed(group);
    select(group,list[(list.indexOf(item)+amount+list.length)%list.length]);
  }
  function equip() {
    if(aisle) return openGroup(catalog[0].id);
    const entry=records[group.id] || (records[group.id]={});
    entry.worn=item.index; entry.jacket=jacket; persist();
    root.dataset.mode='equipped'; toast('Puesta · '+item.name);
  }
  function save() {
    const entry=records[group.id] || (records[group.id]={});
    entry.saved=Array.from(new Set([...(entry.saved||[]),item.index]));
    persist(); toast('Guardada · '+item.name);
  }
  function beginAisle() {
    closeMenu(false); aisle=true; group=catalog[0]; item=filmed(group)[0];
    root.dataset.mode='entry'; root.dataset.entryAuto='yes'; root.dataset.category=''; root.dataset.option='';
    root.setAttribute('aria-label','Vestuario de Lucía'); resize(); clip([152,153.91]);
  }
  function resume() {
    if(!active || blocked() || !picker.hidden) return;
    if(pending) seek();
    else if(!held && !seeking) play();
    else if(held) paint(true);
  }
  function reset() {
    active=false; held=false; pending=false; seeking=false; generation++; cancelBoundary();
    clearTimeout(messageTimer); status.textContent='';
    root.hidden=true; freeze.hidden=true; ambient.hidden=true; closeMenu(false);
  }
  function begin() {
    reset(); active=true; root.hidden=false; beginAisle();
  }
  function snapshot() {
    const c=document.createElement('canvas');
    const scale=Math.min(1,1280/Math.max(view.clientWidth,view.clientHeight));
    c.width=Math.round(view.clientWidth*scale); c.height=Math.round(view.clientHeight*scale);
    const ctx=c.getContext('2d');
    if(!ctx || video.readyState<2) return null;
    const r=Math[portrait?'max':'min'](c.width/sourceWidth,c.height/sourceHeight);
    const w=sourceWidth*r, h=sourceHeight*r;
    ctx.fillStyle='#101115'; ctx.fillRect(0,0,c.width,c.height);
    const f=(parseFloat(view.style.getPropertyValue('--wr-focus'))||50)/100;
    ctx.drawImage(video,(c.width-w)*(portrait?f:.5),(c.height-h)*.5,w,h);
    return c.toDataURL('image/jpeg',.84);
  }
  function act(name) {
    if(!active || blocked()) return;
    if(name==='categories' || name==='back') {openMenu();return;}
    if(name==='enter') {select(catalog[0],filmed(catalog[0])[0],1);return;}
    if(aisle) return;
    switch(name) {
      case 'prev': next(-1); break;
      case 'next': next(1); break;
      case 'confirm': equip(); break;
      case 'save': save(); break;
      case 'replay': select(group,item,(which+1)%(jacket?item.jacketWindows:item.windows).length,jacket); break;
      case 'jacket': if(item.jacketWindows?.length) select(group,item,0,!jacket); break;
    }
  }
  for(const g of catalog) {
    const b=document.createElement('button'); b.type='button'; b.dataset.category=g.id;
    b.textContent=g.name.toLowerCase(); picker.append(b);
  }
  root.addEventListener('click',e=>{
    const target=e.target.closest('button');
    if(!target || target.disabled || blocked()) return;
    if(target.hasAttribute('data-category')) return openGroup(target.dataset.category);
    if(target.hasAttribute('data-option')) return select(group,group.options.find(o=>o.index===Number(target.dataset.option)));
    act(target.dataset.wardrobe);
  });
  document.addEventListener('keydown',e=>{
    if(!active || blocked() || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input,textarea,select,[contenteditable=true]'))return;
    if(!document.querySelector('.gh-quick').hidden || !document.querySelector('.gh-chatbox').hidden)return;
    const key=e.key;
    if(!picker.hidden) {
      if(key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeMenu();button('categories').focus();return;}
      if(['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(key)){
        e.preventDefault();e.stopImmediatePropagation();
        const entries=[...picker.children], i=entries.indexOf(document.activeElement);
        const increment=key==='ArrowLeft'?-1:key==='ArrowRight'?1:key==='ArrowDown'?2:-2;
        entries[i<0?0:(i+increment+entries.length)%entries.length].focus();
      }
      return;
    }
    if(e.target.closest?.('#game-hud button') && ['Enter',' '].includes(key))return;
    if(e.target.closest?.('#wardrobe button') && ['Enter',' '].includes(key))return;
    const motion={ArrowLeft:'prev',ArrowRight:'next',a:'prev',d:'next',e:aisle?'enter':'confirm',Enter:aisle?'enter':'confirm',Escape:'back',r:'replay',j:'jacket'};
    const cmd=motion[key];
    if(!cmd || aisle && !['enter','back'].includes(cmd))return;
    e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)act(cmd);
  },true);
  document.addEventListener('pointerdown',e=>{
    if(active && !picker.hidden && !picker.contains(e.target) && !button('categories').contains(e.target)) closeMenu();
  },true);
  video.addEventListener('loadedmetadata',seek);
  video.addEventListener('seeked',()=>{ if(seeking) ready(); else if(held) paint(true); });
  video.addEventListener('playing',()=>{ if(active)arm(); });
  video.addEventListener('pause',cancelBoundary);
  video.addEventListener('ratechange',arm);
  video.addEventListener('timeupdate',()=>{if(active && !held && !seeking && !pending && !video.paused && video.currentTime>=end-.025)boundary();});
  if(window.ResizeObserver) new ResizeObserver(resize).observe(view);
  window.addEventListener('resize',resize,{passive:true});
  return {start:begin,reset,resume,snapshot,action:()=>act(aisle?'enter':'confirm'),aisle:()=>aisle,
    wantsPlay:()=>active && !held && !seeking && !pending && picker.hidden};
}

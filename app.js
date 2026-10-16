import {safeUrl,safeStyles,sanitizeHtml,eventTimestamp,countdown,rankUsers,fetchAllPoints,resolveImageDimensions,normalizeImageDimension,STYLE_KEYS,headerEdition,MOBILE_HEADER_BREAKPOINT,prizeEdition,PRIZE_NOTE_NODE} from './core.js';
const root=document.querySelector('#glz-ref');
const editing=location.search.includes('editor=1')&&window.parent!==window;
if(editing)document.documentElement.classList.add('editing');
// Stable identifiers are generated from the unmodified, retained approved HTML.
let n=0;root.querySelectorAll('*').forEach(el=>{if(!el.closest('svg')||el.tagName.toLowerCase()==='svg')el.dataset.node='n'+(++n)});
const textNodes=[...root.querySelectorAll('h1,h2,h3,p,li,.nav a,.ticket>*,.unit span,.banner>*,.muted')].filter(el=>!el.closest('#ranking-panel')&&!el.closest('.prizes')&&!el.classList.contains('area'));
textNodes.forEach(el=>el.dataset.text=el.dataset.node);
const template=root.innerHTML;
const mobileHeaderQuery=matchMedia('(max-width: '+MOBILE_HEADER_BREAKPOINT+'px)');
let previewDevice=null;
const mobileHeaderActive=()=>editing&&previewDevice?previewDevice==='mobile':mobileHeaderQuery.matches;
let config,edition,timer,rankingInterval,rankingData=null,rankRequest=0,selected=null;
const rankingCache=new Map();
const E=id=>root.querySelector(`[data-node="${id}"]`);
const label=el=>String(el.innerText||el.getAttribute('aria-label')||el.getAttribute('class')||el.tagName).trim().slice(0,90);
const defaultText={ended:'O sorteio já começou! Acompanhe a live do GLzando. 💜',inactiveTitle:'Nenhum sorteio ativo no momento! 💜',inactiveBody:'Obrigada por participar da nossa Live Premiada! Acompanhe o GLzando para saber quando teremos o próximo sorteio.',rankingUnavailable:'Ranking temporariamente indisponível. Tente novamente mais tarde.',rankingSearch:'Buscar participante em todo o ranking',rankingEmpty:'Nenhum participante encontrado com a pontuação mínima.',rankingUpdated:'Última atualização',rankingOfficial:'Ver leaderboard oficial do StreamElements',rankingLoading:'Atualizando saldos no StreamElements…',close:'Fechar imagem',comingSoon:'Próximo prêmio em breve'};
const t=key=>sanitizeHtml(edition.texts[key]??defaultText[key]??'');
function fillText(el,key,initial){el.dataset.text=key;el.dataset.node=key;el.innerHTML=sanitizeHtml(edition.texts[key]??initial??defaultText[key]??'');return el}
function tokens(s){return s.replace(/\{\{ticketCost\}\}/g,String(edition.ticket.cost)).replace(/\{\{ticketMax\}\}/g,String(edition.ticket.max))}
function tokenTemplate(html){return html.replace(/500(?= GLpontos)/g,'{{ticketCost}}').replace(/10(?= tickets)/g,'{{ticketMax}}')}
function responsiveNavigation(){
  const nav=root.querySelector('.nav'),space=document.createElement('div');space.className='nav-space';space.setAttribute('aria-hidden','true');nav.before(space);horizontalDragging(nav);
  const update=()=>{const height=nav.getBoundingClientRect().height;space.style.height=Math.max(0,height-(parseFloat(getComputedStyle(document.body).paddingTop)||0))+'px';root.style.setProperty('--nav-height',height+'px')};
  const observer=new ResizeObserver(update);observer.observe(nav);imageObservers.push(observer);update();
}
function setupNav(){root.querySelectorAll('.nav a').forEach(a=>a.addEventListener('click',e=>{if(editing)return;e.preventDefault();const target=root.querySelector(a.getAttribute('href'));target?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});history.replaceState(null,'',a.getAttribute('href'))}))}
let imageObservers=[];
function sizeImage(container,img,options,kind){
  if(!container.isConnected)return;
  container.dataset.imageKind=kind;img.dataset.imageKind=kind;
  if(kind==='prize'){img.dataset.prizeId=container.dataset.prizeId}
  img.dataset.node=container.dataset.node+'-image';
  const parent=container.parentElement;
  let lastWidth=-1,baseHeaderHeight,baseTitleMargin;
  const update=()=>{
    if(!img.isConnected||!img.naturalWidth||!img.naturalHeight)return;
    if(kind==='prize'){
      const card=getComputedStyle(parent),rail=parent.parentElement,railCss=getComputedStyle(rail),fraction=parseFloat(railCss.getPropertyValue('--prize-card-fraction'))||.5;
      const railWidth=rail.clientWidth-parseFloat(railCss.paddingLeft)-parseFloat(railCss.paddingRight);
      const column=railWidth*fraction-(fraction===.5?(parseFloat(railCss.columnGap)||0)/2:0);
      const base=column-parseFloat(card.paddingLeft)-parseFloat(card.paddingRight)-parseFloat(card.borderLeftWidth)-parseFloat(card.borderRightWidth);
      const w=normalizeImageDimension(options.width),h=normalizeImageDimension(options.height),ratio=img.naturalWidth/img.naturalHeight;
      const desired=w==='auto'?(h==='auto'?img.naturalWidth:parseFloat(h)*(h.endsWith('%')?img.naturalWidth/100:ratio)):parseFloat(w)*(w.endsWith('%')?base/100:1);
      parent.style.flexBasis=Math.min(railWidth,Math.max(column,desired+column-base))+'px';
    }
    const css=getComputedStyle(parent);
    const side=options.anchorX==='right'?'right':'left',inset=String(options[side]??'0px');
    const offset=(parseFloat(inset)||0)*(inset.endsWith('%')?parent.clientWidth/100:1);
    const available=Math.max(0,(kind==='decor'?Math.min(parent.clientWidth,root.clientWidth):parent.clientWidth)-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight)-(kind==='decor'?Math.max(0,offset):0));
    const size=resolveImageDimensions(options,{width:img.naturalWidth,height:img.naturalHeight},available);
    // Include the existing photo border in its box without changing the approved style.
    const border=getComputedStyle(container),x=parseFloat(border.borderLeftWidth)+parseFloat(border.borderRightWidth),y=parseFloat(border.borderTopWidth)+parseFloat(border.borderBottomWidth);
    container.style.width=size.width+'px';container.style.height=size.height+'px';
    img.style.width=Math.max(0,size.width-x)+'px';img.style.height=Math.max(0,size.height-y)+'px';img.style.objectFit=kind==='decor'?'fill':options.fit==='cover'?'cover':'contain';
    if(kind==='decor')img.style.objectPosition=(side==='right'?'right':'left')+' top';
    if(kind==='decor'&&options.reserveSpace===true){
      const title=parent.querySelector('h1');
      baseHeaderHeight??=parent.style.minHeight;baseTitleMargin??=title.style.marginTop;
      parent.style.minHeight=baseHeaderHeight;title.style.marginTop=baseTitleMargin;
      const box=container.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(title);const text=range.getBoundingClientRect();
      // Large decorations get space instead of covering the title or being clipped.
      if(box.left<text.right&&box.right>text.left&&box.top<text.bottom&&box.bottom>text.top){title.style.marginTop=(parseFloat(getComputedStyle(title).marginTop)+box.bottom-text.top+12)+'px'}
      const top=parent.getBoundingClientRect().top;
      parent.style.minHeight=Math.max(parseFloat(getComputedStyle(parent).minHeight)||0,box.bottom-top+parseFloat(css.paddingBottom))+'px';
    }
  };
  img.addEventListener('load',update);queueMicrotask(update);
  const observer=new ResizeObserver(()=>{const width=kind==='prize'?parent.clientWidth+':'+parent.parentElement.clientWidth:parent.clientWidth;if(width!==lastWidth){lastWidth=width;update()}});observer.observe(parent);if(kind==='prize')observer.observe(parent.parentElement);imageObservers.push(observer);
}
function imageSection(kind){const opt=edition.images[kind];const el=root.querySelector(kind==='banner'?'.banner':'.decor-slot');
  el.hidden=!opt.visible||(kind==='decor'&&!opt.src&&!editing);
  const src=safeUrl(opt.src,true);if(!src)return;
  el.classList.add('has-image');el.replaceChildren();const img=document.createElement('img');img.src=src;img.alt=kind==='banner'?'Banner da edição '+edition.name:'Imagem decorativa';el.append(img);
  el.style.alignSelf=opt.align||'center';el.style.marginLeft=opt.align==='right'?'auto':opt.align==='left'?'0':'auto';el.style.marginRight=opt.align==='left'?'auto':opt.align==='right'?'0':'auto';
  if(kind==='decor'){
    const right=opt.anchorX==='right';
    el.parentElement.classList.toggle('decor-overlay',opt.reserveSpace!==true);
    el.style.left=right?'auto':opt.left||'0px';el.style.right=right?opt.right||'0px':'auto';
    el.style.top=opt.top;el.style.opacity=String(opt.opacity);el.style.margin='0';
  }
  if(kind==='banner'&&!editing){
    el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label','Ampliar imagem central');
    el.addEventListener('click',()=>lightbox(src,img.alt,el));
    el.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();el.click()}});
  }
  sizeImage(el,img,opt,kind);
}
function prizes(){const grid=root.querySelector('.prizes');grid.replaceChildren();grid.tabIndex=0;grid.setAttribute('role','region');grid.setAttribute('aria-label','Galeria de prêmios com rolagem horizontal');
  for(const prize of edition.prizes.filter(p=>p.visible)){
    const card=document.createElement('div');card.className='prize';card.dataset.node='prize-'+prize.id;
    const src=safeUrl(prize.image,true),pic=document.createElement(src?'button':'div');pic.className='pic';pic.dataset.node='photo-'+prize.id;
    // Empty photo areas must select their prize just like an uploaded photo.
    pic.dataset.imageKind='prize';pic.dataset.prizeId=prize.id;
    if(editing){pic.title='Clique para escolher a foto de '+prize.name;if(!src){pic.tabIndex=0;pic.setAttribute('role','button');pic.setAttribute('aria-label','Escolher foto de '+prize.name);pic.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();pic.click()}})}}
    if(src){const img=document.createElement('img');img.src=src;img.alt=prize.name;pic.classList.add('has-image');pic.dataset.prizeId=prize.id;pic.type='button';pic.setAttribute('aria-label','Ampliar: '+prize.name);pic.append(img);queueMicrotask(()=>sizeImage(pic,img,prize.imageSize||{width:'100%',height:'100px',fit:'contain'},'prize'));pic.addEventListener('click',()=>{if(!editing)lightbox(src,prize.name,pic)})}else pic.textContent='▧';
    card.append(pic,fillText(document.createElement('p'),'prize-name-'+prize.id,prize.name));
    if(prize.description){const desc=fillText(document.createElement('p'),'prize-desc-'+prize.id,prize.description);desc.className='prize-description';card.append(desc)}
    Object.assign(card.style,safeStyles(prize.style));grid.append(card);
  }
  if(edition.showComingSoon){const card=document.createElement('div');card.className='prize coming-prize';card.dataset.node='coming-card';card.innerHTML='<div class="pic" data-node="coming-icon">🎁</div>';if(editing)card.firstElementChild.dataset.imageKind='prize';card.append(fillText(document.createElement('p'),'comingSoon'));grid.append(card)}
}
function prizeNavigation(){
  const rail=root.querySelector('.prizes'),controls=document.createElement('div');controls.className='prize-navigation';
  const previous=document.createElement('button'),next=document.createElement('button');
  for(const [button,label,arrow]of [[previous,'Prêmio anterior','←'],[next,'Próximo prêmio','→']]){button.type='button';button.setAttribute('aria-label',label);button.title=label;button.textContent=arrow;controls.append(button)}
  rail.after(controls);horizontalDragging(rail);
  const update=()=>{
    const coming=rail.querySelector('.coming-prize');
    if(coming){
      const photos=[...rail.querySelectorAll(':scope>.prize:not(.coming-prize)>.pic')];
      const heights=photos.filter(photo=>!photo.hidden&&(!photo.classList.contains('has-image')||photo.querySelector('img')?.naturalWidth)).map(photo=>photo.getBoundingClientRect().height).filter(height=>height>0);
      const height=(heights.length?Math.max(...heights):100)+'px';
      if(coming.style.getPropertyValue('--coming-photo-height')!==height)coming.style.setProperty('--coming-photo-height',height);
    }
    const end=Math.max(0,rail.scrollWidth-rail.clientWidth);previous.disabled=rail.scrollLeft<=1;next.disabled=rail.scrollLeft>=end-1;controls.hidden=end<=1;
  };
  const move=direction=>{
    const cards=[...rail.children];if(!cards.length)return;
    const offsets=cards.map(card=>card.offsetLeft-cards[0].offsetLeft),position=rail.scrollLeft;
    const target=direction>0?offsets.find(offset=>offset>position+1):offsets.findLast(offset=>offset<position-1);
    rail.scrollTo({left:target??(direction>0?rail.scrollWidth:0),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  };
  previous.onclick=()=>move(-1);next.onclick=()=>move(1);
  rail.addEventListener('scroll',update,{passive:true});
  rail.addEventListener('keydown',event=>{if(event.target===rail&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();move(event.key==='ArrowRight'?1:-1)}});
  const observer=new ResizeObserver(update);observer.observe(rail);for(const card of rail.children)observer.observe(card);for(const photo of rail.querySelectorAll(':scope>.prize>.pic'))observer.observe(photo);imageObservers.push(observer);queueMicrotask(update);
}
function horizontalDragging(rail){
  let gesture=null;
  rail.addEventListener('dragstart',event=>event.preventDefault());
  rail.addEventListener('pointerdown',event=>{
    if(event.isPrimary)rail.dataset.dragClickBlocked='false';
    if(event.pointerType!=='mouse'||event.button!==0||!event.isPrimary)return;
    const rect=rail.getBoundingClientRect();
    if(rail.scrollWidth<=rail.clientWidth+1||event.clientY>=rect.top+rail.clientHeight)return;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,scroll:rail.scrollLeft,moved:false};
  });
  rail.addEventListener('pointermove',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    if(!(event.buttons&1)){finish(event);return}
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(!gesture.moved){
      if(Math.abs(dx)<6||Math.abs(dx)<=Math.abs(dy))return;
      gesture.moved=true;rail.dataset.dragClickBlocked='true';rail.classList.add('is-dragging');rail.setPointerCapture(event.pointerId);
    }
    event.preventDefault();rail.scrollLeft=gesture.scroll-dx;
  });
  const finish=event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    const id=gesture.id;gesture=null;rail.classList.remove('is-dragging');
    if(rail.hasPointerCapture(id))rail.releasePointerCapture(id);
  };
  rail.addEventListener('pointerup',finish);rail.addEventListener('pointercancel',finish);rail.addEventListener('lostpointercapture',finish);
  rail.addEventListener('pointerleave',event=>{if(gesture&&!gesture.moved)finish(event)});
  rail.addEventListener('click',event=>{if(event.detail>0&&rail.dataset.dragClickBlocked==='true'){event.preventDefault();event.stopImmediatePropagation()}},{capture:true});
}
function lightbox(src,name,opener){
  const d=document.createElement('dialog');d.className='lightbox';d.setAttribute('aria-label',name);
  const frame=document.createElement('div');frame.className='lightbox-frame';
  const close=document.createElement('button');close.type='button';close.innerHTML='<span aria-hidden="true">×</span> <span>'+t('close')+'</span>';close.setAttribute('aria-label',close.querySelector('span:last-child').textContent);
  const img=document.createElement('img');img.alt=name;
  const fit=()=>{
    if(!img.naturalWidth||!img.naturalHeight)return;
    const viewport=window.visualViewport,padding=innerWidth<=460?16:32;
    const scale=Math.max(0,Math.min(((viewport?.width||innerWidth)-padding*2)/img.naturalWidth,((viewport?.height||innerHeight)-padding*2)/img.naturalHeight));
    frame.style.width=img.naturalWidth*scale+'px';frame.style.height=img.naturalHeight*scale+'px';
  };
  img.addEventListener('load',fit);img.src=src;frame.append(img,close);d.append(frame);document.body.append(d);
  window.addEventListener('resize',fit);window.visualViewport?.addEventListener('resize',fit);
  close.onclick=()=>d.close();d.addEventListener('click',event=>{if(event.target===d)d.close()});
  d.addEventListener('close',()=>{window.removeEventListener('resize',fit);window.visualViewport?.removeEventListener('resize',fit);document.documentElement.classList.remove('photo-open');d.remove();const target=opener?.isConnected?opener:E(opener?.dataset.node);target?.focus({preventScroll:true})});
  d.showModal();document.documentElement.classList.add('photo-open');fit();
}
function socials(){const wrap=root.querySelector('.social');[...wrap.children].forEach((old,i)=>{const key=['twitch','instagram','tiktok','x'][i],s=edition.social[key];old.hidden=!s.visible;const url=safeUrl(s.url);const el=document.createElement(url?'a':'span');el.innerHTML=old.innerHTML;el.className=old.className;el.dataset.node=old.dataset.node;el.hidden=old.hidden;el.setAttribute('aria-label',key[0].toUpperCase()+key.slice(1));el.title=url?key:key+' — perfil ainda não cadastrado';if(url){el.href=url;el.target='_blank';el.rel='noopener noreferrer'}else el.setAttribute('aria-disabled','true');old.replaceWith(el)})}
function rankingShell(){const panel=root.querySelector('#ranking-panel');panel.innerHTML='';
  const search=document.createElement('input');search.className='rank-search';search.type='search';search.placeholder=new DOMParser().parseFromString(t('rankingSearch'),'text/html').body.textContent;search.setAttribute('aria-label',search.placeholder);search.dataset.node='ranking-search';search.addEventListener('input',()=>drawRanking(search.value));
  const list=document.createElement('div');list.className='rank-list';list.id='rank-list';list.tabIndex=0;list.setAttribute('role','region');list.setAttribute('aria-label','Participantes por saldo atual');
  const note=fillText(document.createElement('div'),'rankingLoading');note.id='rank-status';note.className='muted rank-note';note.setAttribute('aria-live','polite');
  const link=fillText(document.createElement('a'),'rankingOfficial');link.className='rank-link';const url=safeUrl(edition.ranking.leaderboard);if(url){link.href=url;link.target='_blank';link.rel='noopener noreferrer'}else link.hidden=true;
  panel.append(search,list,note,link);
}
function drawRanking(query=''){
  const list=root.querySelector('#rank-list');if(!list)return;list.replaceChildren();
  if(!rankingData)return;
  const users=rankUsers(rankingData.users,edition.ranking.minimum,edition.ranking.excluded),filtered=users.filter(u=>u.username.toLowerCase().includes(query.trim().toLowerCase()));
  for(const user of filtered){const row=document.createElement('div');row.className='rank-row';const line=document.createElement('div');line.className='rank-line';const name=document.createElement('span');name.textContent=([,'🥇','🥈','🥉'][user.position]||user.position+'.')+' '+user.username;const score=document.createElement('span');score.textContent=user.points.toLocaleString('pt-BR')+' pts';line.append(name,score);const bar=document.createElement('div');bar.className='bar';const fill=document.createElement('div');fill.style.width=(users[0]?.points?user.points/users[0].points*100:0)+'%';bar.append(fill);row.append(line,bar);list.append(row)}
  if(!filtered.length){const p=fillText(document.createElement('p'),'rankingEmpty');p.className='muted';list.append(p)}
}
async function refreshRanking(force=false){const request=++rankRequest;const status=root.querySelector('#rank-status');if(!status)return;
  if(!edition.ranking.enabled){rankingData=null;status.innerHTML=t('rankingUnavailable');drawRanking();return}
  try{const key=edition.ranking.mode+edition.ranking.channelId;let cached=rankingCache.get(key);if(force||!cached||Date.now()-cached.time>edition.ranking.refreshMinutes*60000){const mode=edition.ranking.mode,channelId=edition.ranking.channelId;cached={time:Date.now(),promise:(async()=>{if(mode==='snapshot'){const r=await fetch('ranking.json',{cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();if(!data.updatedAt)throw Error();return data}return fetchAllPoints(channelId,{signal:AbortSignal.timeout(30000)})})()};rankingCache.set(key,cached);cached.promise.catch(()=>rankingCache.delete(key))}const data=await cached.promise;
    if(request!==rankRequest)return;rankingData=data;drawRanking(root.querySelector('.rank-search')?.value);status.innerHTML=t('rankingUpdated')+': ';status.append(document.createTextNode(new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:edition.event.timezone}).format(new Date(data.updatedAt))));status.append(document.createTextNode(' • '+rankUsers(data.users,edition.ranking.minimum,edition.ranking.excluded).length+' participantes'));
  }catch{if(request!==rankRequest)return;rankingData=null;drawRanking();status.innerHTML=t('rankingUnavailable')}
}
function updateTimer(){const timerEl=root.querySelector('.timer');if(!timerEl)return;const timestamp=eventTimestamp(edition.event);const values=countdown(timestamp);if(timestamp<=Date.now()){timerEl.hidden=true;let ended=root.querySelector('.ended');if(!ended){ended=fillText(document.createElement('div'),'ended');ended.className='ended';timerEl.after(ended)}}else{timerEl.hidden=false;root.querySelector('.ended')?.remove();timerEl.querySelectorAll('.unit b').forEach((el,i)=>el.textContent=String(values[i]).padStart(2,'0'))}}
function render(next){imageObservers.forEach(o=>o.disconnect());imageObservers=[];config=structuredClone(next);edition=prizeEdition(headerEdition(config.editions.find(e=>e.id===config.current)||config.editions[0],mobileHeaderActive()),mobileHeaderActive());root.classList.toggle('mobile-prizes',mobileHeaderActive());clearInterval(timer);clearInterval(rankingInterval);rankRequest++;rankingData=null;root.innerHTML=template;document.title=edition.title;
  root.querySelectorAll('[data-node]').forEach(el=>{const key=el.dataset.node;if(edition.texts[key]!==undefined&&(el.dataset.text||el.matches('.rules,.steps,ul,ol'))){el.innerHTML=tokens(sanitizeHtml(edition.texts[key]));el.dataset.text=key}else if(el.dataset.text)el.innerHTML=tokens(tokenTemplate(el.innerHTML))});
  // New blocks inside a deliberately edited container also remain individually editable.
  root.querySelectorAll('[data-text]').forEach(parent=>{let i=0;parent.querySelectorAll('p,li,h2,h3,h4').forEach(child=>{if(!child.dataset.node){child.dataset.node=parent.dataset.node+'-custom-'+(++i);child.dataset.text=child.dataset.node;const custom=edition.texts[child.dataset.node];if(custom!==undefined)child.innerHTML=tokens(sanitizeHtml(custom))}})});
  const caption=root.querySelector('#g-timer>.muted');if(caption&&edition.texts[caption.dataset.text]===undefined){const date=new Date(eventTimestamp(edition.event));caption.textContent='🎄 '+new Intl.DateTimeFormat('pt-BR',{timeZone:edition.event.timezone,day:'numeric',month:'long'}).format(date)+' • '+edition.event.time.replace(':','h')}
  imageSection('banner');imageSection('decor');prizes();prizeNavigation();socials();rankingShell();
  for(const [parentId,order]of Object.entries(edition.orders||{})){const parent=E(parentId);if(parent&&Array.isArray(order))for(const id of order){const child=E(id);if(child?.parentElement===parent)parent.append(child)}}
  if(mobileHeaderActive()){const note=E(PRIZE_NOTE_NODE);if(note)root.querySelector('.prizes').before(note)}
  if(!edition.active){root.querySelector('.heading').hidden=true;root.querySelector('main').hidden=true;root.querySelector('nav').hidden=true;const inactive=document.createElement('section');inactive.className='inactive';inactive.append(fillText(document.createElement('h1'),'inactiveTitle'),fillText(document.createElement('p'),'inactiveBody'));root.querySelector('.viewport').append(inactive)}
  root.querySelector('#g-timer').hidden=!edition.event.visible;
  for(const [id,style]of Object.entries(edition.styles)){const el=E(id);if(el)Object.assign(el.style,safeStyles(style))}
  for(const id of edition.hidden){const el=E(id);if(el)el.hidden=true}
  const bannerGap=edition.images.banner.gapBefore;
  if(Number.isFinite(bannerGap)&&bannerGap>=0){
    const countdownArea=root.querySelector('#g-timer'),date=countdownArea.querySelector(':scope>.muted'),bannerArea=root.querySelector('#g-banner');
    // Let this control set the actual date-to-banner gap, including legacy fixed heights.
    countdownArea.style.height='auto';countdownArea.style.minHeight='0px';countdownArea.style.paddingBottom='0px';countdownArea.style.marginBottom=bannerGap+'px';
    date.style.marginBottom='0px';bannerArea.style.marginTop='0px';bannerArea.style.paddingTop='0px';bannerArea.querySelector('.banner').style.marginTop='0px';
  }

  root.style.background=edition.theme.background||'';
  root.querySelector('.viewport').style.background=edition.theme.background||'';
  root.style.fontFamily=edition.theme.fontFamily||'';
  document.querySelector('#custom-fonts')?.remove();const fontStyle=document.createElement('style');fontStyle.id='custom-fonts';for(const f of edition.fonts){const src=safeUrl(f.src,true);if(src&&/^[\w -]{1,60}$/.test(f.name))fontStyle.textContent+=`@font-face{font-family:"${f.name}";src:url("${src}") format("woff2");font-display:swap}`};document.head.append(fontStyle);
  document.querySelector('#web-fonts')?.remove();if(edition.theme.webFont&&/^[\w -]{1,60}$/.test(edition.theme.webFont)){const link=document.createElement('link');link.id='web-fonts';link.rel='stylesheet';link.href='https://fonts.googleapis.com/css2?family='+encodeURIComponent(edition.theme.webFont)+':wght@400;700&display=swap';document.head.append(link)}
  responsiveNavigation();setupNav();updateTimer();timer=setInterval(updateTimer,1000);refreshRanking();rankingInterval=setInterval(refreshRanking,Math.max(10,edition.ranking.refreshMinutes)*60000);
  if(editing){root.addEventListener('click',selectClick,{capture:true});sendCatalog();if(selected)E(selected)?.classList.add('selected')}
  window.GLzando={config:()=>structuredClone(config),appearance:()=>structuredClone(edition),device:()=>mobileHeaderActive()?'mobile':'desktop',refreshRanking:()=>refreshRanking(true),render};
}
function sendCatalog(){const items=[...root.querySelectorAll('[data-node]')].map(el=>({id:el.dataset.node,text:el.dataset.text||null,label:label(el),tag:el.tagName,inHeader:!!el.closest('.heading'),inPrizes:!!el.closest('#g-prizes'),editableContainer:el.matches('.rules,.steps,ul,ol'),html:tokenTemplate(el.innerHTML)}));window.parent.postMessage({type:'glz-catalog',items},location.origin)}
function selectClick(e){if(!editing||e.target.closest('.prize-navigation')||(e.detail>0&&e.target.closest('.prizes,.nav')?.dataset.dragClickBlocked==='true'))return;e.preventDefault();e.stopPropagation();const el=e.target.closest('[data-text]')||e.target.closest('[data-node]');if(!el)return;selected=el.dataset.node;root.querySelectorAll('.selected').forEach(el=>el.classList.remove('selected'));el.classList.add('selected');window.parent.postMessage({type:'glz-select',id:selected,inHeader:!!el.closest('.heading'),inPrizes:!!el.closest('#g-prizes'),image:el.dataset.imageKind?{kind:el.dataset.imageKind,id:el.dataset.prizeId||null}:null,text:el.dataset.text||null,html:el.dataset.text?edition.texts[el.dataset.text]??tokenTemplate(el.innerHTML):null,label:label(el),parent:el.parentElement.dataset.node,siblings:[...el.parentElement.children].map(c=>c.dataset.node).filter(Boolean),computed:Object.fromEntries(STYLE_KEYS.map(k=>[k,getComputedStyle(el)[k]]))},location.origin)}
window.addEventListener('message',e=>{if(!editing||e.origin!==location.origin||e.source!==window.parent)return;if(e.data.type==='glz-config'){previewDevice=['desktop','mobile'].includes(e.data.device)?e.data.device:null;render(e.data.config);if(e.data.refreshSelection)E(e.data.refreshSelection)?.click()}if(e.data.type==='glz-focus'){const el=E(e.data.id);el?.scrollIntoView({block:'center'});el?.click()}});
mobileHeaderQuery.addEventListener('change',()=>{if(config&&!(editing&&previewDevice)){const query=root.querySelector('.rank-search')?.value||'';render(config);const search=root.querySelector('.rank-search');if(search)search.value=query}});
try{const response=await fetch('config.json',{cache:'no-store'});if(!response.ok)throw Error();render(await response.json())}catch{root.innerHTML='<p role="alert" style="padding:30px">Não foi possível carregar a configuração. Abra o projeto pelo Iniciar GLzando.cmd.</p>'}

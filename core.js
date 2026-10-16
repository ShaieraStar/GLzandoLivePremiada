export const STYLE_KEYS = ['fontFamily','fontSize','fontWeight','fontStyle','textDecoration','textAlign','color','backgroundColor','backgroundImage','letterSpacing','lineHeight','border','borderColor','borderWidth','borderStyle','borderRadius','boxShadow','textShadow','width','maxWidth','height','minHeight','margin','marginTop','marginRight','marginBottom','marginLeft','padding','paddingTop','paddingRight','paddingBottom','paddingLeft','gap','rowGap','columnGap','borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius','borderTopWidth','borderTopStyle','borderTopColor','opacity','display','alignItems','justifyContent','objectFit'];
export function safeUrl(value, image=false){
  if(typeof value!=='string')return '';
  if(image)return /^assets\/[a-zA-Z0-9_./-]+$/.test(value)&&!value.includes('..')?value:'';
  try{const u=new URL(value);return ['https:','http:','mailto:'].includes(u.protocol)?u.href:''}catch{return ''}
}
export function safeStyles(styles={}){
  const out={};for(const [k,v] of Object.entries(styles))if(STYLE_KEYS.includes(k)&&typeof v==='string'&&v.length<600&&!/url\s*\(|expression|@import|javascript|[<>\\]/i.test(v))out[k]=v;return out;
}
export function sanitizeHtml(value){
  const doc=new DOMParser().parseFromString(String(value),'text/html');
  const allowed=new Set(['B','STRONG','I','EM','U','S','STRIKE','DEL','BR','P','DIV','SPAN','UL','OL','LI','A','H1','H2','H3','H4','BLOCKQUOTE','FONT']);
  const walk=node=>{for(const el of [...node.children]){
    if(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','TEMPLATE','LINK','META','IMG','INPUT','FORM','BUTTON'].includes(el.tagName)){el.remove();continue}
    walk(el);if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);continue}
    const style=safeStyles(Object.fromEntries(STYLE_KEYS.map(k=>[k,el.style[k]]).filter(([,v])=>v)));
    const href=el.tagName==='A'?safeUrl(el.getAttribute('href')):'';
    const color=el.tagName==='FONT'?el.getAttribute('color'):null;
    const highlight=el.classList.contains('highlight');
    for(const a of [...el.attributes])el.removeAttribute(a.name);
    Object.assign(el.style,style);
    if(highlight)el.className='highlight';
    if(href){el.setAttribute('href',href);el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer')}
    if(color&&/^#[0-9a-f]{3,8}$/i.test(color))el.style.color=color;
  }};walk(doc.body);return doc.body.innerHTML;
}
export function eventTimestamp(event){
  const [y,m,d]=event.date.split('-').map(Number),[h,min]=event.time.split(':').map(Number);
  const desired=Date.UTC(y,m-1,d,h,min);let guess=desired;
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:event.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let i=0;i<4;i++){const p=Object.fromEntries(formatter.formatToParts(guess).map(x=>[x.type,x.value]));const actual=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);const delta=desired-actual;guess+=delta;if(delta===0)break}
  return guess;
}
export function countdown(timestamp,now=Date.now()){
  let s=Math.max(0,Math.floor((timestamp-now)/1000));const days=Math.floor(s/86400);s%=86400;const hours=Math.floor(s/3600);s%=3600;return [days,hours,Math.floor(s/60),s%60];
}
export function rankUsers(users, minimum=10,excluded=[]){
  const blocked=new Set(excluded.map(x=>String(x).toLowerCase()));
  return [...new Map(users.filter(x=>typeof x.username==='string'&&Number.isFinite(x.points)&&x.points>=minimum&&!blocked.has(x.username.toLowerCase())).map(x=>[x.username.toLowerCase(),{username:x.username,points:x.points}])).values()].sort((a,b)=>b.points-a.points||a.username.localeCompare(b.username)).map((u,i)=>({...u,position:i+1}));
}
export async function fetchAllPoints(channel,{fetcher=fetch,pageSize=100,signal}={}){
  if(!/^[a-f\d]{24}$/i.test(channel))throw new Error('ID do canal inválido.');
  const users=[],seen=new Set();let offset=0,total=Infinity;
  while(offset<total){
    const response=await fetcher(`https://api.streamelements.com/kappa/v2/points/${channel}/top?limit=${pageSize}&offset=${offset}`,{headers:{Accept:'application/json'},signal});
    if(!response.ok)throw new Error(response.status===429?'Limite de consultas atingido. Tente novamente mais tarde.':`StreamElements respondeu HTTP ${response.status}.`);
    const data=await response.json();if(!Array.isArray(data.users))throw new Error('Resposta do StreamElements não reconhecida.');
    if(Number.isFinite(data._total))total=data._total;
    if(!data.users.length){if(offset<total&&total!==Infinity)throw new Error('A API encerrou a paginação antes do total informado.');break}
    const signature=data.users.map(u=>u.username).join('|');if(seen.has(signature))throw new Error('A API repetiu uma página. Não foi possível confirmar o ranking completo.');seen.add(signature);
    users.push(...data.users);offset+=data.users.length;
    if(total===Infinity&&data.users.length<pageSize)break;
  }
  return {users,total:Number.isFinite(total)?total:users.length,updatedAt:new Date().toISOString()};
}

// Image dimensions accept pixels (including bare numbers), percentages and auto.
export function normalizeImageDimension(value,fallback='auto'){
  const text=String(value??'').trim().toLowerCase();
  if(text==='auto')return 'auto';
  const match=text.match(/^(\d+(?:\.\d+)?|\.\d+)\s*(px|%)?$/);
  return match?Number(match[1])+(match[2]||'px'):fallback;
}
export function resolveImageDimensions(options,natural,available){
  const width=normalizeImageDimension(options.width),height=normalizeImageDimension(options.height);
  const ratio=natural.width/natural.height||1;
  let w=width==='auto'?natural.width:parseFloat(width)*(width.endsWith('%')?available/100:1);
  let h=height==='auto'?w/ratio:parseFloat(height)*(height.endsWith('%')?(w/ratio)/100:1);
  if(width==='auto'&&height!=='auto')w=h*ratio;
  if(w>available&&w>0){h*=available/w;w=available}
  return {width:Math.max(0,w),height:Math.max(0,h)};
}


export const MOBILE_HEADER_BREAKPOINT=768;
// Existing desktop settings remain untouched. Mobile overrides concern only the header.
export function mobileHeaderAppearance(edition){
  const saved=edition.mobileHeader||{},styles={
    n10:{...edition.styles.n10,width:'100%',maxWidth:'100%',height:'auto',minHeight:'0px',paddingTop:'28px',paddingBottom:'12px',paddingLeft:'12px',paddingRight:'12px'},
    n13:{...edition.styles.n13,width:'100%',maxWidth:'100%',fontSize:'26px',lineHeight:'1.15',textAlign:'center',marginTop:'0px',marginRight:'0px',marginBottom:'0px',marginLeft:'0px'}
  };
  for(const[id,patch]of Object.entries(saved.styles||{}))styles[id]={...(styles[id]||edition.styles[id]||{}),...patch};
  return {styles,decor:{...edition.images.decor,width:'56px',height:'auto',left:'4px',right:'0px',anchorX:'left',top:'0px',reserveSpace:false,...saved.decor},visibility:saved.visibility||{}};
}
export function headerEdition(edition,mobile=false){
  if(!mobile)return edition;
  const header=mobileHeaderAppearance(edition),hidden=new Set(edition.hidden);
  for(const[id,visible]of Object.entries(header.visibility))visible?hidden.delete(id):hidden.add(id);
  return {...edition,styles:{...edition.styles,...header.styles},images:{...edition.images,decor:header.decor},hidden:[...hidden]};
}

// Stable ID from the retained approved template; only this notice moves on mobile.
export const PRIZE_NOTE_NODE='n53';
export function mobilePrizeImageSize(edition,prize){return {width:'100%',height:'auto',fit:prize.imageSize?.fit||'contain',...(edition.mobilePrizes?.images?.[prize.id]||{})}}
export function mobilePrizeAppearance(edition){
  const saved=edition.mobilePrizes||{},styles={
    [PRIZE_NOTE_NODE]:{...edition.styles[PRIZE_NOTE_NODE],width:'100%',maxWidth:'100%',height:'auto',minHeight:'0px',marginTop:'0px',marginBottom:'12px'}
  };
  for(const[id,patch]of Object.entries(saved.styles||{}))styles[id]={...(styles[id]||edition.styles[id]||{}),...patch};
  return {styles,texts:saved.texts||{},visibility:saved.visibility||{}};
}
export function prizeEdition(edition,mobile=false){
  if(!mobile)return edition;
  const profile=mobilePrizeAppearance(edition),hidden=new Set(edition.hidden);
  for(const[id,visible]of Object.entries(profile.visibility))visible?hidden.delete(id):hidden.add(id);
  return {...edition,styles:{...edition.styles,...profile.styles},texts:{...edition.texts,...profile.texts},prizes:edition.prizes.map(prize=>({...prize,imageSize:mobilePrizeImageSize(edition,prize)})),hidden:[...hidden]};
}

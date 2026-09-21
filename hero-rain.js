/* ═══════════════════════════════════════════════════════════════
   Void Matrix — landing page hero (matrix rain + reveal observer).

   Split out of an inline <script> in index.html so the page can run
   under a Content-Security-Policy with script-src 'self'. Behaviour is
   unchanged.
   ═══════════════════════════════════════════════════════════════ */
// ── MATRIX RAIN ──────────────────────────────────
// Skipped entirely when the OS asks for reduced motion.
if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
const canvas=document.getElementById('heroCanvas');
const ctx=canvas.getContext('2d');
const CHARS='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
let drops=[];
const FS=13;

function resize(){
  canvas.width=canvas.offsetWidth;
  canvas.height=canvas.offsetHeight;
  const cols=Math.floor(canvas.width/FS);
  drops=Array.from({length:cols},()=>Math.random()*-canvas.height/FS);
}
resize();
window.addEventListener('resize',resize);

function rain(){
  ctx.fillStyle='rgba(1,1,3,0.06)';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.font=FS+'px monospace';
  drops.forEach((y,i)=>{
    const ch=CHARS[Math.floor(Math.random()*CHARS.length)];
    ctx.fillStyle=`rgba(0,224,68,${Math.random()*0.5+0.15})`;
    ctx.fillText(ch,i*FS,y*FS);
    if(y*FS>canvas.height&&Math.random()>0.975) drops[i]=0;
    drops[i]+=0.4;
  });
}
setInterval(rain,50);

// ── HERO GLITCH ───────────────────────────────────
const GLITCH='█▓▒░▄▀■◆∞∅⊕';
const NOISE='01';

function glitchEl(el,target,onDone){
  el.innerHTML='';
  const spans=target.split('').map(ch=>{
    const s=document.createElement('span');
    s.dataset.ch=ch;
    s.textContent=ch===' '?' ':NOISE[Math.floor(Math.random()*2)];
    el.appendChild(s);
    return s;
  });
  const n=setInterval(()=>{
    spans.forEach(s=>{
      if(!s.classList.contains('r')&&s.dataset.ch!==' '){
        s.textContent=Math.random()<0.5?NOISE[Math.floor(Math.random()*2)]:GLITCH[Math.floor(Math.random()*GLITCH.length)];
        s.style.color=Math.random()<0.12?'var(--acc)':'';
      }
    });
  },40);
  setTimeout(()=>{
    clearInterval(n);
    let done=0;
    const valid=spans.filter(s=>s.dataset.ch!==' ');
    spans.forEach((s,i)=>{
      if(s.dataset.ch===' '){s.textContent=' ';return;}
      const g=setInterval(()=>{if(!s.classList.contains('r'))s.textContent=GLITCH[Math.floor(Math.random()*GLITCH.length)];},35);
      setTimeout(()=>{
        clearInterval(g);
        s.textContent=s.dataset.ch;s.style.color='';s.classList.add('r');
        done++;
        if(done>=valid.length&&onDone) onDone();
      },i*44+Math.random()*55);
    });
  },520);
}

setTimeout(()=>{
  glitchEl(document.getElementById('heroVoid'),'VOID',()=>{
    setTimeout(()=>glitchEl(document.getElementById('heroAcc'),'MATRIX'),100);
  });
},500);

// ── LIVE DEMO ─────────────────────────────────────
const ALPHA='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function bG(kw){
  kw=(kw||'OBSCURE').toUpperCase();
  const s=new Set(),g=[];
  for(const c of kw) if(ALPHA.includes(c)&&!s.has(c)){s.add(c);g.push(c);}
  for(const c of ALPHA) if(!s.has(c)){s.add(c);g.push(c);}
  const m=[];for(let r=0;r<6;r++) m.push(g.slice(r*6,r*6+6));
  return m;
}
function fnd(m,ch){for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(m[r][c]===ch)return[r+1,c+1];return null;}
function gt(m,r,c){return m[r-1][c-1];}
function pSh(s){const d=s.replace(/\D/g,'');return(d||'1').split('').map(Number);}
function svv(v,s){return(((v-1+s)%6)+1);}
function cT(seq,kw){
  kw=kw.toUpperCase().replace(/[^A-Z]/g,'')||'A';
  const L=kw.length,n=seq.length,fr=Math.floor(n/L),rem=n%L;
  const tbl=Array.from({length:L},()=>[]);
  let idx=0;const rows=fr+(rem?1:0);
  for(let r=0;r<rows;r++)for(let c=0;c<L;c++)if(idx<n)tbl[c].push(seq[idx++]);
  const ord=kw.split('').map((c,i)=>({c,i})).sort((a,b)=>a.c<b.c?-1:a.c>b.c?1:a.i-b.i);
  const res=[];for(const{i}of ord)res.push(...tbl[i]);
  return res;
}
function enc(txt){
  const m=bG('OBSCURE'),sh=pSh('719');
  const clean=txt.toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!clean)return'';
  const rows=[],cols=[];
  for(const c of clean){const p=fnd(m,c);if(p){rows.push(p[0]);cols.push(p[1]);}}
  const sr=rows.map((v,i)=>svv(v,sh[i%sh.length]));
  const sc=cols.map((v,i)=>svv(v,sh[i%sh.length]));
  const trans=cT([...sr,...sc],'VOID');
  let ct='';
  for(let i=0;i<trans.length-1;i+=2)ct+=gt(m,trans[i],trans[i+1]);
  return ct;
}

let dd=null;
document.getElementById('demoInput').addEventListener('input',function(){
  clearTimeout(dd);
  const val=this.value.trim();
  const out=document.getElementById('demoOutput');
  if(!val){out.textContent='awaiting input...';out.className='demo-output empty';return;}
  dd=setTimeout(()=>{
    const ct=enc(val);
    out.textContent=ct||'awaiting input...';
    out.className=ct?'demo-output':'demo-output empty';
  },60);
});

// ── SCROLL REVEAL ─────────────────────────────────
const obs=new IntersectionObserver(entries=>{
  entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible');});
},{threshold:0.1});
document.querySelectorAll('.reveal').forEach(el=>obs.observe(el));
}

// ═══════════════════════════════════════════════
// CIPHER ENGINE - 6x6 (A-Z + 0-9, I and J distinct)
// ═══════════════════════════════════════════════

// Version comes from version.js so the page stamp, the service worker
// cache key and the dossier header cannot drift apart.
const VMC_VERSION=(self.VMC_VERSION_LABEL||'v?');
const GRID_SZ=6;
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; // 36 chars, I and J are distinct

function buildGrid(kw){
  kw=(kw||'OBSCURE').toUpperCase();
  const seen=new Set(),g=[];
  for(const c of kw) if(ALPHABET.includes(c)&&!seen.has(c)){seen.add(c);g.push(c);}
  for(const c of ALPHABET) if(!seen.has(c)){seen.add(c);g.push(c);}
  const m=[];
  for(let r=0;r<GRID_SZ;r++) m.push(g.slice(r*GRID_SZ,r*GRID_SZ+GRID_SZ));
  // find() used to scan all 36 cells for every character of every pass.
  // Build the reverse lookup once per grid instead and read it in O(1).
  // Non-enumerable so nothing iterating the matrix trips over it.
  const idx=new Map();
  for(let r=0;r<GRID_SZ;r++)
    for(let c=0;c<GRID_SZ;c++)
      idx.set(m[r][c],Object.freeze([r+1,c+1]));
  Object.defineProperty(m,'index',{value:idx,enumerable:false});
  return m;
}
function find(m,ch){
  ch=String(ch).toUpperCase();
  if(m.index) return m.index.get(ch)||null;
  // Fallback for a matrix built by hand rather than by buildGrid().
  for(let r=0;r<GRID_SZ;r++)
    for(let c=0;c<GRID_SZ;c++)
      if(m[r][c]===ch) return [r+1,c+1];
  return null;
}
function get(m,r,c){return m[r-1][c-1];}
function cleanInput(txt){
  return txt.toUpperCase().replace(/[^A-Z0-9]/g,'');
}
function parseSh(s){const d=s.replace(/\D/g,'');return(d||'1').split('').map(Number);}
function sv(v,s,add){
  // coords 1-6, modulo 6
  return add?(((v-1+s)%6)+1):(((v-1-s+600)%6)+1);
}
function applyShift(seq,sh,add){return seq.map((v,i)=>sv(v,sh[i%sh.length],add));}

function colTrans(seq,kw){
  kw=kw.toUpperCase().replace(/[^A-Z]/g,'')||'A';
  const L=kw.length,n=seq.length,fr=Math.floor(n/L),rem=n%L;
  const tbl=Array.from({length:L},()=>[]);
  let idx=0;const rows=fr+(rem?1:0);
  for(let r=0;r<rows;r++) for(let c=0;c<L;c++) if(idx<n) tbl[c].push(seq[idx++]);
  const ord=kw.split('').map((c,i)=>({c,i})).sort((a,b)=>a.c<b.c?-1:a.c>b.c?1:a.i-b.i);
  const res=[];for(const{i}of ord)res.push(...tbl[i]);
  return{res,tbl,ord,kw,fr,rem,rows};
}
function revColTrans(seq,kw){
  kw=kw.toUpperCase().replace(/[^A-Z]/g,'')||'A';
  const L=kw.length,n=seq.length,fr=Math.floor(n/L),rem=n%L;
  const ht=Array.from({length:L},(_,i)=>i<rem?fr+1:fr);
  const ord=kw.split('').map((c,i)=>({c,i})).sort((a,b)=>a.c<b.c?-1:a.c>b.c?1:a.i-b.i);
  const cols=Array.from({length:L},()=>[]);
  let p=0;for(const{i}of ord){cols[i]=seq.slice(p,p+ht[i]);p+=ht[i];}
  const res=[],rows=fr+(rem?1:0);
  for(let r=0;r<rows;r++) for(let c=0;c<L;c++) if(r<cols[c].length) res.push(cols[c][r]);
  return res;
}

function encrypt(txt,gk,tk,ss){
  const m=buildGrid(gk),sh=parseSh(ss);
  const clean=cleanInput(txt);
  if(!clean) throw Error('no valid characters in input');
  const rows=[],cols=[],chars=[];
  for(const c of clean){const p=find(m,c);if(p){rows.push(p[0]);cols.push(p[1]);chars.push(c);}}
  const sr=applyShift(rows,sh,true),sc=applyShift(cols,sh,true);
  const lin=[...sr,...sc];
  const td=colTrans(lin,tk);const trans=td.res;
  let ct='';const rcmb=[];
  for(let i=0;i<trans.length-1;i+=2){const l=get(m,trans[i],trans[i+1]);ct+=l;rcmb.push({r:trans[i],c:trans[i+1],l});}
  return{ct,steps:{m,clean,chars,rows,cols,sh,sr,sc,lin,td,trans,rcmb}};
}
function decrypt(ct,gk,tk,ss){
  const m=buildGrid(gk),sh=parseSh(ss);
  const clean=cleanInput(ct);
  if(!clean) throw Error('no valid characters in input');
  const trans=[];
  for(const c of clean){const p=find(m,c);if(p){trans.push(p[0],p[1]);}}
  const lin=revColTrans(trans,tk);
  const n=Math.floor(lin.length/2);
  const sr=lin.slice(0,n),sc=lin.slice(n,n*2);
  const rows=applyShift(sr,sh,false),cols=applyShift(sc,sh,false);
  let pt='';for(let i=0;i<n;i++) pt+=get(m,rows[i],cols[i]);
  return{pt,steps:{m,trans,lin,n,sr,sc,rows,cols}};
}

// ═══════════════════════════════════════════════
// TWO-COLOR CELL FLASH
// ═══════════════════════════════════════════════

function flashCell(r,c,cls){
  const table=document.getElementById('gmat');
  const cell=table.rows[r]&&table.rows[r].cells[c];
  if(!cell||!cell.classList.contains('gval'))return;
  cell.classList.remove('flash-src','flash-out');
  void cell.offsetWidth;
  cell.classList.add(cls);
}

function flashCells(srcCoords,outCoords){
  const srcSeen=new Set(),outSeen=new Set();
  (srcCoords||[]).forEach(([r,c])=>{
    const k=`${r},${c}`;if(!srcSeen.has(k)){srcSeen.add(k);flashCell(r,c,'flash-src');}
  });
  setTimeout(()=>{
    (outCoords||[]).forEach(([r,c])=>{
      const k=`${r},${c}`;if(!outSeen.has(k)){outSeen.add(k);flashCell(r,c,'flash-out');}
    });
  },80);
}

// ═══════════════════════════════════════════════
// SHARE BLOB  (VMC-MSG:base64)
// ═══════════════════════════════════════════════

function flashBtn(id,ok){
  const btn=document.getElementById(id)||document.querySelector(`[data-btn="${id}"]`);
  if(!btn)return;
  btn.classList.remove('flash-ok','flash-err');
  void btn.offsetWidth;
  btn.classList.add(ok?'flash-ok':'flash-err');
  setTimeout(()=>btn.classList.remove('flash-ok','flash-err'),600);
}

// ── Blob codec ────────────────────────────────────────────────────────────
// btoa() is Latin-1 only, so any key outside that range threw. SEANCE is in
// the built-in wordlist and any emoji or CJK key would hard-fail. This is
// UTF-8 safe and URL-safe, so blobs also survive being pasted into a link.
function b64uEncode(str){
  const bytes=new TextEncoder().encode(str);
  let bin='';
  bytes.forEach(b=>{bin+=String.fromCharCode(b);});
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64uDecode(str){
  let t=str.replace(/-/g,'+').replace(/_/g,'/');
  while(t.length%4) t+='=';
  const bin=atob(t);
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  try{ return new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
  catch(e){ return bin; } // legacy blobs written with raw btoa()
}
function makeBlob(gk,tk,ss,ct,passes){
  return 'VMC-MSG:'+b64uEncode(JSON.stringify([gk,tk,ss,ct,passes]));
}
function readBlob(v){
  const parts=JSON.parse(b64uDecode(v.slice(8)));
  if(!Array.isArray(parts)||parts.length<4) throw Error('bad blob');
  return parts;
}

function encodeMsg(){
  const ct=document.getElementById('outBox').dataset.val||'';
  const gk=document.getElementById('gk').value.trim()||'OBSCURE';
  const tk=lastUsedTk||document.getElementById('tk').value.trim()||'VOID';
  const ss=document.getElementById('ss').value.trim()||'719';
  const passes=parseInt(document.getElementById('passInp').value)||1;
  if(!ct){
    flashBtn('shareBtnEnc',false);
    kpMsg('✗ ENCRYPT SOMETHING FIRST','var(--dim-r)');
    return;
  }
  const blob=makeBlob(gk,tk,ss,ct,passes);
  document.getElementById('shareInp').value=blob;
  fallbackCopy(blob,null);
  flashBtn('shareBtnEnc',true);
  kpMsg('✓ BLOB COPIED','var(--t2)');
}

function decodeMsg(){
  const v=document.getElementById('shareInp').value.trim();
  if(!v.startsWith('VMC-MSG:')){
    flashBtn('shareBtnLoad',false);
    kpMsg('✗ INVALID - PASTE A VMC-MSG: STRING','var(--dim-r)');
    return;
  }
  try{
    const parts=readBlob(v);
    const[gk,tk,ss,ct,passes=1]=parts;
    document.getElementById('gk').value=gk;
    document.getElementById('tk').value=tk;
    document.getElementById('ss').value=ss;
    document.getElementById('passInp').value=passes;
    document.getElementById('passHint').textContent=['single pass','double pass','triple pass','quad pass'][(passes||1)-1]||'single pass';
    blobPasses=passes;
    renderGrid(buildGrid(gk));
    updateKeyStrength();
    mode='dec';
    document.getElementById('mbtnE').classList.remove('on');
    document.getElementById('mbtnD').classList.add('on');
    document.getElementById('inLbl').textContent='CIPHERTEXT';
    document.getElementById('outLbl').textContent='PLAINTEXT';
    document.getElementById('mainBtn').textContent='▸ DECRYPT';
    document.getElementById('inp').placeholder='paste ciphertext...';
    hideErr();resetOut();
    document.getElementById('inp').value=ct;
    go();
    flashBtn('shareBtnLoad',true);
    kpMsg('✓ LOADED + DECRYPTED','var(--t2)');
    // Scroll cipher area down to show output
    setTimeout(()=>{
      const outBox=document.getElementById('outBox');
      if(outBox&&outBox.scrollIntoView) outBox.scrollIntoView({behavior:'smooth',block:'nearest'});
    },80);
  }catch(e){
    flashBtn('shareBtnLoad',false);
    kpMsg('✗ CORRUPT BLOB','var(--dim-r)');
  }
}

// ═══════════════════════════════════════════════
// STEP-THROUGH
// ═══════════════════════════════════════════════

let stepState=null; // {chars,srcCoords,outCoords,idx,playing,timer}

function togStep(){
  const b=document.getElementById('stepBody'),a=document.getElementById('stepArrow');
  const o=b.classList.toggle('o');a.classList.toggle('o',o);
}

function initStep(steps,isEnc){
  if(stepState&&stepState.timer)clearInterval(stepState.timer);
  const matrix=steps.matrix;
  let chars,srcCoords,outCoords;
  if(isEnc){
    chars=steps.chars;
    srcCoords=steps.chars.map((_,i)=>[steps.rows[i],steps.cols[i]]);
    outCoords=steps.rcmb.map(({r,c})=>[r,c]);
  }else{
    chars=[];srcCoords=[];outCoords=[];
    const n=steps.n;
    for(let i=0;i<n;i++){
      chars.push(get(matrix,steps.rows[i],steps.cols[i]));
      srcCoords.push([steps.sr[i],steps.sc[i]]);
      outCoords.push([steps.rows[i],steps.cols[i]]);
    }
  }
  stepState={chars,srcCoords,outCoords,idx:0,playing:false,timer:null,built:'',isEnc,matrix};
  renderStepUI();
}

function renderStepUI(){
  if(!stepState)return;
  const{chars,srcCoords,outCoords,idx,built,matrix}=stepState;
  const total=chars.length;
  const info=document.getElementById('stepInfo');
  const prog=document.getElementById('stepProgress');
  document.getElementById('stepOut').textContent=built||'-';
  if(idx===0){
    info.innerHTML=`<span style="color:var(--t0)">press PLAY or advance manually</span>`;
  } else if(idx<=total){
    const i=idx-1;
    const ch=esc(chars[i]||'?');
    const src=srcCoords[i]?`(${srcCoords[i][0]},${srcCoords[i][1]})`:'?';
    const out=outCoords[i]?`(${outCoords[i][0]},${outCoords[i][1]})`:'?';
    const outCh=esc(built.slice(-1)||'?');
    info.innerHTML=`input <span class="si-char">${ch}</span> → src<span class="si-src">${src}</span> → out<span class="si-out">${out}</span> = <span class="si-out">${outCh}</span>`;
  } else {
    info.innerHTML=`<span style="color:var(--acc)">✓ COMPLETE - ${total} CHARS</span>`;
  }
  prog.textContent=idx>0?`${Math.min(idx,total)} / ${total}`:'';
  document.getElementById('stepPlayBtn').textContent=stepState.playing?'⏸ PAUSE':'▸ PLAY';
}

function stepAdvance(){
  if(!stepState)return;
  const{chars,srcCoords,outCoords,idx,matrix}=stepState;
  if(idx>=chars.length){stepStop();return;}
  if(srcCoords[idx])flashCell(srcCoords[idx][0],srcCoords[idx][1],'flash-src');
  if(outCoords[idx])setTimeout(()=>flashCell(outCoords[idx][0],outCoords[idx][1],'flash-out'),80);
  const outCoord=outCoords[idx];
  const outChar=(outCoord&&matrix)?get(matrix,outCoord[0],outCoord[1]):'?';
  stepState.built+=outChar;
  stepState.idx++;
  renderStepUI();
  if(stepState.idx>=chars.length)stepStop();
}

function stepTogglePlay(){
  if(!stepState){setStat('RUN CIPHER FIRST','');return;}
  if(stepState.playing){stepStop();}
  else{
    if(stepState.idx>=stepState.chars.length){stepReset();}
    stepState.playing=true;
    const spd=parseInt(document.getElementById('speedInp').value)||5;
    const ms=Math.round(1200/spd);
    stepState.timer=setInterval(stepAdvance,ms);
    renderStepUI();
  }
}

function stepStop(){
  if(stepState){
    stepState.playing=false;
    if(stepState.timer){clearInterval(stepState.timer);stepState.timer=null;}
  }
  renderStepUI();
}

function stepReset(){
  if(!stepState)return;
  stepStop();
  stepState.idx=0;stepState.built='';
  renderStepUI();
}

// ═══════════════════════════════════════════════
// THEME / HUE
// ═══════════════════════════════════════════════

const PRESETS=[
  {name:'VOID',    h:135},
  {name:'BLOOD',   h:0},
  {name:'SPECTER', h:270},
  {name:'AMBER',   h:38},
  {name:'ICE',     h:195},
  {name:'GOLD',    h:52},
];

function hslToHex(h,s,l){
  s/=100;l/=100;
  const a=s*Math.min(l,1-l);
  const f=n=>{const k=(n+h/30)%12;const c=l-a*Math.max(Math.min(k-3,9-k,1),-1);return Math.round(255*c).toString(16).padStart(2,'0');}
  return`#${f(0)}${f(8)}${f(4)}`;
}

// ── Contrast-aware palette generation ────────────────────────────────────
// WCAG relative luminance and contrast ratio, so the hue picker can target a
// readability level instead of a lightness number.
const SURFACE_DARKEST='#070a0d';   // --win, the darkest surface text sits on
function relLum(hex){
  const ch=[1,3,5].map(i=>{
    const v=parseInt(hex.slice(i,i+2),16)/255;
    return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);
  });
  return 0.2126*ch[0]+0.7152*ch[1]+0.0722*ch[2];
}
function contrast(a,b){
  const la=relLum(a),lb=relLum(b);
  return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05);
}
// Smallest lightness at the given hue and saturation that still clears the
// target ratio against the darkest surface. Monotonic in lightness above
// mid-grey, so a binary search is exact enough and keeps the colour as
// saturated-looking as the target allows.
function solveLightness(h,s,target){
  let lo=25,hi=97,best=hslToHex(h,s,hi);
  for(let i=0;i<22;i++){
    const mid=(lo+hi)/2, hex=hslToHex(h,s,mid);
    if(contrast(hex,SURFACE_DARKEST)>=target){ best=hex; hi=mid; } else { lo=mid; }
  }
  return best;
}

function applyHue(h){
  const r=document.documentElement.style;
  // Each text level is solved for a target contrast ratio rather than given
  // a fixed lightness. Hues differ enormously in intrinsic luminance -- pure
  // red and pure blue are far darker than green at the same HSL lightness --
  // so fixed values meant the palette was readable at green and failed WCAG
  // at red, blue and magenta. Solving per hue holds every level at the same
  // measured ratio whatever colour the user picks. Borders stay dark and are
  // left on fixed lightness: they are chrome, never text.
  const acc=solveLightness(h,100,4.6);
  const t4=solveLightness(h,48,13.5);
  const t3=solveLightness(h,40,11.0);
  const t2=solveLightness(h,34,8.5);
  const t1=solveLightness(h,30,6.5);
  const t0=solveLightness(h,26,4.6);
  const bd2=hslToHex(h,30,25);
  const bd1=hslToHex(h,28,16);
  const bd0=hslToHex(h,22,10);
  // parse acc to rgb for rgba vars
  const rv=parseInt(acc.slice(1,3),16),gv=parseInt(acc.slice(3,5),16),bv=parseInt(acc.slice(5,7),16);
  r.setProperty('--acc',acc);
  r.setProperty('--t0',t0);r.setProperty('--t1',t1);r.setProperty('--t2',t2);r.setProperty('--t3',t3);r.setProperty('--t4',t4);
  r.setProperty('--bd0',bd0);r.setProperty('--bd1',bd1);r.setProperty('--bd2',bd2);
  r.setProperty('--accg',`rgba(${rv},${gv},${bv},0.11)`);
  r.setProperty('--accg2',`rgba(${rv},${gv},${bv},0.22)`);
  document.getElementById('hueSlider').value=h;
  // Do not persist while CYCLIC is animating the hue every 40ms
  if(typeof savePref==='function'&&!(typeof dmtActive!=='undefined'&&dmtActive)) savePref('hue',h);
  // update active preset
  document.querySelectorAll('.preset').forEach(p=>p.classList.toggle('active',parseInt(p.dataset.h)===h));
}

function togTheme(){
  const p=document.getElementById('themePanel');
  p.classList.toggle('open');
}
// Close theme panel when clicking outside it.
// The toggle used to stopPropagation() from an inline onclick, which ran
// before this listener and kept it from undoing the open. Now that both the
// toggle and this handler are delegated from document, they fire in
// registration order on the same node and stopPropagation() no longer
// separates them — so skip the toggle's own clicks explicitly instead.
document.addEventListener('click',function(e){
  const p=document.getElementById('themePanel');
  if(!p||!p.classList.contains('open')) return;
  if(e.target&&e.target.closest&&e.target.closest('[data-act="theme"]')) return;
  if(!p.contains(e.target)) p.classList.remove('open');
});

function initTheme(){
  const row=document.getElementById('presetRow');
  PRESETS.forEach(p=>{
    const d=document.createElement('div');
    d.className='preset'+(p.h===135?' active':'');
    d.dataset.h=p.h;
    d.title=p.name;
    d.style.background=hslToHex(p.h,100,44);
    d.onclick=(e)=>{e.stopPropagation();applyHue(p.h);};
    row.appendChild(d);
  });
  document.getElementById('hueSlider').addEventListener('input',function(e){
    e.stopPropagation();applyHue(parseInt(this.value));
  });
  document.getElementById('hueSlider').addEventListener('click',e=>e.stopPropagation());
}

// ═══════════════════════════════════════════════
// NULL PAD — REMOVED in v3.1
// ═══════════════════════════════════════════════
// The 6x6 engine fractionates n characters into 2n coordinates, which is
// always even, so odd-length messages round-trip cleanly (verified across
// lengths 1-40). The old toggle appended an X that survived into the
// recipient's plaintext, i.e. it corrupted the message to solve a problem
// that did not exist. The stub below keeps any stale reference harmless.

// ═══════════════════════════════════════════════
// ROLL KEYS
// ═══════════════════════════════════════════════

const WORDLIST=['ABYSS','CIPHER','CRYPT','CURSED','DAEMON','DARK','DECAY','DREAD','ELDRITCH','ENTROPY','ETHER','FERAL','GHOST','GLOOM','GRAVE','GRIM','HAUNT','HOLLOW','INFERNAL','LIMBO','LURK','MALICE','MIRE','MORBID','NECRO','NIGHT','NOCTURN','NULL','OBSIDIAN','OCCULT','OMEN','ORACLE','PALE','PHANTOM','PLAGUE','PORTAL','RAVEN','RELIC','RIFT','RUIN','SEANCE','SHADE','SHADOW','SHROUD','SIGIL','SILENCE','SKULL','SPECTER','SPIRAL','STATIC','STYX','TOMB','TRANCE','UMBRA','VEIL','VOID','WARDEN','WRAITH','WRATH','ZENITH'];

// Keys must be unpredictable, so this draws from the platform CSPRNG.
// Math.random() is xorshift128+ in V8: weakly seeded and recoverable from
// a handful of outputs, which made every rolled key guessable. Rejection
// sampling keeps the distribution uniform rather than biasing the tail the
// way a bare modulo would.
function randInt(n){
  if(!(n>0)) return 0;
  if(typeof crypto==='undefined'||!crypto.getRandomValues)
    throw Error('no secure random source available');
  const limit=Math.floor(4294967296/n)*n;
  const buf=new Uint32Array(1);
  let v;
  do{ crypto.getRandomValues(buf); v=buf[0]; } while(v>=limit);
  return v%n;
}

function rollKeys(){
  // randInt() throws rather than falling back to Math.random(): a silent
  // downgrade to a predictable generator is worse than no roll at all.
  let gk,tk,ss;
  try{
    gk=WORDLIST[randInt(WORDLIST.length)];
    tk=WORDLIST[randInt(WORDLIST.length)].slice(0,4+randInt(4));
    let len=3+randInt(4);
    ss='';
    for(let i=0;i<len;i++) ss+=String(1+randInt(6));
  }catch(e){
    kpMsg('✗ NO SECURE RANDOM SOURCE - SET KEYS MANUALLY','var(--dim-r)');
    return;
  }
  // Shift digits are drawn 1-6, not 1-9: sv() reduces each digit mod 6, so
  // 7/8/9 were aliases for 1/2/3 and made those three shifts twice as likely
  // as 4 and 5. 6 maps to the identity shift and is kept deliberately —
  // excluding it would shrink the keyspace and leak a known-absent value.

  ['gk','tk','ss'].forEach(id=>{
    const el=document.getElementById(id);
    el.classList.remove('rolled');
    void el.offsetWidth; // reflow to retrigger animation
    el.classList.add('rolled');
  });

  document.getElementById('gk').value=gk;
  document.getElementById('tk').value=tk;
  document.getElementById('ss').value=ss;
  renderGrid(buildGrid(gk));
  kpMsg('⟳ KEYS ROLLED - SAVE WITH LOCK','var(--t3)');
  sndRoll();
}

// ═══════════════════════════════════════════════
// CHAR COUNTER
// ═══════════════════════════════════════════════

function updateCharCount(){
  const raw=document.getElementById('inp').value;
  const total=raw.length;
  const valid=cleanInput(raw).length;
  const tk=document.getElementById('tk').value.trim()||'VOID';
  const tkLen=tk.replace(/[^A-Za-z]/g,'').length||4;

  document.getElementById('charCount').textContent=`${total} CHARS · ${valid} VALID`;

  const warn=document.getElementById('charWarn');
  // Odd lengths are fine — no warning. The remaining check is the one that
  // still matters: a transposition key short enough to repeat visibly. The
  // auto-extender handles it, so this is informational rather than a defect.
  if(valid===0){
    warn.textContent=''; warn.classList.remove('show');
  } else if(valid<4){
    warn.textContent='⚠ VERY SHORT MESSAGE · WEAK DIFFUSION'; warn.classList.add('show');
  } else if(valid>tkLen*8){
    const eff=extendKey(tk,valid);
    warn.textContent=eff.extended?`KEY AUTO-EXTENDS TO ${eff.key.length} CHARS`:'';
    warn.classList.toggle('show',!!warn.textContent);
  } else {
    warn.textContent=''; warn.classList.remove('show');
  }
  // Live readout of the key that will actually be used
  const effEl=document.getElementById('effTkHint');
  if(effEl){
    const eff=extendKey(tk,Math.max(1,valid));
    effEl.textContent=eff.extended?`${eff.orig} → ${eff.key}`:eff.key;
    effEl.style.color=eff.extended?'var(--away)':'var(--t1)';
  }
}

// ═══════════════════════════════════════════════
// KEY PROFILE
// ═══════════════════════════════════════════════

function kpMsg(msg,col){
  const ok=document.getElementById('kpOk');
  ok.style.color=col;ok.textContent=msg;
  setTimeout(()=>{ok.textContent='';ok.style.color='';},2200);
}

// ═══════════════════════════════════════════════
// CRACK DIFFICULTY
// ═══════════════════════════════════════════════

function log10fac(n){let s=0;for(let i=2;i<=n;i++)s+=Math.log10(i);return s;}
function fmtSci(v){const e=Math.floor(v),m=Math.pow(10,v-e);return`${m.toFixed(1)}×10<sup>${e}</sup>`;}

// log10 of P(n,k) = n!/(n-k)! — the number of distinct grid layouts a key
// with k unique characters can actually produce.
function log10perm(n,k){let s=0;for(let i=0;i<k;i++)s+=Math.log10(n-i);return s;}

function calcCrack(gk,tk,ss){
  const gkC=(gk||'OBSCURE').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const tkC=(tk||'VOID').toUpperCase().replace(/[^A-Z]/g,'');
  const ssC=(ss||'719').replace(/\D/g,'');

  // Grid: the old model claimed 36! (10^41.6) regardless of key. That was
  // wrong — the layout is fully determined by the key's unique characters,
  // so the reachable space is P(36,u), not 36!. With u=36 this still tops
  // out at 36!, but a 4-letter key is now correctly scored near 10^6.
  const U=Math.min(36,Math.max(1,new Set(gkC).size));
  const L=Math.max(1,tkC.length);
  const N=Math.max(1,ssC.length);

  const gL=log10perm(36,U);
  const tL=log10fac(L);
  // sv() reduces every shift digit mod 6, so a digit carries log2(6) bits,
  // not log2(10): 7/8/9 are aliases for 1/2/3 and 6 is the identity. The
  // old model claimed 10^N and overstated the shift term by ~22%.
  const sL=N*Math.log10(6);
  const tot=gL+tL+sL;

  let rating,rc,bar;
  if(tot<8){rating='WEAK';rc='w';bar=12;}
  else if(tot<16){rating='MODERATE';rc='m';bar=38;}
  else if(tot<28){rating='STRONG';rc='s';bar=70;}
  else{rating='VOID';rc='v';bar=100;}

  // Dictionary keys collapse the real search space far below the structural
  // figure, so say so rather than quietly inflating the score.
  const dictHit=WORDLIST.includes(gkC)||WORDLIST.includes(tkC);

  document.getElementById('crackIn').innerHTML=
    `<div class="lstep"><div class="lstep-h">GRID · P(36,${U}) from ${U} unique key chars</div><div class="lstep-c"><span class="hi">${fmtSci(gL)}</span></div></div>`+
    `<div class="lstep"><div class="lstep-h">TRANS · ${L}! column orders</div><div class="lstep-c"><span class="hi">${fmtSci(tL)}</span></div></div>`+
    `<div class="lstep"><div class="lstep-h">SHIFT · 6<sup>${N}</sup> effective sequences</div><div class="lstep-c"><span class="hi">${fmtSci(sL)}</span></div></div>`+
    `<div class="lstep"><div class="lstep-h">COMBINED KEYSPACE</div><div class="lstep-c" style="font-size:var(--fs-value);color:var(--t3)">${fmtSci(tot)}</div></div>`+
    `<div style="padding:0 0 4px 5px;display:flex;align-items:center;gap:6px"><div style="flex:1;height:3px;background:var(--bd0)"><div style="height:100%;width:${bar}%;background:var(--acc);box-shadow:0 0 5px var(--acc);transition:width .4s"></div></div><span style="font-size:var(--fs-lg);letter-spacing:var(--ls-wider);font-family:'VT323',monospace" class="crack-tag ${rc}">${rating}</span></div>`+
    `<div class="crack-note">`+
      (dictHit?`<b>⚠ DICTIONARY KEY DETECTED.</b> A key taken from a word list is searchable in roughly 10<sup>4</sup> guesses regardless of the figure above. Use ROLL plus your own edits.<br><br>`:``)+
      `<b>Keyspace is not security.</b> This is a classical cipher: Polybius fractionation, columnar transposition and cyclic shift. That family yields to statistical analysis given enough traffic under one key, no brute force required. Treat the rating as key hygiene, not a strength guarantee.`+
    `</div>`;
  const cp=document.getElementById('crackPreview');
  if(cp) cp.textContent=rating;
}

// ═══════════════════════════════════════════════
// UI
// ═══════════════════════════════════════════════

let mode='enc';
let lastUsedTk=null; // actual tk used in last encrypt (may be auto-extended)
let blobPasses=null; // pass count from last loaded blob — warn if user changes it

function setMode(m){
  mode=m;
  if(stepState&&stepState.playing){stepStop();}
  document.getElementById('mbtnE').classList.toggle('on',m==='enc');
  document.getElementById('mbtnD').classList.toggle('on',m==='dec');
  document.getElementById('mainBtn').textContent=m==='enc'?'▸ ENCRYPT':'▸ DECRYPT';
  document.getElementById('inp').placeholder=m==='enc'?'type your message here...':'paste ciphertext...';
  document.getElementById('inp').value='';
  hideErr();resetOut();
  // Scanwipe — swap labels at midpoint
  triggerScanwipe(()=>{
    const inLbl=document.getElementById('inLbl');
    const outLbl=document.getElementById('outLbl');
    inLbl.textContent=m==='enc'?'PLAINTEXT':'CIPHERTEXT';
    outLbl.textContent=m==='enc'?'CIPHERTEXT':'PLAINTEXT';
  });
}
function resetOut(){
  const b=document.getElementById('outBox');
  b.innerHTML='<span class="out-ph">awaiting transmission...</span><button class="out-copy disabled" id="cpyBtn" data-act="copy">COPY</button>';
  b.dataset.val='';
  setStat('IDLE','VOID MATRIX '+VMC_VERSION);
  pendingLog=null;
  document.getElementById('logIn').innerHTML='<div class="lstep-c" style="color:var(--t0)">// no transmission recorded</div>';
  document.getElementById('crackIn').innerHTML='<div class="lstep-c" style="color:var(--t0)">// run cipher to calculate</div>';
  const lp=document.getElementById('logPreview'); if(lp) lp.textContent='';
  const cp2=document.getElementById('crackPreview'); if(cp2) cp2.textContent='';
  document.getElementById('verifyInline').style.display='none';
  document.getElementById('icRow').style.display='none';
  document.getElementById('outActions').style.display='none';
  chunkEnabled=false;
  document.getElementById('freqIn').innerHTML='<div class="freq-flat-note" style="color:var(--t0)">// run cipher to analyse</div>';
  const fp=document.getElementById('freqPreview'); if(fp) fp.textContent='';
  document.getElementById('stepInfo').innerHTML='<span style="color:var(--t0)">// encrypt a message first</span>';
  document.getElementById('stepOut').textContent='-';
  document.getElementById('stepProgress').textContent='';
  const sb=document.getElementById('stepBody'),sa=document.getElementById('stepArrow');
  sb.classList.remove('o');sa.classList.remove('o');
  if(stepState&&stepState.timer){clearInterval(stepState.timer);stepState.playing=false;}
  stepState=null;
  lastUsedTk=null;
  const lb=document.getElementById('logBody'),la=document.getElementById('larrow');
  lb.classList.remove('o');la.classList.remove('o');
  const cb=document.getElementById('crackBody'),ca=document.getElementById('crackArrow');
  cb.classList.remove('o');ca.classList.remove('o');
}
function clr(){
  document.getElementById('inp').value='';
  document.getElementById('charCount').textContent='0 CHARS · 0 VALID';
  document.getElementById('charWarn').textContent='';
  document.getElementById('charWarn').classList.remove('show');
  hideFixBanner();
  blobPasses=null;
  resetOut();hideErr();
}
function showErr(msg){const e=document.getElementById('errEl');e.textContent='ERR // '+msg;e.classList.add('show');}
function hideErr(){document.getElementById('errEl').classList.remove('show');}
function setStat(l,r){
  const el=document.getElementById('sbl');
  const sbar=document.querySelector('.sbar');
  el.textContent='● '+l;
  el.classList.toggle('live',l!=='IDLE');
  if(sbar) sbar.classList.toggle('live-state',l!=='IDLE');
  if(r)document.getElementById('sbr').textContent=r;
}
function doCopy(){
  const v=document.getElementById('outBox').dataset.val||'';
  if(!v)return;
  const btn=document.getElementById('cpyBtn');
  const ok=()=>{
    if(btn){
      btn.textContent='✓ COPIED';
      btn.classList.add('did-copy');
      setTimeout(()=>{
        btn.textContent='COPY';
        btn.classList.remove('did-copy');
      },1300);
    }
  };
  if(navigator.clipboard&&window.isSecureContext){
    navigator.clipboard.writeText(v).then(ok).catch(()=>fallbackCopy(v,ok));
  } else { fallbackCopy(v,ok); }
}
function fallbackCopy(text,cb){
  const ta=document.createElement('textarea');
  ta.value=text;ta.style.cssText='position:fixed;opacity:0;top:0;left:0;';
  document.body.appendChild(ta);ta.focus();ta.select();
  try{document.execCommand('copy');if(cb)cb();}catch(e){}
  document.body.removeChild(ta);
}
function togInstr(){
  const b=document.getElementById('instrBody'),a=document.getElementById('instrArrow');
  const o=b.classList.toggle('o');a.classList.toggle('o',o);
}
function togCrack(){
  const b=document.getElementById('crackBody'),a=document.getElementById('crackArrow');
  const o=b.classList.toggle('o');a.classList.toggle('o',o);
}
// buildLog() emits one DOM node per character of the message plus the whole
// transposition table, and #logBody is collapsed by default — so every run
// used to build tens of thousands of nodes into a container nobody was
// looking at. The steps are stashed and rendered on first expand instead.
let pendingLog=null;
function queueLog(isEnc,steps){
  pendingLog={isEnc,steps};
  const b=document.getElementById('logBody');
  if(b&&b.classList.contains('o')) flushLog();
}
function flushLog(){
  if(!pendingLog) return;
  const{isEnc,steps}=pendingLog;
  pendingLog=null;
  buildLog(isEnc,steps);
}
function togLog(){
  const b=document.getElementById('logBody'),a=document.getElementById('larrow');
  const o=b.classList.toggle('o');a.classList.toggle('o',o);
  if(o) flushLog();
}
function renderGrid(m,heatMap){
  const t=document.getElementById('gmat');t.innerHTML='';
  const hr=t.insertRow();hr.insertCell().className='gcoord';
  for(let c=1;c<=6;c++){const tc=hr.insertCell();tc.className='gcoord';tc.textContent=c;}
  for(let r=0;r<6;r++){
    const row=t.insertRow();const rh=row.insertCell();rh.className='gcoord';rh.textContent=r+1;
    for(let c=0;c<6;c++){
      const td=row.insertCell();td.className='gval';td.textContent=m[r][c];
      if(heatMap){
        const key=`${r+1},${c+1}`;
        const cnt=heatMap[key]||0;
        if(cnt>0){
          const intensity=Math.min(cnt/heatMap._max,1);
          const accRgb=getComputedStyle(document.documentElement).getPropertyValue('--acc').trim();
          const rv=parseInt(accRgb.slice(1,3),16)||0,gv=parseInt(accRgb.slice(3,5),16)||220,bv=parseInt(accRgb.slice(5,7),16)||68;
          td.style.boxShadow=`inset 0 0 ${4+intensity*10}px rgba(${rv},${gv},${bv},${0.12+intensity*0.35})`;
          // derive lightness from intensity, hue from current accent
          const hueMatch=accRgb.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
          if(hueMatch){
            const h=parseInt(document.getElementById('hueSlider').value)||135;
            td.style.color=`hsl(${h},60%,${28+intensity*30}%)`;
          }
        }
      }
    }
  }
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function hi(s){return`<span class="hi">${esc(s)}</span>`;}

function buildLog(isEnc,steps){
  const inn=document.getElementById('logIn');inn.innerHTML='';
  const step=(title,html)=>{
    const d=document.createElement('div');d.className='lstep';
    d.innerHTML=`<div class="lstep-h">${title}</div><div class="lstep-c">${html}</div>`;
    inn.appendChild(d);
  };
  if(isEnc){
    const{m,clean,chars,rows,cols,sh,sr,sc,lin,td,trans,rcmb}=steps;
    let mh='';for(let r=0;r<6;r++)mh+=m[r].map(c=>hi(c)).join(' ')+(r<5?'<br>':'');
    step('01 / MATRIX',mh);
    step('02 / FRACTIONATION',chars.map((c,i)=>`${hi(c)}=(${rows[i]},${cols[i]})`).join(' ')+`<br>R: ${rows.join(' ')}&nbsp;&nbsp;C: ${cols.join(' ')}`);
    step('03 / SHIFT',`shift:[${hi(sh.join(''))}]<br>R: ${rows.join(' ')} → ${hi(sr.join(' '))}<br>C: ${cols.join(' ')} → ${hi(sc.join(' '))}`);
    const{tbl,ord,kw,rows:tr}=td;
    let tstr=kw.split('').join(' ')+'\n';
    for(let r=0;r<tr;r++)tstr+=kw.split('').map((_,c)=>tbl[c][r]!==undefined?tbl[c][r]:'·').join(' ')+(r<tr-1?'\n':'');
    step('04 / TRANSPOSITION',`kw:${hi(kw)} order:${hi(ord.map(o=>o.c).join(''))}<br><pre style="font-size:var(--fs-caption);color:var(--t2);line-height:1.6;white-space:pre">${esc(tstr)}</pre>→ ${hi(trans.join(' '))}`);
    step('05 / RECOMBINATION',rcmb.map(({r,c,l})=>`(${r},${c})=${hi(l)}`).join(' '));
  }else{
    const{m,trans,lin,n,sr,sc,rows,cols}=steps;
    let mh='';for(let r=0;r<6;r++)mh+=m[r].map(c=>hi(c)).join(' ')+(r<5?'<br>':'');
    step('01 / MATRIX',mh);
    step('02 / CIPHER → COORDS',trans.join(' '));
    step('03 / UN-TRANSPOSE',`linear: ${hi(lin.join(' '))}<br>R_sh: ${sr.join(' ')}&nbsp;&nbsp;C_sh: ${sc.join(' ')}`);
    step('04 / UN-SHIFT',`R: ${hi(rows.join(' '))}<br>C: ${hi(cols.join(' '))}`);
    let pr='';for(let i=0;i<n;i++)pr+=`(${rows[i]},${cols[i]})=${hi(get(m,rows[i],cols[i]))} `;
    step('05 / PLAINTEXT',pr);
  }
}

// ═══════════════════════════════════════════════
// INDEX OF COINCIDENCE
// ═══════════════════════════════════════════════

function calcIC(text){
  // IC = sum(n_i*(n_i-1)) / (N*(N-1))  over 36-char alphabet
  const clean=cleanInput(text);
  const N=clean.length;
  if(N<2) return null;
  const freq={};
  for(const c of clean) freq[c]=(freq[c]||0)+1;
  let num=0;
  for(const c in freq) num+=freq[c]*(freq[c]-1);
  return num/(N*(N-1));
}

function renderIC(text){
  const row=document.getElementById('icRow');
  const ic=calcIC(text);
  if(ic===null){row.style.display='none';return;}

  // IC on a short string is noise. Below ~40 characters a perfectly good
  // ciphertext will read STRUCT at random, which looks like a failure.
  const clean=cleanInput(text);
  if(clean.length<40){
    document.getElementById('icVal').textContent=ic.toFixed(4);
    const t=document.getElementById('icTag');
    t.textContent='· TOO SHORT TO JUDGE';t.className='ic-tag';
    t.style.color='var(--t1)';
    row.style.display='flex';
    return;
  }
  document.getElementById('icTag').style.color='';
  const RAND_IC=1/36;
  document.getElementById('icVal').textContent=ic.toFixed(4);

  const tagEl=document.getElementById('icTag');
  if(ic<RAND_IC*1.5){
    tagEl.textContent='· FLAT';tagEl.className='ic-tag flat';
  } else if(ic<RAND_IC*3){
    tagEl.textContent='· MIXED';tagEl.className='ic-tag mid';
  } else {
    tagEl.textContent='· STRUCT';tagEl.className='ic-tag struct';
  }
  row.style.display='flex';
}

// ═══════════════════════════════════════════════
// CHUNKED OUTPUT (groups of 5)
// ═══════════════════════════════════════════════

let chunkEnabled=false;

function toggleChunk(){
  chunkEnabled=!chunkEnabled;
  const btn=document.getElementById('chunkBtn');
  btn.classList.toggle('on',chunkEnabled);
  const b=document.getElementById('outBox');
  const raw=b.dataset.val||'';
  if(!raw) return;
  const el=b.querySelector('.otext');
  if(!el) return;
  el.textContent=chunkEnabled?raw.match(/.{1,5}/g).join(' '):raw;
  el.classList.toggle('chunked',chunkEnabled);
}

// ═══════════════════════════════════════════════
// EXPORT DOSSIER (.txt)
// ═══════════════════════════════════════════════

function exportDossier(){
  const ct=document.getElementById('outBox').dataset.val||'';
  if(!ct){kpMsg('✗ NOTHING TO EXPORT','var(--dim-r)');return;}
  const gk=document.getElementById('gk').value.trim()||'OBSCURE';
  const tk=lastUsedTk||document.getElementById('tk').value.trim()||'VOID';
  const ss=document.getElementById('ss').value.trim()||'719';
  const passes=parseInt(document.getElementById('passInp').value)||1;
  const ic=calcIC(ct);
  const icStr=ic!==null?ic.toFixed(4):'--';
  const crackPrev=document.getElementById('crackPreview');
  const rating=crackPrev?crackPrev.textContent||'--':'--';
  const ts=new Date().toISOString().replace('T',' ').slice(0,19)+' UTC';
  const sep='━'.repeat(44);
  const dossier=[
    '┏'+sep+'┓',
    '┃  VOID MATRIX CIPHER · TRANSMISSION RECORD     ┃',
    '┣'+sep+'┫',
    `┃  TIMESTAMP    : ${ts}`,
    `┃  MODE         : ENCRYPT · ${passes} PASS${passes>1?'ES':''}`,
    '┣'+sep+'┫',
    `┃  GRID KEY     : ${gk}`,
    `┃  TRANS KEY    : ${tk}`,
    `┃  SHIFT SEQ    : ${ss}`,
    '┣'+sep+'┫',
    `┃  IC SCORE     : ${icStr}`,
    `┃  CRACK RATING : ${rating}`,
    '┣'+sep+'┫',
    '┃  CIPHERTEXT',
    '┃',
  ];
  const chunks=ct.match(/.{1,44}/g)||[];
  chunks.forEach(c=>dossier.push(`┃  ${c}`));
  dossier.push('┃');
  dossier.push('┗'+sep+'┛');
  dossier.push('');
  dossier.push('VMC-MSG BLOB (paste into LOAD field):');
  dossier.push(makeBlob(gk,tk,ss,ct,passes));

  const text=dossier.join('\n');

  // Try file download first (works on desktop)
  try{
    const blob=new Blob([text],{type:'text/plain'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='vmc_transmission_'+Date.now()+'.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }catch(e){}

  // Always copy to clipboard (works on mobile)
  fallbackCopy(text, null);
  if(navigator.clipboard&&window.isSecureContext){
    navigator.clipboard.writeText(text).catch(()=>{});
  }

  // Show dossier in overlay modal
  showDossierModal(text);
  kpMsg('↓ DOSSIER COPIED','var(--t2)');
}

function showDossierModal(text){
  let overlay=document.getElementById('dossierOverlay');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='dossierOverlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.92);';
    overlay.innerHTML=`
      <div style="background:var(--panel);border:1px solid var(--bd2);display:flex;flex-direction:column;width:92%;max-width:420px;max-height:82vh;box-shadow:0 0 40px rgba(0,200,50,0.08);">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--bd1);flex-shrink:0;">
          <span style="font-size:var(--fs-lg);letter-spacing:var(--ls-wider);color:var(--t3);font-family:'VT323',monospace;">TRANSMISSION DOSSIER</span>
          <div style="display:flex;gap:6px;">
            <button data-act="dossier-copy" style="padding:2px 10px;font-family:'VT323',monospace;font-size:var(--fs-body);letter-spacing:var(--ls-normal);background:transparent;border:1px solid var(--bd1);color:var(--t1);cursor:pointer;" id="dossierCopyBtn">COPY</button>
            <button data-act="dossier-close" style="padding:2px 10px;font-family:'VT323',monospace;font-size:var(--fs-body);letter-spacing:var(--ls-normal);background:transparent;border:1px solid var(--bd1);color:var(--t1);cursor:pointer;">✕</button>
          </div>
        </div>
        <pre id="dossierText" style="flex:1;overflow-y:auto;padding:10px;font-family:'Share Tech Mono',monospace;font-size:var(--fs-caption);color:var(--t2);letter-spacing:var(--ls-normal);line-height:1.7;white-space:pre;overflow-x:auto;-webkit-overflow-scrolling:touch;"></pre>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.style.display='none';});
  }
  overlay.style.display='flex';
  document.getElementById('dossierText').textContent=text;
  window._dossierText=text;
}

function copyDossier(){
  const text=window._dossierText||'';
  const btn=document.getElementById('dossierCopyBtn');
  const ok=()=>{if(btn){btn.textContent='✓ COPIED';setTimeout(()=>btn.textContent='COPY',1400);}};
  if(navigator.clipboard&&window.isSecureContext){
    navigator.clipboard.writeText(text).then(ok).catch(()=>fallbackCopy(text,ok));
  }else{fallbackCopy(text,ok);}
}

// ═══════════════════════════════════════════════
// MULTI-PASS
// ═══════════════════════════════════════════════

document.getElementById('passInp').addEventListener('input',function(){
  const raw=this.value.replace(/[^1-4]/g,'');
  const v=raw?parseInt(raw):1;
  this.value=v;
  const hints=['single pass','double pass','triple pass','quad pass'];
  document.getElementById('passHint').textContent=hints[v-1]||'single pass';
  if(blobPasses!==null&&v!==blobPasses){
    kpMsg(`⚠ BLOB USED ${blobPasses} PASS${blobPasses>1?'ES':''} — DECRYPT WILL FAIL`,'var(--away)');
  } else if(blobPasses!==null&&v===blobPasses){
    kpMsg('✓ PASSES MATCH BLOB','var(--t2)');
  }
});

// Only the final pass's steps are ever read, so keep one reference rather
// than accumulating the full coordinate arrays for every pass.
function multiEncrypt(raw,gk,tk,ss,passes){
  let ct=raw,steps=null;
  for(let i=0;i<passes;i++){
    const r=encrypt(ct,gk,tk,ss);
    ct=r.ct;steps=r.steps;
  }
  return{ct,steps};
}

function multiDecrypt(raw,gk,tk,ss,passes){
  let pt=raw,steps=null;
  for(let i=0;i<passes;i++){
    const r=decrypt(pt,gk,tk,ss);
    pt=r.pt;steps=r.steps;
  }
  return{pt,steps};
}

// ═══════════════════════════════════════════════
// FREQUENCY ANALYSIS
// ═══════════════════════════════════════════════

function renderFreq(text){
  const clean=cleanInput(text);
  const container=document.getElementById('freqIn');
  const prev=document.getElementById('freqPreview');
  if(!clean||clean.length<2){
    container.innerHTML='<div class="freq-flat-note" style="color:var(--t0)">// insufficient data</div>';
    if(prev) prev.textContent='';
    return;
  }
  const freq={};
  for(const c of clean) freq[c]=(freq[c]||0)+1;
  const sorted=Object.entries(freq).sort((a,b)=>b[1]-a[1]);
  const maxCnt=sorted[0][1];
  const N=clean.length;
  const maxBarPx=120;

  let html='';
  sorted.forEach(([ch,cnt])=>{
    const pct=(cnt/N*100).toFixed(1);
    const barW=Math.round((cnt/maxCnt)*maxBarPx);
    html+=`<div class="freq-row"><span class="freq-chr">${esc(ch)}</span><div class="freq-bar" style="width:${barW}px"></div><span class="freq-pct">${pct}%</span></div>`;
  });
  container.innerHTML=html;
  if(prev) prev.textContent=`${sorted.length} chars`;
}

function togFreq(){
  const b=document.getElementById('freqBody'),a=document.getElementById('freqArrow');
  const o=b.classList.toggle('o');a.classList.toggle('o',o);
}

// ═══════════════════════════════════════════════
// QR CODE
// ═══════════════════════════════════════════════


// ── QR library, loaded on demand ─────────────────────────────────────────
// Vendored (see the banner in qrcode.min.js). It was previously pulled from
// cdnjs at runtime, which put un-pinned third-party code in the same
// document as the plaintext and the key fields. Now it is same-origin, so
// script-src is 'self' with no exceptions and the QR works on a cold
// offline start rather than depending on a best-effort cache entry.
//
// Still loaded on demand rather than with a <script> tag in the head: it is
// 20KB that most sessions never need, and there is no reason to parse it on
// every page load. The service worker precaches it either way.
const QR_SRC='./qrcode.min.js';
let qrLibPromise=null;
function loadQRLib(){
  if(typeof QRCode!=='undefined') return Promise.resolve();
  if(qrLibPromise) return qrLibPromise;
  qrLibPromise=new Promise((resolve,reject)=>{
    const sc=document.createElement('script');
    sc.src=QR_SRC;
    sc.async=true;
    sc.onload=()=>{
      if(typeof QRCode==='undefined'){qrLibPromise=null;reject(Error('qr lib loaded but absent'));}
      else resolve();
    };
    sc.onerror=()=>{qrLibPromise=null;reject(Error('qr lib unreachable'));};
    document.head.appendChild(sc);
  });
  return qrLibPromise;
}

function showQR(){
  const ct=document.getElementById('outBox').dataset.val||'';
  const gk=document.getElementById('gk').value.trim()||'OBSCURE';
  const tk=lastUsedTk||document.getElementById('tk').value.trim()||'VOID';
  const ss=document.getElementById('ss').value.trim()||'719';
  const passes=parseInt(document.getElementById('passInp').value)||1;
  const errEl=document.getElementById('qrErr');
  const canvas=document.getElementById('qrCanvas');
  errEl.style.display='none';
  canvas.style.display='block';

  if(!ct){kpMsg('✗ ENCRYPT SOMETHING FIRST','var(--dim-r)');return;}

  const blob=makeBlob(gk,tk,ss,ct,passes);

  if(blob.length>2953){
    document.getElementById('qrOverlay').classList.add('open');
    errEl.textContent='✗ BLOB TOO LARGE FOR QR — shorten message or use SHARE instead';
    errEl.style.display='block';
    canvas.style.display='none';
    return;
  }

  document.getElementById('qrOverlay').classList.add('open');
  errEl.textContent='⟳ LOADING QR ENCODER...';
  errEl.style.display='block';
  loadQRLib().then(()=>{
    errEl.style.display='none';
    errEl.textContent='';
    renderQR(blob);
  }).catch(()=>{
    errEl.textContent='✗ QR ENCODER FAILED TO LOAD — use SHARE instead.';
    errEl.style.display='block';
    canvas.style.display='none';
  });
}

// Renders into a hidden div, then copies the result onto the styled canvas.
function renderQR(blob){
  const errEl=document.getElementById('qrErr');
  const canvas=document.getElementById('qrCanvas');
  const tmp=document.createElement('div');
  tmp.style.cssText='position:fixed;left:-9999px;top:0;';
  document.body.appendChild(tmp);

  try{
    new QRCode(tmp,{
      text:blob,width:200,height:200,
      colorDark:getComputedStyle(document.documentElement).getPropertyValue('--acc').trim()||'#00e044',
      colorLight:'#010103',
      correctLevel:QRCode.CorrectLevel.M
    });
    setTimeout(()=>{
      const src=tmp.querySelector('canvas')||tmp.querySelector('img');
      const ctx2=canvas.getContext('2d');
      ctx2.fillStyle='#010103';
      ctx2.fillRect(0,0,200,200);
      if(src&&src.tagName==='CANVAS'){
        ctx2.drawImage(src,0,0,200,200);
      } else if(src&&src.tagName==='IMG'){
        const img=new Image();
        img.onload=()=>ctx2.drawImage(img,0,0,200,200);
        img.src=src.src;
      } else {
        errEl.textContent='✗ QR render failed';errEl.style.display='block';
      }
      document.body.removeChild(tmp);
    },100);
  }catch(err){
    errEl.textContent='✗ QR library not available — check network';
    errEl.style.display='block';
    canvas.style.display='none';
    if(tmp.parentNode) document.body.removeChild(tmp);
  }
}

function closeQR(e){
  if(e&&e.target!==document.getElementById('qrOverlay')) return;
  document.getElementById('qrOverlay').classList.remove('open');
}

// ═══════════════════════════════════════════════
// MESSAGE HISTORY
// ═══════════════════════════════════════════════

const msgHistory=[]; // max 5 entries
const MAX_HIST=5;

function pushHistory(entry){
  // entry: {ts, pt, ct, gk, tk, ss, ic}
  msgHistory.unshift(entry);
  if(msgHistory.length>MAX_HIST) msgHistory.pop();
  renderHistory();
  const hp=document.getElementById('histPreview');
  if(hp) hp.textContent=`${msgHistory.length} stored`;
}

function renderHistory(){
  const container=document.getElementById('histIn');
  if(msgHistory.length===0){
    container.innerHTML='<div class="hist-empty">// no transmissions recorded this session</div>';
    return;
  }
  container.innerHTML=msgHistory.map((e,i)=>`
    <div class="hist-entry">
      <div class="hist-meta">
        <div class="hist-time">${e.ts} &nbsp;·&nbsp; ENC &nbsp;·&nbsp; ${e.ct.length} CHARS &nbsp;·&nbsp; IC ${e.ic}</div>
        <div class="hist-pt">${esc(e.pt.slice(0,32))}${e.pt.length>32?'…':''}</div>
        <div class="hist-keys">GK:${esc(e.gk)} &nbsp; TK:${esc(e.tk)} &nbsp; SS:${esc(e.ss)}</div>
        <div class="hist-ct">${esc(e.ct.slice(0,28))}${e.ct.length>28?'…':''}</div>
      </div>
      <button class="hist-recall" data-act="recall" data-arg="${i}">↩ USE</button>
    </div>
  `).join('');
}

function recallHistory(i){
  const e=msgHistory[i];
  if(!e) return;
  document.getElementById('gk').value=e.gk;
  document.getElementById('tk').value=e.tk;
  document.getElementById('ss').value=e.ss;
  renderGrid(buildGrid(e.gk));
  updateKeyStrength();
  setMode('enc');
  document.getElementById('inp').value=e.pt;
  updateCharCount();
  kpMsg('↩ HISTORY LOADED','var(--t2)');
  sndClick();
}

function togHistory(){
  const b=document.getElementById('histBody'),a=document.getElementById('histArrow');
  const o=b.classList.toggle('o');a.classList.toggle('o',o);
}

// ─── Key auto-extender ───────────────────────────────────────────────────────
// Deterministically extends a transposition key to cover the message length
// by appending characters derived from the key itself (not random - recipient
// can reproduce the same extension from the same original key).
function extendKey(tk, validLen){
  const base=tk.toUpperCase().replace(/[^A-Z]/g,'');
  // Target: key length >= validLen / 8 (safe ratio)
  const target=Math.max(base.length, Math.ceil(validLen/8));
  if(base.length>=target) return {key:base, extended:false, orig:base};
  // Extend by cycling chars shifted by position (not just repeating)
  let ext=base;
  let i=0;
  while(ext.length<target){
    const c=base[i%base.length];
    const shift=Math.floor(i/base.length)+1;
    const shifted=String.fromCharCode(((c.charCodeAt(0)-65+shift)%26)+65);
    if(!ext.includes(shifted)) ext+=shifted;
    else ext+=c; // fallback if shifted already present
    i++;
  }
  return {key:ext, extended:true, orig:base};
}

function showFixBanner(lines){
  const b=document.getElementById('fixBanner');
  document.getElementById('fixBannerBody').innerHTML=lines.join('<br>');
  b.classList.add('show');
}
// Key names come from user input, so escape before they reach innerHTML.
function hiw(v){return `<span class="hiw">${esc(v)}</span>`;}
function hideFixBanner(){
  document.getElementById('fixBanner').classList.remove('show');
}

function go(){
  hideErr();
  hideFixBanner();
  let raw=document.getElementById('inp').value.trim();
  const gk=document.getElementById('gk').value.trim()||'OBSCURE';
  let tk=document.getElementById('tk').value.trim()||'VOID';
  const ss=document.getElementById('ss').value.trim()||'719';
  if(!raw){showErr('no input provided');return;}
  if(tk.replace(/[^A-Za-z]/g,'').length<2){showErr('transposition key needs 2+ letters');return;}

  const fixes=[];

  // ── Auto-extend transposition key ──
  // Applied in BOTH directions now. Ciphertext length equals plaintext
  // length, so encrypt and decrypt derive an identical extension from the
  // same short key. That means a recipient can type the original key and
  // decrypt successfully — previously extension ran on encrypt only, so
  // manual decryption with the real key silently produced garbage.
  // The input field is no longer overwritten; the extension is shown
  // instead, so the user never loses the key they chose.
  {
    const validLen=cleanInput(raw).length;
    const{key,extended,orig}=extendKey(tk,validLen);
    if(extended){
      fixes.push(`TRANS KEY ${hiw(orig)} is short for ${validLen} chars → using ${hiw(key)} for this run. Your key is unchanged; the recipient derives the same extension from ${hiw(orig)}.`);
      tk=key;
    }
  }

  lastUsedTk=tk; // store for SHARE and VERIFY
  if(fixes.length) showFixBanner(fixes);

  const mGrid=buildGrid(gk);
  renderGrid(mGrid);
  const passes=Math.max(1,Math.min(4,parseInt(document.getElementById('passInp').value)||1));
  try{
    let out,isEnc,logSteps;
    if(mode==='enc'){const r=multiEncrypt(raw,gk,tk,ss,passes);out=r.ct;isEnc=true;logSteps=r.steps;}
    else{const r=multiDecrypt(raw,gk,tk,ss,passes);out=r.pt;isEnc=false;logSteps=r.steps;}

    // ── Heat map ──
    const heat={_max:1};
    const addHeat=(r,c)=>{const k=`${r},${c}`;heat[k]=(heat[k]||0)+1;heat._max=Math.max(heat._max,heat[k]);};
    if(isEnc){
      logSteps.chars.forEach((_,i)=>{addHeat(logSteps.rows[i],logSteps.cols[i]);});
      logSteps.rcmb.forEach(({r,c})=>addHeat(r,c));
    }else{
      logSteps.sr.forEach((r,i)=>addHeat(r,logSteps.sc[i]));
      logSteps.rows.forEach((r,i)=>addHeat(r,logSteps.cols[i]));
    }
    renderGrid(mGrid,heat);

    // ── Wrong-key detection (decrypt only) ──
    let wrongKeyWarning=false;
    if(!isEnc){
      const letters=out.replace(/[^A-Z]/g,'');
      const digits=out.replace(/[^0-9]/g,'');
      const total=letters.length+digits.length;
      // Only warn if output is mostly letters but has almost no vowels.
      // Skip the heuristic if output is >50% digits (numeric message).
      const vowels=(letters.match(/[AEIOU]/g)||[]).length;
      const vowelRatio=letters.length>0?vowels/letters.length:0;
      const digitRatio=total>0?digits.length/total:0;
      if(vowelRatio<0.05&&letters.length>4&&digitRatio<0.5) wrongKeyWarning=true;
    }

    // ── Output ──
    const b=document.getElementById('outBox');
    b.dataset.val=out;
    b.innerHTML=`<span class="otext">${esc(out)}</span><button class="out-copy" id="cpyBtn" data-act="copy">COPY</button>`;
    if(wrongKeyWarning){
      b.innerHTML+=`<div style="font-size:var(--fs-caption);color:var(--away);letter-spacing:var(--ls-normal);font-family:'Share Tech Mono',monospace;margin-top:5px">⚠ NO VOWELS DETECTED - KEYS MAY BE WRONG</div>`;
    }

    // ── Auto-verify (encrypt only) ──
    const vEl=document.getElementById('verifyInline');
    if(isEnc){
      vEl.style.display='block';
      vEl.className='verify-inline pending';
      vEl.textContent='⟳ VERIFYING...';
      setTimeout(()=>{
        try{
          const orig=cleanInput(document.getElementById('inp').value.trim());
          const gkV=document.getElementById('gk').value.trim()||'OBSCURE';
          const tkV=lastUsedTk||document.getElementById('tk').value.trim()||'VOID';
          const ssV=document.getElementById('ss').value.trim()||'719';
          const{pt}=multiDecrypt(out,gkV,tkV,ssV,passes);
          // encrypt() does not pad: ciphertext length always equals
          // plaintext length, odd included. The old ||orig+'X' arm was
          // left over from a removed padding scheme and would report a
          // wrong result as verified for odd-length input.
          const match=pt===orig;
          vEl.className='verify-inline '+(match?'ok':'fail');
          vEl.textContent=match?'✓ ROUND-TRIP VERIFIED':'✗ VERIFY FAILED - CHECK KEYS';
        }catch(e){
          vEl.className='verify-inline fail';
          vEl.textContent='✗ VERIFY ERROR';
        }
      },120);
    }else{
      vEl.style.display='none';
    }
    if(isEnc&&logSteps.rows){
      const src=logSteps.chars.map((_,i)=>[logSteps.rows[i],logSteps.cols[i]]);
      const outC=logSteps.rcmb.map(({r,c})=>[r,c]);
      flashCells(src,outC);
    }else if(!isEnc&&logSteps.sr){
      const src=logSteps.sr.map((r,i)=>[r,logSteps.sc[i]]);
      const outC=logSteps.rows.map((r,i)=>[r,logSteps.cols[i]]);
      flashCells(src,outC);
    }

    // ── Step-through ──
    logSteps.matrix=mGrid;
    initStep(logSteps,isEnc);

    // ── Richer status bar ──
    const charCount=isEnc?cleanInput(raw).length:out.length;
    const uniqueChars=new Set(isEnc?cleanInput(raw):out).size;
    const shLen=ss.replace(/\D/g,'').length||1;
    calcCrack(gk,tk,ss);
    queueLog(isEnc,logSteps);
    setStat(
      isEnc?'ENCRYPTED':'DECRYPTED'+(wrongKeyWarning?' ⚠':''),
      `${out.length} OUT · ${uniqueChars} UNIQ · SH/${shLen}`
    );
    if(isEnc) sndCipherMelody(out); else sndDecrypt();
    glitchResolveTitle();

    // ── Output font scaling ──
    const otextEl=document.querySelector('#outBox .otext');
    if(otextEl){
      otextEl.classList.remove('sz-lg','sz-md','sz-sm','sz-xs');
      if(out.length<=12) otextEl.classList.add('sz-lg');
      else if(out.length<=40) otextEl.classList.add('sz-md');
      else if(out.length<=120) otextEl.classList.add('sz-sm');
      else otextEl.classList.add('sz-xs');
    }

    // ── IC meter ──
    renderIC(out);

    // ── Frequency analysis ──
    renderFreq(out);

    // ── Output actions ──
    chunkEnabled=false;
    document.getElementById('chunkBtn').classList.remove('on');
    document.getElementById('outActions').style.display='flex';

    // ── Header previews ──
    const logPrev=document.getElementById('logPreview');
    if(logPrev) logPrev.textContent=isEnc?`ENC · ${out.length}ch`:`DEC · ${out.length}ch`;

    // ── Message history (encrypt only) ──
    if(isEnc){
      const ic=calcIC(out);
      pushHistory({
        ts:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}),
        pt:cleanInput(raw),
        ct:out,
        gk:gk,
        tk:tk,
        ss:ss,
        ic:ic!==null?ic.toFixed(4):'--'
      });
    }
  }catch(e){showErr(e.message);setStat('ERROR','');sndError();}
}

document.getElementById('gk').addEventListener('input',function(){renderGrid(buildGrid(this.value||'OBSCURE'));updateKeyStrength();});
document.getElementById('tk').addEventListener('input',()=>{updateKeyStrength();updateCharCount();});
document.getElementById('ss').addEventListener('input',updateKeyStrength);
document.getElementById('inp').addEventListener('input',updateCharCount);
document.getElementById('inp').addEventListener('paste',()=>setTimeout(updateCharCount,0));
document.getElementById('inp').addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='Enter')go();});

// ═══════════════════════════════════════════════
// KEY STRENGTH INDICATORS
// ═══════════════════════════════════════════════

function updateKeyStrength(){
  // Grid key: score by unique chars (more unique = more shuffled)
  const gkVal=document.getElementById('gk').value.trim()||'OBSCURE';
  const gkUniq=new Set(gkVal.toUpperCase().replace(/[^A-Z0-9]/g,'')).size;
  const gkScore=gkUniq<4?0:gkUniq<7?1:gkUniq<12?2:gkUniq<18?3:4;
  setStrengthDots('ks-gk',gkScore);

  // Trans key: score by letter count
  const tkVal=document.getElementById('tk').value.trim()||'VOID';
  const tkLen=tkVal.replace(/[^A-Za-z]/g,'').length;
  const tkScore=tkLen<3?0:tkLen<5?1:tkLen<8?2:tkLen<12?3:4;
  setStrengthDots('ks-tk',tkScore);

  // Shift seq: score by digit count
  const ssVal=document.getElementById('ss').value.trim()||'719';
  const ssLen=ssVal.replace(/\D/g,'').length;
  const ssScore=ssLen<2?0:ssLen<4?1:ssLen<6?2:ssLen<9?3:4;
  setStrengthDots('ks-ss',ssScore);
}

function setStrengthDots(id,score){
  // score 0-4, classes: on-w on-m on-s on-v
  const cls=['on-w','on-m','on-s','on-v'];
  const container=document.getElementById(id);
  if(!container)return;
  const dots=container.querySelectorAll('.ksdot');
  dots.forEach((d,i)=>{
    d.className='ksdot';
    if(i<score){
      const c=score<=1?'on-w':score===2?'on-m':score===3?'on-s':'on-v';
      d.classList.add(c);
    }
  });
}

// ═══════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════

let kbdHintTimer=null;
function showKbdHint(){
  const h=document.getElementById('kbdHint');
  h.classList.add('show');
  clearTimeout(kbdHintTimer);
  kbdHintTimer=setTimeout(()=>h.classList.remove('show'),2000);
}

document.addEventListener('keydown',function(e){
  // Don't fire if typing in an input/textarea (except Ctrl combos)
  const tag=document.activeElement.tagName;
  const inInput=(tag==='INPUT'||tag==='TEXTAREA');

  if(e.ctrlKey&&e.key==='Enter'){
    go(); return;
  }
  if(e.ctrlKey&&e.key==='r'&&!e.shiftKey){
    e.preventDefault(); rollKeys(); showKbdHint(); return;
  }
  if(e.ctrlKey&&e.shiftKey&&e.key==='C'){
    e.preventDefault(); doCopy(); showKbdHint(); return;
  }
  if(e.ctrlKey&&e.key==='d'&&!inInput){
    e.preventDefault();
    setMode(mode==='enc'?'dec':'enc'); showKbdHint(); return;
  }
  // Show hint on ? key when not typing
  if(e.key==='?'&&!inInput){
    showKbdHint();
  }
});

// ═══════════════════════════════════════════════
// EERIE SOUND ENGINE (Web Audio API)
// ═══════════════════════════════════════════════

let audioCtx=null;
let soundEnabled=true;

function togSound(){
  soundEnabled=!soundEnabled;
  const btn=document.getElementById('sndBtn');
  btn.classList.toggle('on',soundEnabled);
  btn.textContent=soundEnabled?'SND':'MUTE';
  btn.style.opacity='1';
  if(typeof savePref==='function') savePref('sound',soundEnabled);
}

function getCtx(){
  if(!audioCtx) audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended') audioCtx.resume();
  return audioCtx;
}

// Utility: connect chain of nodes
function chain(ctx,...nodes){
  for(let i=0;i<nodes.length-1;i++) nodes[i].connect(nodes[i+1]);
  nodes[nodes.length-1].connect(ctx.destination);
  return nodes;
}

// Deep bass thud - encrypt
function sndEncrypt(){
  if(!soundEnabled)return;
  try{
    const ctx=getCtx(),now=ctx.currentTime;
    const osc=ctx.createOscillator();
    osc.type='sine';
    osc.frequency.setValueAtTime(55,now);
    osc.frequency.exponentialRampToValueAtTime(28,now+0.35);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.7,now);
    g.gain.exponentialRampToValueAtTime(0.001,now+0.4);
    const dist=ctx.createWaveShaper();
    const curve=new Float32Array(256);
    for(let i=0;i<256;i++){const x=i*2/256-1;curve[i]=x*1.4;}
    dist.curve=curve;
    chain(ctx,osc,dist,g);
    osc.start(now);osc.stop(now+0.45);
  }catch(e){}
}

// Deep bass thud - decrypt (slightly lower/darker)
function sndDecrypt(){
  if(!soundEnabled)return;
  try{
    const ctx=getCtx(),now=ctx.currentTime;
    const osc=ctx.createOscillator();
    osc.type='sine';
    osc.frequency.setValueAtTime(42,now);
    osc.frequency.exponentialRampToValueAtTime(22,now+0.4);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.65,now);
    g.gain.exponentialRampToValueAtTime(0.001,now+0.45);
    const dist=ctx.createWaveShaper();
    const curve=new Float32Array(256);
    for(let i=0;i<256;i++){const x=i*2/256-1;curve[i]=x*1.4;}
    dist.curve=curve;
    chain(ctx,osc,dist,g);
    osc.start(now);osc.stop(now+0.5);
  }catch(e){}
}

// Subtle CRT click on button press
function sndClick(){
  if(!soundEnabled)return;
  try{
    const ctx=getCtx(),now=ctx.currentTime;
    const bufLen=Math.floor(ctx.sampleRate*0.018);
    const buf=ctx.createBuffer(1,bufLen,ctx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<bufLen;i++) d[i]=(Math.random()*2-1)*Math.exp(-i/(bufLen*0.2));
    const src=ctx.createBufferSource();
    src.buffer=buf;
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.12,now);
    g.gain.exponentialRampToValueAtTime(0.001,now+0.025);
    const f=ctx.createBiquadFilter();
    f.type='highpass';f.frequency.value=1200;
    chain(ctx,src,f,g);
    src.start(now);
  }catch(e){}
}

// Unsettling tritone error chord
function sndError(){
  if(!soundEnabled)return;
  try{
    const ctx=getCtx(),now=ctx.currentTime;
    // Tritone = devil's interval
    [160,226].forEach((f,i)=>{
      const osc=ctx.createOscillator();
      osc.type='sawtooth';
      osc.frequency.setValueAtTime(f,now);
      osc.frequency.linearRampToValueAtTime(f*0.93,now+0.5);
      const g=ctx.createGain();
      g.gain.setValueAtTime(0.09,now);
      g.gain.exponentialRampToValueAtTime(0.001,now+0.55);
      const filt=ctx.createBiquadFilter();
      filt.type='lowpass';filt.frequency.value=600;filt.Q.value=4;
      chain(ctx,osc,filt,g);
      osc.start(now);osc.stop(now+0.6);
    });
  }catch(e){}
}

// Eerie ROLL sound: rapid glitchy arpeggiation
function sndRoll(){
  if(!soundEnabled)return;
  try{
    const ctx=getCtx(),now=ctx.currentTime;
    const notes=[220,185,160,140,165,195];
    notes.forEach((f,i)=>{
      const osc=ctx.createOscillator();
      osc.type='square';
      osc.frequency.value=f;
      const g=ctx.createGain();
      const t=now+i*0.045;
      g.gain.setValueAtTime(0.06,t);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.05);
      const filt=ctx.createBiquadFilter();
      filt.type='bandpass';filt.frequency.value=f*1.5;filt.Q.value=3;
      chain(ctx,osc,filt,g);
      osc.start(t);osc.stop(t+0.06);
    });
  }catch(e){}
}

// ═══════════════════════════════════════════════
// DMT MODE
// ═══════════════════════════════════════════════

let dmtActive=false;
let dmtHue=135;
let dmtInterval=null;
// Speed: degrees per tick, tick every 40ms → full rotation ~14s
const DMT_SPEED=1.7;

// Warped hue curve — not linear, it lingers in psychedelic zones
// (magentas, cyans, acid greens) longer than boring zones
function dmtNextHue(h){
  // Non-uniform speed: faster through reds/yellows, slower through purples/cyans
  const zone=h%360;
  let speed=DMT_SPEED;
  if(zone>260&&zone<320) speed=DMT_SPEED*0.5;  // linger in purple/magenta
  if(zone>160&&zone<220) speed=DMT_SPEED*0.5;  // linger in cyan/teal
  if(zone>80&&zone<140)  speed=DMT_SPEED*0.6;  // linger in acid green
  return (h+speed)%360;
}

// Pulse the shell border color independently of hue for extra chaos
let dmtBorderPhase=0;
function dmtPulseBorder(){
  dmtBorderPhase=(dmtBorderPhase+2)%360;
  const h2=(dmtHue+120)%360; // complementary
  const h3=(dmtHue+240)%360; // triadic
  const r=document.documentElement.style;
  const t=dmtBorderPhase/360*Math.PI*2;
  const mix=Math.sin(t)*0.5+0.5;
  // Blend between two border hues for chromatic aberration feel
  r.setProperty('--bd2',`hsl(${h2},60%,${20+mix*12}%)`);
  r.setProperty('--bd1',`hsl(${h3},40%,${12+mix*8}%)`);
}

function dmtTick(){
  dmtHue=dmtNextHue(dmtHue);
  applyHue(Math.round(dmtHue));
  dmtPulseBorder();
}

function togDMT(){
  const wasActive=dmtActive;
  dmtActive=!dmtActive;
  if(wasActive&&typeof loadPrefs==='function'){
    const p=loadPrefs();
    if(typeof p.hue==='number') setTimeout(()=>applyHue(p.hue),0);
  }
  const btn=document.getElementById('dmtBtn');
  const shell=document.querySelector('.shell');

  if(dmtActive){
    btn.classList.add('on');
    shell.classList.add('dmt');
    // Assign cell index CSS vars for staggered animation
    const cells=shell.querySelectorAll('.gval');
    cells.forEach((c,i)=>c.style.setProperty('--ci',i));
    dmtInterval=setInterval(dmtTick,40);
    // DMT sound: ambient drone
    sndDMTon();
  }else{
    btn.classList.remove('on');
    shell.classList.remove('dmt');
    if(dmtInterval){clearInterval(dmtInterval);dmtInterval=null;}
    // Restore to VOID green
    applyHue(135);
    sndDMToff();
  }
}

// DMT activation sound: rising alien chord
function sndDMTon(){
  if(!soundEnabled)return;
  try{
    const ctx=getCtx(),now=ctx.currentTime;
    const freqs=[55,82.4,110,146.8,220];
    freqs.forEach((f,i)=>{
      const osc=ctx.createOscillator();
      osc.type=i%2===0?'sine':'triangle';
      osc.frequency.setValueAtTime(f*0.5,now);
      osc.frequency.exponentialRampToValueAtTime(f,now+0.8+i*0.15);
      const g=ctx.createGain();
      g.gain.setValueAtTime(0,now+i*0.1);
      g.gain.linearRampToValueAtTime(0.07,now+0.3+i*0.1);
      g.gain.exponentialRampToValueAtTime(0.001,now+1.4+i*0.15);
      const filt=ctx.createBiquadFilter();
      filt.type='bandpass';filt.frequency.value=f*2;filt.Q.value=2;
      chain(ctx,osc,filt,g);
      osc.start(now+i*0.1);osc.stop(now+1.6+i*0.15);
    });
  }catch(e){}
}

// DMT deactivation sound: descending collapse
function sndDMToff(){
  if(!soundEnabled)return;
  try{
    const ctx=getCtx(),now=ctx.currentTime;
    const osc=ctx.createOscillator();
    osc.type='sine';
    osc.frequency.setValueAtTime(180,now);
    osc.frequency.exponentialRampToValueAtTime(28,now+0.6);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.3,now);
    g.gain.exponentialRampToValueAtTime(0.001,now+0.7);
    chain(ctx,osc,g);
    osc.start(now);osc.stop(now+0.75);
  }catch(e){}
}

// ═══════════════════════════════════════════════
// SCANLINE WIPE (mode switch)
// ═══════════════════════════════════════════════

function triggerScanwipe(cb){
  const boxes=[
    document.getElementById('inpScanbox'),
    document.getElementById('outScanbox')
  ];
  boxes.forEach(box=>{
    if(!box) return;
    box.classList.remove('wiping');
    void box.offsetWidth;
    box.classList.add('wiping');
    setTimeout(()=>box.classList.remove('wiping'),400);
  });
  // Swap labels at midpoint of wipe
  setTimeout(()=>{if(cb)cb();},140);
}

// ═══════════════════════════════════════════════
// INCOMING TRANSMISSION (RX MODE)
// ═══════════════════════════════════════════════

let rxTypeTimer=null;

function startRX(){
  const v=document.getElementById('shareInp').value.trim();
  if(!v.startsWith('VMC-MSG:')){
    kpMsg('✗ PASTE A VMC-MSG BLOB FIRST','var(--dim-r)');
    flashBtn('shareBtnRX',false);
    return;
  }
  let parts;
  try{parts=readBlob(v);}
  catch(e){kpMsg('✗ CORRUPT BLOB','var(--dim-r)');return;}

  const[gk,tk,ss,ct,passes=1]=parts;

  // Open overlay with slide-up
  const overlay=document.getElementById('rxOverlay');
  document.getElementById('rxCt').textContent=ct;
  document.getElementById('rxPt').innerHTML='<span class="rx-cursor" id="rxCursor"></span>';
  document.getElementById('rxStatus').textContent='// decrypting...';
  document.getElementById('rxBadge').textContent='◉ RECEIVING';
  document.getElementById('rxBadge').classList.remove('locked');
  overlay.classList.add('open');

  // Rebuild grid with incoming keys
  renderGrid(buildGrid(gk));
  glitchResolveTitle();

  // Short dramatic pause, then decrypt and typeout
  setTimeout(()=>{
    let pt='';
    try{
      const r=multiDecrypt(ct,gk,tk,ss,passes);
      pt=r.pt;
    }catch(e){
      document.getElementById('rxStatus').textContent='✗ DECRYPTION FAILED — KEYS MAY BE WRONG';
      return;
    }
    typeOutRX(pt);
  },900);
}

function typeOutRX(text){
  if(rxTypeTimer) clearInterval(rxTypeTimer);
  const ptEl=document.getElementById('rxPt');
  const statusEl=document.getElementById('rxStatus');
  let i=0;
  let built='';
  // Speed: ~18ms per char — fast but readable
  rxTypeTimer=setInterval(()=>{
    if(i>=text.length){
      clearInterval(rxTypeTimer);
      // Remove cursor, show locked state
      ptEl.innerHTML=esc(built);
      document.getElementById('rxBadge').textContent='✓ RECEIVED';
      document.getElementById('rxBadge').classList.add('locked');
      statusEl.textContent=`// ${text.length} chars · transmission complete`;
      window._rxPlaintext=built;
      // Play decrypt sound
      sndDecrypt();
      return;
    }
    built+=text[i];
    ptEl.innerHTML=esc(built)+'<span class="rx-cursor"></span>';
    i++;
    // Play a subtle tick every 4 chars
    if(i%4===0) sndRXtick();
  },18);
}

function sndRXtick(){
  if(!soundEnabled) return;
  try{
    const ctx=getCtx(),now=ctx.currentTime;
    const buf=ctx.createBuffer(1,Math.floor(ctx.sampleRate*0.008),ctx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.exp(-i/(d.length*0.15));
    const src=ctx.createBufferSource();src.buffer=buf;
    const g=ctx.createGain();g.gain.setValueAtTime(0.04,now);
    const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=2400;f.Q.value=2;
    chain(ctx,src,f,g);src.start(now);
  }catch(e){}
}

function closeRX(){
  const overlay=document.getElementById('rxOverlay');
  overlay.classList.remove('open');
  if(rxTypeTimer){clearInterval(rxTypeTimer);rxTypeTimer=null;}
}

function copyRX(){
  const text=window._rxPlaintext||document.getElementById('rxPt').textContent||'';
  if(!text) return;
  const btn=document.getElementById('rxCopyBtn');
  const ok=()=>{btn.textContent='✓ COPIED';setTimeout(()=>btn.textContent='COPY PLAINTEXT',1400);};
  if(navigator.clipboard&&window.isSecureContext){
    navigator.clipboard.writeText(text).then(ok).catch(()=>fallbackCopy(text,ok));
  }else{fallbackCopy(text,ok);}
}

// ═══════════════════════════════════════════════
// CIPHERTEXT-DERIVED UNIQUE SOUND
// ═══════════════════════════════════════════════

// Map each char to a pentatonic-ish frequency
const CIPHER_NOTE_MAP=(()=>{
  const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  // Pentatonic scale frequencies across 3 octaves
  const notes=[
    130.8,146.8,164.8,196,220,
    261.6,293.7,329.6,392,440,
    523.3,587.3,659.3,784,880,
    146.8,174.6,196,233.1,261.6,
    293.7,329.6,392,440,523.3,587.3,
    130.8,155.6,185,207.7,233.1,
    246.9,277.2,311.1,349.2,392
  ];
  const map={};
  chars.split('').forEach((c,i)=>map[c]=notes[i%notes.length]);
  return map;
})();

function sndCipherMelody(ct){
  if(!soundEnabled) return;
  try{
    const ctx=getCtx(),now=ctx.currentTime;
    // Take first 8 unique chars for the melody
    const seen=new Set();
    const melody=[];
    for(const c of ct){
      if(!seen.has(c)&&CIPHER_NOTE_MAP[c]){seen.add(c);melody.push(c);}
      if(melody.length>=8) break;
    }
    melody.forEach((c,i)=>{
      const freq=CIPHER_NOTE_MAP[c];
      const t=now+i*0.09;
      const osc=ctx.createOscillator();
      osc.type='sine';
      osc.frequency.setValueAtTime(freq,t);
      osc.frequency.setValueAtTime(freq*1.002,t+0.04); // slight detune for warmth
      const g=ctx.createGain();
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(0.12,t+0.015);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.18);
      const filt=ctx.createBiquadFilter();
      filt.type='lowpass';filt.frequency.value=2000;filt.Q.value=0.8;
      chain(ctx,osc,filt,g);
      osc.start(t);osc.stop(t+0.2);
    });
    // Bass thud underneath
    sndEncrypt();
  }catch(e){}
}

// ═══════════════════════════════════════════════
// TITLE GLITCH ENGINE
// ═══════════════════════════════════════════════

const TITLE_STR='VOID MATRIX CIPHER';
const GLITCH_CHARS='█▓▒░▄▀■□▪▫◆◇○●∆∇⊕⊗⊘≠≡∞∅';
const NOISE_CHARS='01';
let titleAnimTimer=null;

function randGlyphNoise(){return NOISE_CHARS[Math.floor(Math.random()*NOISE_CHARS.length)];}
function randGlyphBlock(){return GLITCH_CHARS[Math.floor(Math.random()*GLITCH_CHARS.length)];}

function buildTitleSpans(){
  const el=document.getElementById('titleText');
  el.innerHTML='';
  for(let i=0;i<TITLE_STR.length;i++){
    const s=document.createElement('span');
    s.className='tc';
    s.dataset.ch=TITLE_STR[i];
    s.textContent=TITLE_STR[i]===' '?' ':randGlyphNoise();
    el.appendChild(s);
  }
  return el.querySelectorAll('.tc');
}

function glitchResolveTitle(onComplete){
  if(titleAnimTimer) clearTimeout(titleAnimTimer);
  const el=document.getElementById('titleText');
  el.classList.remove('locked','locking');
  el.removeAttribute('data-text');
  const spans=buildTitleSpans();
  const total=spans.length;
  let resolved=0;

  // Phase 1: rapid noise scramble for 600ms
  let noiseInterval=setInterval(()=>{
    spans.forEach(s=>{
      if(s.dataset.ch===' ') return;
      if(!s.classList.contains('resolved')){
        s.textContent=Math.random()<0.5?randGlyphNoise():randGlyphBlock();
        s.classList.toggle('glitch',Math.random()<0.15);
        s.classList.remove('noise');
        s.classList.toggle('noise',Math.random()<0.3);
      }
    });
  },40);

  // Phase 2: resolve characters one by one with stagger
  titleAnimTimer=setTimeout(()=>{
    clearInterval(noiseInterval);

    // Resolve each char with slight random delay
    spans.forEach((s,i)=>{
      if(s.dataset.ch===' '){s.textContent=' ';return;}
      const delay=i*38+Math.random()*60;
      // Keep glitching until just before resolve
      const glitchUntil=setInterval(()=>{
        if(!s.classList.contains('resolved')){
          s.textContent=Math.random()<0.6?randGlyphBlock():randGlyphNoise();
          s.classList.toggle('glitch',Math.random()<0.4);
        }
      },35);
      setTimeout(()=>{
        clearInterval(glitchUntil);
        s.textContent=s.dataset.ch;
        s.classList.remove('glitch','noise');
        s.classList.add('resolved');
        resolved++;
        // When last char resolves → signal lock flash + scanwipe
        if(resolved>=total-1){
          setTimeout(()=>{
            el.classList.add('locking');
            setTimeout(()=>{
              el.classList.remove('locking');
              // Scanwipe accent overlay
              el.dataset.text=TITLE_STR;
              el.classList.add('locked');
              setTimeout(()=>{
                el.classList.remove('locked');
                el.removeAttribute('data-text');
                if(onComplete) onComplete();
              },700);
            },380);
          },60);
        }
      },delay);
    });
  },620);
}

// ═══════════════════════════════════════════════
// PREFERENCE PERSISTENCE
// ═══════════════════════════════════════════════
// Hue and sound reset on every launch previously. Keys and messages are
// deliberately never stored — only display preferences.
const PREF_KEY='vmc.prefs';
function loadPrefs(){
  try{ return JSON.parse(localStorage.getItem(PREF_KEY))||{}; }
  catch(e){ return {}; }
}
function savePref(k,v){
  try{
    const p=loadPrefs(); p[k]=v;
    localStorage.setItem(PREF_KEY,JSON.stringify(p));
  }catch(e){}
}

// ═══════════════════════════════════════════════
// PANIC WIPE
// ═══════════════════════════════════════════════
function panicWipe(){
  ['gk','tk','ss','inp','shareInp'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('passInp').value='1';
  document.getElementById('passHint').textContent='single pass';
  blobPasses=null;
  msgHistory.length=0;
  renderHistory();
  const hp=document.getElementById('histPreview'); if(hp) hp.textContent='';
  hideFixBanner();
  resetOut();
  hideErr();
  document.getElementById('charCount').textContent='0 CHARS · 0 VALID';
  const cw=document.getElementById('charWarn');
  cw.textContent=''; cw.classList.remove('show');
  const eff=document.getElementById('effTkHint'); if(eff) eff.textContent='-';
  renderGrid(buildGrid('OBSCURE'));
  updateKeyStrength();
  // Best-effort clipboard scrub so the last ciphertext is not left behind
  try{ if(navigator.clipboard&&window.isSecureContext) navigator.clipboard.writeText(''); }catch(e){}
  kpMsg('▓ WIPED — KEYS, MESSAGE, OUTPUT, HISTORY','var(--away)');
  sndError();
}

// ═══════════════════════════════════════════════
// LINK LOADING  (#VMC-MSG:...)
// ═══════════════════════════════════════════════
// Blobs are URL-safe base64 now, so a transmission can be sent as a plain
// link. Opening it drops the blob in the field and decrypts immediately.
function loadFromHash(){
  const h=decodeURIComponent((location.hash||'').replace(/^#/,'')).trim();
  if(!h.startsWith('VMC-MSG:')) return;
  document.getElementById('shareInp').value=h;
  // Clear the fragment so the key material is not left in the address bar
  history.replaceState(null,'',location.pathname+location.search);
  setTimeout(()=>decodeMsg(),260);
}

// ═══════════════════════════════════════════════
// BUILD UPDATES
// ═══════════════════════════════════════════════
let waitingWorker=null;
function applyUpdate(){
  if(waitingWorker){ waitingWorker.postMessage('SKIP_WAITING'); }
  else { location.reload(); }
}
function watchForUpdates(reg){
  if(reg.waiting){ waitingWorker=reg.waiting; showUpdatePrompt(); }
  reg.addEventListener('updatefound',()=>{
    const nw=reg.installing;
    if(!nw) return;
    nw.addEventListener('statechange',()=>{
      if(nw.state==='installed'&&navigator.serviceWorker.controller){
        waitingWorker=nw; showUpdatePrompt();
      }
    });
  });
}
function showUpdatePrompt(){
  const b=document.getElementById('updBtn');
  if(b) b.classList.add('show');
}

// ═══════════════════════════════════════════════
// EVENT DELEGATION
// ═══════════════════════════════════════════════
// Every control used to carry an inline onclick=, which forces a CSP with
// script-src 'unsafe-inline' — i.e. no meaningful script CSP at all, on a
// page that holds your plaintext and all three keys in the DOM. The markup
// now declares data-act (plus data-arg where a value is needed) and this one
// listener dispatches it, which is what lets the page run under
// script-src 'self'.
const ACTIONS={
  theme:           ()      => togTheme(),
  dmt:             ()      => togDMT(),
  sound:           ()      => togSound(),
  wipe:            ()      => panicWipe(),
  roll:            ()      => { sndClick(); rollKeys(); },
  run:             ()      => { sndClick(); go(); },
  clear:           ()      => { sndClick(); clr(); },
  mode:            (e,arg) => setMode(arg),
  share:           ()      => encodeMsg(),
  load:            ()      => decodeMsg(),
  qr:              ()      => showQR(),
  rx:              ()      => startRX(),
  'rx-close':      ()      => closeRX(),
  'rx-copy':       ()      => copyRX(),
  copy:            ()      => doCopy(),
  chunk:           ()      => toggleChunk(),
  export:          ()      => exportDossier(),
  'fix-dismiss':   ()      => hideFixBanner(),
  instr:           ()      => togInstr(),
  freq:            ()      => togFreq(),
  crack:           ()      => togCrack(),
  log:             ()      => togLog(),
  history:         ()      => togHistory(),
  recall:          (e,arg) => recallHistory(Number(arg)),
  step:            ()      => togStep(),
  'step-play':     ()      => stepTogglePlay(),
  'step-reset':    ()      => stepReset(),
  'qr-backdrop':   (e)     => closeQR(e),
  'qr-close':      ()      => closeQR(),
  'dossier-copy':  ()      => copyDossier(),
  'dossier-close': ()      => {
                                const o=document.getElementById('dossierOverlay');
                                if(o) o.style.display='none';
                              },
  update:          ()      => applyUpdate(),
  // Marks a container whose clicks must not reach an outer handler.
  // closest() stops at the first data-act it finds, so this is the
  // delegated equivalent of the old onclick="event.stopPropagation()".
  stop:            ()      => {}
};

document.addEventListener('click',e=>{
  const t=(e.target&&e.target.closest)?e.target.closest('[data-act]'):null;
  if(!t) return;
  const fn=ACTIONS[t.dataset.act];
  if(fn) fn(e,t.dataset.arg,t);
});

// ═══════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════
renderGrid(buildGrid('OBSCURE'));
updateKeyStrength();
updateCharCount();
initTheme();

(function bootPrefs(){
  const p=loadPrefs();
  if(typeof p.hue==='number') applyHue(p.hue);
  if(p.sound===false&&typeof togSound==='function') togSound();
})();

// On the wide layout the analysis panels get a column to themselves, so open
// the cheap ones rather than presenting a stack of closed headers. The
// transmission log deliberately stays shut: it is the one panel whose content
// grows with the message length, and queueLog() only builds it on demand.
// Clicking the real toggles keeps the arrow state and the JS in agreement.
if(window.matchMedia&&window.matchMedia('(min-width: 1024px)').matches){
  ['freq','crack'].forEach(act=>{
    const t=document.querySelector(`[data-act="${act}"]`);
    if(t) t.click();
  });
}

setTimeout(()=>glitchResolveTitle(),300);
loadFromHash();
window.addEventListener('hashchange',loadFromHash);

// Register service worker for PWA offline support
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('sw.js').then(reg=>{
      watchForUpdates(reg);
      // Check for a new build whenever the app is brought back to the front
      document.addEventListener('visibilitychange',()=>{
        if(document.visibilityState==='visible') reg.update().catch(()=>{});
      });
    }).catch(()=>{});
    let reloading=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(reloading) return; reloading=true; location.reload();
    });
  });
}

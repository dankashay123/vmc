/* ═══════════════════════════════════════════════════════════════
   Void Matrix Cipher — engine tests.   Run: node test/cipher.test.mjs

   No dependencies and no browser. cipher.js is a classic script that
   touches the DOM at top level, so it cannot be imported directly; the
   pure engine functions are lifted out of the source text instead. If the
   engine is ever split into its own module, swap the lift for an import.
   ═══════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = readFileSync(join(ROOT, 'cipher.js'), 'utf8');

const NAMES = ['buildGrid','find','get','cleanInput','parseSh','sv','applyShift',
               'colTrans','revColTrans','encrypt','decrypt','multiEncrypt',
               'multiDecrypt','extendKey','randInt'];

function lift(name){
  const oneLiner = new RegExp(`^function ${name}\\([^\\n]*\\}$`, 'm');
  const block    = new RegExp(`^function ${name}\\(.*?^\\}`, 'ms');
  const m = SRC.match(oneLiner) || SRC.match(block);
  if (!m) throw new Error(`cannot find function ${name}() in cipher.js`);
  return m[0];
}

const src = [
  'const GRID_SZ=6;',
  "const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';",
  ...NAMES.map(lift),
  `return {ALPHABET, ${NAMES.join(', ')}};`
].join('\n');

const C = new Function('crypto', src)(webcrypto);

let pass = 0;
const failures = [];
const ok = (cond, msg) => { cond ? pass++ : failures.push(msg); };

/* ── the grid is a permutation, and the cached lookup agrees with a scan ── */
for (const kw of ['', 'OBSCURE', 'VOID', 'SEANCE', 'ZZZZ', 'A', '0123456789']) {
  const m = C.buildGrid(kw);
  const flat = m.flat();
  ok(flat.length === 36 && new Set(flat).size === 36, `grid "${kw}": 36 unique cells`);
  for (const ch of C.ALPHABET) {
    const viaMap = C.find(m, ch);
    let scan = null;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) if (m[r][c] === ch) scan = [r+1, c+1];
    ok(viaMap && scan && viaMap[0] === scan[0] && viaMap[1] === scan[1],
       `grid "${kw}": find(${ch}) cache matches exhaustive scan`);
  }
  ok(C.find(m, '!') === null, `grid "${kw}": unknown char returns null`);
}

/* ── the shift is reversible and stays inside 1..6 ─────────────────────── */
for (let v = 1; v <= 6; v++) for (let sh = 0; sh <= 9; sh++) {
  const f = C.sv(v, sh, true);
  ok(f >= 1 && f <= 6,          `sv in range (v=${v} sh=${sh})`);
  ok(C.sv(f, sh, false) === v,  `sv reverses (v=${v} sh=${sh})`);
}
// Documents why rollKeys draws 1-6: mod 6 makes 7/8/9 aliases and 6 the identity.
ok(C.sv(3, 7, true) === C.sv(3, 1, true), 'shift digit 7 aliases 1');
ok(C.sv(3, 6, true) === 3,                'shift digit 6 is the identity');

/* ── columnar transposition round-trips at every length ───────────────── */
for (const kw of ['VOID','A','AB','ZEBRA','AAAA','ABCDEFGHIJ']) {
  for (let n = 0; n <= 40; n++) {
    const seq  = Array.from({length: n}, (_, i) => (i % 6) + 1);
    const back = C.revColTrans(C.colTrans(seq, kw).res, kw);
    ok(JSON.stringify(back) === JSON.stringify(seq), `colTrans kw=${kw} n=${n}`);
  }
}

/* ── end to end, including odd lengths and every pass count ───────────── */
const MSGS = ['A','AB','ABC','HELLO','HELLO WORLD','12345','ODD LENGTH MSG',
              'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG 0123456789',
              'X'.repeat(101), 'AB'.repeat(200)];
const KEYS = [['OBSCURE','VOID','719'], ['A','AB','1'], ['SEANCE','ZEBRA','123456'],
              ['0123456789ABCDEF','ABCDEFGHIJ','9'], ['ZZZ','AAAA','666']];
for (const msg of MSGS) {
  const clean = C.cleanInput(msg);
  if (!clean) continue;
  for (const [gk, tk, ss] of KEYS) {
    for (const passes of [1, 2, 3, 4]) {
      // Mirror go(): both sides derive the same extension from the same key.
      const eff = C.extendKey(tk, clean.length).key;
      const { ct } = C.multiEncrypt(msg, gk, eff, ss, passes);
      const { pt } = C.multiDecrypt(ct, gk, eff, ss, passes);
      ok(ct.length === clean.length,
         `ciphertext length equals plaintext length ("${msg.slice(0,12)}" p${passes})`);
      ok(pt === clean,
         `round-trip "${msg.slice(0,14)}" gk=${gk} tk=${tk} ss=${ss} passes=${passes}`);
    }
  }
}

/* ── extendKey must be deterministic, or a recipient cannot decrypt ───── */
for (const tk of ['AB','VOID','ZEBRA','QQ']) {
  for (const n of [1, 8, 17, 64, 65, 200, 1000]) {
    const a = C.extendKey(tk, n);
    ok(a.key === C.extendKey(tk, n).key,        `extendKey deterministic (${tk}, ${n})`);
    ok(C.extendKey(a.key, n).extended === false, `extendKey idempotent (${tk}, ${n})`);
  }
}

/* ── randInt draws from the CSPRNG, in range and without modulo bias ──── */
for (const n of [1, 6, 9, 59]) {
  const seen = new Array(n).fill(0);
  let inRange = true;
  for (let i = 0; i < 24000; i++) {
    const v = C.randInt(n);
    if (!(v >= 0 && v < n)) inRange = false;
    seen[v]++;
  }
  ok(inRange, `randInt stays in [0,${n})`);
  const worst = Math.max(...seen.map(c => Math.abs(c - 24000 / n) / (24000 / n)));
  ok(n === 1 || worst < 0.20, `randInt roughly uniform for n=${n} (worst dev ${(worst*100).toFixed(1)}%)`);
}
ok(C.randInt(0) === 0, 'randInt(0) guard');

console.log(`${pass} assertions passed, ${failures.length} failed`);
for (const f of failures.slice(0, 20)) console.log('  FAIL: ' + f);
process.exit(failures.length ? 1 : 0);

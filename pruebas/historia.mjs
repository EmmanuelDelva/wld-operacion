// Baja la historia de Binance a esta computadora y mide cada celda: regla, temporalidad y lado.
// Deja el resultado en reglas/evidencia.json, que es lo que la app muestra junto a cada operación.
//   node pruebas/historia.mjs
// Hay que correrlo en tu propia máquina: a los servidores en Estados Unidos Binance les responde 451.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BINANCE, armarTodas, preparar, simular, resumir } from '../motor/motor.js';

const raiz = new URL('../', import.meta.url);
const textoParametros = await readFile(new URL('reglas/parametros.json', raiz), 'utf8');
const textoMotor = await readFile(new URL('motor/motor.js', raiz), 'utf8');
const P = JSON.parse(textoParametros);
const E = P.evidencia;
const pausa = ms => new Promise(r => setTimeout(r, ms));
await mkdir(new URL('datos/', raiz), { recursive: true });

// Baja una serie completa y la guarda; la siguiente vez solo completa lo nuevo.
async function historia(simbolo, marco, inicio = 0) {
  const archivo = new URL(`datos/${simbolo}-${marco}.json`, raiz);
  let filas = [];
  try { filas = JSON.parse(await readFile(archivo, 'utf8')); } catch { /* primera vez */ }
  if (filas.length) filas.pop();
  let desde = filas.length ? filas.at(-1)[0] + 1 : inicio;
  for (;;) {
    const r = await fetch(`${BINANCE}/fapi/v1/klines?symbol=${simbolo}&interval=${marco}&limit=1500&startTime=${desde}`);
    if (!r.ok) throw new Error(`Binance respondió ${r.status} en ${simbolo} ${marco}`);
    const lote = await r.json();
    if (!lote.length) break;
    for (const k of lote) filas.push([+k[0], +k[1], +k[2], +k[3], +k[4], +k[5], +k[6]]);
    desde = lote.at(-1)[0] + 1;
    if (lote.length < 1500) break;
    await pausa(350);
  }
  await writeFile(archivo, JSON.stringify(filas));
  const ahora = Date.now();
  const velas = filas.filter(k => k[6] < ahora).map(k => ({ t: k[0], o: k[1], h: k[2], l: k[3], c: k[4], v: k[5], fin: k[6] }));
  console.log(`  ${simbolo} ${marco}: ${velas.length} velas`);
  return velas;
}

console.log('Bajando historia…');
const w = {};
for (const m of ['1w', '1d', '4h', '1h', '15m']) w[m] = await historia('WLDUSDT', m);
const inicioBtc = w['1d'][0].t - 90 * 86_400_000;
const b = {};
for (const m of ['1d', '4h', '1h', '15m']) b[m] = await historia('BTCUSDT', m, inicioBtc);

const series = armarTodas(w);
const btc = armarTodas(b);
const prep = {};
const prepBtc = {};
for (const m of [...P.operables, '1w']) prep[m] = preparar(series[m], P.contexto);
for (const m of P.operables) prepBtc[m] = preparar(btc[m], P.contexto);

const corte = Date.parse(E.corte);
const error = ops => {
  if (ops.length < 2) return null;
  const xs = ops.map(o => o.neto);
  const media = xs.reduce((s, x) => s + x, 0) / xs.length;
  const varianza = xs.reduce((s, x) => s + (x - media) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(varianza / xs.length);
};

const celdas = {};
for (const m of P.operables) {
  const { ops } = simular(prep[m], m, P, { superior: prep[P.superior[m]], btc: prepBtc[m] });
  for (const regla of ['zona', 'retroceso', 'barrido']) {
    for (const lado of [-1, 1]) {
      const grupo = ops.filter(o => o.regla === regla && o.lado === lado && o.estado === 'cerrada');
      const antes = grupo.filter(o => o.t < corte);
      const despues = grupo.filter(o => o.t >= corte);
      const h = resumir(antes);
      const limpio = resumir(despues);
      const estres = resumir(antes, P.costos.estresPct / P.costos.idaYVueltaPct).neto ?? null;
      const ee = error(antes);
      const piso = h.n && ee != null ? Math.round((h.neto - 1.96 * ee) * 1000) / 1000 : null;
      let etiqueta = 'sin ventaja';
      if (h.n < E.muestraBaja) etiqueta = 'muestra baja';
      else if (h.n >= E.muestraEvaluable && piso > 0 && estres > 0 && (limpio.n < 10 || limpio.neto > -0.05)) etiqueta = 'ventaja medida';
      else if (h.neto > 0) etiqueta = 'a favor, por confirmar';
      celdas[`${regla}|${m}|${lado < 0 ? 'corto' : 'largo'}`] = {
        etiqueta,
        historia: { ...h, conEstres: estres, piso },
        limpio,
        conTresOMas: resumir(antes.filter(o => o.factores.aFavor >= 3)),
        conMenos: resumir(antes.filter(o => o.factores.aFavor < 3)),
      };
    }
  }
}

const evidencia = {
  hecho: new Date().toISOString(),
  huella: createHash('sha256').update(textoMotor).update(textoParametros).digest('hex').slice(0, 16),
  desde: new Date(w['15m'][0].t).toISOString().slice(0, 10),
  corte: E.corte.slice(0, 10),
  costoPct: P.costos.idaYVueltaPct,
  celdas,
};
await writeFile(new URL('reglas/evidencia.json', raiz), JSON.stringify(evidencia, null, 1));

const n = (x, d = 2) => (x == null ? '—' : x.toFixed(d));
console.log(`\nHuella ${evidencia.huella} · historia desde ${evidencia.desde} hasta ${evidencia.corte} · tramo limpio después`);
console.log('celda                    n     neto  factor  estrés   piso | limpio n   neto | 3+ fact.  n  | etiqueta');
for (const [k, c] of Object.entries(celdas).sort((x, y) => (y[1].historia.neto ?? -9) - (x[1].historia.neto ?? -9))) {
  const h = c.historia;
  console.log([
    k.padEnd(22), String(h.n).padStart(5), n(h.neto).padStart(7), n(h.factor).padStart(7), n(h.conEstres).padStart(7), n(h.piso).padStart(7), '|',
    String(c.limpio.n).padStart(6), n(c.limpio.neto).padStart(7), '|', n(c.conTresOMas.neto).padStart(6), String(c.conTresOMas.n).padStart(5), '|', c.etiqueta,
  ].join(' '));
}

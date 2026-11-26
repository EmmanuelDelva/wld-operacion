// Baja la historia de Binance a esta computadora y mide cada celda: regla, temporalidad y lado.
// Deja el resultado en reglas/evidencia.json, que es lo que la app muestra junto a cada operación.
//   node pruebas/historia.mjs
// Hay que correrlo en tu propia máquina: a los servidores en Estados Unidos Binance les responde 451.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BINANCE, armarTodas, preparar, simular, simularTirador, resumir } from '../motor/motor.js';

const raiz = new URL('../', import.meta.url);
const textoParametros = await readFile(new URL('reglas/parametros.json', raiz), 'utf8');
const textoMotor = await readFile(new URL('motor/motor.js', raiz), 'utf8');
const P = JSON.parse(textoParametros);
const E = P.evidencia;
const pausa = ms => new Promise(r => setTimeout(r, ms));
await mkdir(new URL('datos/', raiz), { recursive: true });

// Baja una serie completa y la guarda; la siguiente vez solo completa lo nuevo.
async function historia(simbolo, marco, inicio = 0) {
  const archivo = new URL(`datos/${simbolo}-${marco}-b.json`, raiz);
  let filas = [];
  try { filas = JSON.parse(await readFile(archivo, 'utf8')); } catch { /* primera vez */ }
  if (filas.length) filas.pop();
  let desde = filas.length ? filas.at(-1)[0] + 1 : inicio;
  for (;;) {
    const r = await fetch(`${BINANCE}/fapi/v1/klines?symbol=${simbolo}&interval=${marco}&limit=1500&startTime=${desde}`);
    if (!r.ok) throw new Error(`Binance respondió ${r.status} en ${simbolo} ${marco}`);
    const lote = await r.json();
    if (!lote.length) break;
    for (const k of lote) filas.push([+k[0], +k[1], +k[2], +k[3], +k[4], +k[5], +k[6], +k[9]]);
    desde = lote.at(-1)[0] + 1;
    if (lote.length < 1500) break;
    await pausa(350);
  }
  await writeFile(archivo, JSON.stringify(filas));
  const ahora = Date.now();
  const velas = filas.filter(k => k[6] < ahora).map(k => ({ t: k[0], o: k[1], h: k[2], l: k[3], c: k[4], v: k[5], fin: k[6], tb: k[7] }));
  console.log(`  ${simbolo} ${marco}: ${velas.length} velas`);
  return velas;
}

console.log('Bajando historia…');
const w = {};
for (const m of ['1w', '1d', '4h', '1h', '15m']) w[m] = await historia('WLDUSDT', m);
const inicioBtc = w['1d'][0].t - 90 * 86_400_000;
const b = {};
for (const m of ['1d', '4h', '1h', '15m']) b[m] = await historia('BTCUSDT', m, inicioBtc);

// Funding: lo que una posición cobra o paga mientras está abierta. Un corto cobra cuando la tasa es positiva.
async function historiaFunding(simbolo) {
  const archivo = new URL(`datos/${simbolo}-funding-b.json`, raiz);
  let filas = [];
  try { filas = JSON.parse(await readFile(archivo, 'utf8')); } catch { /* primera vez */ }
  let desde = filas.length ? filas.at(-1)[0] + 1 : w['1d'][0].t;
  for (;;) {
    const r = await fetch(`${BINANCE}/fapi/v1/fundingRate?symbol=${simbolo}&limit=1000&startTime=${desde}`);
    if (!r.ok) throw new Error(`Binance respondió ${r.status} en funding`);
    const lote = await r.json();
    if (!lote.length) break;
    for (const k of lote) filas.push([+k.fundingTime, +k.fundingRate]);
    desde = lote.at(-1).fundingTime + 1;
    if (lote.length < 1000) break;
    await pausa(350);
  }
  await writeFile(archivo, JSON.stringify(filas));
  console.log(`  ${simbolo} funding: ${filas.length} cobros`);
  return filas;
}
const funding = await historiaFunding('WLDUSDT');
const acumulado = [0];
for (const f of funding) acumulado.push(acumulado.at(-1) + f[1]);
const hasta = t => { let lo = 0, hi = funding.length; while (lo < hi) { const m = (lo + hi) >> 1; if (funding[m][0] <= t) lo = m + 1; else hi = m; } return lo; };
// Suma al resultado de cada operación cerrada el funding de su tiempo abierta, en R.
function conFunding(ops) {
  for (const o of ops) {
    if (o.estado !== 'cerrada') continue;
    const tasa = acumulado[hasta(o.tSalida)] - acumulado[hasta(o.t)];
    o.fundingR = -o.lado * tasa * 100 / o.riesgoPct;
    o.bruto += o.fundingR;
    o.neto += o.fundingR;
    if (o.netoBE != null) o.netoBE += o.fundingR;
    if (o.netoGestion != null) o.netoGestion += o.fundingR;
  }
  return ops;
}

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
const media = xs => (xs.length ? Math.round(1000 * xs.reduce((s, x) => s + x, 0) / xs.length) / 1000 : null);
const etiquetar = (h, piso, estres, limpio) => {
  if (h.n < E.muestraBaja) return 'muestra baja';
  if (h.n >= E.muestraEvaluable && piso > 0 && estres > 0 && (limpio.n < 10 || limpio.neto > -0.05)) return 'ventaja medida';
  return h.neto > 0 ? 'a favor, por confirmar' : 'sin ventaja';
};
// Francotirador: idea en el macro, disparo en 15 m.
for (const m of P.tirador.marcos) {
  const { ops } = simularTirador(prep['15m'], prep[m], m, P, { superior: prep[P.superior[m]], btc: prepBtc[m] });
  conFunding(ops);
  for (const lado of [-1, 1]) {
    const grupo = ops.filter(o => o.lado === lado && o.estado === 'cerrada' && o.g.fin && o.finRecorrido);
    const antes = grupo.filter(o => o.t < corte);
    const despues = grupo.filter(o => o.t >= corte);
    const h = resumir(antes);
    const limpio = resumir(despues);
    const estres = resumir(antes, P.costos.estresPct / P.costos.idaYVueltaPct).neto ?? null;
    const ee = error(antes);
    const piso = h.n && ee != null ? Math.round((h.neto - 1.96 * ee) * 1000) / 1000 : null;
    const recorrido = {};
    for (const k of [1, 2, 3, 4, 5]) recorrido[k] = antes.length ? Math.round(100 * antes.filter(o => o.mfe >= k).length / antes.length) : null;
    celdas[`tirador|${m}|${lado < 0 ? 'corto' : 'largo'}`] = {
      etiqueta: etiquetar(h, piso, estres, limpio),
      historia: { ...h, conEstres: estres, piso },
      limpio,
      conTresOMas: resumir(antes.filter(o => o.factores.aFavor >= 3)),
      conMenos: resumir(antes.filter(o => o.factores.aFavor < 3)),
      gestion: { stopALaEntrada: media(antes.map(o => o.netoBE)), parcialYStopMovil: media(antes.map(o => o.netoGestion)) },
      flujo: { aFavor: resumir(antes.filter(o => o.flujoAFavor === true)), enContra: resumir(antes.filter(o => o.flujoAFavor === false)) },
      recorrido,
      stopMedioPct: media(antes.map(o => o.riesgoPct)),
      fundingMedioR: media(antes.map(o => o.fundingR)),
    };
  }
}
for (const m of P.operables) {
  const { ops } = simular(prep[m], m, P, { superior: prep[P.superior[m]], btc: prepBtc[m] });
  conFunding(ops);
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
  funding: 'incluido',
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

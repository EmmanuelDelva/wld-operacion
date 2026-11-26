// Comprueba con datos reales que las velas que arma el motor son las mismas que da Binance.
// Binance sí publica 3 m, 30 m y 2 h: se arman aquí desde 1 m, 15 m y 1 h y se comparan vela por vela.
// Las de 45 m y 3 h no existen en Binance; salen del mismo procedimiento.
//   node pruebas/armado.mjs
import { traerVelas, soloCerradas, agrupar } from '../motor/motor.js';

const simbolo = process.argv[2] || 'WLDUSDT';
const casos = [['1m', 1, '3m', 3], ['15m', 15, '30m', 30], ['1h', 60, '2h', 120]];
let fallas = 0;
for (const [base, minBase, destino, minDestino] of casos) {
  const [a, b] = await Promise.all([traerVelas(simbolo, base, 1500), traerVelas(simbolo, destino, 500)]);
  const armadas = new Map(agrupar(soloCerradas(a), minBase, minDestino).map(v => [v.t, v]));
  let iguales = 0, distintas = 0;
  for (const n of soloCerradas(b)) {
    const m = armadas.get(n.t);
    if (!m) continue;
    const igual = m.o === n.o && m.h === n.h && m.l === n.l && m.c === n.c && Math.abs(m.v - n.v) <= 1e-6 * Math.max(1, n.v);
    if (igual) iguales++; else { distintas++; if (distintas <= 3) console.log('  distinta', destino, new Date(n.t).toISOString(), m, n); }
  }
  fallas += distintas;
  console.log(`${destino} armada desde ${base}: ${iguales} velas iguales, ${distintas} distintas`);
}
console.log(fallas === 0 ? 'Armado correcto.' : 'Hay diferencias: revisar.');
process.exitCode = fallas === 0 ? 0 : 1;

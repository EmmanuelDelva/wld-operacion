// Lee Binance desde esta computadora y muestra lo que el motor ve ahora mismo.
//   node pruebas/estado.mjs            (WLDUSDT)
//   node pruebas/estado.mjs BTCUSDT
// Desde servidores en Estados Unidos Binance responde 451: hay que correrlo en tu propia máquina.
import { readFile } from 'node:fs/promises';
import { leerEstado, MARCOS } from '../motor/motor.js';

const parametros = JSON.parse(await readFile(new URL('../reglas/parametros.json', import.meta.url), 'utf8'));
const simbolo = process.argv[2] || 'WLDUSDT';
const n = (x, d = 4) => (x == null ? '—' : x.toFixed(d));
const inicio = Date.now();
const e = await leerEstado({ simbolo, parametros });

console.log(`${e.simbolo} · precio ${n(e.precio)} · ${new Date(e.hora).toISOString()} · ${Date.now() - inicio} ms`);
console.log('marco  sesgo     fuerza  ADX    cierre   EMA21    EMA50    última vela (UTC)');
for (const m of MARCOS) {
  const x = e.marcos[m];
  if (!x.listo) { console.log(`${m.padEnd(6)} faltan velas (${x.velas})`); continue; }
  console.log([
    m.padEnd(6), (x.sesgo + (x.contra ? '*' : '')).padEnd(9), String(x.fuerza).padStart(6), n(x.adx, 1).padStart(6),
    n(x.cierre).padStart(8), n(x.emaRapida).padStart(8), n(x.emaLenta).padStart(8), ' ' + new Date(x.hora).toISOString().slice(0, 16),
  ].join(' '));
}
console.log('* la fuerza va contra el sesgo de fondo');
console.log(`Manda: ${e.manda ?? 'ninguna con tendencia clara'}`);
console.log(`Volatilidad: percentil ${e.volatilidad.percentil} · ${e.volatilidad.operable ? 'operable' : 'fuera de rango'}`);
const z = e.swing;
if (!z.lado) console.log(`Swing: sin zona (${z.motivo})`);
else console.log(`Swing ${z.lado}: abre entre ${n(z.desde)} y ${n(z.hasta)} · ideal ${n(z.ideal)} · se invalida en ${n(z.invalida)} (${n(z.riesgoPct, 2)} %) · objetivo 1 ${n(z.objetivo1)} · objetivo 2 ${n(z.objetivo2)} · precio en zona: ${z.precioEnZona ? 'sí' : 'no'}`);

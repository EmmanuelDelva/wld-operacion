// Lee Binance desde esta computadora y muestra lo que el motor ve ahora mismo.
//   node pruebas/estado.mjs
// Desde servidores en Estados Unidos Binance responde 451: hay que correrlo en tu propia máquina.
import { readFile } from 'node:fs/promises';
import { leerEstado, MARCOS } from '../motor/motor.js';

const parametros = JSON.parse(await readFile(new URL('../reglas/parametros.json', import.meta.url), 'utf8'));
const n = (x, d = 4) => (x == null ? '—' : x.toFixed(d));
const L = l => (l < 0 ? 'corto' : 'largo');
const inicio = Date.now();
const e = await leerEstado({ simbolo: process.argv[2] || 'WLDUSDT', parametros });

console.log(`${e.simbolo} · precio ${n(e.precio)} · ${new Date(e.hora).toISOString()} · ${Date.now() - inicio} ms`);
console.log(MARCOS.map(m => { const x = e.marcos[m]; return x.listo ? `${m} ${x.sesgo}${x.contra ? '*' : ''} ${x.fuerza}` : `${m} faltan velas`; }).join(' · '));
console.log(`Manda: ${e.mando.manda ?? 'sin impulso en 15 m'} ${e.mando.manda ? (e.mando.direccion > 0 ? 'alcista' : 'bajista') : ''} · Fondo: ${e.mando.fondo ?? '—'} ${e.mando.fondo ? (e.mando.direccionFondo > 0 ? 'alcista' : 'bajista') : ''}`);
console.log(`Funding ${n(e.extras.funding)} % · cuentas grandes ${n(e.extras.grandesCuentas, 2)} · volatilidad percentil ${e.volatilidad.percentil}`);
const f = e.fase;
console.log(f.clara ? `Fase ${f.lado < 0 ? 'bajista' : 'alcista'}: inició en ${n(f.inicio)}, final proyectado ${n(f.final)}, recorrido ${f.recorrido} %` : `Sin fase clara: rango ${n(f.piso)} a ${n(f.techo)}`);
if (e.btc) console.log(`BTC: 1d ${e.btc.marcos['1d'].sesgo} · 4h ${e.btc.marcos['4h'].sesgo} · 1h ${e.btc.marcos['1h'].sesgo} · WLD contra BTC 24 h ${n(e.btc.diferencia, 2)} % · correlación ${n(e.btc.correlacion, 2)}`);
const m = e.mapa;
console.log(`Día: apertura ${n(m.apertura)} · máx ${n(m.maximo)} · mín ${n(m.minimo)} · techo probable ${n(m.techo)} · piso probable ${n(m.piso)}`);
console.log('   ' + m.bloques.map(b => `${b.horas} ${b.estado}${b.cambio != null ? ' ' + n(b.cambio, 1) + ' %' : ''} (${b.sesgo}${b.sesgo !== 'sin sesgo' ? ' ' + b.frecuencia + ' % de ' + b.dias : ''})`).join(' · '));
console.log('Por temporalidad:');
for (const marco of e.operables) {
  const x = e.porMarco[marco];
  const partes = [];
  for (const regla of ['zona', 'retroceso', 'barrido']) {
    const s = x[regla];
    if (s.estado === 'en operación') partes.push(`${regla}: ${L(s.op.lado)} confirmado, entrada ${n(s.op.entrada)} → objetivo 2 ${n(s.op.objetivo2)}, stop ${n(s.op.stop)}, a favor ${s.op.factores.aFavor} de ${s.op.factores.de}`);
    else if (s.estado === 'preparando' || s.estado === 'en zona') partes.push(`${regla}: ${L(s.lado)} ${s.estado}, abre entre ${n(s.desde)} y ${n(s.hasta)}, se invalida en ${n(s.invalida)}`);
    else if (s.estado === 'barrido en curso') partes.push(`barrido en curso (${L(s.lado)}), nivel ${n(s.nivel)}`);
  }
  console.log(`  ${marco.padEnd(4)} ${partes.join(' | ') || 'sin operación'}`);
}
const p = e.principal;
console.log(p ? `Principal: ${p.regla} ${p.marco} · ${p.estado}` : 'Principal: ninguna');
console.log(`Vigentes: ${e.vigentes.length} · señales cerradas en el periodo cargado: ${e.senales.length}`);
for (const o of e.senales.slice(0, 5)) console.log(`  ${new Date(o.t).toISOString().slice(0, 16)} ${o.marco} ${o.regla} ${L(o.lado)} ${n(o.entrada)} → ${n(o.salida)} ${o.motivo} ${n(o.neto, 2)} R`);

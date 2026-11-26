// Pruebas del motor con datos fabricados. No usa red: corre en cualquier lado.
//   node pruebas/autoprueba.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  agrupar, ema, atr, adx, eficiencia, percentil, cuantil, leerMarco, soloCerradas, preparar,
  regimen, zona, simular, resumir, quienManda, leerFase, mapaDelDia,
} from '../motor/motor.js';

const P = JSON.parse(await readFile(new URL('../reglas/parametros.json', import.meta.url), 'utf8'));
const C = P.contexto;
const R = P.retroceso;
const MIN = 60_000;
const cerca = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} no es ${b}`);
let pruebas = 0;
const prueba = f => { f(); pruebas++; };

// Serie de velas con precio dado por una función del índice.
function serie(n, minutos, precio, t0 = Date.UTC(2026, 0, 5), mecha = 0.5) {
  return Array.from({ length: n }, (_, i) => {
    const o = precio(i), c = precio(i + 1);
    return { t: t0 + i * minutos * MIN, o, c, h: Math.max(o, c) + mecha, l: Math.min(o, c) - mecha, v: 10, fin: t0 + (i + 1) * minutos * MIN - 1 };
  });
}

// Un día de 15 m da 32 velas de 45 m, alineadas a las 00:00 UTC.
prueba(() => {
  const v45 = agrupar(serie(96, 15, i => 100 + i), 15, 45);
  assert.equal(v45.length, 32);
  assert.equal(v45[1].t, Date.UTC(2026, 0, 5, 0, 45));
  assert.equal(v45[31].t, Date.UTC(2026, 0, 5, 23, 15));
  assert.deepEqual([v45[0].o, v45[0].c, v45[0].h, v45[0].l, v45[0].v], [100, 103, 103.5, 99.5, 30]);
});

// Un grupo incompleto no sale; y las cuentas por día de 3 h, 2 h, 30 m y 3 m.
prueba(() => {
  assert.equal(agrupar(serie(4, 15, i => 100 + i), 15, 45).length, 1);
  assert.equal(agrupar(serie(24, 60, i => 100 + i), 60, 180).length, 8);
  assert.equal(agrupar(serie(24, 60, i => 100 + i), 60, 120).length, 12);
  assert.equal(agrupar(serie(96, 15, i => 100 + i), 15, 30).length, 48);
  assert.equal(agrupar(serie(1440, 1, i => 100 + i), 1, 3).length, 480);
});

// La vela abierta se descarta.
prueba(() => {
  const v = serie(5, 15, i => 100 + i);
  assert.equal(soloCerradas(v, v[4].t + MIN).length, 4);
});

// Indicadores.
prueba(() => {
  cerca(ema(new Array(60).fill(7), 21).at(-1), 7);
  assert.deepEqual(ema([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  const planas = Array.from({ length: 40 }, (_, i) => ({ t: i, o: 10, c: 10, h: 11, l: 9, v: 1, fin: i }));
  cerca(atr(planas, 14).at(-1), 2);
  cerca(eficiencia(Array.from({ length: 30 }, (_, i) => i), 20), 100);
  cerca(eficiencia(Array.from({ length: 30 }, (_, i) => -i), 20), -100);
  cerca(eficiencia(Array.from({ length: 31 }, (_, i) => i % 2), 20), 0);
  cerca(percentil([1, 2, 3, 4], 3), 75);
  cerca(cuantil([1, 2, 3, 4, 5], 0.5), 3);
  assert.ok(adx(serie(120, 60, i => 100 + i * 2), 14).at(-1) > 60);
  assert.ok(adx(serie(120, 60, i => 100 + (i % 2)), 14).at(-1) < 20);
});

// Lectura de una temporalidad.
prueba(() => {
  const baja = leerMarco(serie(120, 240, i => 300 - i), C);
  assert.equal(baja.sesgo, 'bajista');
  assert.equal(baja.fuerza, 100);
  assert.equal(leerMarco(serie(120, 240, i => 100 + (i % 2)), C).sesgo, 'lateral');
  assert.equal(leerMarco(serie(30, 240, i => 100 + i), C).listo, false);
});

// Régimen: bajada limpia = corto; subida = largo; mercado plano = ninguno, por la separación mínima.
prueba(() => {
  const baja = preparar(serie(200, 240, i => 300 - i), C);
  const sube = preparar(serie(200, 240, i => 100 + i), C);
  const plano = preparar(serie(200, 240, i => 100 + (i % 2)), C);
  assert.equal(regimen(baja, 199, R), -1);
  assert.equal(regimen(sube, 199, R), 1);
  assert.equal(regimen(plano, 199, R), 0);
});

// Zona: en bajada queda arriba del precio, la invalidación arriba de la zona y los objetivos abajo.
prueba(() => {
  const p = preparar(serie(200, 240, i => 300 - i), C);
  const z = zona(p, 199, -1, R, '4h');
  assert.ok(z.desde < z.hasta && z.hasta < z.invalida);
  const riesgo = z.invalida - z.ideal;
  cerca(z.ideal - z.objetivo1, R.objetivo1R * riesgo);
  cerca(z.ideal - z.objetivo2, R.objetivo2R * riesgo);
  assert.ok(riesgo >= p.rango[199] - 1e-9);
  const zl = zona(preparar(serie(200, 240, i => 100 + i), C), 199, 1, R, '4h');
  assert.ok(zl.invalida < zl.desde && zl.desde < zl.hasta && zl.objetivo2 > zl.objetivo1);
});

// Simulación del retroceso: bajada, rebote a la zona y nueva caída.
// Debe abrir cortos, con stop arriba de la entrada y objetivos abajo, y la caída final debe llegar al objetivo 2.
prueba(() => {
  const precio = i => (i <= 120 ? 400 - i : i <= 132 ? 280 + (i - 120) * 1.5 : 298 - (i - 132) * 2);
  const { ops } = simular(preparar(serie(200, 60, precio), C), '1h', P);
  const cortos = ops.filter(o => o.lado === -1 && o.regla !== 'barrido');
  assert.ok(cortos.length >= 1, 'no abrió ningún corto');
  for (const o of cortos) {
    assert.ok(o.stop > o.entrada && o.objetivo1 < o.entrada && o.objetivo2 < o.objetivo1);
    cerca(o.stop - o.entrada, o.riesgo);
    assert.ok(o.costoR > 0);
  }
  const ganadoras = cortos.filter(o => o.motivo === 'objetivo 2');
  assert.ok(ganadoras.length >= 1, 'ninguna llegó al objetivo 2');
  cerca(ganadoras[0].bruto, R.objetivo2R, 1e-9);
  cerca(ganadoras[0].neto, R.objetivo2R - ganadoras[0].costoR, 1e-9);
  assert.equal(ganadoras[0].toco1, true);
});

// Simulación del barrido: rango plano, una vela rebasa el máximo y cierra de vuelta adentro.
prueba(() => {
  const v = serie(120, 15, i => 100 + (i % 2) * 0.4, Date.UTC(2026, 0, 5), 0.2);
  const k = 100;
  v[k] = { ...v[k], h: 103, c: 100.2, o: 100.4 };            // mecha arriba del rango y cierre adentro
  for (let i = k + 1; i < 120; i++) v[i] = { ...v[i], o: v[i - 1].c, c: v[i - 1].c - 0.6, h: v[i - 1].c + 0.1, l: v[i - 1].c - 0.7 };
  const { ops } = simular(preparar(v, C), '15m', P);
  const b = ops.find(o => o.regla === 'barrido');
  assert.ok(b, 'no detectó la ruptura fallida');
  assert.equal(b.lado, -1);
  assert.ok(b.stop >= 103);
  assert.equal(b.motivo, 'objetivo 2');
});

// El resumen suma bien, y el estrés encarece el costo.
prueba(() => {
  const r = resumir([
    { estado: 'cerrada', bruto: 2.5, costoR: 0.1, toco1: true, motivo: 'objetivo 2' },
    { estado: 'cerrada', bruto: -1, costoR: 0.1, toco1: false, motivo: 'stop' },
    { estado: 'abierta' },
  ]);
  assert.equal(r.n, 2);
  cerca(r.neto, 0.65, 1e-9);
  cerca(r.factor, 2.4 / 1.1, 1e-3);
  assert.equal(r.objetivo2, 50);
  cerca(resumir([{ estado: 'cerrada', bruto: 1, costoR: 0.2, motivo: 'tiempo' }], 1.5).neto, 0.7, 1e-9);
});

// Quién manda: el movimiento que nace en 15 m llega hasta donde aparece una dirección contraria; los neutrales se saltan.
prueba(() => {
  const m = (direccion, adxv = 30) => ({ listo: true, direccion, adx: adxv });
  const marcos = { '15m': m(1), '30m': m(1), '45m': m(0), '1h': m(1), '2h': m(-1), '3h': m(-1), '4h': m(-1, 20), '1d': m(-1, 40), '1w': m(0) };
  const q = quienManda(marcos, C);
  assert.equal(q.manda, '1h');
  assert.equal(q.direccion, 1);
  assert.equal(q.fondo, '1d');
  assert.equal(q.direccionFondo, -1);
  assert.equal(quienManda({ ...marcos, '15m': m(0) }, C).manda, null);
});

// Fase: tras romper hacia abajo un rango, la fase es bajista y proyecta la amplitud del rango.
prueba(() => {
  const precio = i => (i <= 80 ? 100 + (i % 2) : 100 - (i - 80) * 0.5);
  const f = leerFase(preparar(serie(120, 240, precio, Date.UTC(2026, 0, 5), 0.1), C), P.fase);
  assert.equal(f.clara, true);
  assert.equal(f.lado, -1);
  assert.ok(f.final < f.inicio);
  assert.equal(leerFase(preparar(serie(120, 240, i => 100 + (i % 2)), C), P.fase).clara, false);
});

// Mapa del día: techo arriba de la apertura, piso abajo, y cuatro bloques de 6 horas.
prueba(() => {
  const t0 = Date.UTC(2026, 0, 5);
  const v1h = serie(24 * 70 + 8, 60, i => 100 + Math.sin(i / 5), t0, 0.3);
  const v1d = agrupar(v1h, 60, 1440);
  const ahora = v1h.at(-1).fin + 1;
  const m = mapaDelDia(v1d, v1h, v1h.at(-1).c, P.mapaDelDia, ahora);
  assert.ok(m.techo > m.apertura && m.piso < m.apertura);
  assert.equal(m.bloques.length, 4);
  assert.equal(m.bloques[0].estado, 'cerrado');
  assert.equal(m.bloques[1].estado, 'en curso');
  assert.ok(m.bloques[0].dias >= 60);
});

console.log(`Motor: ${pruebas} pruebas pasaron.`);

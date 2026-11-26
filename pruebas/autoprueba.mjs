// Pruebas del motor con datos fabricados. No usa red: corre en cualquier lado.
//   node pruebas/autoprueba.mjs
import assert from 'node:assert/strict';
import { agrupar, ema, atr, adx, eficiencia, percentil, leerMarco, zonaSwing, soloCerradas } from '../motor/motor.js';

const MIN = 60_000;
const cerca = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} no es ${b}`);
const C = { emaRapida: 21, emaLenta: 50, velasPendiente: 3, velasFuerza: 20, fuerzaLateral: 20, adxTendencia: 25 };
const S = { anchoZonaAtr: 1.0, margenInvalidacionAtr: 0.35, invalidacionMinima: 0.015, objetivo1R: 1.5, objetivo2R: 2.5 };

// Serie de velas con precio dado por una función del índice.
function serie(n, minutos, precio, t0 = Date.UTC(2026, 0, 5)) {
  return Array.from({ length: n }, (_, i) => {
    const o = precio(i), c = precio(i + 1);
    return { t: t0 + i * minutos * MIN, o, c, h: Math.max(o, c) + 0.5, l: Math.min(o, c) - 0.5, v: 10, fin: t0 + (i + 1) * minutos * MIN - 1 };
  });
}

// 1. Un día de 15 m da 32 velas de 45 m, alineadas a las 00:00 UTC.
{
  const dia = serie(96, 15, i => 100 + i);
  const v45 = agrupar(dia, 15, 45);
  assert.equal(v45.length, 32);
  assert.equal(v45[0].t, Date.UTC(2026, 0, 5));
  assert.equal(v45[1].t, Date.UTC(2026, 0, 5, 0, 45));
  assert.equal(v45[31].t, Date.UTC(2026, 0, 5, 23, 15));
  assert.equal(v45[0].o, 100);
  assert.equal(v45[0].c, 103);
  assert.equal(v45[0].h, 103.5);
  assert.equal(v45[0].l, 99.5);
  assert.equal(v45[0].v, 30);
}

// 2. Un grupo incompleto no sale: con 4 velas de 15 m solo hay una de 45 m.
assert.equal(agrupar(serie(4, 15, i => 100 + i), 15, 45).length, 1);

// 3. Tres horas: 8 velas por día. Dos horas: 12. Media hora desde 15 m: 48. Tres minutos desde 1 m: 480.
assert.equal(agrupar(serie(24, 60, i => 100 + i), 60, 180).length, 8);
assert.equal(agrupar(serie(24, 60, i => 100 + i), 60, 120).length, 12);
assert.equal(agrupar(serie(96, 15, i => 100 + i), 15, 30).length, 48);
assert.equal(agrupar(serie(1440, 1, i => 100 + i), 1, 3).length, 480);

// 4. La vela abierta se descarta.
{
  const v = serie(5, 15, i => 100 + i);
  assert.equal(soloCerradas(v, v[4].t + MIN).length, 4);
}

// 5. EMA: una serie constante da la misma constante; un caso chico calculado a mano.
cerca(ema(new Array(60).fill(7), 21).at(-1), 7);
{
  const e = ema([1, 2, 3, 4, 5], 3); // arranque (1+2+3)/3 = 2; luego 4*0.5+2*0.5 = 3; luego 5*0.5+3*0.5 = 4
  assert.deepEqual(e, [null, null, 2, 3, 4]);
}

// 6. ATR: si todas las velas miden lo mismo y no hay huecos, el ATR es ese tamaño.
{
  const v = Array.from({ length: 40 }, (_, i) => ({ t: i, o: 10, c: 10, h: 11, l: 9, v: 1, fin: i }));
  cerca(atr(v, 14).at(-1), 2);
}

// 7. Fuerza: línea recta = 100 con su signo; zigzag que no avanza = 0.
cerca(eficiencia(Array.from({ length: 30 }, (_, i) => i), 20), 100);
cerca(eficiencia(Array.from({ length: 30 }, (_, i) => -i), 20), -100);
cerca(eficiencia(Array.from({ length: 31 }, (_, i) => i % 2), 20), 0);

// 8. Percentil.
cerca(percentil([1, 2, 3, 4], 3), 75);

// 9. ADX: alto en tendencia limpia, bajo en un zigzag.
{
  const tendencia = serie(120, 60, i => 100 + i * 2);
  const zigzag = serie(120, 60, i => 100 + (i % 2));
  assert.ok(adx(tendencia, 14).at(-1) > 60);
  assert.ok(adx(zigzag, 14).at(-1) < 20);
}

// 10. Lectura de una temporalidad: bajada limpia = bajista con fuerza 100; zigzag = lateral.
{
  const baja = leerMarco(serie(120, 240, i => 300 - i), C);
  assert.equal(baja.sesgo, 'bajista');
  assert.equal(baja.fuerza, 100);
  assert.equal(baja.contra, false);
  assert.equal(leerMarco(serie(120, 240, i => 100 + (i % 2)), C).sesgo, 'lateral');
  assert.equal(leerMarco(serie(30, 240, i => 100 + i), C).listo, false);
}

// 11. Zona del swing en una bajada: la zona queda arriba del precio, la invalidación arriba de la zona
//     y los objetivos abajo, a 1.5 y 2.5 veces el riesgo.
{
  const z = zonaSwing(serie(200, 240, i => 300 - i), S, C);
  assert.equal(z.lado, 'corto');
  assert.ok(z.desde < z.hasta && z.hasta < z.invalida);
  assert.ok(z.objetivo2 < z.objetivo1 && z.objetivo1 < z.ideal);
  const riesgo = z.invalida - z.ideal;
  cerca(z.ideal - z.objetivo1, 1.5 * riesgo, 1e-9);
  cerca(z.ideal - z.objetivo2, 2.5 * riesgo, 1e-9);
  assert.ok(z.riesgoPct >= 1.5 - 1e-9);
}

// 12. En una subida es el espejo.
{
  const z = zonaSwing(serie(200, 240, i => 100 + i), S, C);
  assert.equal(z.lado, 'largo');
  assert.ok(z.invalida < z.desde && z.desde < z.hasta);
  assert.ok(z.objetivo2 > z.objetivo1 && z.objetivo1 > z.ideal);
}

// 13. Sin régimen no hay zona: tras una bajada larga, un rebote fuerte deja el precio sobre la EMA lenta
//     mientras la EMA rápida sigue debajo de ella. Ni corto ni largo.
assert.equal(zonaSwing(serie(154, 240, i => (i <= 150 ? 300 - i : 150 + (i - 150) * 10)), S, C).lado, null);

console.log('Motor: 13 pruebas pasaron.');

// Motor de la app de operación WLD.
// Cálculo puro, sin pantalla: corre igual en el navegador del teléfono y en Node 18 o más nuevo.
// Solo usa velas cerradas. No guarda llaves y no manda órdenes.

export const BINANCE = 'https://fapi.binance.com';
const MIN = 60_000;
const DIA = 1440 * MIN;

// Series que se piden a Binance, con sus minutos.
export const NATIVAS = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080 };
// Series que se arman en el aparato: [serie base, minutos].
export const ARMADAS = { '3m': ['1m', 3], '30m': ['15m', 30], '45m': ['15m', 45], '2h': ['1h', 120], '3h': ['1h', 180] };
// De mayor a menor, como se leen en pantalla.
export const MARCOS = ['1w', '1d', '4h', '3h', '2h', '1h', '45m', '30m', '15m', '5m', '3m', '1m'];
// De menor a mayor, para seguir hasta dónde llega un movimiento.
export const ESCALERA = ['15m', '30m', '45m', '1h', '2h', '3h', '4h', '1d', '1w'];

// ---------- Datos ----------

// Pide velas a Binance desde este aparato. Si hacen falta más de 1500, pide hacia atrás por tramos.
export async function traerVelas(simbolo, marco, cuantas = 500, traer = fetch) {
  let velas = [];
  let hasta;
  while (velas.length < cuantas) {
    const pedir = Math.min(1500, cuantas - velas.length);
    const url = `${BINANCE}/fapi/v1/klines?symbol=${simbolo}&interval=${marco}&limit=${pedir}` + (hasta ? `&endTime=${hasta}` : '');
    const r = await traer(url);
    if (!r.ok) throw new Error(`Binance respondió ${r.status} al pedir velas de ${marco}`);
    const lote = (await r.json()).map(k => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], fin: +k[6], tb: +k[9] }));
    if (!lote.length) break;
    velas = lote.concat(velas);
    hasta = lote[0].t - 1;
    if (lote.length < pedir) break;
  }
  return velas;
}

// Quita la vela que todavía está abierta.
export function soloCerradas(velas, ahora = Date.now()) {
  return velas.filter(v => v.fin < ahora);
}

// Arma velas más grandes a partir de una serie base, alineadas al inicio del día UTC como TradingView.
// Solo devuelve grupos completos: una vela de 45 m sale de tres velas cerradas de 15 m.
export function agrupar(velas, minutosBase, minutosDestino) {
  const esperadas = minutosDestino / minutosBase;
  const paso = minutosDestino * MIN;
  const grupos = new Map();
  for (const v of velas) {
    const dia = Math.floor(v.t / DIA) * DIA;
    const inicio = dia + Math.floor((v.t - dia) / paso) * paso;
    let g = grupos.get(inicio);
    if (!g) {
      g = { t: inicio, o: v.o, h: v.h, l: v.l, c: v.c, v: 0, tb: 0, fin: inicio + paso - 1, partes: 0 };
      grupos.set(inicio, g);
    }
    g.h = Math.max(g.h, v.h);
    g.l = Math.min(g.l, v.l);
    g.c = v.c;
    g.v += v.v;
    g.tb += v.tb || 0;
    g.partes += 1;
  }
  return [...grupos.values()]
    .filter(g => g.partes === esperadas)
    .sort((a, b) => a.t - b.t)
    .map(({ partes, ...vela }) => vela);
}

// Completa las series armadas a partir de las nativas que haya.
export function armarTodas(nativas) {
  const series = { ...nativas };
  for (const [marco, [base, minutos]] of Object.entries(ARMADAS)) {
    if (nativas[base]) series[marco] = agrupar(nativas[base], NATIVAS[base], minutos);
  }
  return series;
}

// ---------- Indicadores ----------

// Media móvil exponencial; arranca con el promedio simple de las primeras n, como TradingView.
export function ema(x, n) {
  const salida = new Array(x.length).fill(null);
  if (x.length < n) return salida;
  const k = 2 / (n + 1);
  let e = 0;
  for (let i = 0; i < n; i++) e += x[i];
  e /= n;
  salida[n - 1] = e;
  for (let i = n; i < x.length; i++) {
    e = x[i] * k + e * (1 - k);
    salida[i] = e;
  }
  return salida;
}

// Media de Wilder. Salta los valores vacíos del principio.
export function mediaWilder(x, n) {
  const salida = new Array(x.length).fill(null);
  const ini = x.findIndex(v => v != null);
  if (ini < 0 || x.length - ini < n) return salida;
  let e = 0;
  for (let i = ini; i < ini + n; i++) e += x[i];
  e /= n;
  salida[ini + n - 1] = e;
  for (let i = ini + n; i < x.length; i++) {
    e = (e * (n - 1) + x[i]) / n;
    salida[i] = e;
  }
  return salida;
}

function rangoVerdadero(v) {
  return v.map((b, i) => i === 0
    ? b.h - b.l
    : Math.max(b.h - b.l, Math.abs(b.h - v[i - 1].c), Math.abs(b.l - v[i - 1].c)));
}

// Rango promedio de las velas (ATR de Wilder).
export function atr(v, n = 14) {
  return mediaWilder(rangoVerdadero(v), n);
}

// ADX de Wilder: mide si hay tendencia, sin decir hacia dónde.
export function adx(v, n = 14) {
  const sube = [0];
  const baja = [0];
  for (let i = 1; i < v.length; i++) {
    const a = v[i].h - v[i - 1].h;
    const b = v[i - 1].l - v[i].l;
    sube.push(a > b && a > 0 ? a : 0);
    baja.push(b > a && b > 0 ? b : 0);
  }
  const rango = mediaWilder(rangoVerdadero(v), n);
  const mas = mediaWilder(sube, n);
  const menos = mediaWilder(baja, n);
  const dx = rango.map((r, i) => {
    if (r == null || r === 0) return r == null ? null : 0;
    const p = 100 * mas[i] / r;
    const m = 100 * menos[i] / r;
    return p + m === 0 ? 0 : 100 * Math.abs(p - m) / (p + m);
  });
  return mediaWilder(dx, n);
}

// Fuerza con signo, de −100 a 100: cuánto avanzó el precio en n velas contra todo lo que caminó.
// 100 es una línea recta hacia arriba; cerca de 0 es ir y venir sin avanzar.
export function eficiencia(cierres, n = 20, i = cierres.length - 1) {
  if (i < n) return null;
  let camino = 0;
  for (let k = i - n + 1; k <= i; k++) camino += Math.abs(cierres[k] - cierres[k - 1]);
  return camino === 0 ? 0 : 100 * (cierres[i] - cierres[i - n]) / camino;
}

// Qué porcentaje de la serie queda en o por debajo del valor.
export function percentil(serie, valor) {
  const xs = serie.filter(x => x != null);
  if (!xs.length || valor == null) return null;
  return 100 * xs.filter(x => x <= valor).length / xs.length;
}

// El valor que deja debajo a la fracción q de la serie.
export function cuantil(serie, q) {
  const xs = serie.filter(x => x != null).sort((a, b) => a - b);
  if (!xs.length) return null;
  const pos = (xs.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}

// ---------- Lectura del mercado ----------

// Deja listos los indicadores de una serie, una sola vez.
export function preparar(velas, C) {
  const c = velas.map(b => b.c);
  return { velas, c, rapida: ema(c, C.emaRapida), lenta: ema(c, C.emaLenta), rango: atr(velas, 14) };
}

// Dirección de fondo en la vela i: cierre contra la EMA lenta y pendiente de la EMA rápida.
export function direccionEn(p, i, C) {
  if (i < C.velasPendiente || p.lenta[i] == null || p.rapida[i - C.velasPendiente] == null) return 0;
  const pendiente = p.rapida[i] - p.rapida[i - C.velasPendiente];
  return p.c[i] > p.lenta[i] && pendiente > 0 ? 1 : p.c[i] < p.lenta[i] && pendiente < 0 ? -1 : 0;
}

// Sesgo y fuerza de una temporalidad.
export function leerMarco(velas, C) {
  if (!velas || velas.length < C.emaLenta + C.velasFuerza) return { listo: false, velas: velas ? velas.length : 0 };
  const p = preparar(velas, C);
  const i = velas.length - 1;
  const direccion = direccionEn(p, i, C);
  const f = eficiencia(p.c, C.velasFuerza);
  const fuerza = Math.round(Math.abs(f));
  const lateral = direccion === 0 || fuerza < C.fuerzaLateral;
  return {
    listo: true,
    hora: velas[i].t,
    cierre: p.c[i],
    emaRapida: p.rapida[i],
    emaLenta: p.lenta[i],
    direccion,
    sesgo: lateral ? 'lateral' : direccion > 0 ? 'alcista' : 'bajista',
    fuerza,
    // La fuerza va contra el sesgo de fondo: es un rebote o un retroceso.
    contra: direccion !== 0 && Math.sign(f) !== 0 && Math.sign(f) !== direccion,
    adx: adx(velas, 14)[i],
  };
}

// Quién manda: hasta qué temporalidad llega, sin interrumpirse, la dirección que nace en 15 m.
// Fondo: la temporalidad más alta con tendencia clara.
export function quienManda(marcos, C) {
  const base = marcos['15m'];
  let manda = null;
  if (base && base.listo && base.direccion !== 0) {
    manda = '15m';
    for (const m of ESCALERA.slice(1)) {
      const x = marcos[m];
      if (!x || !x.listo || x.direccion === 0) continue; // neutral: se salta
      if (x.direccion === base.direccion) manda = m;      // misma dirección: el movimiento llega hasta aquí
      else break;                                         // contraria: aquí se detiene
    }
  }
  let fondo = null;
  for (const m of [...ESCALERA].reverse()) {
    const x = marcos[m];
    if (x && x.listo && x.direccion !== 0 && x.adx > C.adxTendencia) { fondo = m; break; }
  }
  return {
    manda,
    direccion: manda ? base.direccion : 0,
    fondo,
    direccionFondo: fondo ? marcos[fondo].direccion : 0,
  };
}

// ---------- Reglas ----------

// Régimen de la propia temporalidad en la vela i: −1 corto, 1 largo, 0 ninguno.
// Pide que las dos EMA estén separadas, para no dar zona en un mercado plano.
export function regimen(p, i, R) {
  const a = p.rango[i];
  if (i < 0 || a == null || p.lenta[i] == null) return 0;
  const separacion = p.rapida[i] - p.lenta[i];
  if (separacion <= -R.separacionAtr * a && p.c[i] < p.lenta[i]) return -1;
  if (separacion >= R.separacionAtr * a && p.c[i] > p.lenta[i]) return 1;
  return 0;
}

// Stop mínimo en ATR: en las temporalidades chicas es más ancho, porque el costo pesa más.
function stopMinimo(K, marco) {
  return (K.stopMinimoPorMarco && K.stopMinimoPorMarco[marco]) || K.stopMinimoAtr;
}

// Zona del retroceso en la vela i: dónde abre, dónde se invalida y los objetivos si se entra en la zona.
export function zona(p, i, lado, R, marco) {
  const a = p.rango[i];
  const r = p.rapida[i];
  const l = p.lenta[i];
  const desde = lado < 0 ? r : Math.max(l, r - R.anchoZonaAtr * a);
  const hasta = lado < 0 ? Math.min(l, r + R.anchoZonaAtr * a) : r;
  const ideal = (desde + hasta) / 2;
  const borde = lado < 0 ? hasta + R.margenInvalidacionAtr * a : desde - R.margenInvalidacionAtr * a;
  const riesgo = Math.max(Math.abs(borde - ideal), stopMinimo(R, marco) * a);
  return {
    desde, hasta, ideal,
    invalida: ideal - lado * riesgo,
    riesgoPct: 100 * riesgo / ideal,
    objetivo1: ideal + lado * R.objetivo1R * riesgo,
    objetivo2: ideal + lado * R.objetivo2R * riesgo,
  };
}

// Índice de la última vela ya cerrada en el instante t.
function ultimaCerrada(p, t) {
  let lo = 0;
  let hi = p.velas.length - 1;
  let r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (p.velas[m].fin <= t) { r = m; lo = m + 1; } else hi = m - 1;
  }
  return r;
}

// Lugar del rango de la vela i, como porcentaje del precio, contra sus velas anteriores.
function lugarVolatilidad(p, i, V) {
  if (p.rango[i] == null) return null;
  const x = p.rango[i] / p.c[i];
  let n = 0;
  let menores = 0;
  for (let k = Math.max(0, i - V.velas + 1); k <= i; k++) {
    if (p.rango[k] == null) continue;
    n++;
    if (p.rango[k] / p.c[k] <= x) menores++;
  }
  return n < 50 ? null : 100 * menores / n;
}

// Factores a favor de una operación. No bloquean: se cuentan y se muestran.
function factores(p, i, lado, regla, P, ctx, extra) {
  const C = P.contexto;
  const t = p.velas[i].fin;
  const lista = [];
  const sup = ctx.superior ? direccionEn(ctx.superior, ultimaCerrada(ctx.superior, t), C) : null;
  lista.push(['Temporalidad superior alineada', sup == null ? null : sup === lado]);
  const b = ctx.btc ? direccionEn(ctx.btc, ultimaCerrada(ctx.btc, t), C) : null;
  lista.push(['BTC alineado', b == null ? null : b === lado]);
  const vol = lugarVolatilidad(p, i, P.volatilidad);
  lista.push(['Volatilidad operable', vol == null ? null : vol >= P.volatilidad.minimo && vol <= P.volatilidad.maximo]);
  if (regla !== 'barrido') {
    const f = eficiencia(p.c, C.velasFuerza, i);
    lista.push(['Fuerza a favor', f == null ? null : Math.sign(f) === lado && Math.abs(f) >= C.fuerzaLateral]);
  } else {
    lista.push(['Volumen bajo en el barrido', extra ? extra.volumenBajo : null]);
  }
  return { lista, aFavor: lista.filter(x => x[1] === true).length, de: lista.filter(x => x[1] != null).length };
}

function cerrar(op, precio, motivo, vela, i) {
  op.salida = precio;
  op.motivo = motivo;
  op.tSalida = vela.fin;
  op.velas = i - op.i;
  op.bruto = op.lado * (precio - op.entrada) / op.riesgo;
  op.neto = op.bruto - op.costoR;
  op.estado = 'cerrada';
  return true;
}

// Avanza una operación abierta con una vela cerrada. Si la misma vela toca stop y objetivo, cuenta el stop.
function avanzar(op, vela, i) {
  const s = op.lado;
  const tocaStop = s > 0 ? vela.l <= op.stop : vela.h >= op.stop;
  const toca1 = s > 0 ? vela.h >= op.objetivo1 : vela.l <= op.objetivo1;
  const toca2 = s > 0 ? vela.h >= op.objetivo2 : vela.l <= op.objetivo2;
  if (tocaStop) return cerrar(op, op.stop, 'stop', vela, i);
  if (toca1) op.toco1 = true;
  if (toca2) return cerrar(op, op.objetivo2, 'objetivo 2', vela, i);
  if (i - op.i >= op.vence) return cerrar(op, vela.c, 'tiempo', vela, i);
  return false;
}

// Recorre una serie de velas cerradas y aplica las reglas:
//   zona:      en tendencia, orden límite en el punto medio de la zona entre las dos EMA;
//   retroceso: lo mismo, pero espera a que una vela confirme después de tocar la zona;
//   barrido:   el precio rebasa el extremo de las últimas velas y cierra de vuelta (ruptura fallida).
// Devuelve todas las operaciones y el estado vivo de cada regla. Es el mismo código para la app y para las pruebas.
export function simular(p, marco, P, ctx = {}) {
  const v = p.velas;
  const n = v.length;
  const R = P.retroceso;
  const B = P.barrido;
  const C = P.contexto;
  const ops = [];
  const ini = Math.max(C.emaLenta + C.velasPendiente + 1, B.velasRango + 15);
  let opZ = null;
  let opR = null;
  let opB = null;
  let armada = 0;
  let toque = null;
  let barr = null;

  const abrir = (regla, i, lado, entrada, riesgo, K, extra) => {
    const op = {
      id: `${regla}|${marco}|${v[i].fin}`,
      regla, marco, lado, i,
      t: v[i].fin,
      entrada, riesgo,
      riesgoPct: 100 * riesgo / entrada,
      stop: entrada - lado * riesgo,
      objetivo1: entrada + lado * K.objetivo1R * riesgo,
      objetivo2: entrada + lado * K.objetivo2R * riesgo,
      vence: K.vencimientoVelas,
      costoR: P.costos.idaYVueltaPct / 100 * entrada / riesgo,
      toco1: false,
      estado: 'abierta',
      // En la entrada en zona se cuentan con la vela anterior: la del llenado todavía no cerraba.
      factores: factores(p, extra && extra.velaFactores != null ? extra.velaFactores : i, lado, regla, P, ctx, extra),
    };
    if (extra && extra.datos) Object.assign(op, extra.datos);
    ops.push(op);
    return op;
  };

  for (let i = ini; i < n; i++) {
    const b = v[i];
    const a = p.rango[i];

    // Operaciones abiertas.
    if (opZ && avanzar(opZ, b, i)) opZ = null;
    if (opR && avanzar(opR, b, i)) opR = null;
    if (opB && avanzar(opB, b, i)) opB = null;

    // Retroceso en tendencia.
    const lado = regimen(p, i, R);
    const previo = regimen(p, i - 1, R);
    if (previo !== 0) {
      // Entrada en zona: la orden se arma cuando el precio cierra fuera de la zona, del lado de la tendencia,
      // y se llena cuando una vela llega al punto medio. En la vela del llenado solo se revisa el stop.
      const z = zona(p, i - 1, previo, R, marco);
      if (armada === previo && !opZ && (previo < 0 ? b.h >= z.ideal : b.l <= z.ideal)) {
        armada = 0;
        opZ = abrir('zona', i, previo, z.ideal, Math.abs(z.invalida - z.ideal), R, { velaFactores: i - 1 });
        if (previo < 0 ? b.h >= opZ.stop : b.l <= opZ.stop) { cerrar(opZ, opZ.stop, 'stop', b, i); opZ = null; }
      }
      if (previo < 0 ? b.c < z.desde : b.c > z.hasta) armada = previo;
    } else {
      armada = 0;
    }
    if (lado !== 0 && previo === lado) {
      const z = zona(p, i - 1, lado, R, marco);
      if (lado < 0 ? b.h >= z.desde : b.l <= z.hasta) {
        if (!toque || toque.lado !== lado || i - toque.ultimo > R.velasEspera) {
          toque = { lado, i, ultimo: i, extremo: lado < 0 ? b.h : b.l };
        } else {
          toque.ultimo = i;
        }
      }
    }
    if (toque) {
      if (toque.lado !== lado || i - toque.ultimo > R.velasEspera) toque = null;
      else toque.extremo = toque.lado < 0 ? Math.max(toque.extremo, b.h) : Math.min(toque.extremo, b.l);
    }
    if (toque && !opR && (lado < 0 ? b.c < v[i - 1].l : b.c > v[i - 1].h)) {
      // El stop va detrás del extremo del retroceso, medido solo en las últimas velas.
      let extremo = lado < 0 ? -Infinity : Infinity;
      for (let k = Math.max(toque.i, i - R.velasEspera); k <= i; k++) extremo = lado < 0 ? Math.max(extremo, v[k].h) : Math.min(extremo, v[k].l);
      const riesgo = Math.max(Math.abs(extremo - lado * R.margenStopAtr * a - b.c), stopMinimo(R, marco) * a);
      opR = abrir('retroceso', i, lado, b.c, riesgo, R);
      toque = null;
    }

    // Ruptura fallida.
    if (!opB) {
      if (!barr) {
        let alto = -Infinity;
        let bajo = Infinity;
        let volumen = 0;
        for (let k = i - B.velasRango; k < i; k++) {
          alto = Math.max(alto, v[k].h);
          bajo = Math.min(bajo, v[k].l);
          volumen += v[k].v;
        }
        const arriba = b.h > alto + B.excesoAtr * a;
        const abajo = b.l < bajo - B.excesoAtr * a;
        if (arriba !== abajo) {
          barr = {
            lado: arriba ? -1 : 1, i,
            nivel: arriba ? alto : bajo,
            otro: arriba ? bajo : alto,
            extremo: arriba ? b.h : b.l,
            volumenBajo: b.v < volumen / B.velasRango,
          };
        }
      } else {
        barr.extremo = barr.lado < 0 ? Math.max(barr.extremo, b.h) : Math.min(barr.extremo, b.l);
      }
      if (barr) {
        if (barr.lado < 0 ? b.c < barr.nivel : b.c > barr.nivel) {
          const riesgo = Math.max(Math.abs(barr.extremo - barr.lado * B.margenStopAtr * a - b.c), stopMinimo(B, marco) * a);
          opB = abrir('barrido', i, barr.lado, b.c, riesgo, B, { volumenBajo: barr.volumenBajo, datos: { nivel: barr.nivel, objetivo3: barr.otro } });
          barr = null;
        } else if (i - barr.i >= B.velasRegreso - 1) {
          barr = null;
        }
      }
    }
  }

  // Estado vivo, con la última vela cerrada.
  const u = n - 1;
  const vivo = { zona: { estado: 'sin operación' }, retroceso: { estado: 'sin operación' }, barrido: { estado: 'sin operación' } };
  if (u >= ini) {
    const lado = regimen(p, u, R);
    if (opZ) vivo.zona = { estado: 'en operación', op: opZ };
    if (opR) vivo.retroceso = { estado: 'en operación', op: opR };
    else if (lado !== 0) {
      vivo.retroceso = {
        estado: toque ? 'en zona' : 'preparando',
        lado,
        ...zona(p, u, lado, R, marco),
        gatillo: lado < 0 ? v[u].l : v[u].h,
        factores: factores(p, u, lado, 'retroceso', P, ctx),
      };
    }
    if (opB) vivo.barrido = { estado: 'en operación', op: opB };
    else if (barr) {
      vivo.barrido = { estado: 'barrido en curso', lado: barr.lado, nivel: barr.nivel, quedan: B.velasRegreso - 1 - (u - barr.i) };
    } else {
      let alto = -Infinity;
      let bajo = Infinity;
      for (let k = u - B.velasRango + 1; k <= u; k++) { alto = Math.max(alto, v[k].h); bajo = Math.min(bajo, v[k].l); }
      vivo.barrido = { estado: 'vigilando', arriba: alto, abajo: bajo };
    }
  }
  return { ops, vivo };
}

// Resumen de un grupo de operaciones cerradas. «estres» multiplica el costo (1.5 = 0.30 % en vez de 0.20 %).
export function resumir(ops, estres = 1) {
  const c = ops.filter(o => o.estado === 'cerrada');
  if (!c.length) return { n: 0 };
  let suma = 0;
  let gana = 0;
  let pierde = 0;
  let acumulado = 0;
  let pico = 0;
  let caida = 0;
  let t1 = 0;
  let t2 = 0;
  for (const o of c) {
    const r = o.bruto - o.costoR * estres;
    suma += r;
    if (r > 0) gana += r; else pierde -= r;
    acumulado += r;
    pico = Math.max(pico, acumulado);
    caida = Math.max(caida, pico - acumulado);
    if (o.toco1) t1++;
    if (o.motivo === 'objetivo 2') t2++;
  }
  const red = x => Math.round(x * 1000) / 1000;
  return {
    n: c.length,
    neto: red(suma / c.length),
    factor: pierde ? red(gana / pierde) : null,
    caida: red(caida),
    toco1: Math.round(100 * t1 / c.length),
    objetivo2: Math.round(100 * t2 / c.length),
  };
}

// ---------- Francotirador: la idea sale del macro y el disparo se da en 15 m ----------

// Avanza una operación de francotirador con una vela de 15 m. Lleva cuatro cuentas a la vez:
// la principal (stop fijo y salida completa en el objetivo 2), dos variantes de gestión
// y el recorrido: hasta dónde llegó el precio antes del stop o del vencimiento.
function pasoTirador(o, b, i, v, T) {
  const s = o.lado;
  const enR = x => s * (x - o.entrada) / o.riesgo;
  const favorable = enR(s > 0 ? b.h : b.l);
  const tocaStop = s > 0 ? b.l <= o.stop : b.h >= o.stop;
  const vencio = i - o.i >= o.vence;

  // Variante con parcial y stop móvil: cobra una parte en el extremo previo y deja correr el resto.
  const g = o.g;
  if (!g.fin) {
    if (!g.parcial) {
      if (tocaStop) { g.r = -1; g.fin = true; }
      else if (o.conPrevio && favorable >= enR(o.objetivo1)) { g.parcial = true; g.r = T.parcial * enR(o.objetivo1); g.trail = o.stop; }
      else if (!o.conPrevio && favorable >= T.objetivoLargoR) { g.r = T.objetivoLargoR; g.fin = true; }
      else if (i - o.i >= T.velasPaciencia && enR(b.c) < T.avanceMinimoR) { g.r = enR(b.c); g.fin = true; }
    } else if (s > 0 ? b.l <= g.trail : b.h >= g.trail) {
      g.r += (1 - T.parcial) * enR(g.trail); g.fin = true;
    } else if (favorable >= T.objetivoLargoR) {
      g.r += (1 - T.parcial) * T.objetivoLargoR; g.fin = true;
    }
    if (!g.fin && g.parcial) {
      let e = s > 0 ? Infinity : -Infinity;
      for (let k = i - T.velasTrail + 1; k <= i; k++) e = s > 0 ? Math.min(e, v[k].l) : Math.max(e, v[k].h);
      g.trail = s > 0 ? Math.max(g.trail, e) : Math.min(g.trail, e);
    }
    if (!g.fin && vencio) { g.r = g.parcial ? g.r + (1 - T.parcial) * enR(b.c) : enR(b.c); g.fin = true; }
    if (g.fin) o.netoGestion = g.r - o.costoR;
  }

  // Variante: stop a la entrada después de tocar el objetivo 1.
  if (o.netoBE == null && o.toco1 && (s > 0 ? b.l <= o.entrada : b.h >= o.entrada)) o.netoBE = -o.costoR;

  // Recorrido máximo a favor, en R.
  if (!o.finRecorrido) {
    if (tocaStop) o.finRecorrido = true;
    else { if (favorable > o.mfe) o.mfe = favorable; if (vencio) o.finRecorrido = true; }
  }

  // Operación principal.
  if (o.estado === 'abierta') {
    if (tocaStop) cerrar(o, o.stop, 'stop', b, i);
    else {
      if (favorable >= enR(o.objetivo1)) o.toco1 = true;
      if (favorable >= enR(o.objetivo2)) cerrar(o, o.objetivo2, 'objetivo 2', b, i);
      else if (vencio) cerrar(o, b.c, 'tiempo', b, i);
    }
    if (o.estado === 'cerrada' && o.netoBE == null) o.netoBE = o.neto;
  }
  return o.estado === 'cerrada' && g.fin && o.finRecorrido;
}

// Recorre las velas de 15 m con el contexto de una temporalidad macro (1 h a 1 D).
// La zona y el régimen salen de la última vela macro cerrada; el disparo, de una vela de 15 m que
// cierra rompiendo el extremo de las tres anteriores, cerca de su propio extremo y sin ser un latigazo.
// El stop va detrás del extremo de las últimas velas de 15 m; si queda muy lejos o el objetivo no paga
// al menos 2 R netos, no hay entrada y se espera otra estructura.
export function simularTirador(p15, pM, marco, P, ctx = {}) {
  const T = P.tirador;
  const R = P.retroceso;
  const v = p15.velas;
  const n = v.length;
  const minutos = NATIVAS[marco] || ARMADAS[marco][1];
  const vence = Math.round(R.vencimientoVelas * minutos / 15);
  const espera = Math.round(R.velasEspera * minutos / 15);
  const ops = [];
  const seguimiento = [];
  let j = -1;
  let op = null;
  let armada = 0;
  let dentro = null;
  let lado = 0;
  let z = null;
  for (let i = Math.max(60, T.velasExtremo + 5); i < n; i++) {
    const b = v[i];
    const a = p15.rango[i];
    while (j + 1 < pM.velas.length && pM.velas[j + 1].fin <= b.fin) j++;
    for (let q = seguimiento.length - 1; q >= 0; q--) {
      const o = seguimiento[q];
      const listo = pasoTirador(o, b, i, v, T);
      if (o === op && o.estado === 'cerrada') op = null;
      if (listo) seguimiento.splice(q, 1);
    }
    lado = j >= 0 ? regimen(pM, j, R) : 0;
    if (lado === 0) { armada = 0; dentro = null; z = null; continue; }
    z = zona(pM, j, lado, R, marco);
    if (dentro && dentro.lado !== lado) dentro = null;
    if (lado < 0 ? b.c < z.desde : b.c > z.hasta) armada = lado;
    if (!dentro && armada === lado && (lado < 0 ? b.h >= z.desde : b.l <= z.hasta)) dentro = { lado, i };
    if (dentro && ((lado < 0 ? b.h >= z.invalida : b.l <= z.invalida) || i - dentro.i > espera)) { dentro = null; armada = 0; }
    if (!dentro || op) continue;

    // Disparo.
    let bajo = Infinity;
    let alto = -Infinity;
    for (let k = i - T.velasRuptura; k < i; k++) { bajo = Math.min(bajo, v[k].l); alto = Math.max(alto, v[k].h); }
    const rango = b.h - b.l;
    if (!(lado < 0 ? b.c < bajo : b.c > alto)) continue;
    if (rango <= 0 || (lado < 0 ? b.c - b.l : b.h - b.c) > T.tercio * rango || rango > T.rangoMaximoAtr * a) continue;
    let extremo = lado < 0 ? -Infinity : Infinity;
    for (let k = Math.max(dentro.i, i - T.velasExtremo + 1); k <= i; k++) extremo = lado < 0 ? Math.max(extremo, v[k].h) : Math.min(extremo, v[k].l);
    const entrada = b.c;
    const riesgo = Math.max(Math.abs(extremo - lado * T.margenStopAtr * a - entrada), T.stopMinimoAtr * a, T.stopMinimoPct / 100 * entrada);
    if (riesgo > T.stopMaximoPct / 100 * entrada) continue;
    const objetivo2 = entrada + lado * R.objetivo2R * Math.abs(z.invalida - z.ideal);
    const costoR = P.costos.idaYVueltaPct / 100 * entrada / riesgo;
    if (Math.abs(objetivo2 - entrada) / riesgo - costoR < T.rrMinimo) continue;
    let previo = lado < 0 ? Infinity : -Infinity;
    for (let k = Math.max(0, j - T.velasPrevio + 1); k <= j; k++) previo = lado < 0 ? Math.min(previo, pM.velas[k].l) : Math.max(previo, pM.velas[k].h);
    const conPrevio = lado * (previo - entrada) / riesgo >= T.parcialMinimoR && lado * (objetivo2 - previo) > 0;
    let comprador = 0;
    let volumen = 0;
    for (let k = i - T.velasDelta + 1; k <= i; k++) { comprador += v[k].tb || 0; volumen += v[k].v; }
    const flujo = volumen && v[i].tb != null && !Number.isNaN(v[i].tb) ? (2 * comprador - volumen) / volumen : null;
    const f = factores(pM, j, lado, 'retroceso', P, ctx);
    f.lista.push(['Flujo agresor a favor', flujo == null ? null : Math.sign(flujo) === lado]);
    f.aFavor = f.lista.filter(x => x[1] === true).length;
    f.de = f.lista.filter(x => x[1] != null).length;
    op = {
      id: `tirador|${marco}|${b.fin}`,
      regla: 'tirador', marco, lado, i,
      t: b.fin,
      entrada, riesgo,
      riesgoPct: 100 * riesgo / entrada,
      stop: entrada - lado * riesgo,
      objetivo1: conPrevio ? previo : entrada + lado * T.parcialMinimoR * riesgo,
      objetivo2,
      conPrevio,
      vence, costoR,
      toco1: false,
      estado: 'abierta',
      mfe: 0,
      finRecorrido: false,
      netoBE: null,
      netoGestion: null,
      g: { fin: false, parcial: false, r: 0, trail: null },
      flujoAFavor: flujo == null ? null : Math.sign(flujo) === lado,
      factores: f,
    };
    ops.push(op);
    seguimiento.push(op);
    dentro = null;
    armada = 0;
  }

  let vivo = { estado: 'sin operación' };
  if (op) vivo = { estado: 'en operación', op };
  else if (lado !== 0 && z) {
    const u = n - 1;
    let gatillo = lado < 0 ? Infinity : -Infinity;
    for (let k = u - T.velasRuptura + 1; k <= u; k++) gatillo = lado < 0 ? Math.min(gatillo, v[k].l) : Math.max(gatillo, v[k].h);
    vivo = { estado: dentro ? 'apuntando' : 'preparando', lado, ...z, gatillo, armada: dentro ? true : armada === lado, factores: factores(pM, j, lado, 'retroceso', P, ctx) };
  }
  return { ops, vivo };
}

// Desde dónde hasta dónde va el movimiento que manda en una temporalidad.
export function movimiento(p, direccion, C) {
  const v = p.velas;
  const u = v.length - 1;
  let s = u;
  while (s > 0 && u - s < 300 && direccionEn(p, s - 1, C) !== -direccion) s--;
  let io = Math.max(0, s - 10);
  for (let k = io; k <= u; k++) if (direccion > 0 ? v[k].l < v[io].l : v[k].h > v[io].h) io = k;
  let ie = io;
  for (let k = io; k <= u; k++) if (direccion > 0 ? v[k].h > v[ie].h : v[k].l < v[ie].l) ie = k;
  return {
    desde: direccion > 0 ? v[io].l : v[io].h,
    tDesde: v[io].t,
    hasta: direccion > 0 ? v[ie].h : v[ie].l,
    tHasta: v[ie].t,
    velas: u - io,
  };
}

// ---------- Contexto ----------

// Fase aproximada: busca la ruptura de un rango de N velas que sigue vigente y proyecta su final
// con la amplitud de ese rango. Es geometría, no pronóstico.
export function leerFase(p, F) {
  const v = p.velas;
  const n = v.length;
  const N = F.velasRango;
  let fase = null;
  for (let i = N; i < n; i++) {
    let alto = -Infinity;
    let bajo = Infinity;
    for (let k = i - N; k < i; k++) { alto = Math.max(alto, v[k].h); bajo = Math.min(bajo, v[k].l); }
    const c = p.c[i];
    if (fase) {
      const dentro = x => (fase.lado < 0 ? x > fase.nivel : x < fase.nivel);
      if (dentro(c) && dentro(p.c[i - 1])) fase = null;
    }
    const rompe = c < bajo ? -1 : c > alto ? 1 : 0;
    if (rompe !== 0 && (!fase || fase.lado !== rompe)) {
      fase = { lado: rompe, t: v[i].t, nivel: rompe < 0 ? bajo : alto, amplitud: alto - bajo };
    }
  }
  if (!fase) {
    let alto = -Infinity;
    let bajo = Infinity;
    for (let k = n - N; k < n; k++) { alto = Math.max(alto, v[k].h); bajo = Math.min(bajo, v[k].l); }
    return { clara: false, techo: alto, piso: bajo };
  }
  const final = fase.nivel + fase.lado * fase.amplitud;
  const recorrido = 100 * fase.lado * (p.c[n - 1] - fase.nivel) / fase.amplitud;
  return { clara: true, lado: fase.lado, inicio: fase.nivel, desde: fase.t, final, recorrido: Math.round(recorrido) };
}

// Mapa del día. El día empieza a las 00:00 UTC, que son las 18:00 en Guadalajara.
// Techo y piso probables: solo 2 de cada 10 días pasados los rebasaron. Los bloques de 6 horas
// llevan sesgo únicamente si se repitieron lo suficiente.
export function mapaDelDia(v1d, v1h, precio, M, ahora = Date.now()) {
  const hoy = Math.floor(ahora / DIA) * DIA;
  const deHoy = v1h.filter(b => b.t >= hoy);
  const apertura = deHoy.length ? deHoy[0].o : (v1d.length ? v1d.at(-1).c : precio);
  let maximo = Math.max(apertura, precio);
  let minimo = Math.min(apertura, precio);
  for (const b of deHoy) { maximo = Math.max(maximo, b.h); minimo = Math.min(minimo, b.l); }
  const dias = v1d.slice(-M.dias);
  const techo = apertura * (1 + cuantil(dias.map(d => (d.h - d.o) / d.o), M.percentil / 100));
  const piso = apertura * (1 - cuantil(dias.map(d => (d.o - d.l) / d.o), M.percentil / 100));

  // Historia de cada bloque de 6 horas.
  const conteo = [0, 1, 2, 3].map(() => ({ dias: 0, sube: 0 }));
  const porDia = new Map();
  for (const b of v1h) {
    if (b.t >= hoy) continue;
    const d = Math.floor(b.t / DIA);
    const k = Math.floor((b.t % DIA) / (360 * MIN));
    const clave = d * 4 + k;
    let g = porDia.get(clave);
    if (!g) porDia.set(clave, g = { k, o: b.o, c: b.c, n: 0 });
    g.c = b.c;
    g.n++;
  }
  for (const g of porDia.values()) {
    if (g.n !== 6) continue;
    conteo[g.k].dias++;
    if (g.c > g.o) conteo[g.k].sube++;
  }
  const actual = Math.floor((ahora - hoy) / (360 * MIN));
  const etiquetas = ['18:00–00:00', '00:00–06:00', '06:00–12:00', '12:00–18:00'];
  const bloques = [0, 1, 2, 3].map(k => {
    const velas = deHoy.filter(b => Math.floor((b.t - hoy) / (360 * MIN)) === k);
    const h = conteo[k];
    const frecuencia = h.dias ? Math.round(100 * h.sube / h.dias) : null;
    let sesgo = 'sin sesgo';
    if (h.dias >= M.diasMinimos && frecuencia >= M.frecuenciaSesgo) sesgo = 'alcista';
    if (h.dias >= M.diasMinimos && frecuencia <= 100 - M.frecuenciaSesgo) sesgo = 'bajista';
    return {
      horas: etiquetas[k],
      estado: k < actual ? 'cerrado' : k === actual ? 'en curso' : 'por venir',
      cambio: velas.length ? 100 * ((k < actual ? velas.at(-1).c : precio) / velas[0].o - 1) : null,
      sesgo,
      frecuencia: sesgo === 'bajista' ? 100 - frecuencia : frecuencia,
      dias: h.dias,
    };
  });
  return { apertura, maximo, minimo, techo, piso, bloques };
}

function leerBtc(series, btc, P) {
  const marcos = {};
  for (const m of ['1d', '4h', '1h']) marcos[m] = leerMarco(btc[m], P.contexto);
  const cambio = (v, n) => (v && v.length > n ? 100 * (v.at(-1).c / v.at(-1 - n).c - 1) : null);
  const wld24 = cambio(series['1h'], 24);
  const btc24 = cambio(btc['1h'], 24);
  let correlacion = null;
  const a = series['1h'];
  const b = btc['1h'];
  if (a && b && a.length > 49 && b.length > 49) {
    const ra = [];
    const rb = [];
    for (let k = 48; k >= 1; k--) {
      ra.push(a.at(-k).c / a.at(-k - 1).c - 1);
      rb.push(b.at(-k).c / b.at(-k - 1).c - 1);
    }
    const media = x => x.reduce((s, y) => s + y, 0) / x.length;
    const ma = media(ra);
    const mb = media(rb);
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    for (let k = 0; k < ra.length; k++) { sab += (ra[k] - ma) * (rb[k] - mb); saa += (ra[k] - ma) ** 2; sbb += (rb[k] - mb) ** 2; }
    correlacion = saa && sbb ? sab / Math.sqrt(saa * sbb) : null;
  }
  return { marcos, wld24, btc24, diferencia: wld24 != null && btc24 != null ? wld24 - btc24 : null, correlacion };
}

async function traerExtras(simbolo, traer) {
  const json = async url => {
    try { const r = await traer(url); return r.ok ? await r.json() : null; } catch { return null; }
  };
  const [indice, cuentas] = await Promise.all([
    json(`${BINANCE}/fapi/v1/premiumIndex?symbol=${simbolo}`),
    json(`${BINANCE}/futures/data/topLongShortPositionRatio?symbol=${simbolo}&period=1h&limit=1`),
  ]);
  return {
    precio: indice ? +indice.markPrice : null,
    funding: indice ? 100 * +indice.lastFundingRate : null,
    proximoFunding: indice ? +indice.nextFundingTime : null,
    grandesCuentas: cuentas && cuentas[0] ? +cuentas[0].longShortRatio : null,
  };
}

// La operación que va arriba en la pantalla: primero lo recién confirmado, luego lo que espera
// confirmación, luego lo que se prepara. A igualdad, más factores a favor y temporalidad más alta.
// «pesoEvidencia» deja pasar primero las reglas que sí han mostrado resultado en esa temporalidad.
// Una zona que queda lejos del precio pesa menos que una operación ya abierta.
export function elegirPrincipal(porMarco, operables, ahora, mando, pesoEvidencia, opciones = {}) {
  const peso = { reciente: 5, apuntando: 4, 'en zona': 4, 'barrido en curso': 3, 'en operación': 2, preparando: 1, lejos: 0.5 };
  const reglas = opciones.reglas || ['tirador', 'retroceso', 'zona', 'barrido'];
  let mejor = null;
  operables.forEach((marco, k) => {
    for (const regla of reglas) {
      const x = porMarco[marco][regla];
      if (!x || !peso[x.estado]) continue;
      let estado = x.estado;
      let faltaPct = null;
      if (estado === 'preparando' && opciones.precio != null) {
        const falta = x.lado < 0 ? x.desde - opciones.precio : opciones.precio - x.hasta;
        faltaPct = 100 * Math.max(0, falta) / opciones.precio;
        if (falta > 1.5 * Math.abs(x.invalida - x.ideal) || x.armada === false) estado = 'lejos';
      }
      const minutos = NATIVAS[marco] || ARMADAS[marco][1];
      if (estado === 'en operación' && ahora - x.op.t <= (regla === 'tirador' ? 4 * 15 : 2 * minutos) * MIN) estado = 'reciente';
      const f = x.op ? x.op.factores : x.factores;
      const lado = x.op ? x.op.lado : x.lado;
      const conFondo = mando && mando.direccionFondo !== 0 && lado === mando.direccionFondo;
      const puntos = (pesoEvidencia ? pesoEvidencia(regla, marco, lado) : 0) * 10000
        + peso[estado] * 1000 + (conFondo ? 100 : 0) + (f ? f.aFavor : 0) * 10 + k;
      if (!mejor || puntos > mejor.puntos) mejor = { puntos, marco, regla, ...x, estado, faltaPct };
    }
  });
  return mejor;
}

// Compara lo que el usuario ve (lado y precio) contra las zonas y operaciones del motor.
export function compararIdea(lado, precio, e) {
  let cerca = null;
  for (const marco of [...e.operables].reverse()) {
    const x = e.porMarco[marco].retroceso;
    if (x.estado === 'en operación' && x.op.lado === lado) {
      const o = x.op;
      const riesgo = Math.abs(o.stop - precio);
      const dentro = lado < 0 ? precio < o.stop && precio > o.objetivo1 : precio > o.stop && precio < o.objetivo1;
      if (dentro) return { coincide: true, marco, tipo: 'operación', stop: o.stop, objetivo2: o.objetivo2, riesgoPct: 100 * riesgo / precio, paga: Math.abs(o.objetivo2 - precio) / riesgo };
    }
    if ((x.estado === 'preparando' || x.estado === 'en zona') && x.lado === lado) {
      const riesgo = Math.abs(x.invalida - precio);
      if (precio >= x.desde && precio <= x.hasta) {
        return { coincide: true, marco, tipo: 'zona', desde: x.desde, hasta: x.hasta, stop: x.invalida, objetivo2: x.objetivo2, riesgoPct: 100 * riesgo / precio, paga: Math.abs(x.objetivo2 - precio) / riesgo };
      }
      const distancia = Math.min(Math.abs(precio - x.desde), Math.abs(precio - x.hasta));
      if (!cerca || distancia < cerca.distancia) cerca = { marco, desde: x.desde, hasta: x.hasta, distancia };
    }
  }
  return { coincide: false, cerca };
}

// ---------- Estado completo ----------

export async function leerEstado({ simbolo = 'WLDUSDT', parametros: P, traer = fetch, ahora = Date.now() }) {
  const pedir = (s, m, n) => traerVelas(s, m, n, traer).then(v => soloCerradas(v, ahora));
  const marcosW = Object.keys(NATIVAS);
  const marcosB = Object.keys(P.velasBtc);
  const [w, bt, extras] = await Promise.all([
    Promise.all(marcosW.map(m => pedir(simbolo, m, P.velas[m]))),
    Promise.all(marcosB.map(m => pedir('BTCUSDT', m, P.velasBtc[m]))).then(x => x, () => null),
    traerExtras(simbolo, traer),
  ]);
  const series = armarTodas(Object.fromEntries(marcosW.map((m, k) => [m, w[k]])));
  const btc = bt ? armarTodas(Object.fromEntries(marcosB.map((m, k) => [m, bt[k]]))) : {};
  const precio = extras.precio ?? series['1m'].at(-1).c;

  const marcos = {};
  for (const m of MARCOS) marcos[m] = leerMarco(series[m], P.contexto);

  const prep = {};
  const prepBtc = {};
  for (const m of [...P.operables, '1w']) prep[m] = preparar(series[m], P.contexto);
  for (const m of P.operables) if (btc[m]) prepBtc[m] = preparar(btc[m], P.contexto);

  const porMarco = {};
  const todas = [];
  for (const m of P.operables) {
    const r = simular(prep[m], m, P, { superior: prep[P.superior[m]], btc: prepBtc[m] });
    porMarco[m] = r.vivo;
    for (const o of r.ops) todas.push(o);
  }
  for (const m of P.tirador.marcos) {
    const r = simularTirador(prep['15m'], prep[m], m, P, { superior: prep[P.superior[m]], btc: prepBtc[m] });
    porMarco[m].tirador = r.vivo;
    for (const o of r.ops) todas.push(o);
  }
  todas.sort((a, b) => b.t - a.t);

  const lugar = lugarVolatilidad(prep['1h'], prep['1h'].velas.length - 1, { velas: P.volatilidad.horas });
  const mando = quienManda(marcos, P.contexto);
  const siguiente = ESCALERA[mando.manda ? ESCALERA.indexOf(mando.manda) + 1 : 0];
  return {
    simbolo,
    hora: ahora,
    precio,
    extras,
    marcos,
    mando,
    // Desde dónde hasta dónde va el movimiento que manda, y la temporalidad que sigue.
    movimiento: mando.manda ? movimiento(prep[mando.manda] || preparar(series[mando.manda], P.contexto), mando.direccion, P.contexto) : null,
    vigilar: siguiente && marcos[siguiente] && marcos[siguiente].listo ? { marco: siguiente, ...marcos[siguiente] } : null,
    volatilidad: {
      percentil: lugar == null ? null : Math.round(lugar),
      operable: lugar != null && lugar >= P.volatilidad.minimo && lugar <= P.volatilidad.maximo,
    },
    fase: leerFase(prep[P.fase.marco], P.fase),
    btc: bt ? leerBtc(series, btc, P) : null,
    mapa: mapaDelDia(series['1d'], series['1h'], precio, P.mapaDelDia, ahora),
    operables: P.operables,
    porMarco,
    vigentes: todas.filter(o => o.estado === 'abierta'),
    senales: todas.filter(o => o.estado === 'cerrada'),
    principal: elegirPrincipal(porMarco, P.operables, ahora, mando, null, { precio }),
  };
}

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
    const lote = (await r.json()).map(k => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], fin: +k[6] }));
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
      g = { t: inicio, o: v.o, h: v.h, l: v.l, c: v.c, v: 0, fin: inicio + paso - 1, partes: 0 };
      grupos.set(inicio, g);
    }
    g.h = Math.max(g.h, v.h);
    g.l = Math.min(g.l, v.l);
    g.c = v.c;
    g.v += v.v;
    g.partes += 1;
  }
  return [...grupos.values()]
    .filter(g => g.partes === esperadas)
    .sort((a, b) => a.t - b.t)
    .map(({ partes, ...vela }) => vela);
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
export function eficiencia(cierres, n = 20) {
  const i = cierres.length - 1;
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

// ---------- Lectura del mercado ----------

// Sesgo y fuerza de una temporalidad.
// Sesgo: cierre contra la EMA lenta y pendiente de la EMA rápida. Fuerza: la eficiencia, sin signo.
export function leerMarco(velas, C) {
  if (velas.length < C.emaLenta + C.velasFuerza) return { listo: false, velas: velas.length };
  const cierres = velas.map(b => b.c);
  const i = cierres.length - 1;
  const rapida = ema(cierres, C.emaRapida);
  const lenta = ema(cierres, C.emaLenta);
  const pendiente = rapida[i] - rapida[i - C.velasPendiente];
  const direccion = cierres[i] > lenta[i] && pendiente > 0 ? 1
    : cierres[i] < lenta[i] && pendiente < 0 ? -1 : 0;
  const f = eficiencia(cierres, C.velasFuerza);
  const fuerza = Math.round(Math.abs(f));
  const lateral = direccion === 0 || fuerza < C.fuerzaLateral;
  return {
    listo: true,
    hora: velas[i].t,
    cierre: cierres[i],
    emaRapida: rapida[i],
    emaLenta: lenta[i],
    direccion,
    sesgo: lateral ? 'lateral' : direccion > 0 ? 'alcista' : 'bajista',
    fuerza,
    // La fuerza va contra el sesgo de fondo: es un rebote o un retroceso.
    contra: direccion !== 0 && Math.sign(f) !== 0 && Math.sign(f) !== direccion,
    adx: adx(velas, 14)[i],
  };
}

// Quién manda: la temporalidad más alta con tendencia clara.
export function quienManda(marcos, C) {
  for (const m of MARCOS) {
    const x = marcos[m];
    if (x && x.listo && x.direccion !== 0 && x.adx > C.adxTendencia) return m;
  }
  return null;
}

// ---------- Regla swing: dónde abre y dónde se invalida ----------

export function zonaSwing(velas4h, S, C) {
  const cierres = velas4h.map(b => b.c);
  const i = cierres.length - 1;
  const rapida = ema(cierres, C.emaRapida)[i];
  const lenta = ema(cierres, C.emaLenta)[i];
  const rango = atr(velas4h, 14)[i];
  const precio = cierres[i];
  if (rapida == null || lenta == null || rango == null) return { lado: null, motivo: 'faltan velas de 4 h' };

  let lado = null;
  let desde;
  let hasta;
  let invalida;
  if (rapida < lenta && precio < lenta) {
    lado = 'corto';
    desde = rapida;
    hasta = Math.min(lenta, rapida + S.anchoZonaAtr * rango);
    const ideal = (desde + hasta) / 2;
    invalida = Math.max(hasta + S.margenInvalidacionAtr * rango, ideal * (1 + S.invalidacionMinima));
  } else if (precio > rapida && rapida > lenta) {
    lado = 'largo';
    hasta = rapida;
    desde = Math.max(lenta, rapida - S.anchoZonaAtr * rango);
    const ideal = (desde + hasta) / 2;
    invalida = Math.min(desde - S.margenInvalidacionAtr * rango, ideal * (1 - S.invalidacionMinima));
  } else {
    return { lado: null, motivo: 'las 4 h no tienen régimen claro' };
  }
  const ideal = (desde + hasta) / 2;
  const riesgo = Math.abs(invalida - ideal);
  const signo = lado === 'corto' ? -1 : 1;
  return {
    lado,
    desde,
    hasta,
    ideal,
    invalida,
    riesgoPct: 100 * riesgo / ideal,
    objetivo1: ideal + signo * S.objetivo1R * riesgo,
    objetivo2: ideal + signo * S.objetivo2R * riesgo,
    precioEnZona: precio >= desde && precio <= hasta,
  };
}

// ---------- Estado completo ----------

export async function leerEstado({ simbolo = 'WLDUSDT', parametros, traer = fetch, ahora = Date.now() }) {
  const P = parametros;
  const nativas = {};
  await Promise.all(Object.keys(NATIVAS).map(async marco => {
    nativas[marco] = soloCerradas(await traerVelas(simbolo, marco, P.velas[marco], traer), ahora);
  }));
  const series = { ...nativas };
  for (const [marco, [base, minutos]] of Object.entries(ARMADAS)) {
    series[marco] = agrupar(nativas[base], NATIVAS[base], minutos);
  }
  const marcos = {};
  for (const m of MARCOS) marcos[m] = leerMarco(series[m], P.contexto);

  // Volatilidad: ATR de 1 h como porcentaje del precio, contra sus últimos 90 días.
  const rango1h = atr(series['1h'], P.volatilidad.atr).map((a, i) => (a == null ? null : 100 * a / series['1h'][i].c));
  const lugar = percentil(rango1h.slice(-P.volatilidad.horas), rango1h.at(-1));

  return {
    simbolo,
    hora: ahora,
    precio: series['1m'].at(-1)?.c ?? null,
    marcos,
    manda: quienManda(marcos, P.contexto),
    volatilidad: {
      percentil: lugar == null ? null : Math.round(lugar),
      operable: lugar != null && lugar >= P.volatilidad.minimo && lugar <= P.volatilidad.maximo,
    },
    swing: zonaSwing(series['4h'], P.swing, P.contexto),
  };
}

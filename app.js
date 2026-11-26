// Pantalla de la app de operación WLD. Todo el cálculo vive en motor/motor.js.
import { leerEstado, compararIdea, elegirPrincipal, MARCOS } from './motor/motor.js';

const app = document.getElementById('app');
const leerGuardado = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

let P = null;       // parámetros
let EV = null;      // evidencia medida
let E = null;       // estado
let falla = null;
let cargando = false;
let reloj = null;
let auto = leerGuardado('auto', false);
let temporizador = null;
const ancho = () => window.innerWidth >= 1100;
const abiertos = new Set(leerGuardado('abiertos', ancho() ? ['mercado', 'fase', 'boleta'] : []));
const idea = leerGuardado('idea', { lado: -1, precio: '' });
const opiniones = leerGuardado('opiniones', {});
const vistas = new Set(leerGuardado('vistas', []));
let pegando = null;
let todo = leerGuardado('todo', false);   // mostrar también las reglas sin ventaja medida

const NOMBRE = { '1w': '1 S', '1d': '1 D', '4h': '4 h', '3h': '3 h', '2h': '2 h', '1h': '1 h', '45m': '45 m', '30m': '30 m', '15m': '15 m', '5m': '5 m', '3m': '3 m', '1m': '1 m' };
const REGLA = { tirador: 'Francotirador', zona: 'Retroceso, entrada en zona', retroceso: 'Retroceso, con confirmación', barrido: 'Ruptura fallida' };
const CORTA = { tirador: 'Francotirador', zona: 'Zona', retroceso: 'Confirmación', barrido: 'Ruptura fallida' };
const LADO = l => (l < 0 ? 'Corto' : 'Largo');
const color = l => (l < 0 ? 'rojo' : 'verde');
const dec = () => (E && E.precio < 1 ? 4 : E && E.precio < 100 ? 2 : 1);
const n = (x, d = dec()) => (x == null || !isFinite(x) ? '—' : x.toFixed(d));
const R = x => (x == null ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(2) + ' R');
const pct = (x, d = 2) => (x == null ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d) + ' %');
const hora = t => new Date(t).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sesgoTxt = d => (d > 0 ? 'alcista' : d < 0 ? 'bajista' : 'lateral');
const durar = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
const dia = t => new Date(t).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short' });

// ---------- Evidencia ----------

function evidencia(regla, marco, lado) {
  const c = EV && EV.celdas[`${regla}|${marco}|${lado < 0 ? 'corto' : 'largo'}`];
  if (!c) return { clase: 'gris', texto: 'sin medir' };
  const h = c.historia;
  if (!h.n) return { clase: 'gris', texto: 'sin casos en la historia' };
  const clase = c.etiqueta === 'ventaja medida' ? 'verde' : c.etiqueta === 'a favor, por confirmar' ? 'ambar' : c.etiqueta === 'muestra baja' ? 'gris' : 'rojo';
  const limpio = c.limpio.n ? ` · desde ${EV.corte}: ${c.limpio.n} casos, ${R(c.limpio.neto)}` : '';
  return { clase, etiqueta: c.etiqueta, neto: h.neto, texto: `${c.etiqueta}: ${h.n} casos, ${R(h.neto)} netos${limpio}` };
}

// Las reglas con resultado a favor pasan primero; las que no han mostrado ventaja quedan al final.
const PESO = { 'ventaja medida': 3, 'a favor, por confirmar': 2, 'muestra baja': 1, 'sin ventaja': 0 };
const pesoEvidencia = (regla, marco, lado) => PESO[evidencia(regla, marco, lado).etiqueta] ?? 1;
const sinVentaja = o => evidencia(o.regla, o.marco, o.lado).etiqueta === 'sin ventaja';

// Qué tan sólida es una opción. Manda lo que dice la historia de su celda; el número de condiciones solo
// pesa donde cumplir más sí dejó mejor resultado.
function lectura(p, lado, f) {
  const ev = evidencia(p.regla, p.marco, lado);
  const celda = EV && EV.celdas[`${p.regla}|${p.marco}|${lado < 0 ? 'corto' : 'largo'}`];
  let cond = f && f.de ? `Cumple ${f.aFavor} de ${f.de} condiciones` : 'No hay condiciones que medir';
  let pesan = null;
  if (f && f.de && celda && celda.conTresOMas && celda.conMenos && celda.conTresOMas.n >= 30 && celda.conMenos.n >= 30) {
    pesan = celda.conTresOMas.neto > celda.conMenos.neto + 0.05;
    cond += pesan ? '; en esta regla, cumplir más sí dejó mejor resultado.' : '; en esta regla, cumplir más no dejó mejor resultado, así que ese número no la hace mejor ni peor.';
  } else cond += '.';
  const pocas = pesan && f.aFavor < 3;
  if (ev.etiqueta === 'sin ventaja') return { clase: 'rojo', texto: `Sin respaldo: esta regla pierde en la historia de ${NOMBRE[p.marco]}. ${cond}` };
  if (ev.etiqueta === 'ventaja medida') return { clase: pocas ? 'ambar' : 'verde', texto: `Con ventaja medida. ${cond}` };
  if (ev.etiqueta === 'a favor, por confirmar') return { clase: 'ambar', texto: `${pocas ? 'Floja' : 'A favor en la historia, sin confirmar'}. ${cond}` };
  return { clase: 'gris', texto: `Sin casos suficientes para medirla. ${cond}` };
}

function condiciones(p, f) {
  if (!f) return '';
  const nombre = x => (x === 'Temporalidad superior alineada' ? `${NOMBRE[P.superior[p.marco]]} alineado` : x);
  return f.lista.map(x => `<span class="${x[1] == null ? 'mut' : x[1] ? 'verde' : 'rojo'}" style="white-space:nowrap">${x[1] == null ? '·' : x[1] ? '✓' : '✗'} ${nombre(x[0])}</span>`).join(' &nbsp; ');
}

// El francotirador de una temporalidad, en una frase.
function resumenTirador(marco, direccion) {
  const x = marco && E.porMarco[marco] ? E.porMarco[marco].tirador : null;
  if (!x) return 'no aplica en esta temporalidad';
  const tf = NOMBRE[marco];
  if (x.estado === 'sin operación') return `sin zona: las medias de ${tf} no están lo bastante separadas para apuntar`;
  const lado = x.op ? x.op.lado : x.lado;
  const g = NOMBRE[(x.op ? x.op.gatilloMarco : x.gatilloMarco) || '15m'];
  const ev = evidencia('tirador', marco, lado);
  const contra = direccion && lado !== direccion ? ' Va contra lo que manda.' : '';
  const cola = ` <span class="${ev.clase}">${ev.etiqueta ? ev.etiqueta[0].toUpperCase() + ev.etiqueta.slice(1) : ev.texto}.</span>${contra}`;
  if (x.estado === 'en operación') {
    const o = x.op;
    return `<b class="${color(lado)}">${LADO(lado)} en operación</b> desde <span class="num">${n(o.entrada)}</span> (${hora(o.t)}): stop <span class="num">${n(o.stop)}</span>, objetivo <span class="num">${n(o.objetivo2)}</span>, va en ${R(lado * (E.precio - o.entrada) / o.riesgo)}.${cola}`;
  }
  if (x.estado === 'apuntando') return `<b class="${color(lado)}">${LADO(lado)} apuntando</b>: dispara con una vela de ${g} que cierre ${lado < 0 ? 'bajo' : 'sobre'} <span class="num">${n(x.gatillo)}</span>; se invalida en <span class="num">${n(x.invalida)}</span>.${cola}`;
  return `<b class="${color(lado)}">${LADO(lado)} en preparación</b>: zona entre <span class="num">${n(x.desde)}</span> y <span class="num">${n(x.hasta)}</span>${x.armada === false ? ', por la que el precio ya pasó sin dar entrada' : ''}; se invalida en <span class="num">${n(x.invalida)}</span>.${cola}`;
}

// ---------- Piezas ----------

function cabecera() {
  return `<div class="fila">
    <div><div style="font-size:16px;font-weight:600;letter-spacing:-.01em">WLD/USDT perpetuo</div>
    <div class="lab fila" style="gap:6px"><span style="width:7px;height:7px;border-radius:50%;background:var(--${falla ? 'rojo' : 'verde'})"></span><span id="edad">${falla ? 'Sin dato' : ''}</span> · Binance, directo desde este aparato</div></div>
    <div class="fila" style="margin-left:auto">
      <label class="lab fila" style="gap:6px;min-height:44px"><input type="checkbox" data-a="auto" ${auto ? 'checked' : ''}>Auto 60 s</label>
      <button class="btn pri" data-a="actualizar">${cargando ? 'Leyendo…' : 'Actualizar'}</button>
    </div></div>`;
}

function escalera(partes) {
  // De menor a mayor precio.
  return `<div class="fila" style="gap:6px;align-items:stretch">${partes.sort((a, b) => a.p - b.p).map(x => `<div class="seg ${x.c || ''}"><div class="lab ${x.k || ''}">${x.t}</div><div class="num" style="font-size:15px">${x.v}</div>${x.s ? `<div class="lab">${x.s}</div>` : ''}</div>`).join('')}</div>`;
}

function datosRapidos() {
  return `<div class="cuatro" style="margin-top:10px">
    <div><div class="lab">Precio</div><div class="num" style="font-size:16px">${n(E.precio)}</div></div>
    <div><div class="lab">Funding</div><div class="num" style="font-size:16px">${E.extras.funding == null ? '—' : pct(E.extras.funding, 3)}</div></div>
    <div><div class="lab">Volatilidad</div><div class="num" style="font-size:16px">${E.volatilidad.percentil ?? '—'}<span class="lab"> pct.</span></div></div>
    <div><div class="lab">Cuentas grandes</div><div class="num" style="font-size:16px">${n(E.extras.grandesCuentas, 2)}</div></div></div>`;
}

// Lo primero: qué temporalidad manda, desde dónde hasta dónde va su movimiento, el fondo y qué vigilar.
function bloqueManda() {
  const m = E.mando;
  const mv = E.movimiento;
  const vg = E.vigilar;
  const c = m.direccion > 0 ? 'verde' : m.direccion < 0 ? 'rojo' : 'gris';
  const titulo = m.manda ? `${NOMBRE[m.manda]}, ${sesgoTxt(m.direccion)}` : 'Sin impulso claro en 15 m';
  const recorrido = mv
    ? `Va desde <b class="num">${n(mv.desde)}</b> (${hora(mv.tDesde)}) hasta <b class="num">${n(mv.hasta)}</b> (${hora(mv.tHasta)}): ${pct(100 * (mv.hasta / mv.desde - 1), 1)}. Precio ahora <span class="num">${n(E.precio)}</span>.${['15m', '30m', '45m'].includes(m.manda) ? ' Es un impulso corto: todavía no llega a 1 h.' : ''}`
    : 'Las temporalidades chicas no apuntan a ningún lado. Lo que cuenta es el fondo.';
  let fondo = 'ninguna temporalidad con tendencia clara';
  if (m.fondo) {
    fondo = `${NOMBRE[m.fondo]}, ${sesgoTxt(m.direccionFondo)}`;
    if (m.manda) fondo += m.direccion === m.direccionFondo ? ' · lo que manda va a favor del fondo' : ' · lo que manda va contra el fondo: es un rebote o un retroceso';
  }
  let vigilar = '—';
  if (vg) {
    const x = E.porMarco[vg.marco];
    const tf = NOMBRE[vg.marco];
    const abierta = x ? ['tirador', 'retroceso'].map(r => x[r]).find(q => q && q.estado === 'en operación') : null;
    const z = x && x.retroceso && (x.retroceso.estado === 'preparando' || x.retroceso.estado === 'en zona') ? x.retroceso : null;
    if (abierta) vigilar = `<b>${tf}</b>: ya hay ${LADO(abierta.op.lado).toLowerCase()} confirmado desde <span class="num">${n(abierta.op.entrada)}</span>. Terminaría cerca de <span class="num">${n(abierta.op.objetivo2)}</span> y se invalida en <span class="num">${n(abierta.op.stop)}</span>.`;
    else if (z) vigilar = `<b>${tf}</b>: el ${LADO(z.lado).toLowerCase()} empezaría entre <span class="num">${n(z.desde)}</span> y <span class="num">${n(z.hasta)}</span>, terminaría cerca de <span class="num">${n(z.objetivo2)}</span> y se invalida si pasa de <span class="num">${n(z.invalida)}</span>.`;
    else vigilar = `<b>${tf}</b> está ${vg.sesgo}. Empezaría a girar a ${E.precio < vg.emaLenta ? 'alcista con cierres sobre' : 'bajista con cierres bajo'} su EMA50, en <span class="num">${n(vg.emaLenta)}</span>.`;
  }
  return `<div class="p"><div class="lab">Manda ahora</div>
    <div class="estado ${c}">${titulo}</div>
    <div style="padding:4px 0 8px">${recorrido}</div>
    <div class="kv"><span>Fondo</span><span>${fondo}</span></div>
    <div class="kv"><span>Francotirador en lo que manda</span><span>${m.manda ? resumenTirador(m.manda, m.direccion) : 'sin impulso que seguir'}</span></div>
    <div class="kv"><span>A vigilar</span><span>${vigilar}</span></div>
    ${datosRapidos()}</div>`;
}

// Una opción: la macro (1 h a 1 D) o la micro (15 y 30 m).
function tarjetaOpcion(titulo, p) {
  if (!p) return `<div class="p"><div class="lab">${titulo}</div><div class="estado" style="font-size:20px">Sin operación</div><div class="mut">Ninguna de estas temporalidades tiene zona ni entrada vigente.</div></div>`;
  const op = p.op;
  const lado = op ? op.lado : p.lado;
  const tf = NOMBRE[p.marco];
  const f = op ? op.factores : p.factores;
  const ev = evidencia(p.regla, p.marco, lado);
  const m = E.mando;
  const fondo = m.direccionFondo === 0 ? '' : lado === m.direccionFondo ? `<span class="chip verde">mismo lado que ${NOMBRE[m.fondo]}</span>` : `<span class="chip ambar">contra ${NOMBRE[m.fondo]}</span>`;
  const G = NOMBRE[(op ? op.gatilloMarco : p.gatilloMarco) || '15m'];
  const lim = p.limites || [P.tirador.stopMinimoPct, P.tirador.stopMaximoPct];
  const lec = lectura(p, lado, f);
  let palabra;
  let frase;
  let partes;
  let nota = '';
  if (op) {
    const avance = lado * (E.precio - op.entrada) / op.riesgo;
    palabra = p.estado === 'reciente' ? 'Entrada confirmada' : 'En operación';
    frase = `${LADO(lado)} de ${tf} · ${CORTA[p.regla]}${p.regla === 'tirador' ? `, disparo en ${G}` : ''} · desde ${hora(op.t)} · va en ${R(avance)}`;
    partes = [
      { p: op.stop, t: 'Stop', v: n(op.stop), s: `a ${op.riesgoPct.toFixed(2)} %`, c: 'inv', k: 'rojo' },
      { p: op.entrada, t: 'Entrada', v: n(op.entrada), s: `ahora ${n(E.precio)}`, c: 'zona', k: 'ambar' },
      { p: op.objetivo1, t: 'Objetivo 1', v: n(op.objetivo1), s: op.toco1 ? 'ya lo tocó' : R(lado * (op.objetivo1 - op.entrada) / op.riesgo) },
      { p: op.objetivo2, t: 'Objetivo 2', v: n(op.objetivo2), s: R(lado * (op.objetivo2 - op.entrada) / op.riesgo) },
    ];
    nota = `El costo se lleva ${op.costoR.toFixed(2)} R. Neto al objetivo 2: ${R(lado * (op.objetivo2 - op.entrada) / op.riesgo - op.costoR)}.`;
  } else if (p.estado === 'barrido en curso') {
    palabra = 'Atento';
    frase = `Ruptura en ${tf}: si una vela cierra de vuelta ${lado < 0 ? 'bajo' : 'sobre'} ${n(p.nivel)}, abre ${LADO(lado).toLowerCase()}.`;
    partes = [{ p: p.nivel, t: 'Nivel barrido', v: n(p.nivel), s: `ahora ${n(E.precio)}`, c: 'zona', k: 'ambar' }];
  } else {
    const dentro = E.precio >= p.desde && E.precio <= p.hasta;
    const espera = p.estado === 'preparando' || p.estado === 'lejos';
    palabra = p.estado === 'apuntando' ? 'Apuntando' : p.estado === 'en zona' ? 'Esperar confirmación' : 'Esperar';
    frase = `${LADO(lado)} de ${tf}${espera ? ' en preparación' : ': el precio ya tocó la zona'}${dentro ? ' y sigue dentro' : ''}${espera && p.faltaPct ? `: la zona queda a ${p.faltaPct.toFixed(1)} % del precio` : ''}`;
    partes = [
      { p: p.invalida, t: 'Se invalida si pasa de', v: n(p.invalida), s: '', c: 'inv', k: 'rojo' },
      { p: p.ideal, t: 'Abre entre', v: `${n(p.desde)} y ${n(p.hasta)}`, s: `ahora ${n(E.precio)}`, c: 'zona', k: 'ambar' },
      { p: p.objetivo2, t: 'Terminaría cerca de', v: n(p.objetivo2), s: '' },
    ];
    if (p.regla === 'tirador' && p.estado === 'apuntando') nota = `Disparo: una vela de ${G} que cierre ${lado < 0 ? 'bajo' : 'sobre'} <span class="num">${n(p.gatillo)}</span>, cerca de su extremo. El stop queda detrás del ${lado < 0 ? 'máximo' : 'mínimo'} de las últimas velas de ${G}, entre ${lim[0]} % y ${lim[1]} %.`;
    else if (p.regla === 'tirador' && p.armada === false) nota = `El precio ya pasó por esta zona sin dar entrada. Se vuelve a armar cuando una vela de ${G} cierre ${lado < 0 ? 'bajo' : 'sobre'} <span class="num">${n(lado < 0 ? p.desde : p.hasta)}</span> y el precio regrese a la zona.`;
    else if (p.regla === 'tirador') nota = `Cuando el precio entre a la zona, el disparo será una vela de ${G} que cierre ${lado < 0 ? 'bajo el mínimo' : 'sobre el máximo'} de las tres anteriores. Stop entre ${lim[0]} % y ${lim[1]} %.`;
    else if (p.gatillo != null) nota = `Confirma con una vela de ${tf} que cierre ${lado < 0 ? 'bajo' : 'sobre'} <span class="num">${n(p.gatillo)}</span>.`;
  }
  const celda = EV && EV.celdas[`${p.regla}|${p.marco}|${lado < 0 ? 'corto' : 'largo'}`];
  const rec = celda && celda.recorrido && celda.historia.n ? `<div class="lab" style="padding-top:4px">De ${celda.historia.n} casos, antes del stop llegó a +1 R el ${celda.recorrido[1]} %, a +2 R el ${celda.recorrido[2]} % y a +3 R el ${celda.recorrido[3]} %.</div>` : '';
  // Salida corta de alta efectividad: stop en la invalidación del macro y objetivo a un tercio de esa distancia.
  const ae = EV && EV.altaEfectividad && p.regla === 'tirador' ? EV.altaEfectividad.rejilla[`${p.marco}|${lado < 0 ? 'corto' : 'largo'}|stop macro|objetivo 0.33`] : null;
  let alta = '';
  if (ae && ae.historia.n) {
    let niveles = '';
    if (op && op.invalidaMacro != null) {
      const d = Math.max(op.riesgo, Math.abs(op.invalidaMacro - op.entrada));
      niveles = ` En esta operación: objetivo <span class="num">${n(op.entrada + lado * 0.33 * d)}</span> y stop <span class="num">${n(op.entrada - lado * d)}</span>.`;
    }
    alta = `<div class="lab" style="padding-top:4px">Salida corta (stop en la invalidación del macro, objetivo a un tercio de esa distancia): acertó ${ae.historia.aciertos} % en ${ae.historia.n} casos, con ${pct(ae.historia.netoPct)} neto por operación${ae.limpio.n ? `; desde ${EV.corte}, ${ae.limpio.aciertos} % en ${ae.limpio.n} casos, con ${pct(ae.limpio.netoPct)}` : ''}. Una pérdida borra unas cuatro ganancias.${niveles}</div>`;
  }
  const separan = celda && celda.conTresOMas && celda.conMenos && celda.conTresOMas.n >= 20 && celda.conMenos.n >= 20
    ? `<div class="lab" style="padding-top:4px">En la historia de esta regla, con 3 o más condiciones dejó ${R(celda.conTresOMas.neto)} en ${celda.conTresOMas.n} casos; con menos, ${R(celda.conMenos.neto)} en ${celda.conMenos.n}.</div>` : '';
  return `<div class="p">
    <div class="fila"><div class="lab">${titulo}</div>${fondo}<span class="chip">condiciones ${f ? `${f.aFavor} de ${f.de}` : '—'}</span></div>
    <div class="estado" style="font-size:22px">${palabra}</div>
    <div class="${color(lado)}" style="padding:2px 0 6px">${frase}</div>
    <div class="${lec.clase}" style="padding-bottom:8px">${lec.texto}</div>
    ${escalera(partes)}
    ${nota ? `<div class="lab" style="padding-top:6px">${nota}</div>` : ''}
    <div style="padding-top:6px;font-size:12px;line-height:1.7">${condiciones(p, f)}</div>
    <div class="lab ${ev.clase}" style="padding-top:6px">Evidencia en ${tf}: ${ev.texto}</div>${separan}${rec}${alta}</div>`;
}

// Macro y micro: alineados o no, y dónde salir si se va contra el macro.
function alineacion() {
  const a = E.macro;
  const b = E.micro;
  const la = a ? (a.op ? a.op.lado : a.lado) : 0;
  const lb = b ? (b.op ? b.op.lado : b.lado) : 0;
  let t;
  if (!la && !lb) t = 'No hay opción macro ni micro en este momento.';
  else if (!la) t = `Solo hay opción micro, de ${LADO(lb).toLowerCase()}. Sin macro que la respalde, trátala como operación corta.`;
  else if (!lb) t = `Solo hay opción macro, de ${LADO(la).toLowerCase()}. El micro no tiene entrada todavía.`;
  else if (la === lb) t = `<b class="verde">Alineados:</b> macro y micro van de ${LADO(la).toLowerCase()}.`;
  else {
    const salida = a.op ? a.op.entrada : la < 0 ? a.desde : a.hasta;
    t = `<b class="ambar">Desalineados:</b> el micro va de ${LADO(lb).toLowerCase()} contra el macro, que va de ${LADO(la).toLowerCase()}. Si operas el micro vas contra la tendencia: sal antes de <span class="num">${n(salida)}</span>, donde empieza el macro.`;
  }
  return `<div class="p"><div class="h">Macro y micro</div><div style="padding-top:6px">${t}</div></div>`;
}

function tarjetaIdea() {
  const precio = parseFloat(String(idea.precio).replace(',', '.'));
  const L = LADO(idea.lado).toLowerCase();
  let v = '<span class="mut">Elige lado y pon tu precio para comparar contra las reglas.</span>';
  if (isFinite(precio) && precio > 0) {
    const r = compararIdea(idea.lado, precio, E);
    if (r.coincide) {
      v = `<b class="verde">Coincide con el ${L} de ${NOMBRE[r.marco]}.</b> ${r.tipo === 'zona' ? `${n(precio)} queda dentro de la zona, entre ${n(r.desde)} y ${n(r.hasta)}.` : 'Hay una operación confirmada en esa dirección.'} Con stop en ${n(r.stop)} arriesgas ${r.riesgoPct.toFixed(2)} % y el objetivo 2, en ${n(r.objetivo2)}, paga ${r.paga.toFixed(1)} R.`;
    } else if (r.cerca) {
      v = `<b class="ambar">Todavía no coincide.</b> La zona de ${L} más cercana es la de ${NOMBRE[r.cerca.marco]}: entre ${n(r.cerca.desde)} y ${n(r.cerca.hasta)}.`;
    } else {
      v = `<b class="rojo">No coincide.</b> Ninguna temporalidad tiene zona de ${L} en este momento.`;
    }
  }
  return `<div class="p"><div class="h">Lo que ves en TradingView</div>
    <div class="fila" style="padding:8px 0">
      <div class="par"><button class="btn" data-a="lado" data-v="-1" aria-pressed="${idea.lado < 0}">Corto</button><button class="btn" data-a="lado" data-v="1" aria-pressed="${idea.lado > 0}">Largo</button></div>
      <label class="lab" for="precio">Tu entrada</label><input id="precio" class="num" type="text" inputmode="decimal" value="${esc(idea.precio)}" placeholder="${n(E.precio)}">
    </div><div>${v}</div></div>`;
}

function veredicto(texto) {
  const t = texto.trim().toUpperCase();
  if (t.startsWith('A FAVOR')) return ['A favor', 'verde'];
  if (t.startsWith('EN CONTRA')) return ['En contra', 'rojo'];
  if (t.startsWith('ESPERAR')) return ['Esperar', 'ambar'];
  return ['Pegada', 'azul'];
}

function tarjetaOpiniones() {
  const p = E.principal;
  const f = p ? (p.op ? p.op.factores : p.factores) : null;
  const ia = k => {
    const o = opiniones[k];
    const [v, c] = o ? veredicto(o.texto) : ['Falta', 'gris'];
    return `<button class="btn" data-a="pegar" data-v="${k}" style="text-align:left;padding:7px 9px"><span class="lab" style="display:block">${k}</span><span class="${c}" style="display:block;font-weight:600">${v}</span><span class="lab" style="display:block">${o ? hora(o.hora) : 'tocar para pegar'}</span></button>`;
  };
  const caja = pegando ? `<div style="padding-top:8px"><label class="lab" for="texto">Respuesta de ${pegando}</label><textarea id="texto" placeholder="Pega aquí lo que contestó">${opiniones[pegando] ? esc(opiniones[pegando].texto) : ''}</textarea><div class="fila" style="padding-top:6px"><button class="btn pri" data-a="guardarOpinion">Guardar</button><button class="btn" data-a="cerrarOpinion">Cerrar</button></div></div>` : '';
  return `<div class="p"><div class="h">Segunda y tercera opinión</div>
    <div class="cuatro" style="padding:8px 0">
      <div class="tile"><div class="lab">Reglas</div><div style="font-weight:600">${f ? `${f.aFavor} de ${f.de}` : '—'}</div><div class="lab">factores a favor</div></div>
      ${ia('Claude')}${ia('ChatGPT')}${ia('Gemini')}
    </div>
    <button class="btn pri" data-a="copiar" style="width:100%">Copiar estado para las IA</button>
    <div class="lab" id="copiado" style="padding-top:6px">Copias el estado, lo pegas en cada chat y pegas aquí su respuesta.</div>${caja}</div>`;
}

function seccion(id, titulo, dato, cuerpo) {
  return `<details class="sec" data-id="${id}" ${abiertos.has(id) ? 'open' : ''}><summary><span class="t">${titulo}</span><span class="f">${dato}</span></summary><div class="b">${cuerpo}</div></details>`;
}

function secMercado() {
  const fila = k => {
    const x = E.marcos[k];
    if (!x.listo) return `<div class="tf"><span class="num">${NOMBRE[k]}</span><span class="mut">faltan velas</span><span></span><span></span></div>`;
    const c = x.sesgo === 'alcista' ? 'verde' : x.sesgo === 'bajista' ? 'rojo' : 'gris';
    return `<div class="tf"><span class="num">${NOMBRE[k]}</span><span class="${c}">${x.sesgo === 'alcista' ? '↑' : x.sesgo === 'bajista' ? '↓' : '→'} ${x.sesgo[0].toUpperCase() + x.sesgo.slice(1)}</span><div class="bar"><i style="width:${x.fuerza}%;background:var(--${c})"></i></div><span class="num" style="text-align:right">${x.fuerza}</span></div>`;
  };
  const m = E.mando;
  const dato = `${m.manda ? `Manda ${NOMBRE[m.manda]}, ${sesgoTxt(m.direccion)}` : 'Sin impulso en 15 m'} · fondo ${m.fondo ? `${NOMBRE[m.fondo]} ${sesgoTxt(m.direccionFondo)}` : 'sin tendencia'}`;
  return seccion('mercado', 'Mercado', dato, `<div class="lab" style="padding-bottom:4px">Sesgo y fuerza, de 0 a 100, en velas cerradas.</div><div class="dos"><div>${MARCOS.slice(0, 6).map(fila).join('')}</div><div>${MARCOS.slice(6).map(fila).join('')}</div></div>
    <div class="kv" style="margin-top:6px"><span>Quién manda</span><span>${m.manda ? `el movimiento de 15 m llega hasta ${NOMBRE[m.manda]}, ${sesgoTxt(m.direccion)}` : '15 m no tiene dirección clara'}</span></div>
    <div class="kv"><span>Fondo</span><span>${m.fondo ? `${NOMBRE[m.fondo]}, ${sesgoTxt(m.direccionFondo)}` : 'ninguna temporalidad con tendencia clara'}</span></div>`);
}

function secFase() {
  const f = E.fase;
  const b = E.btc;
  const fase = f.clara ? `${f.lado < 0 ? 'Bajista' : 'Alcista'}, ${f.recorrido} % recorrido` : 'Sin fase clara';
  const cuerpoFase = f.clara
    ? `<div class="kv" style="border-top:0"><span>La fase inició en</span><span><span class="num">${n(f.inicio)}</span>, el ${hora(f.desde)}</span></div>
       <div class="kv"><span>Final proyectado</span><span><span class="num">${n(f.final)}</span>, por la amplitud del rango roto</span></div>
       <div class="kv"><span>Recorrido</span><span><span class="num">${f.recorrido} %</span>${f.recorrido > 100 ? ', ya rebasó la proyección' : ''}</span></div>
       <div class="lab" style="padding:4px 0 8px">Es una proyección geométrica en ${NOMBRE[P.fase.marco]}, no un pronóstico.</div>`
    : `<div class="kv" style="border-top:0"><span>Rango de las últimas ${P.fase.velasRango} velas de ${NOMBRE[P.fase.marco]}</span><span class="num">${n(f.piso)} a ${n(f.techo)}</span></div>`;
  const cuerpoBtc = b
    ? `<div class="kv"><span>BTC, sesgo y fuerza</span><span>${['1d', '4h', '1h'].map(k => `${NOMBRE[k]} ${b.marcos[k].sesgo} <span class="num">${b.marcos[k].fuerza}</span>`).join(' · ')}</span></div>
       <div class="kv"><span>WLD frente a BTC, 24 h</span><span><span class="num">${pct(b.diferencia)}</span>, ${b.diferencia >= 0 ? 'más fuerte' : 'más débil'}</span></div>
       <div class="kv"><span>Correlación con BTC, 1 h</span><span class="num">${n(b.correlacion, 2)}</span></div>`
    : '<div class="kv"><span>BTC</span><span>sin dato</span></div>';
  return seccion('fase', 'Fase y BTC', `${fase}${b ? ` · BTC ${b.marcos['4h'].sesgo} en 4 h` : ''}`, cuerpoFase + cuerpoBtc);
}

// ---------- Mapa del día: plan por horario ----------

// Lo medido para un bloque: su horario con el contexto de 4 h y 30 m si se ha dado bastantes veces; si no,
// el horario solo. La inclinación cuenta únicamente si queda sobre 50 % aun restándole su margen de error.
function basePlan(b) {
  const pl = EV && EV.plan;
  if (!pl) return null;
  const hor = pl.horas ? pl.horas[b.k] : null;
  const ctx = pl.celdas[`${b.k}|${b.macro}|${b.micro}`];
  const conContexto = !!ctx && ctx.n >= P.plan.casosMinimos;
  const c = conContexto ? ctx : hor;
  if (!c) return null;
  // WLD ha bajado en más de la mitad de todos los bloques: para contar como inclinación bajista tiene que superar eso.
  const general = pl.base || { baja: 50, sube: 50 };
  const lado = c.baja > c.sube ? -1 : 1;
  const q = Math.max(c.sube, c.baja) / 100;
  const referencia = Math.max(50, lado < 0 ? general.baja : general.sube) / 100;
  const inclina = q - 1.96 * Math.sqrt(q * (1 - q) / c.n) > referencia ? lado : 0;
  return { ...c, conContexto, casosContexto: ctx ? ctx.n : 0, hor, inclina, general };
}

function tituloPlan(c) {
  if (!c) return 'Sin medición cargada';
  if (c.inclina < 0) return `Inclinación bajista${c.baja < 60 ? ' leve' : ''}: bajó el ${c.baja} % de ${c.n} veces`;
  if (c.inclina > 0) return `Inclinación alcista${c.sube < 60 ? ' leve' : ''}: subió el ${c.sube} % de ${c.n} veces`;
  return `Sin lado medido: subió el ${c.sube} % y bajó el ${c.baja} % de ${c.n} veces`;
}

// La ruta posible: hasta dónde suele llegar arriba y abajo desde la apertura del bloque, y qué extremo hace primero.
function rutaPlan(b, c) {
  if (!c) return '<span class="mut">Falta la medición de este horario.</span>';
  const orden = c.primeroArriba >= 55 ? ` Suele hacer primero el máximo (${c.primeroArriba} %).` : c.primeroAbajo >= 55 ? ` Suele hacer primero el mínimo (${c.primeroAbajo} %).` : ' Sin orden claro entre máximo y mínimo.';
  if (b.estado !== 'en curso') return `Arriba: típico ${pct(c.arriba.med, 1)}, amplio ${pct(c.arriba.p80, 1)}. Abajo: típico ${pct(-c.abajo.med, 1)}, amplio ${pct(-c.abajo.p80, 1)}, desde donde abra.${orden}`;
  const px = x => {
    const nivel = b.apertura * (1 + x / 100);
    return `<span class="num">${n(nivel)}</span>${(x > 0 ? b.maximo >= nivel : b.minimo <= nivel) ? ' (ya lo tocó)' : ''}`;
  };
  return `Arriba: típico ${px(c.arriba.med)}, amplio ${px(c.arriba.p80)}. Abajo: típico ${px(-c.abajo.med)}, amplio ${px(-c.abajo.p80)}.${orden}`;
}

// Cómo se cruza el bloque con el francotirador macro y micro: qué hay, si el horario suele llegar ahí y qué respaldo tiene.
function comoOperar(b, c) {
  const partes = [];
  for (const [nombre, p] of [['Macro', E.macro], ['Micro', E.micro]]) {
    if (!p) { partes.push(`<b>${nombre}</b>: sin francotirador vigente.`); continue; }
    const l = p.op ? p.op.lado : p.lado;
    const lado = LADO(l).toLowerCase();
    const et = evidencia(p.regla, p.marco, l).etiqueta;
    const respaldo = et === 'sin ventaja' ? ' <span class="rojo">Esta regla pierde en la historia.</span>' : et === 'a favor, por confirmar' ? ' <span class="ambar">A favor en la historia, sin confirmar.</span>' : et === 'ventaja medida' ? ' <span class="verde">Con ventaja medida.</span>' : ' Sin casos para medirla.';
    const cabeza = `<b>${nombre} (${NOMBRE[p.marco]})</b>`;
    if (p.op) { partes.push(`${cabeza}: ${lado} abierto desde <span class="num">${n(p.op.entrada)}</span>, stop <span class="num">${n(p.op.stop)}</span>, objetivo <span class="num">${n(p.op.objetivo2)}</span>.${respaldo}`); continue; }
    if (p.estado === 'apuntando') { partes.push(`${cabeza}: ${lado} apuntando; dispara con una vela de ${NOMBRE[p.gatilloMarco || '15m']} que cierre ${l < 0 ? 'bajo' : 'sobre'} <span class="num">${n(p.gatillo)}</span>.${respaldo}`); continue; }
    let alcance = '';
    if (c) {
      const borde = l < 0 ? p.desde : p.hasta;
      const llega = x => (l < 0 ? borde <= x : borde >= x);
      const tipico = b.apertura * (1 + (l < 0 ? c.arriba.med : -c.abajo.med) / 100);
      const amplio = b.apertura * (1 + (l < 0 ? c.arriba.p80 : -c.abajo.p80) / 100);
      alcance = llega(tipico) ? ', dentro de lo que este horario suele recorrer' : llega(amplio) ? ', que solo alcanza un recorrido amplio' : ', más lejos de lo que este horario suele recorrer';
    }
    partes.push(`${cabeza}: espera el ${lado} entre <span class="num">${n(p.desde)}</span> y <span class="num">${n(p.hasta)}</span>${alcance}.${respaldo}`);
  }
  return partes.join('<br>');
}

function tilePlan(b) {
  const c = basePlan(b);
  const cur = b.estado === 'en curso';
  const col = !c || c.inclina === 0 ? '' : c.inclina > 0 ? 'verde' : 'rojo';
  const contexto = `4 h ${sesgoTxt(b.macro)} y 30 m ${sesgoTxt(b.micro)}`;
  let base = '';
  if (c) {
    base = c.conContexto
      ? `Medido en este horario con ${contexto}.${c.hor ? ` El horario solo, con cualquier contexto: bajó el ${c.hor.baja} % de ${c.hor.n}.` : ''}`
      : `Medido en este horario con cualquier contexto: el de ${cur ? 'este bloque' : 'ahora'} (${contexto}) se ha dado ${c.casosContexto} veces, pocas para medirlo aparte.`;
    if (c.inclina < 0) base += ` WLD bajó en el ${c.general.baja} % de todos los bloques.`;
    if (c.inclina !== 0 && !c.conContexto && c.porAnio) base += ` Por año: ${Object.entries(c.porAnio).map(([a, y]) => `${a}, ${c.inclina < 0 ? y.baja : y.sube} %`).join('; ')}.`;
  }
  return `<div class="tile" ${cur ? 'style="border:1px solid #5A4718"' : ''}>
    <div class="fila"><b class="num">${b.horas}</b><span class="lab">${cur ? `en curso · quedan ${durar(b.restante)}` : `empieza en ${durar(b.falta)}`}</span></div>
    <div class="${col}" style="font-weight:600;padding:3px 0 1px">${tituloPlan(c)}</div>
    <div class="lab">${cur ? `Al empezar: ${contexto}.` : `Si sigue como ahora: ${contexto}.`} ${base}</div>
    ${cur ? `<div class="lab" style="padding-top:3px">Va <span class="num ${b.cambio >= 0 ? 'verde' : 'rojo'}">${pct(b.cambio, 1)}</span> desde <span class="num">${n(b.apertura)}</span> · máx. <span class="num">${n(b.maximo)}</span> · mín. <span class="num">${n(b.minimo)}</span></div>` : ''}
    <div style="padding-top:5px"><span class="lab">Ruta · </span>${rutaPlan(b, c)}</div>
    ${cur ? `<div style="padding-top:5px"><div class="lab">Cómo se opera</div>${comoOperar(b, c)}</div>` : ''}</div>`;
}

function panelPlan() {
  const pl = E.plan;
  const m = E.mapa;
  const filas = pl.registro.slice(0, 12).map(r => `<div class="sen"><div><span class="num">${dia(r.t)} · ${r.horas}</span>${r.acerto == null ? '' : r.acerto ? ' · siguió la dirección que traía' : ' · fue contra la dirección que traía'}</div><div class="r num ${r.cambio >= 0 ? 'verde' : 'rojo'}">${pct(r.cambio, 1)}</div>
    <div class="lab">Empezó con 4 h ${sesgoTxt(r.macro)} y 30 m ${sesgoTxt(r.micro)} · subió hasta ${pct(r.arriba, 1)} y bajó hasta ${pct(-r.abajo, 1)} · primero hizo el ${r.primero === 'arriba' ? 'máximo' : r.primero === 'abajo' ? 'mínimo' : 'máximo y el mínimo a la vez'}</div><div></div></div>`).join('');
  const h = EV && EV.plan ? EV.plan.resumen['con dirección'] : null;
  const dias = Math.round(pl.registro.length / 4);
  return `<div class="p"><div class="fila"><div class="h">Mapa del día: plan por horario</div><div class="lab" style="margin-left:auto">Hora de Guadalajara · bloques de 6 horas</div></div>
    <div class="plan" style="padding-top:8px">${pl.bloques.map(tilePlan).join('')}</div>
    <div class="cuatro" style="padding-top:6px"><div class="tile"><div class="lab">Apertura del día (18:00)</div><div class="num">${n(m.apertura)}</div></div><div class="tile"><div class="lab">Máx. y mín. del día</div><div class="num">${n(m.maximo)} · ${n(m.minimo)}</div></div><div class="tile"><div class="lab">Techo probable</div><div class="num">${n(m.techo)}</div></div><div class="tile"><div class="lab">Piso probable</div><div class="num">${n(m.piso)}</div></div></div>
    <div class="lab" style="padding:6px 0 2px">«Típico» es lo que recorrió la mitad de los bloques iguales; «amplio», lo que solo 2 de cada 10 rebasaron. Lo mismo con el techo y el piso del día. Es lo que ha hecho este horario en toda la historia de WLD, no un pronóstico.</div>
    ${seccion('registro', 'Registro de bloques', pl.cuenta.n ? `siguió la dirección que traía en ${pl.cuenta.aciertos} de ${pl.cuenta.n} · ${dias} días` : 'sin bloques cerrados', `${filas || '<div class="mut">Todavía no hay bloques cerrados.</div>'}
      ${h && h.historia.n ? `<div class="lab" style="padding-top:8px">En toda la historia, el bloque cerró hacia donde apuntaban 4 h y 30 m al empezar el ${h.historia.aFavor} % de ${h.historia.n} veces${h.limpio.n ? ` (desde ${EV.corte}: ${h.limpio.aFavor} % de ${h.limpio.n})` : ''}: la tendencia que trae no dice hacia dónde cierra el bloque. El registro completo está en Drive, en «Registro del mapa del día».</div>` : ''}`)}</div>`;
}

function secBoleta() {
  const p = E.principal;
  if (!p || p.estado === 'barrido en curso') return seccion('boleta', 'Boleta', 'Sin operación principal', '<div class="mut">Aparece cuando hay una zona o una entrada confirmada.</div>');
  const op = p.op;
  const lado = op ? op.lado : p.lado;
  const entrada = op ? op.entrada : p.ideal;
  const stop = op ? op.stop : p.invalida;
  const o1 = op ? op.objetivo1 : p.objetivo1;
  const o2 = op ? op.objetivo2 : p.objetivo2;
  const riesgo = Math.abs(stop - entrada);
  const riesgoPct = 100 * riesgo / entrada;
  const costo = P.costos.idaYVueltaPct / riesgoPct;
  const neto = Math.abs(o2 - entrada) / riesgo - costo;
  const palanca = Math.max(1, Math.floor(100 / (riesgoPct * 1.8)));
  const liq = entrada * (1 - lado * (1 / palanca - 0.01));
  const texto = `${LADO(lado)} WLD/USDT (${NOMBRE[p.marco]}): entrada ${n(entrada)}, stop ${n(stop)}, objetivo 1 ${n(o1)}, objetivo 2 ${n(o2)}.`;
  return seccion('boleta', 'Boleta', `${LADO(lado)} ${NOMBRE[p.marco]} · stop ${n(stop)} · objetivo 2 ${n(o2)}`, `
    <div class="kv" style="border-top:0"><span>${op ? 'Entrada confirmada' : 'Entrada ideal'}</span><span class="num">${n(entrada)}</span></div>
    ${op ? '' : `<div class="kv"><span>Abre entre</span><span class="num">${n(p.desde)} y ${n(p.hasta)}</span></div>`}
    <div class="kv"><span>Stop, donde se invalida</span><span><span class="num">${n(stop)}</span>, a ${riesgoPct.toFixed(2)} %</span></div>
    <div class="kv"><span>Objetivo 1, de seguimiento</span><span class="num">${n(o1)}</span></div>
    <div class="kv"><span>Objetivo 2, el principal</span><span class="num">${n(o2)}</span></div>
    <div class="kv"><span>Neto al objetivo 2</span><span><span class="num">${R(neto)}</span>${neto < 2 ? ', paga menos de 2 R' : ''}</span></div>
    <div class="kv"><span>Costo de ida y vuelta</span><span class="num">${costo.toFixed(2)} R</span></div>
    <div class="kv"><span>Apalancamiento máximo</span><span><span class="num">${palanca}x</span>, lo fija el stop</span></div>
    <div class="kv"><span>Liquidación teórica, margen aislado</span><span class="num">${n(liq)}</span></div>
    <div class="lab" style="padding:6px 0">Vence a las ${p.regla === 'barrido' ? P.barrido.vencimientoVelas : P.retroceso.vencimientoVelas} velas de ${NOMBRE[p.marco]}.</div>
    <button class="btn" data-a="copiarTexto" data-v="${esc(texto)}" style="width:100%">Copiar boleta</button>`);
}

function porTemporalidad() {
  const cuenta = { '-1': 0, '1': 0 };
  let ocultas = 0;
  for (const o of E.vigentes) { if (!todo && sinVentaja(o)) ocultas++; else cuenta[o.lado]++; }
  const filas = E.operables.map(marco => {
    const x = E.porMarco[marco];
    const items = [];
    for (const regla of ['tirador', 'zona', 'retroceso', 'barrido']) {
      const s = x[regla];
      if (!s) continue;
      if (regla === 'tirador' && s.estado === 'apuntando') {
        const ev = evidencia('tirador', marco, s.lado);
        items.push(`<div class="l1"><span class="chip ambar">${LADO(s.lado)} apuntando</span><span class="num">zona entre ${n(s.desde)} y ${n(s.hasta)}</span></div>
          <div class="l2">Francotirador · dispara si una vela de ${NOMBRE[s.gatilloMarco || '15m']} cierra ${s.lado < 0 ? 'bajo' : 'sobre'} ${n(s.gatillo)} · se invalida en ${n(s.invalida)}<br><span class="${ev.clase}">${ev.texto}</span></div>`);
        continue;
      }
      if (s.estado === 'en operación') {
        const o = s.op;
        if (!todo && sinVentaja(o)) continue;
        const ev = evidencia(regla, marco, o.lado);
        const avance = o.lado * (E.precio - o.entrada) / o.riesgo;
        items.push(`<div class="l1"><span class="chip ${color(o.lado)}">${LADO(o.lado)} confirmado</span><span class="num">${n(o.entrada)} → ${n(o.objetivo2)}</span><span class="${avance >= 0 ? 'verde' : 'rojo'} num">${R(avance)}</span></div>
          <div class="l2">${CORTA[regla]} · desde ${hora(o.t)} · stop ${n(o.stop)} · a favor ${o.factores.aFavor} de ${o.factores.de}${o.toco1 ? ' · ya tocó el objetivo 1' : ''}<br><span class="${ev.clase}">${ev.texto}</span></div>`);
      } else if (regla === 'retroceso' && (s.estado === 'preparando' || s.estado === 'en zona')) {
        const ev = evidencia('retroceso', marco, s.lado);
        items.push(`<div class="l1"><span class="chip">${LADO(s.lado)} ${s.estado === 'en zona' ? 'en zona' : 'en preparación'}</span><span class="num">abre entre ${n(s.desde)} y ${n(s.hasta)}</span></div>
          <div class="l2">se invalida en ${n(s.invalida)} · objetivo 2 ${n(s.objetivo2)}${s.estado === 'en zona' ? ` · confirma al cerrar ${s.lado < 0 ? 'bajo' : 'sobre'} ${n(s.gatillo)}` : ''} · a favor ${s.factores.aFavor} de ${s.factores.de}<br><span class="${ev.clase}">${ev.texto}</span></div>`);
      } else if (s.estado === 'barrido en curso') {
        items.push(`<div class="l1"><span class="chip ambar">Ruptura en curso</span><span class="num">nivel ${n(s.nivel)}</span></div><div class="l2">abre ${LADO(s.lado).toLowerCase()} si cierra de vuelta ${s.lado < 0 ? 'bajo' : 'sobre'} el nivel</div>`);
      }
    }
    if (!items.length) items.push('<div class="l1 mut">sin operación</div>');
    return items.map((it, k) => `<div class="op"><div class="m num">${k === 0 ? NOMBRE[marco] : ''}</div><div>${it}</div></div>`).join('');
  }).join('');
  return `<div class="p ancho2"><div class="h">Por temporalidad: lo vigente</div>
    <div class="lab" style="padding:4px 0 2px">${cuenta['-1']} de corto y ${cuenta['1']} de largo confirmadas ahora. Las del mismo lado nacen del mismo movimiento: cuentan como un solo riesgo, no como varias operaciones. Son señales de la app; tu posición real la llevas tú en Binance.</div>${filas}
    <button class="btn" data-a="todo" style="width:100%;margin-top:8px">${todo ? 'Ocultar las reglas sin ventaja medida' : `Ver también las reglas sin ventaja medida${ocultas ? ` (${ocultas} confirmadas ahora)` : ''}`}</button></div>`;
}

function senales() {
  const lista = E.senales.filter(o => todo || !sinVentaja(o)).slice(0, 40);
  const filas = lista.map(o => `<div class="sen"><div><span class="num">${NOMBRE[o.marco]}</span> · <span class="${color(o.lado)}">${LADO(o.lado)}</span> · ${CORTA[o.regla]}${vistas.has(o.id) ? ' · <span class="azul">vista en vivo</span>' : ''}</div><div class="r num ${o.neto >= 0 ? 'verde' : 'rojo'}">${R(o.neto)}</div>
    <div class="lab">${hora(o.t)} · <span class="num">${n(o.entrada)} → ${n(o.salida)}</span> · ${o.motivo}${o.toco1 && o.motivo !== 'objetivo 2' ? ' · tocó el objetivo 1' : ''}</div><div></div></div>`).join('');
  const suma = lista.reduce((s, o) => s + o.neto, 0);
  return `<div class="p"><div class="fila"><div class="h">Señales</div><div class="lab" style="margin-left:auto">Últimas ${lista.length} · ${todo ? 'todas las reglas' : 'reglas con resultado a favor o por medir'}</div></div>
    <div class="lab" style="padding:4px 0">Se reconstruyen solas al abrir, con las velas que Binance guarda. Suma de estas ${lista.length}: <span class="num ${suma >= 0 ? 'verde' : 'rojo'}">${R(suma)}</span>, con costo de ${P.costos.idaYVueltaPct.toFixed(2)} % descontado.</div>${filas || '<div class="mut">Todavía no hay señales cerradas de estas reglas.</div>'}</div>`;
}

function pie() {
  return `<div class="lab" style="text-align:center;padding-top:4px">Reglas versión ${P.version}${EV ? ` · evidencia medida el ${hora(Date.parse(EV.hecho))}, hora de Guadalajara, con historia desde ${EV.desde}` : ' · sin evidencia cargada'} · No es asesoría financiera: la app no opera ni guarda llaves.</div>`;
}

// ---------- Pintar ----------

function pintar() {
  if (!E) {
    app.innerHTML = cabecera() + `<div class="p ${falla ? 'aviso' : ''}">${falla ? `No se pudo leer Binance: ${esc(falla)}. Revisa la conexión y toca Actualizar.` : '<span class="mut">Leyendo Binance desde este aparato…</span>'}</div>`;
    return;
  }
  for (const o of E.vigentes) vistas.add(o.id);
  guardar('vistas', [...vistas].slice(-400));
  app.innerHTML = cabecera()
    + (falla ? `<div class="p aviso">No se pudo actualizar: ${esc(falla)}. Lo que ves es el último dato bueno.</div>` : '')
    + bloqueManda()
    + `<div class="cols">${tarjetaOpcion('Opción macro · 1 h a 1 D', E.macro)}${tarjetaOpcion('Opción micro · 15 y 30 m', E.micro)}<div style="display:flex;flex-direction:column;gap:10px">${alineacion()}${tarjetaIdea()}</div></div>`
    + panelPlan()
    + `<div class="cols"><div class="p" style="padding-top:0;padding-bottom:0">${secMercado()}${secFase()}</div><div class="p" style="padding-top:0;padding-bottom:0">${secBoleta()}</div>${tarjetaOpiniones()}</div>`
    + `<div class="cols">${porTemporalidad()}${senales()}</div>`
    + pie();
  edad();
}

function edad() {
  const el = document.getElementById('edad');
  if (!el || !E) return;
  const s = Math.round((Date.now() - E.hora) / 1000);
  el.textContent = s < 90 ? `Dato de hace ${s} s` : `Dato de hace ${Math.round(s / 60)} min`;
  el.style.color = s > 300 ? 'var(--ambar)' : '';
}

function textoParaIA() {
  const p = E.principal;
  const L = [];
  L.push('Eres una segunda opinión para una operación de WLD/USDT perpetuo en Binance. No cambies números ni reglas. Contesta en español, máximo 120 palabras. Empieza con una de estas tres: A FAVOR, EN CONTRA o ESPERAR. Luego di el riesgo principal y qué lo invalida.');
  L.push(`Hora de Guadalajara: ${hora(E.hora)}. Precio ${n(E.precio)}. Funding ${E.extras.funding == null ? 'sin dato' : pct(E.extras.funding, 3)}. Cuentas grandes, largos por corto: ${n(E.extras.grandesCuentas, 2)}. Volatilidad de 1 h en percentil ${E.volatilidad.percentil}.`);
  L.push('Sesgo y fuerza (0 a 100) en velas cerradas: ' + MARCOS.map(k => `${NOMBRE[k]} ${E.marcos[k].listo ? `${E.marcos[k].sesgo} ${E.marcos[k].fuerza}` : 'sin dato'}`).join(', ') + '.');
  L.push(`Quién manda: ${E.mando.manda ? `${NOMBRE[E.mando.manda]}, ${sesgoTxt(E.mando.direccion)}` : 'sin impulso en 15 m'}. Fondo: ${E.mando.fondo ? `${NOMBRE[E.mando.fondo]}, ${sesgoTxt(E.mando.direccionFondo)}` : 'sin tendencia clara'}.`);
  if (E.movimiento) L.push(`El movimiento que manda va desde ${n(E.movimiento.desde)} hasta ${n(E.movimiento.hasta)}.`);
  if (E.micro && E.macro && E.micro !== E.principal) { const b = E.micro; const lb = b.op ? b.op.lado : b.lado; L.push(`Opción micro: ${LADO(lb)} de ${NOMBRE[b.marco]}, ${b.estado}.`); }
  if (E.btc) L.push(`BTC: ${['1d', '4h', '1h'].map(k => `${NOMBRE[k]} ${E.btc.marcos[k].sesgo}`).join(', ')}. WLD frente a BTC en 24 h: ${pct(E.btc.diferencia)}.`);
  L.push(`Mapa del día: apertura ${n(E.mapa.apertura)}, máximo ${n(E.mapa.maximo)}, mínimo ${n(E.mapa.minimo)}, techo probable ${n(E.mapa.techo)}, piso probable ${n(E.mapa.piso)}.`);
  const b0 = E.plan.bloques[0];
  const c0 = basePlan(b0);
  L.push(`Bloque ${b0.horas} (hora de Guadalajara): abrió en ${n(b0.apertura)} y va ${pct(b0.cambio, 1)}. Historia de este horario: ${tituloPlan(c0).toLowerCase()}.`);
  if (p) {
    const lado = p.op ? p.op.lado : p.lado;
    const f = p.op ? p.op.factores : p.factores;
    const ev = evidencia(p.regla, p.marco, lado);
    L.push(p.op
      ? `Operación principal: ${LADO(lado)} de ${NOMBRE[p.marco]} (${REGLA[p.regla]}), confirmada el ${hora(p.op.t)}. Entrada ${n(p.op.entrada)}, stop ${n(p.op.stop)}, objetivo 1 ${n(p.op.objetivo1)}, objetivo 2 ${n(p.op.objetivo2)}.`
      : p.estado === 'barrido en curso'
        ? `Ruptura en curso en ${NOMBRE[p.marco]}: abre ${LADO(lado)} si una vela cierra de vuelta ${lado < 0 ? 'bajo' : 'sobre'} ${n(p.nivel)}.`
        : `Operación principal: ${LADO(lado)} de ${NOMBRE[p.marco]}, ${p.estado}. Abre entre ${n(p.desde)} y ${n(p.hasta)}, ideal ${n(p.ideal)}, se invalida en ${n(p.invalida)}, objetivo 1 ${n(p.objetivo1)}, objetivo 2 ${n(p.objetivo2)}.`);
    if (f) L.push('Factores: ' + f.lista.map(x => `${x[0]}: ${x[1] == null ? 'sin dato' : x[1] ? 'sí' : 'no'}`).join('; ') + `. Evidencia medida: ${ev.texto}.`);
  } else {
    L.push('Las reglas no tienen operación principal en este momento.');
  }
  const idp = parseFloat(String(idea.precio).replace(',', '.'));
  if (isFinite(idp) && idp > 0) L.push(`Lo que Emmanuel ve en TradingView: ${LADO(idea.lado)} en ${n(idp)}.`);
  return L.join('\n');
}

async function copiar(texto, aviso) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const t = document.createElement('textarea');
    t.value = texto;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
  const el = document.getElementById('copiado');
  if (el) el.textContent = aviso;
}

// ---------- Datos ----------

async function actualizar() {
  if (cargando) return;
  cargando = true;
  pintar();
  try {
    if (!P) P = await (await fetch('reglas/parametros.json', { cache: 'no-store' })).json();
    if (!EV) { try { const r = await fetch('reglas/evidencia.json', { cache: 'no-store' }); if (r.ok) EV = await r.json(); } catch { /* sin evidencia */ } }
    E = await leerEstado({ parametros: P });
    E.macro = elegirPrincipal(E.porMarco, P.tirador.marcos, E.hora, E.mando, pesoEvidencia, { reglas: ['tirador'], precio: E.precio });
    E.micro = elegirPrincipal(E.porMarco, ['15m', '30m'], E.hora, E.mando, pesoEvidencia, { reglas: ['tirador'], precio: E.precio });
    E.principal = E.macro || E.micro;
    falla = null;
  } catch (e) {
    falla = e && e.message ? e.message : String(e);
  }
  cargando = false;
  pintar();
}

function programar() {
  clearInterval(temporizador);
  if (auto) temporizador = setInterval(() => { if (!document.hidden) actualizar(); }, 60_000);
}

app.addEventListener('click', ev => {
  const b = ev.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a;
  if (a === 'actualizar') actualizar();
  if (a === 'auto') { auto = b.checked; guardar('auto', auto); programar(); }
  if (a === 'lado') { idea.lado = +b.dataset.v; guardar('idea', idea); pintar(); }
  if (a === 'todo') { todo = !todo; guardar('todo', todo); pintar(); }
  if (a === 'copiar') copiar(textoParaIA(), 'Copiado. Pégalo en Claude, ChatGPT y Gemini, y trae aquí su respuesta.');
  if (a === 'copiarTexto') copiar(b.dataset.v, 'Boleta copiada.');
  if (a === 'pegar') { pegando = b.dataset.v; pintar(); const t = document.getElementById('texto'); if (t) t.focus(); }
  if (a === 'cerrarOpinion') { pegando = null; pintar(); }
  if (a === 'guardarOpinion') {
    const t = document.getElementById('texto').value.trim();
    if (t) opiniones[pegando] = { texto: t, hora: Date.now(), precio: E ? E.precio : null }; else delete opiniones[pegando];
    guardar('opiniones', opiniones);
    pegando = null;
    pintar();
  }
});
app.addEventListener('change', ev => {
  if (ev.target.id === 'precio') { idea.precio = ev.target.value; guardar('idea', idea); pintar(); }
});
app.addEventListener('toggle', ev => {
  const d = ev.target;
  if (!d.dataset || !d.dataset.id) return;
  if (d.open) abiertos.add(d.dataset.id); else abiertos.delete(d.dataset.id);
  guardar('abiertos', [...abiertos]);
}, true);
document.addEventListener('visibilitychange', () => { if (!document.hidden && E && Date.now() - E.hora > 120_000) actualizar(); });

clearInterval(reloj);
reloj = setInterval(edad, 1000);
programar();
actualizar();

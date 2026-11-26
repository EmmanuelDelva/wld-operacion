# Las reglas

Versión 3. Aquí nada bloquea: cada operación se muestra con sus factores a favor y con el resultado medido de su celda, que es la combinación de regla, temporalidad y lado. Los números viven en `reglas/parametros.json`.

Todo se evalúa en velas cerradas. Las reglas corren por separado en ocho temporalidades: 15, 30 y 45 minutos; 1, 2, 3 y 4 horas; y 1 día. El costo de ida y vuelta, 0.20 %, se descuenta siempre.

## Retroceso en tendencia

| Paso | Regla |
|---|---|
| Régimen | En la propia temporalidad, EMA21 y EMA50 separadas al menos 0.30 ATR y el cierre del mismo lado de la EMA50. Debajo es corto; arriba es largo. |
| Zona | Entre la EMA21 y la EMA50, con tope de 1 ATR contando desde la EMA21. La entrada ideal es el punto medio. |
| Invalidación | El borde lejano de la zona más 0.35 ATR, con distancia mínima de 1 ATR desde la entrada ideal (1.25 ATR en 15 y 30 minutos). |
| Entrada con confirmación | Después de tocar la zona, una vela cierra rompiendo el mínimo de la anterior, en cortos, o el máximo, en largos. Stop detrás del extremo del retroceso más 0.25 ATR. |
| Entrada en zona | Orden límite en el punto medio, con stop en la invalidación. Se mide aparte. |
| Objetivos | 1.5 R y 2.5 R. Vence a las 18 velas. |

## Ruptura fallida

| Paso | Regla |
|---|---|
| Barrido | El precio rebasa el extremo de las 20 velas previas por al menos 0.1 ATR y, en 3 velas o menos, una cierra de vuelta adentro. |
| Entrada | Al cierre de esa vela, en contra del barrido. |
| Stop | Detrás del extremo del barrido más 0.15 ATR, con el mismo mínimo en ATR. |
| Objetivos | 1.2 R y 2.4 R. Vence a las 12 velas. |

## Factores a favor

Se cuentan, no bloquean:

1. La temporalidad superior apunta igual.
2. BTC apunta igual en esa misma temporalidad.
3. La volatilidad está entre el percentil 20 y el 97.
4. En retrocesos, la fuerza de la propia temporalidad va a favor. En rupturas fallidas, el barrido se hizo con volumen bajo.

## Quién manda y fondo

- **Quién manda:** hasta qué temporalidad llega, sin que aparezca una dirección contraria, el movimiento que nace en 15 minutos. Las temporalidades neutrales se saltan.
- **Fondo:** la temporalidad más alta con tendencia clara.

## Cómo se mide

`pruebas/historia.mjs` baja toda la historia de Binance y corre las reglas una vez. Parte el resultado en dos: hasta el 15 de septiembre de 2026, que es historia ya explorada, y del 16 de septiembre en adelante. El resultado queda en `reglas/evidencia.json` y la app lo muestra junto a cada operación.

Cada celda lleva una etiqueta:

- **Muestra baja:** menos de 30 casos.
- **Ventaja medida:** 100 casos o más, el piso del intervalo de confianza arriba de cero, sigue positiva con costo de 0.30 % y no se cae en el tramo reciente.
- **A favor, por confirmar:** resultado neto positivo sin cumplir lo anterior.
- **Sin ventaja:** resultado neto en cero o negativo.

Si una vela toca el stop y el objetivo a la vez, se cuenta el stop.

## Lo que salió en la primera medición

Corrida del 25 de noviembre de 2026, con historia desde el 24 de julio de 2023.

- De 48 celdas, ninguna alcanzó «ventaja medida».
- Cuatro quedaron a favor, por confirmar; las cuatro son cortos de retroceso con confirmación: 3 h (+0.14 R en 178 casos), 2 h (+0.03 R en 262), 4 h (+0.03 R en 136) y 30 m (+0.01 R en 931).
- Las rupturas fallidas salieron negativas en todas las temporalidades, salvo cortos de 1 D con muestra baja.
- La entrada en zona sin confirmación rindió peor que esperar el cierre.
- Los largos rindieron peor que los cortos.

Son 48 comparaciones a la vez: alguna puede verse bien solo por azar. Lo que confirma o descarta una celda es lo que siga pasando con las señales nuevas.

## Francotirador (versión 3)

La idea sale del macro y el disparo se da en 15 minutos. Corre para macros de 1, 2, 3 y 4 horas y 1 día, cortos y largos por separado.

| Paso | Regla |
|---|---|
| Idea | Régimen y zona del retroceso en la temporalidad macro, con su última vela cerrada. |
| Armado | El precio cierra fuera de la zona, del lado de la tendencia, y luego entra a ella. Si toca la invalidación del macro o pasan 6 velas macro sin disparo, se cancela y hay que volver a armar. |
| Disparo | Una vela de 15 m cierra rompiendo el extremo de las 3 anteriores, en el tercio final de su propio rango, y no mide más de 1.8 ATR de 15 m. |
| Stop | Detrás del extremo de las últimas 8 velas de 15 m más 0.25 ATR. Mínimo: lo mayor entre 1.5 ATR de 15 m y 1.2 %. Si pide más de 3.5 %, no hay entrada. |
| Objetivo | 2.5 veces el riesgo del macro, contado desde la entrada. Si no deja al menos 2 R netos, no hay entrada. |
| Salida | Stop fijo y salida completa en el objetivo, o al vencer 18 velas macro. |

Se midieron además, sin operar con ellas, dos formas de gestión (stop a la entrada después del objetivo 1; cobro parcial de 40 % con stop móvil), el flujo agresor de las últimas 3 velas y el recorrido: qué tan lejos llegó el precio antes del stop.

### Lo que salió

Corrida del 25 de noviembre de 2026, historia desde el 24 de julio de 2023, con costo de 0.20 % y funding incluidos.

| Macro y lado | Casos | Neto por operación | Llegó a +1 R, +2 R y +3 R | Peor racha |
|---|---|---|---|---|
| 4 h, corto | 308 | +0.17 R | 56 %, 39 % y 30 % | 25 R |
| 3 h, corto | 358 | +0.11 R | 56 %, 39 % y 28 % | 30 R |
| 1 D, corto | 76 | +1.12 R | 51 %, 37 % y 32 % | 18 R |
| 1 D, largo | 68 | +0.39 R | 53 %, 31 % y 19 % | 28 R |
| 2 h, corto | 452 | −0.11 R | 50 %, 33 % y 23 % | 63 R |
| 1 h, corto | 516 | −0.20 R | 46 %, 30 % y 19 % | 117 R |
| Largos de 1 a 4 h | 167 a 360 | entre −0.08 y −0.15 R | | |

- Ninguna celda alcanzó «ventaja medida»: en todas, el piso del intervalo de confianza queda en cero o debajo.
- El cobro parcial con stop móvil rindió peor que dejar correr hasta el objetivo. El stop a la entrada no mejoró de forma consistente.
- El flujo agresor casi no separa: nueve de cada diez disparos ya lo traen a favor.
- El resultado de 1 D en corto descansa en pocas operaciones muy grandes, durante años en que WLD cayó. No se puede dar por repetible.
- Solo dos de cada diez operaciones llegan al objetivo. Las rachas de pérdidas son largas: con 1 % de riesgo por operación, una racha de 25 R es una caída de 25 %.

Toda la historia hasta el 25 de noviembre de 2026 ya se usó para diseñar o medir. Lo que confirme o descarte estas reglas son las señales nuevas.

## Búsqueda de alta efectividad

Emmanuel pidió una regla con 75 % a 80 % de aciertos o más. Se midieron cuatro caminos en una sola corrida, con el mismo trato: stop primero si una vela toca los dos, costo de 0.20 % y funding descontados, y «acierto» es terminar con resultado neto positivo.

| Camino | Casos | Aciertos | Neto por operación | Del 16 de septiembre en adelante |
|---|---|---|---|---|
| Francotirador, corto con macro de 4 h, stop en la invalidación del macro y objetivo a un tercio de esa distancia | 308 | 81 % | +0.28 % | 19 casos, 68 %, −0.60 % |
| Lo mismo con macro de 3 h | 358 | 80 % | +0.32 % | 26 casos, 62 %, −0.84 % |
| Lo mismo con macro de 4 h y objetivo a la mitad | 308 | 73 % | +0.45 % | 19 casos, 68 %, +0.06 % |
| Lo mismo con macro de 4 h y objetivo a tres cuartos | 308 | 64 % | +0.63 % | 19 casos, 63 %, +0.51 % |
| Francotirador con el stop corto del disparo y objetivo a un tercio | 308 a 358 | 79 % a 80 % | −0.05 % a −0.08 % | |
| Regla de ChatGPT: corto por agresión compradora fallida | 13 | 54 % | −0.41 % | 1 caso |
| Regla de Gemini: corto en ruptura fallida con funding no negativo | 577 | 68 % | −0.10 % | 24 casos, 71 %, −0.01 % |
| Idea de Gemini: corto por agotamiento tras un salto | 154 | 45 % | −0.61 % | 13 casos, 38 %, −0.63 % |

- Sí hay una salida con 80 % de aciertos y resultado positivo en la historia: stop ancho y objetivo corto sobre las entradas de francotirador de 3 h y 4 h. El margen es delgado, porque una pérdida borra unas cuatro ganancias, y en el tramo reciente no se sostuvo.
- Con el stop corto del disparo también se acierta 80 %, pero el costo se come la ganancia.
- Llegar a 90 % pediría un objetivo todavía más corto; con costo de 0.20 % la ganancia por acierto quedaría por debajo de lo que cuesta una sola pérdida entre diez.
- Con el mismo disparo, subir el objetivo baja los aciertos y sube lo que deja cada operación.

## Versión 4: francotirador en lo que manda y en el micro, y mapa del día por horario

### Francotirador micro

La misma regla del francotirador, con la idea en 15, 30 o 45 m y el disparo en una vela de 5 m. Stop entre 0.6 % y 2.0 %. Así, lo que manda ahora, la opción macro y la opción micro tienen cada una su francotirador.

| Idea | Lado | Casos | Neto por operación | Del 16 de septiembre en adelante |
|---|---|---|---|---|
| 15 m | corto | 1649 | −0.14 R | 113 casos, −0.21 R |
| 15 m | largo | 1355 | −0.23 R | 82 casos, −0.24 R |
| 30 m | corto | 1361 | −0.10 R | 102 casos, −0.29 R |
| 30 m | largo | 1077 | −0.22 R | 56 casos, −0.04 R |
| 45 m | corto | 1167 | −0.17 R | 109 casos, −0.40 R |
| 45 m | largo | 901 | −0.22 R | 59 casos, −0.02 R |

- Las seis celdas pierden. El stop medio es de 0.9 % a 1.1 %, así que el costo de 0.20 % se lleva cerca de 0.2 R en cada operación.
- La app lo muestra con la etiqueta «sin respaldo». Sirve para ver por dónde va el impulso corto, no como operación con ventaja.

### Las condiciones no son una calificación

Se midió si cumplir más condiciones deja mejor resultado. No hay un patrón que se repita:

- En los cortos de 4 h y de 3 h, con 4 o más condiciones salió mejor (+0.55 R en 111 casos y +0.33 R en 118).
- En los cortos de 1 h y de 2 h, con 4 o más salió peor (−0.29 R en 157 casos y −0.22 R en 122).
- Por eso la tarjeta ya no pinta el número de condiciones como bueno o malo: dice cuáles se cumplen y si en esa regla cumplir más ha servido.

### Mapa del día por horario

Bloques de 6 horas en hora de Guadalajara. Para cada uno se midió, en toda la historia, lo que hizo el precio desde la apertura del bloque. «Típico» es lo que recorrió la mitad de los bloques; «amplio», lo que solo 2 de cada 10 rebasaron.

| Horario | Bajó | Arriba, típico y amplio | Abajo, típico y amplio | Nota |
|---|---|---|---|---|
| 18:00–00:00 | 50 % de 1220 | 1.71 % y 3.65 % | 1.68 % y 3.56 % | |
| 00:00–06:00 | 54 % de 1220 | 1.39 % y 3.36 % | 1.70 % y 3.24 % | |
| 06:00–12:00 | 56 % de 1221 | 1.80 % y 4.20 % | 2.27 % y 4.58 % | El de más recorrido. Hace primero el máximo 56 % de las veces. Por año: 60, 59, 56 y 52 % |
| 12:00–18:00 | 52 % de 1221 | 1.52 % y 3.42 % | 1.63 % y 3.58 % | |

- WLD bajó en 53 % de todos los bloques, así que una inclinación bajista solo cuenta si supera eso.
- La dirección de 4 h y de 30 m al empezar el bloque no dice hacia dónde cierra: coincidió 49.9 % de 4502 veces. Con macro y micro alineados, 49.8 % de 2446.
- Lo que sí es estable es el tamaño del recorrido por horario. Con eso la app dice si la zona del francotirador queda dentro de lo que ese horario suele recorrer.
- El registro de cada bloque (contexto al empezar, apertura, máximo, mínimo, cierre y qué extremo hizo primero) se reconstruye en la app con las velas de Binance; el registro completo de la historia queda en Drive, en «Registro del mapa del día».

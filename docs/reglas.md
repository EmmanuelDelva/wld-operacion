# Las reglas

Versión 2. Aquí nada bloquea: cada operación se muestra con sus factores a favor y con el resultado medido de su celda, que es la combinación de regla, temporalidad y lado. Los números viven en `reglas/parametros.json`.

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

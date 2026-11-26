# Las cuatro reglas

Las cuatro son hipótesis. Ninguna tiene ventaja demostrada todavía y cada una se valida por separado. Los números viven en `reglas/parametros.json`; aquí está lo mismo en palabras.

Todo se evalúa en velas cerradas. El costo de ida y vuelta se toma en 0.20 % y se repite la cuenta con 0.30 % como prueba de estrés.

## Swing corto, la base

| Paso | Regla |
|---|---|
| Régimen | En 4 h, EMA21 debajo de EMA50 y cierre debajo de EMA50. Si el diario apunta igual se anota como etiqueta, no es requisito. |
| Volatilidad | El ATR de 1 h, como porcentaje del precio, entre el percentil 20 y el 97 de sus últimos 90 días. |
| Zona | Abre entre la EMA21 de 4 h y lo que quede más abajo entre la EMA50 de 4 h y la EMA21 más 1 ATR de 4 h. La entrada ideal es el punto medio. |
| Invalidación | El mayor entre el borde alto de la zona más 0.35 ATR de 4 h y la entrada ideal más 1.5 %. Ahí va el stop. |
| Entrada en zona | Orden límite en la entrada ideal. Se cancela si el precio toca la invalidación antes de llenarse o si pasan 12 velas de 1 h. |
| Entrada con confirmación | Después de tocar la zona, una vela de 1 h cierra bajo el mínimo de la vela anterior. Stop en el máximo del rebote más 0.25 ATR de 1 h, con distancia mínima de 1.5 %. |
| Salida que se valida | Un solo objetivo a 2.5 R, que deje al menos 2 R netos. Vence a las 72 horas. |
| Variante que se mide aparte | La mitad a 1.5 R sin mover el stop y la otra mitad con stop móvil por las últimas 4 velas de 4 h. |
| Etiquetas | Diario alineado; razón de largos por corto de las cuentas grandes en 1.9 o más. |

La entrada en zona y la entrada con confirmación corren en paralelo y se comparan.

## Swing largo

Es el espejo: en 4 h, cierre sobre EMA21 y EMA21 sobre EMA50; retroceso a la EMA21 de 4 h; confirmación con una vela de 1 h que cierra sobre el máximo de la anterior. Además pide tres cosas:

- BTC alcista en 4 h, con cierre sobre su EMA50.
- WLD más fuerte que BTC en las últimas 24 horas.
- Funding en +0.03 % o menos.

La distancia mínima del stop es 1.8 %. El RSI se anota como etiqueta.

## Intradía corto, ruptura fallida

| Paso | Regla |
|---|---|
| Régimen | Cierre debajo de EMA50 en 1 h y en 4 h. |
| Volatilidad | ATR de 15 m entre el percentil 20 y el 97 de sus últimos 90 días. |
| Funding | Fuera de los 5 minutos antes y después del cobro. |
| Barrido | El precio rebasa el máximo de las 20 velas previas de 15 m por al menos 0.1 ATR y, en 3 velas o menos, una cierra de vuelta abajo. |
| Entrada | El primer precio ejecutable después de ese cierre. |
| Stop | El máximo del barrido más 0.15 ATR de 15 m, con distancia mínima de 1.3 %. |
| Salida que se valida | El borde bajo del rango de 20 velas, solo si deja 2 R netos o más. Vence a las 16 velas. |
| Variante que se mide aparte | La mitad a 1.2 R y la otra mitad a 2.2 R. |
| Etiqueta | Volumen bajo en el barrido. |

## Intradía largo

Es el espejo: barrido del mínimo de 20 velas y cierre de vuelta arriba en 3 velas o menos. Además pide 1 h alcista, BTC alcista en 1 h, WLD más fuerte que BTC en 4 horas y volumen relativo de 1.1 o más en la vela que recupera. Distancia mínima del stop: 1.3 %.

## Cómo se validan

1. **Descarte.** Una sola corrida sobre la historia ya explorada, hasta el 15 de septiembre de 2026. Pasa si el factor de ganancia es 1.20 o más con costo de 0.20 % y sigue arriba de 1.0 con 0.30 %, la expectativa es de +0.10 R o más, la peor racha no pasa de 12 R y hay al menos 100 operaciones.
2. **Tramo limpio.** Una sola corrida del 16 de septiembre de 2026 a hoy. Solo detecta colapsos: la expectativa debe quedar arriba de −0.05 R y la peor racha no pasar de 6 R.
3. **Libro en vivo.** A las 30 señales se detiene si va en −0.15 R o peor, o si la racha pasa de 8 R. A las 60, aprobación provisional con +0.12 R o más y factor de 1.25 o más, con tamaño chico. A las 100, juntando tramo limpio y nuevas, con al menos 30 nuevas, se confirma si el límite inferior del intervalo de confianza queda arriba de cero.

Una muestra insuficiente es resultado inconcluso, no aprobación. El código y los parámetros se sellan con una huella antes de abrir el tramo limpio; cualquier cambio posterior reinicia la validación.

## Pendiente antes de sellar

- Revisión del texto final por ChatGPT y Gemini.
- El régimen del swing no pide una separación mínima entre EMA21 y EMA50: en un mercado plano puede cumplirse por un pelo. Las pruebas con datos fabricados lo mostraron. Falta decidir si se deja así, con la volatilidad como único filtro, o se pide una separación mínima.
- «Quién manda» se definió como la temporalidad más alta con tendencia clara. Falta ver con datos reales si eso se queda pegado en la semanal.

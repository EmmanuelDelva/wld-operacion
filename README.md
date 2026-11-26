# wld-operacion

App para operar WLD/USDT perpetuo en Binance. Sirve como segunda opinión: tú ves algo en TradingView, le dices a la app qué estás viendo y contesta si coincide con sus reglas, dónde abre la entrada, dónde se invalida y qué tanto ha funcionado esa regla en esa temporalidad.

## Cómo funciona

- Corre en el navegador del teléfono o de la computadora y pide los datos a Binance desde ese mismo aparato. No hay servidor en medio y no cuesta nada mantenerla.
- No guarda llaves ni contraseñas y no manda órdenes. Las operaciones las pones tú en Binance.
- Solo lee velas cerradas. Pide siete series a Binance (1 m, 5 m, 15 m, 1 h, 4 h, 1 D y 1 S) y arma en el aparato las otras cinco (3 m, 30 m, 45 m, 2 h y 3 h), alineadas al inicio del día UTC, igual que TradingView.
- Sin servidor no hay avisos con la app cerrada. Al abrirla reconstruye sola las señales con las velas que Binance guarda.
- Las opiniones de Claude, ChatGPT y Gemini entran por copiar y pegar: un botón copia el estado, lo pegas en cada chat y pegas de vuelta la respuesta.

## Qué muestra

- El estado y dónde se espera la entrada: «abre entre tal y tal precio, se invalida si pasa de tal».
- Tu idea contra las reglas: corto o largo y a qué precio, con el riesgo y lo que paga.
- Sesgo y fuerza de las 12 temporalidades, quién manda y cuál es el fondo.
- Fase del mercado, BTC y mapa del día.
- Boleta con stop, objetivos, resultado neto y apalancamiento máximo.
- Lo vigente por temporalidad: qué está en preparación, en zona o confirmado, con sus precios.
- Las señales, hasta abajo, con su resultado neto.

Nada bloquea. Cada operación trae sus factores a favor y la evidencia medida de su regla en esa temporalidad. Las reglas que no han mostrado ventaja quedan ocultas hasta que tocas «Ver también».

## En qué va

| Parte | Estado |
|---|---|
| Motor completo: 12 temporalidades, reglas, factores, fase, BTC, mapa del día, señales | Hecho y probado |
| Medición con toda la historia | Hecha; ver [docs/reglas.md](docs/reglas.md) |
| Pantalla | Hecha |
| Lectura de la cuenta de Binance y órdenes | No está; sería después |

En la primera medición ninguna regla alcanzó ventaja demostrada. Las que quedaron a favor son cortos de retroceso con confirmación en 2, 3 y 4 horas, y falta confirmarlas con señales nuevas.

## Las reglas

Están escritas en [docs/reglas.md](docs/reglas.md), sus números en [reglas/parametros.json](reglas/parametros.json) y el resultado medido en `reglas/evidencia.json`.

## Probar el motor

Hace falta Node 18 o más nuevo.

```
node pruebas/autoprueba.mjs
node pruebas/armado.mjs
node pruebas/estado.mjs
node pruebas/historia.mjs
```

La primera usa datos fabricados y no necesita red. La segunda compara, con datos reales, las velas que arma el motor contra las que publica Binance. La tercera muestra lo que el motor ve en ese momento. La cuarta baja toda la historia y vuelve a medir cada regla. Las tres últimas leen Binance y hay que correrlas en tu propia máquina, porque a los servidores en Estados Unidos Binance les responde 451.

## Carpetas

- `index.html` y `app.js`: la pantalla.
- `motor/`: el cálculo, sin pantalla. El mismo archivo corre en el navegador y en Node.
- `reglas/`: parámetros y evidencia.
- `docs/`: las reglas en palabras.
- `pruebas/`: pruebas del motor.

## Aviso

Esto no es asesoría financiera y no promete ganancias. Operar perpetuos con apalancamiento puede hacer perder todo el margen.

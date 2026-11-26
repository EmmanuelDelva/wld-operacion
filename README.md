# wld-operacion

App para operar WLD/USDT perpetuo en Binance. Sirve como segunda opinión: tú ves algo en TradingView, le dices a la app qué estás viendo y contesta si coincide con sus reglas, dónde abre la entrada, dónde se invalida y qué condición falta.

## Cómo funciona

- Corre en el navegador del teléfono o de la computadora y pide los datos a Binance desde ese mismo aparato. No hay servidor en medio y no cuesta nada mantenerla.
- No guarda llaves ni contraseñas y no manda órdenes. Las operaciones las pones tú en Binance.
- Solo lee velas cerradas. Pide siete series a Binance (1 m, 5 m, 15 m, 1 h, 4 h, 1 D y 1 S) y arma en el aparato las otras cinco (3 m, 30 m, 45 m, 2 h y 3 h), alineadas al inicio del día UTC, igual que TradingView.
- Sin servidor no hay avisos con la app cerrada. Al abrirla repasa las velas que faltaron y completa sola el libro de señales.
- Las opiniones de Claude, ChatGPT y Gemini entran por copiar y pegar: un botón copia el estado, lo pegas en cada chat y pegas de vuelta la respuesta.

## Qué muestra

- El estado en una palabra y dónde se espera la entrada: «abre entre tal y tal precio, se invalida si pasa de tal».
- Tu idea contra las reglas: corto o largo y a qué precio, con el riesgo y lo que paga.
- Sesgo y fuerza de las 12 temporalidades, quién manda y qué cambiaría el mando.
- Fase del mercado, con dónde inició y dónde se proyecta su final.
- BTC y la fuerza de WLD frente a BTC.
- Swing e intradía, con las condiciones cumplidas y las que faltan, para cortos y para largos.
- Mapa del día: apertura, máximo y mínimo, techo y piso probables, y bloques de 6 horas.
- Boleta con stop, tres objetivos, resultado neto y apalancamiento máximo.
- Libro automático de señales.

## En qué va

| Parte | Estado |
|---|---|
| Motor: velas, las 12 temporalidades, sesgo, fuerza y quién manda | Hecho y probado |
| Motor: zona, invalidación y objetivos del swing | Hecho y probado |
| Motor: funding, cuentas grandes, BTC, fase, intradía y mapa del día | Falta |
| Libro que se reconstruye al abrir | Falta |
| Pantalla | Falta; el diseño ya está |
| Pruebas de descarte y tramo limpio de las cuatro reglas | Falta |

Ninguna regla tiene ventaja demostrada todavía. Mientras no pasen sus pruebas, la app las muestra como «en validación».

## Las reglas

Están escritas en [docs/reglas.md](docs/reglas.md) y sus números en [reglas/parametros.json](reglas/parametros.json). Son cuatro: swing corto, swing largo, intradía corto e intradía largo.

## Probar el motor

Hace falta Node 18 o más nuevo.

```
node pruebas/autoprueba.mjs
node pruebas/armado.mjs
node pruebas/estado.mjs
```

La primera usa datos fabricados y no necesita red. La segunda compara, con datos reales, las velas que arma el motor contra las que publica Binance. La tercera muestra lo que el motor ve en ese momento. Las dos últimas leen Binance y hay que correrlas en tu propia máquina, porque a los servidores en Estados Unidos Binance les responde 451.

## Carpetas

- `motor/`: el cálculo, sin pantalla. El mismo archivo corre en el navegador y en Node.
- `reglas/`: los parámetros.
- `docs/`: las reglas en palabras.
- `pruebas/`: pruebas del motor.

## Aviso

Esto no es asesoría financiera y no promete ganancias. Operar perpetuos con apalancamiento puede hacer perder todo el margen.

# Billetera

Gastos personales en pesos y dólares. Funciona sin internet en el iPhone;
con internet trae la cotización del dólar. Los datos viven sólo en el
teléfono: no hay servidor, cuenta ni login.

## Instalarla en el iPhone

1. Abrí `https://sarkismorales.github.io/billetera/` en **Safari**.
2. Compartir → **Agregar a inicio**.
3. Abrila desde el ícono. Así queda en pantalla completa, anda sin red y
   iOS no borra los datos por inactividad (en Safari común sí puede, si no
   la abrís en una semana).

**Ojo: en el iPhone, Safari y la app del ícono guardan los datos por
separado.** Lo que cargás en uno no aparece en el otro. Usala siempre desde
el ícono. Si la abrís en Safari (por ejemplo, tocando un link), arriba
aparece un aviso amarillo.

**Actualizaciones.** Cada vez que la app vuelve a primer plano pregunta si
hay versión nueva. Si hay, se recarga sola, pero nunca con una hoja abierta
o mientras escribís: espera a que termines. En Ajustes, abajo de todo, dice
qué versión corre (fecha y commit), desde dónde está abierta y cuántos
movimientos, proyectos y notas hay guardados ahí.

## Las cinco pantallas

| Pantalla | Qué muestra |
| --- | --- |
| Inicio | Patrimonio total en pesos y dólares (con un ojito para ocultar los montos), lo que entró y gastaste en el mes, saldo por cuenta y gasto por categoría con presupuesto. |
| Movimientos | Mes por mes, agrupado por día, con buscador y filtro por cuenta y categoría. Tocás uno para editarlo o borrarlo. |
| Reportes | Cruza cuentas, categorías, movimientos, dólar e inflación, y muestra la inflación mes a mes. Ver abajo. |
| Proyectos | Proyectos con presupuesto, objetivos y notas propias; y aparte, Notas sueltas estilo Todoist. Ver abajo. |
| Ajustes | Dólar de referencia, cuentas, categorías y presupuestos, Archivos y Transferencias, tema. |

El botón **+** carga un gasto, un ingreso o una transferencia. Recuerda la
última cuenta usada.

## Reglas de plata

| Regla | Por qué |
| --- | --- |
| Todo se guarda en centavos enteros | Con decimales binarios los saldos se desvían de a poco. |
| Comprar dólares es una **transferencia** ARS → USD con los dos montos | No es gasto. La app muestra el tipo de cambio que pagaste. |
| Un gasto en USD guarda la cotización del día que lo cargaste | El presupuesto de marzo no cambia porque el dólar suba en abril. |
| Dólar de referencia: **MEP venta** por defecto | Se cambia en Ajustes (oficial, blue, CCL, tarjeta, cripto) o se carga a mano. |
| Sin internet se usa la última cotización bajada | Se ve cuándo se bajó y la marca "sin conexión". |
| Corregir el saldo de una cuenta ajusta el saldo inicial | El ajuste no aparece como gasto ni ingreso y no ensucia el mes. |
| Borrar un movimiento lo marca como borrado | Así importar un backup viejo no lo revive. |
| Presupuesto: ámbar al 80%, rojo al pasarte | Los topes están en pesos: con inflación conviene revisarlos cada tanto. |
| Tope **por mes** o **entre fechas** (por categoría) | Entre fechas cuenta sólo lo gastado en esa categoría en ese período, aunque cruce de mes ("$ 50.000 en comida del 29/10 al 31/10"). Antes de empezar y después de terminar no aparece; al terminar, la categoría queda sin tope. |

Cotización: [dolarapi.com](https://dolarapi.com), se actualiza como mucho
una vez por hora, al abrir la app o al volver la señal.

## Inflación (Reportes → Período)

Último dato mensual, acumulada del año y los últimos **3 o 6 meses** mes a
mes, cada uno comparado con el anterior en puntos (▲ subió, ▼ bajó). La
acumulada se calcula compuesta (2% y 3% dan 5,06%, no 5%).

- Fuente: `GET https://api.argentinadatos.com/v1/finanzas/indices/inflacion`,
  que devuelve `[{ "fecha": "AAAA-MM-DD", "valor": 1.9 }, ...]` (fin de mes,
  % mensual del INDEC). El dato de un mes sale a mediados del siguiente.
- Está en Reportes → Período, debajo de "Lo que llama la atención", y se
  ve con cualquier período elegido (la inflación no depende de él).
- Se guarda en el teléfono y se pide **como mucho una vez por día**, al
  abrir Reportes. Si la
  API falla o no hay conexión, se usa lo guardado y la tarjeta avisa de qué
  fecha es. Tras un fallo, no se reintenta antes de una hora.
- **Cargar o corregir un mes a mano** (últimos 12 meses cerrados): pisa al
  dato de internet, se usa también en Reportes y viaja en el archivo de
  Archivos y Transferencias. "Usar el de internet" lo deshace.
- Código: `src/inflacion/`.

## Reportes

Módulo aparte (`src/reportes/`): sólo lee los datos de la app, nunca los
escribe, y nada del resto depende de él. Si se borra la carpeta y la pestaña
en `App.tsx`, la app queda igual, salvo que la tarjeta de Inflación deja de
verse. La tarjeta es de `src/inflacion/` y es lo único en la pantalla de Reportes
que guarda algo (las correcciones a mano de un mes).

**Período** (este mes, mes pasado, últimos 3, 6 o 12 meses):

| Reporte | Cómo se calcula |
| --- | --- |
| Resumen | Gastado, entrado, cuánto te quedó y qué porcentaje. "Este mes" se compara contra el mes pasado **hasta el mismo día**; los demás, contra el período anterior de igual largo. Si la app no tenía datos de todo ese período anterior, no compara. |
| Lo que llama la atención | Hasta 6 frases, de la más importante a la menos. Ver abajo. Sólo aparece lo que tiene datos suficientes. |
| Inflación | La tarjeta de inflación (ver arriba). |
| En qué se fue / De dónde salió | Gasto por categoría (con variación) y por cuenta. |
| Los gastos más grandes | Los 5 mayores del período. |

Las frases de "Lo que llama la atención", en orden de prioridad:

| Frase | Cuándo sale |
| --- | --- |
| ⚠️ Una cuenta en negativo | Sólo en "Este mes": casi siempre falta cargar un ingreso o una transferencia. |
| 🎯 Te pasaste del tope / respetaste los topes | Períodos de un mes, topes por mes. "Respetaste" sólo en "Mes pasado" (con el mes en curso todavía no se sabe). Usa los topes de hoy. |
| 📈 La categoría que más subió | Contra el período anterior, si subió 10% o más. |
| 🧮 Descontando la inflación | Gasto del período contra el anterior en pesos de un mismo mes. Sólo si todos los meses ya tienen inflación publicada (con "Este mes" nunca). |
| 🧾 Un solo gasto que se llevó mucho | El gasto más grande, si es 25% o más del total y hay 4 gastos o más. |
| 💵 Compraste dólares | Transferencias de pesos a dólares en el período: a cuánto pagaste en promedio contra el dólar de hoy. |
| 📉 La categoría que más bajó | Si bajó 10% o más. |
| 🐜 Gasto hormiga | 5 gastos o más de menos de US$ 5 que sumen 5% o más del total. |
| 🏷️ Gastos sin categoría | Cuántos y cuánto suman. |
| 💸 Efectivo y la inflación | Sólo en "Este mes": cuánto pierde por mes la plata en cuentas de efectivo en pesos con la última inflación, si es más de US$ 1. |
| 💳 De qué cuenta sale la plata | Si una cuenta pone el 50% o más y tenés más de una. |
| 🌱 Racha sin gastar | La racha más larga, de 3 días o más, contando desde que empezaste a usar la app. |

**Tendencias** (últimos 6 meses), en tres unidades:

- **Pesos**: nominales.
- **Pesos de hoy**: ajustados con la inflación mensual del INDEC hasta el
  último mes publicado. Los meses todavía sin dato no se ajustan.
- **Dólares**: cada mes al dólar promedio de ese mes (la casa elegida en
  Ajustes). Lo gastado desde cuentas en dólares va directo.

Más la tasa de ahorro mes a mes, tu **patrimonio en dólares** al cierre de
cada mes y **tus dólares**: a cuánto los compraste en promedio, cuánto valen
hoy y si le ganaron a la inflación.

Fuente de inflación y dólar histórico:
[api.argentinadatos.com](https://argentinadatos.com). Se baja al abrir
Reportes, como mucho cada 12 h, y queda en un caché propio del módulo para
usar sin conexión.

## Proyectos y Notas

Módulo aparte (`src/proyectos/`), en la pestaña **Proyectos**, con dos vistas
separadas arriba: **Proyectos** y **Notas**. No toca cuentas, categorías ni
movimientos: un proyecto no se une con los gastos reales.

**Proyectos**

- Tarjetas con nombre, ícono, presupuesto y barra de avance. Los
  **terminados** se archivan abajo, plegados; no se borran.
- Presupuesto opcional, en **pesos o dólares**. Los montos de los objetivos
  van en la misma moneda.
- **Objetivos**: lista con tilde y monto opcional ("Cubiertas — $ 400.000").
  Carga rápida: texto, monto y Enter.
- **Avance**: "3 de 5 objetivos hechos" y "$ 490.000 de $ 1.200.000 ya
  cubiertos" (suma de los objetivos tildados). Con presupuesto, la barra
  mide la plata cubierta; sin presupuesto, los objetivos hechos. Avisa
  cuánto falta y si los objetivos suman más que el presupuesto.
- **Estado**: activo, pausado o terminado.
- **Notas del proyecto**: iguales a las sueltas, pero sólo se ven adentro
  de ese proyecto.
- Borrar un proyecto (para errores) se lleva sus objetivos y notas, y se
  puede deshacer desde el aviso.

**Notas** (estilo Todoist)

| Qué | Cómo |
| --- | --- |
| Carga rápida | Escribís y Enter. `#etiqueta` la etiqueta y `!1` / `!2` le pone prioridad alta / media: "Pagar patente #auto !1". |
| Hecha | El círculo la tilda; las hechas bajan a "Hechas", plegado. El aviso tiene Deshacer. |
| Fecha | Opcional: Hoy, Mañana, En una semana o cualquier día. Las vencidas dicen "⚠️ Vencida", no sólo en rojo. |
| Prioridad | Normal, media o alta: se ve en el círculo y en palabras. |
| Fijar | 📌 arriba de todo. |
| Detalle | Texto largo con renglones; en la lista se ve el primero. |
| Etiquetas | Fichas arriba para filtrar. |
| Buscador | Busca en texto, detalle y etiquetas, sin importar acentos. |

Orden de las pendientes: vencidas, después prioridad, fecha (las sin fecha
al final) y la más nueva.

## Archivos y Transferencias

En Ajustes. Un archivo con **toda** la billetera: movimientos, cuentas,
categorías, presupuestos y ajustes.

- **Guardar archivo**: un toque. En el iPhone abre Compartir → "Guardar en
  Archivos" → iCloud Drive. La app te recuerda si pasa una semana sin
  guardar.
- **Cargar archivo** en una billetera **vacía** (recién instalada): carga
  todo directo y queda **idéntica** a la del archivo, con las mismas cuentas
  y categorías (las de ejemplo se reemplazan, no se duplican).
- **Cargar archivo** en una billetera **con movimientos**: muestra qué trae
  el archivo y pregunta:
  - **Reemplazar todo**: queda idéntica al archivo; lo de antes se borra.
  - **Sumar lo nuevo**: merge por id, gana la versión editada más
    recientemente. Para recuperar un archivo de esta misma billetera.
- Un archivo dañado o de otra app se rechaza entero: no se carga nada a
  medias.
- Desde la versión 2 del archivo viajan también proyectos, objetivos y
  notas. Un archivo viejo (versión 1) se sigue cargando y **no borra** los
  proyectos ni las notas de esta billetera. Una app vieja rechaza un archivo
  2 en vez de perder las notas sin avisar.

Para pasar la billetera a otro teléfono: Guardar archivo en el viejo →
abrir la Billetera en el nuevo → Ajustes → Cargar archivo.

## Desarrollo

```bash
npm install
npm run dev        # servidor local
npm test           # tests de dominio y persistencia
npm run typecheck
npm run build      # queda en dist/
```

Cada push a `main` corre los tests y publica en GitHub Pages
(`.github/workflows/deploy.yml`). Hay que activarlo una vez: Settings →
Pages → Source: **GitHub Actions**.

| Carpeta | Qué hay |
| --- | --- |
| `src/dominio/` | Reglas puras: tipos, montos, fechas, saldos, presupuestos, validación. |
| `src/datos/` | Dexie (IndexedDB), repositorio, respaldo, cotización. |
| `src/reportes/` | El módulo de Reportes, completo: cálculos, históricos, gráficos, pantalla, estilos y tests. |
| `src/proyectos/` | Proyectos y Notas: tipos, cálculos, repositorio, pantalla, estilos y tests. Sus tablas son la versión 2 de la base. |
| `src/pantallas/`, `src/componentes/` | La interfaz. |
| `src/pruebas/` | Tests contra el Dexie real sobre una IndexedDB en memoria. |

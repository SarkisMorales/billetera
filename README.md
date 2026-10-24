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

## Las cuatro pantallas

| Pantalla | Qué muestra |
| --- | --- |
| Inicio | Patrimonio total en pesos y dólares (con un ojito para ocultar los montos), lo que entró y gastaste en el mes, saldo por cuenta, gasto por categoría con presupuesto y proyección a fin de mes. |
| Movimientos | Mes por mes, agrupado por día, con buscador y filtro por cuenta y categoría. Tocás uno para editarlo o borrarlo. |
| Reportes | Cruza cuentas, categorías, movimientos, dólar e inflación. Ver abajo. |
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

Cotización: [dolarapi.com](https://dolarapi.com), se actualiza como mucho
una vez por hora, al abrir la app o al volver la señal.

## Reportes

Módulo aparte (`src/reportes/`): sólo lee los datos de la app, nunca los
escribe, y nada del resto depende de él. Si se borra la carpeta y la pestaña
en `App.tsx`, la app queda igual.

**Período** (este mes, mes pasado, últimos 3, 6 o 12 meses):

| Reporte | Cómo se calcula |
| --- | --- |
| Resumen | Gastado, entrado, cuánto te quedó y qué porcentaje. "Este mes" se compara contra el mes pasado **hasta el mismo día**; los demás, contra el período anterior de igual largo. Si la app no tenía datos de todo ese período anterior, no compara. |
| Lo que llama la atención | La categoría que más subió, el día de la semana más caro, el gasto hormiga (gastos de menos de US$ 5 a la cotización de hoy), de qué cuenta sale la plata y los días sin gastos. Sólo aparece lo que tiene datos suficientes. |
| Un día típico de la semana | La **mediana** de lo gastado cada lunes, martes, etc. Mediana para que el alquiler un lunes no haga parecer caros a todos los lunes. |
| En qué se fue / De dónde salió | Gasto por categoría (con variación) y por cuenta. |
| Los gastos más grandes | Los 5 mayores del período. |

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
| `src/pantallas/`, `src/componentes/` | La interfaz. |
| `src/pruebas/` | Tests contra el Dexie real sobre una IndexedDB en memoria. |

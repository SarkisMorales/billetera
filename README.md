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

## Las tres pantallas

| Pantalla | Qué muestra |
| --- | --- |
| Inicio | Patrimonio total en pesos y dólares, saldo por cuenta, lo gastado en el mes por categoría con presupuesto y proyección a fin de mes. |
| Movimientos | Mes por mes, agrupado por día, con buscador y filtro por cuenta y categoría. Tocás uno para editarlo o borrarlo. |
| Ajustes | Dólar de referencia, cuentas, categorías y presupuestos, respaldo, tema. |

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

## Respaldo

Ajustes → **Guardar respaldo** abre la hoja de Compartir: elegí "Guardar en
Archivos" → iCloud Drive. La app te recuerda si pasa una semana sin backup.
**Importar** hace merge por id: gana la versión editada más recientemente,
así que importar dos veces o importar un backup viejo no duplica ni pisa
nada.

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
| `src/pantallas/`, `src/componentes/` | La interfaz. |
| `src/pruebas/` | Tests contra el Dexie real sobre una IndexedDB en memoria. |

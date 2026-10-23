import { convertir } from './dinero';
import { diasDelMes, mesDe } from './fechas';
import type { Ajustes, Categoria, Centavos, Cuenta, Movimiento } from './tipos';

/**
 * Pesos por dólar que usa la app ahora: el manual si lo cargaste, si no la
 * venta de la casa elegida en la última bajada. Null si nunca hubo internet
 * ni cotización manual.
 */
export function cotizacionVigente(ajustes: Ajustes): number | null {
  if (ajustes.cotizacionManual) return ajustes.cotizacionManual;
  const c = ajustes.cotizaciones.find((x) => x.casa === ajustes.casa);
  return c ? c.venta : null;
}

function vivos(movimientos: Movimiento[]): Movimiento[] {
  return movimientos.filter((m) => !m.borrado);
}

/** Saldo de cada cuenta, en su propia moneda. */
export function saldos(cuentas: Cuenta[], movimientos: Movimiento[]): Map<string, Centavos> {
  const resultado = new Map<string, Centavos>(cuentas.map((c) => [c.id, c.saldoInicial]));
  const sumar = (id: string | null, delta: Centavos) => {
    if (id && resultado.has(id)) resultado.set(id, resultado.get(id)! + delta);
  };
  for (const m of vivos(movimientos)) {
    if (m.tipo === 'ingreso') sumar(m.cuentaId, m.monto);
    else if (m.tipo === 'gasto') sumar(m.cuentaId, -m.monto);
    else {
      sumar(m.cuentaId, -m.monto);
      sumar(m.cuentaDestinoId, m.montoDestino ?? m.monto);
    }
  }
  return resultado;
}

export interface Patrimonio {
  pesos: Centavos;
  dolares: Centavos;
  /** Todo pasado a pesos. Null si hay dólares y no hay cotización. */
  totalEnPesos: Centavos | null;
  totalEnDolares: Centavos | null;
}

export function patrimonio(
  cuentas: Cuenta[],
  movimientos: Movimiento[],
  pesosPorDolar: number | null,
): Patrimonio {
  const s = saldos(cuentas, movimientos);
  let pesos = 0;
  let dolares = 0;
  for (const c of cuentas) {
    if (c.archivada) continue;
    const saldo = s.get(c.id) ?? 0;
    if (c.moneda === 'ARS') pesos += saldo;
    else dolares += saldo;
  }
  if (!pesosPorDolar) {
    return {
      pesos,
      dolares,
      totalEnPesos: dolares === 0 ? pesos : null,
      totalEnDolares: pesos === 0 ? dolares : null,
    };
  }
  return {
    pesos,
    dolares,
    totalEnPesos: pesos + convertir(dolares, 'USD', 'ARS', pesosPorDolar),
    totalEnDolares: dolares + convertir(pesos, 'ARS', 'USD', pesosPorDolar),
  };
}

/**
 * Un gasto o ingreso llevado a pesos. Los de cuentas en dólares usan la
 * cotización guardada el día que se cargaron; si no tienen, la vigente.
 */
export function enPesos(
  m: Movimiento,
  cuentas: Map<string, Cuenta>,
  pesosPorDolar: number | null,
): Centavos {
  const cuenta = cuentas.get(m.cuentaId);
  if (!cuenta || cuenta.moneda === 'ARS') return m.monto;
  const cotizacion = m.cotizacion ?? pesosPorDolar;
  return cotizacion ? convertir(m.monto, 'USD', 'ARS', cotizacion) : 0;
}

export interface ResumenMes {
  mes: string;
  ingresos: Centavos;
  gastos: Centavos;
  /** Gastos en pesos por categoría. */
  porCategoria: Map<string, Centavos>;
}

/**
 * Lo que entró y salió en el mes, en pesos. Las transferencias no cuentan:
 * pasar plata del banco a MP o comprar dólares no es gastar.
 */
export function resumenMes(
  mes: string,
  movimientos: Movimiento[],
  cuentas: Cuenta[],
  pesosPorDolar: number | null,
): ResumenMes {
  const porId = new Map(cuentas.map((c) => [c.id, c]));
  const resumen: ResumenMes = { mes, ingresos: 0, gastos: 0, porCategoria: new Map() };
  for (const m of vivos(movimientos)) {
    if (m.tipo === 'transferencia' || mesDe(m.fecha) !== mes) continue;
    const pesos = enPesos(m, porId, pesosPorDolar);
    if (m.tipo === 'ingreso') {
      resumen.ingresos += pesos;
    } else {
      resumen.gastos += pesos;
      const clave = m.categoriaId ?? '';
      resumen.porCategoria.set(clave, (resumen.porCategoria.get(clave) ?? 0) + pesos);
    }
  }
  return resumen;
}

export type NivelPresupuesto = 'ok' | 'cerca' | 'pasado';

export interface EstadoPresupuesto {
  categoria: Categoria;
  gastado: Centavos;
  tope: Centavos;
  proporcion: number;
  nivel: NivelPresupuesto;
}

/** Desde qué proporción del tope se avisa. */
export const UMBRAL_CERCA = 0.8;

export function estadoPresupuestos(
  categorias: Categoria[],
  resumen: ResumenMes,
): EstadoPresupuesto[] {
  return categorias
    .filter((c) => c.tipo === 'gasto' && !c.archivada && c.presupuesto && c.presupuesto > 0)
    .map((categoria) => {
      const tope = categoria.presupuesto!;
      const gastado = resumen.porCategoria.get(categoria.id) ?? 0;
      const proporcion = gastado / tope;
      const nivel: NivelPresupuesto =
        proporcion > 1 ? 'pasado' : proporcion >= UMBRAL_CERCA ? 'cerca' : 'ok';
      return { categoria, gastado, tope, proporcion, nivel };
    });
}

/**
 * A este ritmo, cuánto vas a haber gastado al final del mes. Lineal y
 * simple a propósito: alquiler y servicios caen a principio de mes y la
 * inflan los primeros días, así que antes del día 7 no se muestra.
 */
export function proyeccionGasto(resumen: ResumenMes, diaActual: number): Centavos | null {
  if (diaActual < 7) return null;
  return Math.round((resumen.gastos / diaActual) * diasDelMes(resumen.mes));
}

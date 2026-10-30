/**
 * Cálculos de los gastos fijos. Funciones puras, sin base.
 */
import { convertir } from '../dominio/dinero';
import { diaYMes, diasDelMes, diasIncluidos, mesDe, sumarMeses } from '../dominio/fechas';
import type { Centavos, Cuenta } from '../dominio/tipos';
import type { Fijo } from './tipos';

/** El día `dia` de ese mes; si el mes es más corto, el último (el 31 de febrero es el 28 o 29). */
export function fechaDelMes(mes: string, dia: number): string {
  return `${mes}-${String(Math.min(dia, diasDelMes(mes))).padStart(2, '0')}`;
}

/** El vencimiento que sigue a `fecha`, `cadaMeses` meses después, en el día del fijo. */
export function siguienteVencimiento(fecha: string, dia: number, cadaMeses: number): string {
  return fechaDelMes(sumarMeses(mesDe(fecha), cadaMeses), dia);
}

/** El primer vencimiento desde `desde` (inclusive): este mes si todavía no pasó el día, si no el que viene. */
export function primerVencimiento(desde: string, dia: number): string {
  const esteMes = fechaDelMes(mesDe(desde), dia);
  return esteMes >= desde ? esteMes : fechaDelMes(sumarMeses(mesDe(desde), 1), dia);
}

const vivos = (fijos: Fijo[]) => fijos.filter((f) => !f.borrado && f.activo);

/** Los que ya vencieron (o vencen hoy) y esperan que los confirmes o saltees. El más viejo primero. */
export function paraConfirmar(fijos: Fijo[], hoyStr: string): Fijo[] {
  return vivos(fijos)
    .filter((f) => f.proxima <= hoyStr)
    .sort((a, b) => a.proxima.localeCompare(b.proxima) || a.nota.localeCompare(b.nota));
}

/** Los que vencen en los próximos `dias` días (sin contar hoy). */
export function proximos(fijos: Fijo[], hoyStr: string, dias = 7): Fijo[] {
  return vivos(fijos)
    .filter((f) => f.proxima > hoyStr && diasIncluidos(hoyStr, f.proxima) - 1 <= dias)
    .sort((a, b) => a.proxima.localeCompare(b.proxima));
}

/**
 * Cuánto falta pagar de gastos fijos hasta fin de mes (incluye los vencidos
 * sin confirmar), en pesos. Los de cuentas en dólares, a la cotización de hoy.
 */
export function faltaPagarEsteMes(
  fijos: Fijo[],
  cuentas: Cuenta[],
  hoyStr: string,
  pesosPorDolar: number | null,
): { total: Centavos; cuantos: number } {
  const finDeMes = fechaDelMes(mesDe(hoyStr), 31);
  const porId = new Map(cuentas.map((c) => [c.id, c]));
  let total = 0;
  let cuantos = 0;
  for (const f of vivos(fijos)) {
    if (f.tipo !== 'gasto' || f.proxima > finDeMes) continue;
    const moneda = porId.get(f.cuentaId)?.moneda ?? 'ARS';
    if (moneda === 'USD' && !pesosPorDolar) continue;
    total += moneda === 'USD' ? convertir(f.monto, 'USD', 'ARS', pesosPorDolar!) : f.monto;
    cuantos++;
  }
  return { total, cuantos };
}

/** "vence hoy", "venció ayer", "venció el 1/10", "vence mañana", "vence el 5/11". */
export function textoVencimiento(proxima: string, hoyStr: string): string {
  const dias = diasIncluidos(hoyStr, proxima) - 1;
  if (dias === 0) return 'vence hoy';
  if (dias === -1) return 'venció ayer';
  if (dias < 0) return `venció el ${diaYMes(proxima)}`;
  if (dias === 1) return 'vence mañana';
  return `vence el ${diaYMes(proxima)}`;
}

export function nombreFrecuencia(cadaMeses: number): string {
  return (
    { 1: 'todos los meses', 2: 'cada 2 meses', 3: 'cada 3 meses', 6: 'cada 6 meses', 12: 'una vez por año' } as Record<
      number,
      string
    >
  )[cadaMeses] ?? `cada ${cadaMeses} meses`;
}

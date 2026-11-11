import { enPesos } from '../dominio/calculos';
import { sumarDias } from '../dominio/fechas';
import type { Centavos, Cuenta, Movimiento } from '../dominio/tipos';

/** Día en que arranca la semana: 0 domingo, 1 lunes … 6 sábado (como `Date.getDay()`). */
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Si nunca se tocó el ajuste, la semana va de lunes a domingo. */
export const INICIO_POR_DEFECTO: DiaSemana = 1;

/** En el orden en que se muestran en Ajustes: de lunes a domingo. */
export const DIAS_SEMANA: { dia: DiaSemana; corto: string; nombre: string }[] = [
  { dia: 1, corto: 'Lun', nombre: 'lunes' },
  { dia: 2, corto: 'Mar', nombre: 'martes' },
  { dia: 3, corto: 'Mié', nombre: 'miércoles' },
  { dia: 4, corto: 'Jue', nombre: 'jueves' },
  { dia: 5, corto: 'Vie', nombre: 'viernes' },
  { dia: 6, corto: 'Sáb', nombre: 'sábado' },
  { dia: 0, corto: 'Dom', nombre: 'domingo' },
];

export function nombreDiaSemana(dia: DiaSemana): string {
  return DIAS_SEMANA.find((d) => d.dia === dia)!.nombre;
}

/** Lo guardado en ajustes, o lunes si no hay nada o el valor no sirve. */
export function inicioElegido(valor: number | null | undefined): DiaSemana {
  return Number.isInteger(valor) && valor! >= 0 && valor! <= 6 ? (valor as DiaSemana) : INICIO_POR_DEFECTO;
}

function diaDeLaSemana(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(a, m - 1, d).getDay();
}

/** Desde qué día y hasta cuál va la semana en la que cae `hoy`. */
export function semanaDe(hoy: string, inicio: DiaSemana): { desde: string; hasta: string } {
  const atras = (diaDeLaSemana(hoy) - inicio + 7) % 7;
  const desde = sumarDias(hoy, -atras);
  return { desde, hasta: sumarDias(desde, 6) };
}

/**
 * Lo gastado en la semana de `hoy`, en pesos. Igual que el mes: las
 * transferencias no cuentan, y los gastos en dólares van con la cotización
 * del día en que se cargaron.
 */
export function gastoDeLaSemana(
  movimientos: Movimiento[],
  cuentas: Cuenta[],
  pesosPorDolar: number | null,
  hoy: string,
  inicio: DiaSemana,
): { desde: string; hasta: string; gastado: Centavos } {
  const { desde, hasta } = semanaDe(hoy, inicio);
  const porId = new Map(cuentas.map((c) => [c.id, c]));
  let gastado = 0;
  for (const m of movimientos) {
    if (m.borrado || m.tipo !== 'gasto' || m.fecha < desde || m.fecha > hasta) continue;
    gastado += enPesos(m, porId, pesosPorDolar);
  }
  return { desde, hasta, gastado };
}

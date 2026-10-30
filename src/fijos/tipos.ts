import type { Centavos } from '../dominio/tipos';

/**
 * Un gasto o ingreso que se repite: alquiler, luz, Netflix, el sueldo.
 * No se carga solo: cuando vence aparece en el Inicio "para confirmar",
 * porque con inflación el monto cambia y hay que poder corregirlo.
 */
export interface Fijo {
  id: string;
  tipo: 'gasto' | 'ingreso';
  /** "Alquiler", "Netflix". Es la nota del movimiento que se carga. */
  nota: string;
  /** Lo que se espera pagar, en la moneda de la cuenta. Se actualiza con lo último que confirmaste. */
  monto: Centavos;
  cuentaId: string;
  categoriaId: string;
  /** Día del mes en que vence, 1 a 31. En un mes más corto, el último día. */
  dia: number;
  /** 1 todos los meses, 2 bimestral, 3 trimestral, 6 semestral, 12 una vez por año. */
  cadaMeses: number;
  /** El próximo vencimiento todavía sin confirmar ni saltear, `AAAA-MM-DD`. */
  proxima: string;
  /** Pausado: no aparece para confirmar, pero no se pierde. */
  activo: boolean;
  borrado: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

export const FRECUENCIAS: { cadaMeses: number; nombre: string }[] = [
  { cadaMeses: 1, nombre: 'Todos los meses' },
  { cadaMeses: 2, nombre: 'Cada 2 meses' },
  { cadaMeses: 3, nombre: 'Cada 3 meses' },
  { cadaMeses: 6, nombre: 'Cada 6 meses' },
  { cadaMeses: 12, nombre: 'Una vez por año' },
];

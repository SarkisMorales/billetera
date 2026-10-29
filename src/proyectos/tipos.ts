import type { Centavos, Moneda } from '../dominio/tipos';

/**
 * Proyectos y Notas. Módulo aparte: no toca cuentas, categorías ni
 * movimientos, y nada de la billetera depende de él. Lo único que comparte
 * es la base (tablas propias) y el archivo de Archivos y Transferencias.
 *
 * Igual que los movimientos: plata en centavos enteros y borrado lógico,
 * para que un archivo viejo no reviva lo que borraste.
 */

/** Los terminados se archivan: no se borran, quedan en "Terminados". */
export type EstadoProyecto = 'activo' | 'pausado' | 'terminado';

export interface Proyecto {
  id: string;
  nombre: string;
  emoji: string;
  /** Moneda del presupuesto y de los montos de sus objetivos. */
  moneda: Moneda;
  /** Opcional: un proyecto puede ser sólo una lista de objetivos. */
  presupuesto: Centavos | null;
  estado: EstadoProyecto;
  orden: number;
  borrado: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

export interface Objetivo {
  id: string;
  proyectoId: string;
  texto: string;
  /** En la moneda del proyecto. Opcional: "Sacar turno" no cuesta nada. */
  monto: Centavos | null;
  hecho: boolean;
  orden: number;
  borrado: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

/** 1 alta, 2 media, 3 normal. Como en Todoist: menor número, más importante. */
export type Prioridad = 1 | 2 | 3;

export interface Nota {
  id: string;
  /** Null: nota suelta. Si no, sólo se ve adentro de ese proyecto. */
  proyectoId: string | null;
  texto: string;
  /** Texto largo opcional, con renglones. */
  detalle: string;
  /** En minúscula y sin el "#". */
  etiquetas: string[];
  /** Para cuándo, `AAAA-MM-DD`. */
  fecha: string | null;
  prioridad: Prioridad;
  /** Fijada arriba (📌). */
  fijada: boolean;
  hecha: boolean;
  hechaEn: string | null;
  borrado: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

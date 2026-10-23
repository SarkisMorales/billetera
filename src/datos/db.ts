import Dexie, { type EntityTable } from 'dexie';
import type { Ajustes, Categoria, Cuenta, Movimiento } from '../dominio/tipos';

export class BilleteraDB extends Dexie {
  cuentas!: EntityTable<Cuenta, 'id'>;
  categorias!: EntityTable<Categoria, 'id'>;
  movimientos!: EntityTable<Movimiento, 'id'>;
  ajustes!: EntityTable<Ajustes, 'id'>;

  constructor(nombre = 'billetera') {
    super(nombre);
    this.version(1).stores({
      // Los índices son sólo para buscar/ordenar; el resto de los campos
      // igual se guarda completo.
      cuentas: 'id, orden',
      categorias: 'id, tipo, orden',
      movimientos: 'id, fecha, cuentaId, cuentaDestinoId, categoriaId, creadoEn',
      ajustes: 'id',
    });
  }
}

export const db = new BilleteraDB();

/**
 * Le pide al navegador que no borre la base cuando le falte espacio.
 * En Safari/iPhone es importante: sin esto, IndexedDB de un sitio que no se
 * usa hace un tiempo puede ser eliminado automáticamente.
 */
export async function pedirAlmacenamientoPersistente(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

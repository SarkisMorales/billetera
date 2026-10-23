import type { BilleteraDB } from './db';
import { db as dbPorDefecto } from './db';
import type { Ajustes, Categoria, Cuenta, Movimiento } from '../dominio/tipos';

export const VERSION_RESPALDO = 1;

export interface Respaldo {
  version: number;
  app: 'billetera';
  exportadoEn: string;
  cuentas: Cuenta[];
  categorias: Categoria[];
  movimientos: Movimiento[];
  ajustes: Ajustes | null;
}

export interface ResumenImportacion {
  nuevos: number;
  actualizados: number;
  ignorados: number;
}

export async function exportar(db: BilleteraDB = dbPorDefecto): Promise<Respaldo> {
  const [cuentas, categorias, movimientos, ajustes] = await Promise.all([
    db.cuentas.toArray(),
    db.categorias.toArray(),
    db.movimientos.toArray(),
    db.ajustes.get('unico'),
  ]);
  return {
    version: VERSION_RESPALDO,
    app: 'billetera',
    exportadoEn: new Date().toISOString(),
    cuentas,
    categorias,
    movimientos,
    ajustes: ajustes ?? null,
  };
}

/**
 * Import por merge, no destructivo. Cuentas, categorías y movimientos se
 * cruzan por `id`: gana el que tenga `actualizadoEn` más reciente. Así
 * importar un backup viejo no pisa lo que cargaste después, e importar el
 * mismo archivo dos veces no duplica nada.
 *
 * Los movimientos borrados viajan en el backup con `borrado: true` justamente
 * para esto: si no, un backup anterior al borrado los haría reaparecer.
 *
 * Los ajustes sólo se toman si localmente no hay nada configurado.
 */
export async function importar(
  datos: unknown,
  db: BilleteraDB = dbPorDefecto,
): Promise<ResumenImportacion> {
  const respaldo = validarRespaldo(datos);
  const resumen: ResumenImportacion = { nuevos: 0, actualizados: 0, ignorados: 0 };

  async function fusionar<T extends { id: string; actualizadoEn: string }>(
    tabla: { get(id: string): Promise<T | undefined>; put(x: T): Promise<unknown> },
    entrantes: T[],
  ) {
    for (const entrante of entrantes) {
      const local = await tabla.get(entrante.id);
      if (!local) {
        await tabla.put(entrante);
        resumen.nuevos++;
      } else if (entrante.actualizadoEn > local.actualizadoEn) {
        await tabla.put(entrante);
        resumen.actualizados++;
      } else {
        resumen.ignorados++;
      }
    }
  }

  await db.transaction('rw', [db.cuentas, db.categorias, db.movimientos, db.ajustes], async () => {
    await fusionar<Cuenta>(db.cuentas, respaldo.cuentas);
    await fusionar<Categoria>(db.categorias, respaldo.categorias);
    await fusionar<Movimiento>(db.movimientos, respaldo.movimientos);
    if (respaldo.ajustes && !(await db.ajustes.get('unico'))) {
      await db.ajustes.put(respaldo.ajustes);
    }
  });

  return resumen;
}

function validarRespaldo(datos: unknown): Respaldo {
  if (typeof datos !== 'object' || datos === null) {
    throw new Error('El archivo no tiene el formato esperado.');
  }
  const r = datos as Partial<Respaldo>;
  if (r.app !== 'billetera') {
    throw new Error('Ese archivo no es un respaldo de la Billetera.');
  }
  if (!Array.isArray(r.cuentas) || !Array.isArray(r.categorias) || !Array.isArray(r.movimientos)) {
    throw new Error('Al archivo le faltan cuentas, categorías o movimientos.');
  }
  if (typeof r.version !== 'number' || r.version > VERSION_RESPALDO) {
    throw new Error('El archivo viene de una versión más nueva de la app.');
  }
  return {
    version: r.version,
    app: 'billetera',
    exportadoEn: r.exportadoEn ?? new Date().toISOString(),
    cuentas: r.cuentas,
    categorias: r.categorias,
    movimientos: r.movimientos,
    ajustes: r.ajustes ?? null,
  };
}

/** Borra todo. Sólo desde ajustes, con confirmación escrita. */
export async function borrarTodo(db: BilleteraDB = dbPorDefecto): Promise<void> {
  await db.transaction('rw', [db.cuentas, db.categorias, db.movimientos, db.ajustes], async () => {
    await Promise.all([
      db.cuentas.clear(),
      db.categorias.clear(),
      db.movimientos.clear(),
      db.ajustes.clear(),
    ]);
  });
}

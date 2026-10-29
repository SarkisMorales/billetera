import type { BilleteraDB } from './db';
import { db as dbPorDefecto } from './db';
import type { Ajustes, Categoria, Cuenta, Movimiento } from '../dominio/tipos';
import type { Nota, Objetivo, Proyecto } from '../proyectos/tipos';

/**
 * 2: suma proyectos, objetivos y notas. Una app vieja rechaza un archivo 2
 * en vez de cargarlo y perder las notas sin avisar. Los archivos 1 se siguen
 * cargando.
 */
export const VERSION_RESPALDO = 2;

export interface Respaldo {
  version: number;
  app: 'billetera';
  exportadoEn: string;
  cuentas: Cuenta[];
  categorias: Categoria[];
  movimientos: Movimiento[];
  ajustes: Ajustes | null;
  /** Desde la versión 2. Un archivo 1 no los trae: no dice nada de ellos. */
  proyectos?: Proyecto[];
  objetivos?: Objetivo[];
  notas?: Nota[];
}

/** Las tablas de Proyectos y Notas, para las transacciones. */
const tablasProyectos = (db: BilleteraDB) => [db.proyectos, db.objetivos, db.notas];

export interface ResumenImportacion {
  nuevos: number;
  actualizados: number;
  ignorados: number;
}

export async function exportar(db: BilleteraDB = dbPorDefecto): Promise<Respaldo> {
  const [cuentas, categorias, movimientos, ajustes, proyectos, objetivos, notas] = await Promise.all([
    db.cuentas.toArray(),
    db.categorias.toArray(),
    db.movimientos.toArray(),
    db.ajustes.get('unico'),
    db.proyectos.toArray(),
    db.objetivos.toArray(),
    db.notas.toArray(),
  ]);
  return {
    version: VERSION_RESPALDO,
    app: 'billetera',
    exportadoEn: new Date().toISOString(),
    cuentas,
    categorias,
    movimientos,
    ajustes: ajustes ?? null,
    proyectos,
    objetivos,
    notas,
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

  await db.transaction('rw', [db.cuentas, db.categorias, db.movimientos, db.ajustes, ...tablasProyectos(db)], async () => {
    await fusionar<Cuenta>(db.cuentas, respaldo.cuentas);
    await fusionar<Categoria>(db.categorias, respaldo.categorias);
    await fusionar<Movimiento>(db.movimientos, respaldo.movimientos);
    await fusionar<Proyecto>(db.proyectos, respaldo.proyectos ?? []);
    await fusionar<Objetivo>(db.objetivos, respaldo.objetivos ?? []);
    await fusionar<Nota>(db.notas, respaldo.notas ?? []);
    if (respaldo.ajustes && !(await db.ajustes.get('unico'))) {
      await db.ajustes.put(respaldo.ajustes);
    }
  });

  return resumen;
}

/* ---------- Validación ---------- */

const esTexto = (x: unknown) => typeof x === 'string';
const esEntero = (x: unknown) => Number.isInteger(x);

/**
 * Lo mínimo para que un registro no rompa la app. Si un solo registro está
 * mal, se rechaza el archivo entero: cargar la mitad sería peor que nada.
 */
function cuentaValida(c: Partial<Cuenta>): boolean {
  return esTexto(c.id) && esTexto(c.nombre) && (c.moneda === 'ARS' || c.moneda === 'USD') &&
    esEntero(c.saldoInicial) && esTexto(c.actualizadoEn);
}

function categoriaValida(c: Partial<Categoria>): boolean {
  return esTexto(c.id) && esTexto(c.nombre) && (c.tipo === 'gasto' || c.tipo === 'ingreso') &&
    esTexto(c.actualizadoEn);
}

function movimientoValido(m: Partial<Movimiento>): boolean {
  return esTexto(m.id) && ['gasto', 'ingreso', 'transferencia'].includes(m.tipo as string) &&
    esTexto(m.fecha) && /^\d{4}-\d{2}-\d{2}$/.test(m.fecha!) && esEntero(m.monto) &&
    esTexto(m.cuentaId) && esTexto(m.actualizadoEn);
}

function proyectoValido(p: Partial<Proyecto>): boolean {
  return esTexto(p.id) && esTexto(p.nombre) && (p.moneda === 'ARS' || p.moneda === 'USD') &&
    (p.presupuesto === null || esEntero(p.presupuesto)) &&
    ['activo', 'pausado', 'terminado'].includes(p.estado as string) && esTexto(p.actualizadoEn);
}

function objetivoValido(o: Partial<Objetivo>): boolean {
  return esTexto(o.id) && esTexto(o.proyectoId) && esTexto(o.texto) && (o.monto === null || esEntero(o.monto)) &&
    esTexto(o.actualizadoEn);
}

function notaValida(n: Partial<Nota>): boolean {
  return esTexto(n.id) && (n.proyectoId === null || esTexto(n.proyectoId)) && esTexto(n.texto) &&
    Array.isArray(n.etiquetas) && n.etiquetas.every(esTexto) &&
    (n.fecha === null || (esTexto(n.fecha) && /^\d{4}-\d{2}-\d{2}$/.test(n.fecha!))) &&
    [1, 2, 3].includes(n.prioridad as number) && esTexto(n.actualizadoEn);
}

/** Una lista opcional: si no está, undefined; si está, tiene que ser válida entera. */
function listaOpcional<T>(x: unknown, valido: (y: Partial<T>) => boolean): T[] | undefined | false {
  if (x === undefined) return undefined;
  return Array.isArray(x) && x.every(valido) ? (x as T[]) : false;
}

function validarRespaldo(datos: unknown): Respaldo {
  if (typeof datos !== 'object' || datos === null) {
    throw new Error('El archivo no tiene el formato esperado.');
  }
  const r = datos as Partial<Respaldo>;
  if (r.app !== 'billetera') {
    throw new Error('Ese archivo no es de la Billetera.');
  }
  if (!Array.isArray(r.cuentas) || !Array.isArray(r.categorias) || !Array.isArray(r.movimientos)) {
    throw new Error('Al archivo le faltan cuentas, categorías o movimientos.');
  }
  if (typeof r.version !== 'number' || r.version > VERSION_RESPALDO) {
    throw new Error('El archivo viene de una versión más nueva de la app. Actualizá esta billetera primero.');
  }
  const proyectos = listaOpcional<Proyecto>(r.proyectos, proyectoValido);
  const objetivos = listaOpcional<Objetivo>(r.objetivos, objetivoValido);
  const notas = listaOpcional<Nota>(r.notas, notaValida);
  if (
    !r.cuentas.every(cuentaValida) || !r.categorias.every(categoriaValida) || !r.movimientos.every(movimientoValido) ||
    proyectos === false || objetivos === false || notas === false
  ) {
    throw new Error('El archivo está dañado: tiene registros incompletos. No se cargó nada.');
  }
  return {
    version: r.version,
    app: 'billetera',
    exportadoEn: r.exportadoEn ?? new Date().toISOString(),
    cuentas: r.cuentas,
    categorias: r.categorias,
    movimientos: r.movimientos,
    ajustes: r.ajustes ?? null,
    // Las tres juntas: un archivo con proyectos sin sus objetivos no existe.
    ...(proyectos || objetivos || notas
      ? { proyectos: proyectos ?? [], objetivos: objetivos ?? [], notas: notas ?? [] }
      : {}),
  };
}

/** Lee el texto de un archivo y lo valida. Tira un error en castellano si no sirve. */
export function leerArchivo(texto: string): Respaldo {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error('Ese archivo no es de la Billetera (no se puede leer).');
  }
  return validarRespaldo(datos);
}

export interface ContenidoArchivo {
  exportadoEn: string;
  cuentas: number;
  categorias: number;
  movimientos: number;
  proyectos: number;
  notas: number;
}

/** Qué trae un archivo, para mostrarlo antes de cargarlo. Los borrados no cuentan. */
export function contenido(r: Respaldo): ContenidoArchivo {
  return {
    exportadoEn: r.exportadoEn,
    cuentas: r.cuentas.filter((c) => !c.archivada).length,
    categorias: r.categorias.filter((c) => !c.archivada).length,
    movimientos: r.movimientos.filter((m) => !m.borrado).length,
    proyectos: (r.proyectos ?? []).filter((p) => !p.borrado).length,
    notas: (r.notas ?? []).filter((n) => !n.borrado).length,
  };
}

/** Movimientos cargados (sin contar los borrados). Cero = billetera recién instalada. */
export function contarMovimientos(db: BilleteraDB = dbPorDefecto): Promise<number> {
  return db.movimientos.filter((m) => !m.borrado).count();
}

/** Lo que hay en esta billetera, para saber si está vacía y avisar qué se pierde al reemplazar. */
export async function contenidoLocal(
  db: BilleteraDB = dbPorDefecto,
): Promise<{ movimientos: number; proyectos: number; notas: number }> {
  const [movimientos, proyectos, notas] = await Promise.all([
    contarMovimientos(db),
    db.proyectos.filter((p) => !p.borrado).count(),
    db.notas.filter((n) => !n.borrado).count(),
  ]);
  return { movimientos, proyectos, notas };
}

/**
 * Deja esta billetera idéntica a la del archivo: borra todo lo que hay y
 * carga lo del archivo, con los mismos ids. Es lo que se usa para pasar la
 * billetera a otro teléfono: las cuentas y categorías de ejemplo de una
 * billetera nueva no se mezclan con las del archivo.
 *
 * Un archivo viejo (versión 1) no trae proyectos ni notas: no dice nada de
 * ellos, así que los de esta billetera se quedan como están.
 *
 * Todo en una transacción: si algo falla, queda como estaba.
 */
export async function reemplazar(datos: unknown, db: BilleteraDB = dbPorDefecto): Promise<ContenidoArchivo> {
  const r = validarRespaldo(datos);
  await db.transaction('rw', [db.cuentas, db.categorias, db.movimientos, db.ajustes, ...tablasProyectos(db)], async () => {
    const ajustesLocales = await db.ajustes.get('unico');
    await Promise.all([db.cuentas.clear(), db.categorias.clear(), db.movimientos.clear(), db.ajustes.clear()]);
    await db.cuentas.bulkPut(r.cuentas);
    await db.categorias.bulkPut(r.categorias);
    await db.movimientos.bulkPut(r.movimientos);
    const ajustes = r.ajustes ?? ajustesLocales;
    if (ajustes) await db.ajustes.put({ ...ajustes, id: 'unico' });
    if (r.proyectos && r.objetivos && r.notas) {
      await Promise.all([db.proyectos.clear(), db.objetivos.clear(), db.notas.clear()]);
      await db.proyectos.bulkPut(r.proyectos);
      await db.objetivos.bulkPut(r.objetivos);
      await db.notas.bulkPut(r.notas);
    }
  });
  return contenido(r);
}

/** Borra todo. Sólo desde ajustes, con confirmación escrita. */
export async function borrarTodo(db: BilleteraDB = dbPorDefecto): Promise<void> {
  await db.transaction('rw', [db.cuentas, db.categorias, db.movimientos, db.ajustes, ...tablasProyectos(db)], async () => {
    await Promise.all([
      db.cuentas.clear(),
      db.categorias.clear(),
      db.movimientos.clear(),
      db.ajustes.clear(),
      db.proyectos.clear(),
      db.objetivos.clear(),
      db.notas.clear(),
    ]);
  });
}

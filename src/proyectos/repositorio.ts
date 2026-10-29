import type { BilleteraDB } from '../datos/db';
import { db as dbPorDefecto } from '../datos/db';
import { ErrorDeValidacion, type Reloj } from '../datos/repositorio';
import { leerEtiquetas } from './calculos';
import type { EstadoProyecto, Nota, Objetivo, Prioridad, Proyecto } from './tipos';

const relojReal: Reloj = {
  ahora: () => new Date().toISOString(),
  id: () => crypto.randomUUID(),
};

export type DatosProyecto = Pick<Proyecto, 'nombre' | 'emoji' | 'moneda' | 'presupuesto'>;
export type CambiosProyecto = Partial<DatosProyecto & { estado: EstadoProyecto }>;
export type DatosObjetivo = Pick<Objetivo, 'texto' | 'monto'>;
export type DatosNota = Pick<Nota, 'texto'> &
  Partial<Pick<Nota, 'proyectoId' | 'detalle' | 'etiquetas' | 'fecha' | 'prioridad' | 'fijada'>>;
export type CambiosNota = Partial<Omit<DatosNota, 'proyectoId'> & { hecha: boolean }>;

function validarMonto(monto: number | null | undefined, que: string) {
  if (monto === null || monto === undefined) return;
  if (!Number.isInteger(monto) || monto <= 0) throw new ErrorDeValidacion(`${que} tiene que ser un monto mayor a cero.`);
}

function validarFecha(fecha: string | null | undefined) {
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new ErrorDeValidacion('La fecha no es válida.');
}

function validarPrioridad(p: Prioridad | undefined) {
  if (p !== undefined && ![1, 2, 3].includes(p)) throw new ErrorDeValidacion('La prioridad no es válida.');
}

/**
 * Lo que se guarda de Proyectos y Notas. Mismas reglas que el resto de la
 * billetera: montos en centavos enteros, borrado lógico y `actualizadoEn`
 * en cada cambio, para que "Sumar lo nuevo" sepa cuál versión gana.
 */
export class RepositorioProyectos {
  constructor(
    private db: BilleteraDB = dbPorDefecto,
    private reloj: Reloj = relojReal,
  ) {}

  /* ---------- Proyectos ---------- */

  async crearProyecto(datos: DatosProyecto): Promise<Proyecto> {
    const nombre = datos.nombre.trim();
    if (!nombre) throw new ErrorDeValidacion('El proyecto necesita un nombre.');
    validarMonto(datos.presupuesto, 'El presupuesto');
    const ahora = this.reloj.ahora();
    const proyecto: Proyecto = {
      nombre,
      emoji: datos.emoji.trim() || '📁',
      moneda: datos.moneda,
      presupuesto: datos.presupuesto ?? null,
      id: this.reloj.id(),
      estado: 'activo',
      orden: await this.db.proyectos.count(),
      borrado: false,
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    await this.db.proyectos.add(proyecto);
    return proyecto;
  }

  async editarProyecto(id: string, cambios: CambiosProyecto): Promise<void> {
    if (cambios.nombre !== undefined && !cambios.nombre.trim()) {
      throw new ErrorDeValidacion('El proyecto necesita un nombre.');
    }
    validarMonto(cambios.presupuesto, 'El presupuesto');
    const limpio = {
      ...cambios,
      ...(cambios.nombre !== undefined && { nombre: cambios.nombre.trim() }),
      ...(cambios.emoji !== undefined && { emoji: cambios.emoji.trim() || '📁' }),
    };
    await this.db.proyectos.update(id, { ...limpio, actualizadoEn: this.reloj.ahora() });
  }

  /** Borra el proyecto con sus objetivos y notas (borrado lógico). Para errores: lo terminado se archiva. */
  async borrarProyecto(id: string, borrado = true): Promise<void> {
    const ahora = this.reloj.ahora();
    await this.db.transaction('rw', [this.db.proyectos, this.db.objetivos, this.db.notas], async () => {
      await this.db.proyectos.update(id, { borrado, actualizadoEn: ahora });
      await this.db.objetivos.where('proyectoId').equals(id).modify({ borrado, actualizadoEn: ahora });
      await this.db.notas.where('proyectoId').equals(id).modify({ borrado, actualizadoEn: ahora });
    });
  }

  /* ---------- Objetivos ---------- */

  async crearObjetivo(proyectoId: string, datos: DatosObjetivo): Promise<Objetivo> {
    const texto = datos.texto.trim();
    if (!texto) throw new ErrorDeValidacion('Escribí el objetivo.');
    validarMonto(datos.monto, 'El monto');
    if (!(await this.db.proyectos.get(proyectoId))) throw new ErrorDeValidacion('Ese proyecto no existe.');
    const ahora = this.reloj.ahora();
    const objetivo: Objetivo = {
      id: this.reloj.id(),
      proyectoId,
      texto,
      monto: datos.monto ?? null,
      hecho: false,
      orden: await this.db.objetivos.where('proyectoId').equals(proyectoId).count(),
      borrado: false,
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    await this.db.objetivos.add(objetivo);
    return objetivo;
  }

  async editarObjetivo(id: string, cambios: Partial<DatosObjetivo & { hecho: boolean; borrado: boolean }>): Promise<void> {
    if (cambios.texto !== undefined && !cambios.texto.trim()) throw new ErrorDeValidacion('Escribí el objetivo.');
    validarMonto(cambios.monto, 'El monto');
    await this.db.objetivos.update(id, {
      ...cambios,
      ...(cambios.texto !== undefined && { texto: cambios.texto.trim() }),
      actualizadoEn: this.reloj.ahora(),
    });
  }

  /* ---------- Notas ---------- */

  async crearNota(datos: DatosNota): Promise<Nota> {
    const texto = datos.texto.trim();
    if (!texto) throw new ErrorDeValidacion('La nota está vacía.');
    validarFecha(datos.fecha);
    validarPrioridad(datos.prioridad);
    const ahora = this.reloj.ahora();
    const nota: Nota = {
      id: this.reloj.id(),
      proyectoId: datos.proyectoId ?? null,
      texto,
      detalle: datos.detalle?.trim() ?? '',
      etiquetas: leerEtiquetas((datos.etiquetas ?? []).join(' ')),
      fecha: datos.fecha || null,
      prioridad: datos.prioridad ?? 3,
      fijada: datos.fijada ?? false,
      hecha: false,
      hechaEn: null,
      borrado: false,
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    await this.db.notas.add(nota);
    return nota;
  }

  async editarNota(id: string, cambios: CambiosNota): Promise<void> {
    if (cambios.texto !== undefined && !cambios.texto.trim()) throw new ErrorDeValidacion('La nota está vacía.');
    validarFecha(cambios.fecha);
    validarPrioridad(cambios.prioridad);
    const ahora = this.reloj.ahora();
    await this.db.notas.update(id, {
      ...cambios,
      ...(cambios.texto !== undefined && { texto: cambios.texto.trim() }),
      ...(cambios.detalle !== undefined && { detalle: cambios.detalle.trim() }),
      ...(cambios.etiquetas !== undefined && { etiquetas: leerEtiquetas(cambios.etiquetas.join(' ')) }),
      ...(cambios.fecha !== undefined && { fecha: cambios.fecha || null }),
      ...(cambios.hecha !== undefined && { hechaEn: cambios.hecha ? ahora : null }),
      actualizadoEn: ahora,
    });
  }

  /** Borrado lógico. Con `false`, la devuelve (el "Deshacer"). */
  async borrarNota(id: string, borrado = true): Promise<void> {
    await this.db.notas.update(id, { borrado, actualizadoEn: this.reloj.ahora() });
  }
}

export const repoProyectos = new RepositorioProyectos();

import type { BilleteraDB } from './db';
import { db as dbPorDefecto } from './db';
import { cotizacionVigente } from '../dominio/calculos';
import { validarMovimiento, type DatosMovimiento } from '../dominio/validar';
import {
  AJUSTES_POR_DEFECTO,
  type Ajustes,
  type Categoria,
  type Cuenta,
  type Movimiento,
} from '../dominio/tipos';

/** Error de validación. La UI lo muestra; no es un bug. */
export class ErrorDeValidacion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeValidacion';
  }
}

export interface Reloj {
  ahora(): string;
  id(): string;
}

const relojReal: Reloj = {
  ahora: () => new Date().toISOString(),
  id: () => crypto.randomUUID(),
};

export type DatosCuenta = Pick<Cuenta, 'nombre' | 'moneda' | 'tipo' | 'saldoInicial'>;
export type DatosCategoria = Pick<Categoria, 'nombre' | 'tipo' | 'emoji' | 'presupuesto'>;

export class Repositorio {
  constructor(
    private db: BilleteraDB = dbPorDefecto,
    private reloj: Reloj = relojReal,
  ) {}

  /* ---------- Ajustes ---------- */

  async ajustes(): Promise<Ajustes> {
    return (await this.db.ajustes.get('unico')) ?? AJUSTES_POR_DEFECTO;
  }

  async guardarAjustes(cambios: Partial<Omit<Ajustes, 'id'>>): Promise<Ajustes> {
    const nuevos = { ...(await this.ajustes()), ...cambios, id: 'unico' as const };
    await this.db.ajustes.put(nuevos);
    return nuevos;
  }

  /* ---------- Cuentas ---------- */

  async crearCuenta(datos: DatosCuenta): Promise<Cuenta> {
    const nombre = datos.nombre.trim();
    if (!nombre) throw new ErrorDeValidacion('La cuenta necesita un nombre.');
    const ahora = this.reloj.ahora();
    const cuenta: Cuenta = {
      ...datos,
      nombre,
      id: this.reloj.id(),
      archivada: false,
      orden: await this.db.cuentas.count(),
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    await this.db.cuentas.add(cuenta);
    return cuenta;
  }

  /**
   * La moneda no se puede cambiar si la cuenta ya tiene movimientos: todos
   * sus montos pasarían a significar otra cosa.
   */
  async editarCuenta(id: string, cambios: Partial<DatosCuenta & { archivada: boolean }>) {
    const cuenta = await this.db.cuentas.get(id);
    if (!cuenta) throw new ErrorDeValidacion('La cuenta no existe.');
    if (cambios.nombre !== undefined && !cambios.nombre.trim()) {
      throw new ErrorDeValidacion('La cuenta necesita un nombre.');
    }
    if (cambios.moneda && cambios.moneda !== cuenta.moneda && (await this.usosDeCuenta(id)) > 0) {
      throw new ErrorDeValidacion('No se puede cambiar la moneda de una cuenta con movimientos.');
    }
    await this.db.cuentas.put({
      ...cuenta,
      ...cambios,
      nombre: (cambios.nombre ?? cuenta.nombre).trim(),
      actualizadoEn: this.reloj.ahora(),
    });
  }

  async usosDeCuenta(id: string): Promise<number> {
    const [origen, destino] = await Promise.all([
      this.db.movimientos.where('cuentaId').equals(id).filter((m) => !m.borrado).count(),
      this.db.movimientos.where('cuentaDestinoId').equals(id).filter((m) => !m.borrado).count(),
    ]);
    return origen + destino;
  }

  /* ---------- Categorías ---------- */

  async crearCategoria(datos: DatosCategoria): Promise<Categoria> {
    const nombre = datos.nombre.trim();
    if (!nombre) throw new ErrorDeValidacion('La categoría necesita un nombre.');
    const ahora = this.reloj.ahora();
    const categoria: Categoria = {
      ...datos,
      nombre,
      presupuesto: datos.tipo === 'gasto' ? datos.presupuesto : null,
      id: this.reloj.id(),
      archivada: false,
      orden: await this.db.categorias.count(),
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    await this.db.categorias.add(categoria);
    return categoria;
  }

  async editarCategoria(
    id: string,
    cambios: Partial<Omit<DatosCategoria, 'tipo'> & { archivada: boolean }>,
  ) {
    const categoria = await this.db.categorias.get(id);
    if (!categoria) throw new ErrorDeValidacion('La categoría no existe.');
    if (cambios.nombre !== undefined && !cambios.nombre.trim()) {
      throw new ErrorDeValidacion('La categoría necesita un nombre.');
    }
    await this.db.categorias.put({
      ...categoria,
      ...cambios,
      nombre: (cambios.nombre ?? categoria.nombre).trim(),
      actualizadoEn: this.reloj.ahora(),
    });
  }

  /* ---------- Movimientos ---------- */

  private async normalizar(datos: DatosMovimiento) {
    const [cuentas, categorias] = await Promise.all([
      this.db.cuentas.toArray(),
      this.db.categorias.toArray(),
    ]);
    const porIdCuenta = new Map(cuentas.map((c) => [c.id, c]));
    const error = validarMovimiento(
      datos,
      porIdCuenta,
      new Map(categorias.map((c) => [c.id, c])),
    );
    if (error) throw new ErrorDeValidacion(error);

    const origen = porIdCuenta.get(datos.cuentaId)!;
    const nota = datos.nota.trim();

    if (datos.tipo === 'transferencia') {
      const destino = porIdCuenta.get(datos.cuentaDestinoId!)!;
      const mismaMoneda = destino.moneda === origen.moneda;
      const montoDestino = mismaMoneda ? datos.monto : datos.montoDestino!;
      // En una compra o venta de dólares, el tipo de cambio queda implícito
      // en los dos montos. Lo guardamos para no tener que recalcularlo.
      const [pesos, dolares] =
        origen.moneda === 'ARS' ? [datos.monto, montoDestino] : [montoDestino, datos.monto];
      return {
        ...datos,
        nota,
        categoriaId: null,
        montoDestino,
        cotizacion: mismaMoneda ? null : pesos / dolares,
      };
    }

    const cotizacion =
      origen.moneda === 'USD' ? cotizacionVigente(await this.ajustes()) : null;
    return { ...datos, nota, cuentaDestinoId: null, montoDestino: null, cotizacion };
  }

  async crearMovimiento(datos: DatosMovimiento): Promise<Movimiento> {
    const ahora = this.reloj.ahora();
    const movimiento: Movimiento = {
      ...(await this.normalizar(datos)),
      id: this.reloj.id(),
      borrado: false,
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    await this.db.movimientos.add(movimiento);
    return movimiento;
  }

  async editarMovimiento(id: string, datos: DatosMovimiento): Promise<Movimiento> {
    const actual = await this.db.movimientos.get(id);
    if (!actual || actual.borrado) throw new ErrorDeValidacion('El movimiento no existe.');
    const normalizado = await this.normalizar(datos);
    // Si no cambió ni la cuenta ni el monto, se respeta la cotización con la
    // que se cargó: corregir una nota no tiene por qué revaluar el gasto.
    const conservarCotizacion =
      normalizado.tipo !== 'transferencia' &&
      actual.cuentaId === normalizado.cuentaId &&
      actual.monto === normalizado.monto &&
      actual.cotizacion !== null;
    const movimiento: Movimiento = {
      ...actual,
      ...normalizado,
      cotizacion: conservarCotizacion ? actual.cotizacion : normalizado.cotizacion,
      actualizadoEn: this.reloj.ahora(),
    };
    await this.db.movimientos.put(movimiento);
    return movimiento;
  }

  async borrarMovimiento(id: string): Promise<void> {
    const actual = await this.db.movimientos.get(id);
    if (!actual) return;
    await this.db.movimientos.put({ ...actual, borrado: true, actualizadoEn: this.reloj.ahora() });
  }

  /* ---------- Primer uso ---------- */

  /**
   * La primera vez que se abre la app, con la base vacía, deja cuentas y
   * categorías razonables para empezar a cargar en el acto. Se pueden
   * renombrar o archivar después.
   */
  sembrarSiVacia(): Promise<boolean> {
    // En una transacción: si se llama dos veces seguidas (React en modo
    // estricto lo hace), la segunda espera a la primera y ve la base llena.
    return this.db.transaction('rw', this.db.cuentas, this.db.categorias, () => this.sembrar());
  }

  private async sembrar(): Promise<boolean> {
    if ((await this.db.cuentas.count()) > 0 || (await this.db.categorias.count()) > 0) {
      return false;
    }
    const cuentas: DatosCuenta[] = [
      { nombre: 'Efectivo', moneda: 'ARS', tipo: 'efectivo', saldoInicial: 0 },
      { nombre: 'Banco', moneda: 'ARS', tipo: 'banco', saldoInicial: 0 },
      { nombre: 'Mercado Pago', moneda: 'ARS', tipo: 'virtual', saldoInicial: 0 },
      { nombre: 'Dólares', moneda: 'USD', tipo: 'efectivo', saldoInicial: 0 },
    ];
    const categorias: DatosCategoria[] = [
      { nombre: 'Súper', tipo: 'gasto', emoji: '🛒', presupuesto: null },
      { nombre: 'Comida afuera', tipo: 'gasto', emoji: '🍔', presupuesto: null },
      { nombre: 'Transporte', tipo: 'gasto', emoji: '⛽', presupuesto: null },
      { nombre: 'Casa', tipo: 'gasto', emoji: '🏠', presupuesto: null },
      { nombre: 'Servicios', tipo: 'gasto', emoji: '💡', presupuesto: null },
      { nombre: 'Suscripciones', tipo: 'gasto', emoji: '📺', presupuesto: null },
      { nombre: 'Salud', tipo: 'gasto', emoji: '💊', presupuesto: null },
      { nombre: 'Ropa', tipo: 'gasto', emoji: '👕', presupuesto: null },
      { nombre: 'Salidas', tipo: 'gasto', emoji: '🍻', presupuesto: null },
      { nombre: 'Regalos', tipo: 'gasto', emoji: '🎁', presupuesto: null },
      { nombre: 'Otros gastos', tipo: 'gasto', emoji: '📦', presupuesto: null },
      { nombre: 'Retiro de negocios', tipo: 'ingreso', emoji: '💼', presupuesto: null },
      { nombre: 'Otros ingresos', tipo: 'ingreso', emoji: '💰', presupuesto: null },
    ];
    for (const c of cuentas) await this.crearCuenta(c);
    for (const c of categorias) await this.crearCategoria(c);
    return true;
  }
}

export const repositorio = new Repositorio();

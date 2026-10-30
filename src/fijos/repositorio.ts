import type { BilleteraDB } from '../datos/db';
import { db as dbPorDefecto } from '../datos/db';
import { ErrorDeValidacion, type Reloj } from '../datos/repositorio';
import type { Movimiento } from '../dominio/tipos';
import { siguienteVencimiento } from './calculos';
import { FRECUENCIAS, type Fijo } from './tipos';

const relojReal: Reloj = {
  ahora: () => new Date().toISOString(),
  id: () => crypto.randomUUID(),
};

export type DatosFijo = Pick<Fijo, 'tipo' | 'nota' | 'monto' | 'cuentaId' | 'categoriaId' | 'dia' | 'cadaMeses' | 'proxima'>;
export type CambiosFijo = Partial<DatosFijo & { activo: boolean }>;

/**
 * Lo que se guarda de los gastos fijos. Igual que el resto: centavos
 * enteros, borrado lógico y `actualizadoEn` en cada cambio.
 */
export class RepositorioFijos {
  constructor(
    private db: BilleteraDB = dbPorDefecto,
    private reloj: Reloj = relojReal,
  ) {}

  private async validar(d: DatosFijo) {
    if (!Number.isInteger(d.monto) || d.monto <= 0) throw new ErrorDeValidacion('El monto tiene que ser mayor a cero.');
    if (!Number.isInteger(d.dia) || d.dia < 1 || d.dia > 31) throw new ErrorDeValidacion('El día tiene que ser del 1 al 31.');
    if (!FRECUENCIAS.some((f) => f.cadaMeses === d.cadaMeses)) throw new ErrorDeValidacion('Elegí cada cuánto se repite.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.proxima)) throw new ErrorDeValidacion('La fecha del próximo vencimiento no es válida.');
    const [cuenta, categoria] = await Promise.all([this.db.cuentas.get(d.cuentaId), this.db.categorias.get(d.categoriaId)]);
    if (!cuenta) throw new ErrorDeValidacion('Elegí una cuenta.');
    if (!categoria || categoria.tipo !== d.tipo) throw new ErrorDeValidacion('Elegí una categoría.');
  }

  async crearFijo(datos: DatosFijo): Promise<Fijo> {
    const limpio = { ...datos, nota: datos.nota.trim() };
    if (!limpio.nota) {
      limpio.nota = (await this.db.categorias.get(datos.categoriaId))?.nombre ?? '';
    }
    await this.validar(limpio);
    const ahora = this.reloj.ahora();
    const fijo: Fijo = { ...limpio, id: this.reloj.id(), activo: true, borrado: false, creadoEn: ahora, actualizadoEn: ahora };
    await this.db.fijos.add(fijo);
    return fijo;
  }

  /**
   * "Se repite" al cargar un movimiento: el que cargaste cuenta como el de
   * este vencimiento, así que el próximo es el siguiente.
   */
  crearDesdeMovimiento(m: Movimiento, cadaMeses: number): Promise<Fijo> {
    if (m.tipo === 'transferencia' || !m.categoriaId) throw new ErrorDeValidacion('Sólo se repiten gastos e ingresos.');
    const dia = Number(m.fecha.slice(8, 10));
    return this.crearFijo({
      tipo: m.tipo,
      nota: m.nota,
      monto: m.monto,
      cuentaId: m.cuentaId,
      categoriaId: m.categoriaId,
      dia,
      cadaMeses,
      proxima: siguienteVencimiento(m.fecha, dia, cadaMeses),
    });
  }

  async editarFijo(id: string, cambios: CambiosFijo): Promise<void> {
    const actual = await this.db.fijos.get(id);
    if (!actual) throw new ErrorDeValidacion('Ese gasto fijo no existe.');
    const nuevo = { ...actual, ...cambios, nota: (cambios.nota ?? actual.nota).trim() || actual.nota };
    await this.validar(nuevo);
    await this.db.fijos.put({ ...nuevo, actualizadoEn: this.reloj.ahora() });
  }

  /** Borrado lógico. Con `false`, lo devuelve (el "Deshacer"). */
  async borrarFijo(id: string, borrado = true): Promise<void> {
    await this.db.fijos.update(id, { borrado, actualizadoEn: this.reloj.ahora() });
  }

  /**
   * Confirmado: pasa al siguiente vencimiento y se queda con el monto que
   * pagaste, que es la mejor estimación para la próxima. Devuelve cómo
   * estaba, para el "Deshacer".
   */
  async confirmar(id: string, montoPagado: number): Promise<Fijo> {
    const actual = await this.db.fijos.get(id);
    if (!actual) throw new ErrorDeValidacion('Ese gasto fijo no existe.');
    await this.db.fijos.put({
      ...actual,
      monto: montoPagado > 0 ? montoPagado : actual.monto,
      proxima: siguienteVencimiento(actual.proxima, actual.dia, actual.cadaMeses),
      actualizadoEn: this.reloj.ahora(),
    });
    return actual;
  }

  /** Este vencimiento no corresponde (no hubo que pagarlo): pasa al siguiente. */
  async saltear(id: string): Promise<Fijo> {
    const actual = await this.db.fijos.get(id);
    if (!actual) throw new ErrorDeValidacion('Ese gasto fijo no existe.');
    await this.db.fijos.put({
      ...actual,
      proxima: siguienteVencimiento(actual.proxima, actual.dia, actual.cadaMeses),
      actualizadoEn: this.reloj.ahora(),
    });
    return actual;
  }

  /** Vuelve a como estaba antes de confirmar o saltear. */
  async restaurar(anterior: Fijo): Promise<void> {
    await this.db.fijos.put({ ...anterior, actualizadoEn: this.reloj.ahora() });
  }
}

export const repoFijos = new RepositorioFijos();

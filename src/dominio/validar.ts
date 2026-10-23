import type { Categoria, Cuenta, Movimiento } from './tipos';

export type DatosMovimiento = Pick<
  Movimiento,
  'tipo' | 'fecha' | 'monto' | 'cuentaId' | 'categoriaId' | 'cuentaDestinoId' | 'montoDestino' | 'nota'
>;

/** Devuelve el primer problema en castellano, o null si está todo bien. */
export function validarMovimiento(
  datos: DatosMovimiento,
  cuentas: Map<string, Cuenta>,
  categorias: Map<string, Categoria>,
): string | null {
  if (!Number.isInteger(datos.monto) || datos.monto <= 0) return 'El monto tiene que ser mayor a cero.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) return 'La fecha no es válida.';

  const origen = cuentas.get(datos.cuentaId);
  if (!origen) return 'Elegí una cuenta.';

  if (datos.tipo === 'transferencia') {
    const destino = datos.cuentaDestinoId ? cuentas.get(datos.cuentaDestinoId) : undefined;
    if (!destino) return 'Elegí a qué cuenta va la plata.';
    if (destino.id === origen.id) return 'Origen y destino no pueden ser la misma cuenta.';
    if (destino.moneda !== origen.moneda) {
      if (!datos.montoDestino || datos.montoDestino <= 0) {
        return `Poné cuánto entra en ${destino.nombre} (${destino.moneda}).`;
      }
    }
    return null;
  }

  const categoria = datos.categoriaId ? categorias.get(datos.categoriaId) : undefined;
  if (!categoria) return 'Elegí una categoría.';
  if (categoria.tipo !== datos.tipo) return 'La categoría no corresponde al tipo de movimiento.';
  return null;
}

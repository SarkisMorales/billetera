import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../datos/db';
import {
  AJUSTES_POR_DEFECTO,
  type Ajustes,
  type Categoria,
  type Cuenta,
  type Movimiento,
} from '../dominio/tipos';

export interface Billetera {
  cuentas: Cuenta[];
  categorias: Categoria[];
  movimientos: Movimiento[];
  ajustes: Ajustes;
  cargando: boolean;
}

/**
 * Un solo lugar del que la UI lee. `useLiveQuery` vuelve a consultar Dexie
 * sólo cuando los datos cambian, así que después de guardar algo no hay que
 * refrescar nada a mano. Los movimientos borrados quedan afuera acá.
 */
export function useBilletera(): Billetera {
  const cuentas = useLiveQuery(() => db.cuentas.orderBy('orden').toArray(), [], undefined);
  const categorias = useLiveQuery(() => db.categorias.orderBy('orden').toArray(), [], undefined);
  const movimientos = useLiveQuery(
    () => db.movimientos.filter((m) => !m.borrado).toArray(),
    [],
    undefined,
  );
  const ajustes = useLiveQuery(() => db.ajustes.get('unico'), [], undefined);

  return {
    cuentas: cuentas ?? [],
    categorias: categorias ?? [],
    movimientos: movimientos ?? [],
    ajustes: ajustes ?? AJUSTES_POR_DEFECTO,
    cargando: cuentas === undefined || movimientos === undefined,
  };
}

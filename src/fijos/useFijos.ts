import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../datos/db';
import type { Fijo } from './tipos';

/** Los gastos e ingresos fijos sin borrar. Se vuelve a leer sólo cuando cambian. */
export function useFijos(): Fijo[] {
  return useLiveQuery(() => db.fijos.filter((f) => !f.borrado).toArray(), []) ?? [];
}

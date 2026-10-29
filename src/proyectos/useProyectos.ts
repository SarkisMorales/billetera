import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../datos/db';
import type { Nota, Objetivo, Proyecto } from './tipos';

export interface DatosProyectos {
  proyectos: Proyecto[];
  objetivos: Objetivo[];
  notas: Nota[];
  cargando: boolean;
}

/** Como `useBilletera`: se vuelve a leer sólo cuando algo cambia. Lo borrado queda afuera. */
export function useProyectos(): DatosProyectos {
  const proyectos = useLiveQuery(() => db.proyectos.orderBy('orden').filter((p) => !p.borrado).toArray(), []);
  const objetivos = useLiveQuery(() => db.objetivos.filter((o) => !o.borrado).toArray(), []);
  const notas = useLiveQuery(() => db.notas.filter((n) => !n.borrado).toArray(), []);
  return {
    proyectos: proyectos ?? [],
    objetivos: objetivos ?? [],
    notas: notas ?? [],
    cargando: proyectos === undefined || objetivos === undefined || notas === undefined,
  };
}

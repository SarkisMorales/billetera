import { repositorio } from './repositorio';
import { NOMBRE_CASA, type CasaDolar, type Cotizacion } from '../dominio/tipos';

const FUENTE = 'https://dolarapi.com/v1/dolares';

/** No se vuelve a pedir antes de esto, salvo que lo pidas a mano. */
const VIGENCIA_MS = 60 * 60 * 1000;

function esCasa(casa: unknown): casa is CasaDolar {
  return typeof casa === 'string' && casa in NOMBRE_CASA;
}

/** Interpreta la respuesta de dolarapi.com; descarta lo que no entiende. */
export function leerRespuesta(datos: unknown): Cotizacion[] {
  if (!Array.isArray(datos)) return [];
  return datos.flatMap((d): Cotizacion[] => {
    if (typeof d !== 'object' || d === null) return [];
    const { casa, compra, venta, fechaActualizacion } = d as Record<string, unknown>;
    if (!esCasa(casa) || typeof venta !== 'number' || venta <= 0) return [];
    return [
      {
        casa,
        compra: typeof compra === 'number' ? compra : venta,
        venta,
        fechaActualizacion: typeof fechaActualizacion === 'string' ? fechaActualizacion : '',
      },
    ];
  });
}

/**
 * Baja las cotizaciones y las guarda. Sin internet no hace nada: la app
 * sigue con la última guardada. Devuelve si pudo actualizar.
 */
export async function actualizarCotizaciones(forzar = false): Promise<boolean> {
  if (!navigator.onLine) return false;
  const { cotizacionesBajadasEn } = await repositorio.ajustes();
  if (
    !forzar &&
    cotizacionesBajadasEn &&
    Date.now() - Date.parse(cotizacionesBajadasEn) < VIGENCIA_MS
  ) {
    return false;
  }
  try {
    const respuesta = await fetch(FUENTE, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!respuesta.ok) return false;
    const cotizaciones = leerRespuesta(await respuesta.json());
    if (!cotizaciones.length) return false;
    await repositorio.guardarAjustes({
      cotizaciones,
      cotizacionesBajadasEn: new Date().toISOString(),
    });
    return true;
  } catch {
    return false;
  }
}

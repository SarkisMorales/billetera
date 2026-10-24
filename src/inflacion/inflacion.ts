/**
 * Inflación mensual del INDEC, vía api.argentinadatos.com.
 *
 * Se guarda en el teléfono y se pide a la API como mucho una vez por día
 * (por día de calendario: si se bajó a las 8, a las 22 no se vuelve a pedir).
 * Si la API falla o no hay conexión, se usa lo guardado y la tarjeta avisa
 * de qué fecha es.
 *
 * Es un caché: si se pierde, se vuelve a bajar. Lo que no se puede perder
 * (las correcciones a mano) vive en los ajustes de la billetera.
 */

const FUENTE = 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion';
const CLAVE = 'billetera.inflacion.v1';
/** Tres años alcanzan para el acumulado del año y los últimos 6 meses. */
const MESES_GUARDADOS = 36;
/** Si la API falló, no se reintenta antes de esto. */
const ESPERA_TRAS_FALLO_MS = 60 * 60 * 1000;

export interface Guardado {
  serie: [string, number][];
  /** Última vez que la API respondió bien. */
  bajadaEn: string | null;
  /** Último intento fallido, para no martillar una API caída. */
  falloEn: string | null;
}

const VACIO: Guardado = { serie: [], bajadaEn: null, falloEn: null };

export function inflacionGuardada(): Guardado {
  try {
    const crudo = localStorage.getItem(CLAVE);
    return crudo ? { ...VACIO, ...(JSON.parse(crudo) as Guardado) } : VACIO;
  } catch {
    return VACIO;
  }
}

function guardar(g: Guardado) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(g));
  } catch {
    /* Sin almacenamiento: vale para esta sesión. */
  }
}

/** Si toca pedirle a la API: nunca se bajó, o se bajó otro día. */
export function necesitaActualizar(bajadaEn: string | null, ahora: Date = new Date()): boolean {
  if (!bajadaEn) return true;
  return new Date(bajadaEn).toDateString() !== ahora.toDateString();
}

/**
 * Interpreta la respuesta de la API: [{ fecha: 'AAAA-MM-DD', valor: número }].
 * Devuelve [mes, valor] ordenado; descarta lo que no tenga esa forma.
 */
export function leerSerie(datos: unknown): [string, number][] {
  if (!Array.isArray(datos)) return [];
  return datos
    .flatMap((x): [string, number][] => {
      const { fecha, valor } = (x ?? {}) as Record<string, unknown>;
      return typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha) &&
        typeof valor === 'number' && Number.isFinite(valor)
        ? [[fecha.slice(0, 7), valor]]
        : [];
    })
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-MESES_GUARDADOS);
}

export type ResultadoActualizacion = 'actualizada' | 'al-dia' | 'sin-conexion' | 'fallo';

export async function actualizarInflacion(forzar = false): Promise<ResultadoActualizacion> {
  const g = inflacionGuardada();
  if (!forzar && !necesitaActualizar(g.bajadaEn)) return 'al-dia';
  if (!navigator.onLine) return 'sin-conexion';
  if (!forzar && g.falloEn && Date.now() - Date.parse(g.falloEn) < ESPERA_TRAS_FALLO_MS) return 'fallo';

  try {
    const r = await fetch(FUENTE, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(String(r.status));
    const serie = leerSerie(await r.json());
    // Una respuesta vacía o rara no pisa lo que ya había.
    if (!serie.length) throw new Error('vacía');
    guardar({ serie, bajadaEn: new Date().toISOString(), falloEn: null });
    return 'actualizada';
  } catch {
    guardar({ ...g, falloEn: new Date().toISOString() });
    return 'fallo';
  }
}

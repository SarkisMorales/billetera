/**
 * Inflación mensual (INDEC) y dólar histórico, de api.argentinadatos.com.
 *
 * Es un caché propio del módulo de Reportes, en localStorage: no toca la base
 * de la app. Si se pierde no pasa nada, se vuelve a bajar con la próxima
 * conexión. Sin internet y sin caché, los reportes muestran sólo pesos.
 */
import type { CasaDolar } from '../dominio/tipos';
import type { Historicos } from './calculos';

const BASE = 'https://api.argentinadatos.com/v1';
const CLAVE = 'billetera.reportes.historicos.v1';
const VIGENCIA_MS = 12 * 60 * 60 * 1000;
/** Lo que guardamos: alcanza para 12 meses de reportes y el período anterior. */
const MESES_INFLACION = 36;
const DIAS_DOLAR = 800;

interface Guardado {
  inflacion: [string, number][];
  inflacionBajadaEn: string | null;
  dolar: Partial<Record<CasaDolar, { fecha: string; venta: number }[]>>;
  dolarBajadoEn: Partial<Record<CasaDolar, string>>;
}

const VACIO: Guardado = { inflacion: [], inflacionBajadaEn: null, dolar: {}, dolarBajadoEn: {} };

function leer(): Guardado {
  try {
    const crudo = localStorage.getItem(CLAVE);
    return crudo ? { ...VACIO, ...(JSON.parse(crudo) as Guardado) } : VACIO;
  } catch {
    return VACIO;
  }
}

function escribir(g: Guardado) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(g));
  } catch {
    /* Sin almacenamiento: se usa lo bajado en esta sesión y listo. */
  }
}

export function historicosGuardados(casa: CasaDolar): Historicos & { inflacionHasta: string | null } {
  const g = leer();
  const inflacion = new Map(g.inflacion);
  let inflacionHasta: string | null = null;
  for (const mes of inflacion.keys()) if (!inflacionHasta || mes > inflacionHasta) inflacionHasta = mes;
  return { inflacion, dolar: g.dolar[casa] ?? [], inflacionHasta };
}

function vieja(iso: string | null | undefined): boolean {
  return !iso || Date.now() - Date.parse(iso) > VIGENCIA_MS;
}

async function pedir(ruta: string): Promise<unknown> {
  const r = await fetch(`${BASE}${ruta}`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/** Interpreta la serie de inflación; descarta lo que no entiende. */
export function leerInflacion(datos: unknown): [string, number][] {
  if (!Array.isArray(datos)) return [];
  return datos
    .flatMap((x): [string, number][] => {
      const { fecha, valor } = (x ?? {}) as Record<string, unknown>;
      return typeof fecha === 'string' && /^\d{4}-\d{2}/.test(fecha) && typeof valor === 'number'
        ? [[fecha.slice(0, 7), valor]]
        : [];
    })
    .slice(-MESES_INFLACION);
}

/** Interpreta la serie diaria del dólar; descarta lo que no entiende. */
export function leerDolar(datos: unknown): { fecha: string; venta: number }[] {
  if (!Array.isArray(datos)) return [];
  return datos
    .flatMap((x) => {
      const { fecha, venta } = (x ?? {}) as Record<string, unknown>;
      return typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && typeof venta === 'number' && venta > 0
        ? [{ fecha, venta }]
        : [];
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .slice(-DIAS_DOLAR);
}

/**
 * Baja lo que falte o esté viejo. Devuelve true si cambió algo. Nunca tira:
 * un error de red deja el caché como estaba.
 */
export async function actualizarHistoricos(casa: CasaDolar): Promise<boolean> {
  if (!navigator.onLine) return false;
  const g = leer();
  let cambio = false;

  if (vieja(g.inflacionBajadaEn)) {
    try {
      const inflacion = leerInflacion(await pedir('/finanzas/indices/inflacion'));
      if (inflacion.length) {
        g.inflacion = inflacion;
        g.inflacionBajadaEn = new Date().toISOString();
        cambio = true;
      }
    } catch {
      /* Queda lo que había. */
    }
  }

  if (vieja(g.dolarBajadoEn[casa])) {
    try {
      const serie = leerDolar(await pedir(`/cotizaciones/dolares/${casa}`));
      if (serie.length) {
        g.dolar = { ...g.dolar, [casa]: serie };
        g.dolarBajadoEn = { ...g.dolarBajadoEn, [casa]: new Date().toISOString() };
        cambio = true;
      }
    } catch {
      /* Queda lo que había. */
    }
  }

  if (cambio) escribir(g);
  return cambio;
}

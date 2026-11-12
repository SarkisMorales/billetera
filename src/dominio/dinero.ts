import type { Centavos, Moneda } from './tipos';

/**
 * Lee un monto tal como lo escribe alguien en Argentina y lo devuelve en
 * centavos. Devuelve null si no es un número positivo.
 *
 *   "1500"        → 150000
 *   "1.500"       → 150000   (punto de miles)
 *   "1.500,50"    → 150050
 *   "1500,5"      → 150050
 *   "12.5"        → 1250     (punto decimal: no tiene tres cifras atrás)
 *   "1.500.000"   → 150000000
 */
export function leerMonto(texto: string): Centavos | null {
  let t = texto.trim().replace(/\s|\$|US\$|USD|ARS/gi, '');
  if (!t) return null;

  if (t.includes(',')) {
    // Con coma, la coma es el decimal y los puntos son de miles.
    t = t.replace(/\./g, '').replace(',', '.');
  } else {
    const partes = t.split('.');
    const ultima = partes[partes.length - 1] ?? '';
    // Sólo puntos: si todos los grupos después del primero tienen 3 cifras,
    // son separadores de miles. Si no, el único punto es el decimal.
    const sonMiles = partes.length > 1 && partes.slice(1).every((p) => p.length === 3);
    if (sonMiles) t = partes.join('');
    else if (partes.length > 2 || ultima.length === 0) return null;
  }

  if (!/^\d+(\.\d{0,2})?$/.test(t)) return null;
  const centavos = Math.round(Number(t) * 100);
  return centavos > 0 ? centavos : null;
}

const formatos = new Map<string, Intl.NumberFormat>();

function formato(decimales: number): Intl.NumberFormat {
  const clave = String(decimales);
  let f = formatos.get(clave);
  if (!f) {
    f = new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    });
    formatos.set(clave, f);
  }
  return f;
}

/**
 * "$ 1.500" / "US$ 1.500,50". Los centavos se muestran sólo si existen:
 * en pesos casi nunca importan y ensucian la lectura.
 */
export function formatearMonto(
  centavos: Centavos,
  moneda: Moneda,
  opciones: { signo?: boolean; sinDecimales?: boolean } = {},
): string {
  const negativo = centavos < 0;
  const abs = Math.abs(centavos);
  const decimales = opciones.sinDecimales || abs % 100 === 0 ? 0 : 2;
  const valor = decimales === 0 ? Math.round(abs / 100) : abs / 100;
  const simbolo = moneda === 'USD' ? 'US$' : '$';
  const signo = negativo ? '−' : opciones.signo ? '+' : '';
  return `${signo}${simbolo} ${formato(decimales).format(valor)}`;
}

/** Para precargar un input al editar: "1500,5". */
export function montoParaEditar(centavos: Centavos): string {
  const entero = Math.floor(centavos / 100);
  const resto = centavos % 100;
  return resto === 0 ? String(entero) : `${entero},${String(resto).padStart(2, '0')}`;
}

/** Convierte entre monedas con una cotización en pesos por dólar. */
export function convertir(
  centavos: Centavos,
  desde: Moneda,
  hacia: Moneda,
  pesosPorDolar: number,
): Centavos {
  if (desde === hacia) return centavos;
  return desde === 'USD'
    ? Math.round(centavos * pesosPorDolar)
    : Math.round(centavos / pesosPorDolar);
}

/**
 * La cotización manual (pesos por dólar), escrita como un monto: "1.450",
 * "1450,50" o "1450.5". Null si no es un número positivo. Antes se le
 * sacaban todos los puntos y "1450.5" quedaba en 14.505.
 */
export function leerCotizacion(texto: string): number | null {
  const centavos = leerMonto(texto);
  return centavos === null ? null : centavos / 100;
}

/** Para precargar el campo de la cotización manual: 1450.5 → "1.450,50". */
export function cotizacionParaEditar(pesosPorDolar: number | null): string {
  if (!pesosPorDolar) return '';
  const centavos = Math.round(pesosPorDolar * 100);
  const entero = Math.floor(centavos / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const resto = centavos % 100;
  return resto === 0 ? entero : `${entero},${String(resto).padStart(2, '0')}`;
}

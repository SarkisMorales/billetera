import { sumarDias } from './fechas';
import type { Centavos, Movimiento, TipoMovimiento } from './tipos';

/**
 * Lo que la app aprende de tus notas: si "Coto" siempre fue Súper desde
 * Mercado Pago, la próxima vez que escribas "co" te lo sugiere, y con un
 * toque completa nota, categoría, cuenta y (si no pusiste) el monto.
 * Nada se guarda aparte: se calcula de tus movimientos.
 */
export interface Sugerencia {
  /** La nota tal como la escribiste la última vez. */
  nota: string;
  /** La nota sin acentos ni mayúsculas, para comparar. */
  clave: string;
  categoriaId: string | null;
  cuentaId: string;
  monto: Centavos;
  veces: number;
  /** Fecha del último uso. */
  ultima: string;
}

/** "  Café  CON leche " → "cafe con leche". */
export function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Una sugerencia por nota distinta, con lo de su último uso. */
export function aprenderNotas(movimientos: Movimiento[], tipo: TipoMovimiento): Sugerencia[] {
  const porClave = new Map<string, Sugerencia>();
  const conNota = movimientos
    .filter((m) => !m.borrado && m.tipo === tipo && m.nota.trim())
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creadoEn.localeCompare(b.creadoEn));
  for (const m of conNota) {
    const clave = normalizarTexto(m.nota);
    porClave.set(clave, {
      nota: m.nota.trim(),
      clave,
      categoriaId: m.categoriaId,
      cuentaId: m.cuentaId,
      monto: m.monto,
      veces: (porClave.get(clave)?.veces ?? 0) + 1,
      ultima: m.fecha,
    });
  }
  return [...porClave.values()];
}

/**
 * Las que empiezan con lo que escribiste (o tienen una palabra que empieza
 * así), primero las que empiezan igual, después las más usadas. La que ya
 * escribiste entera no se sugiere.
 */
export function sugerir(lista: Sugerencia[], texto: string, max = 3): Sugerencia[] {
  const q = normalizarTexto(texto);
  if (!q) return [];
  const empiezaIgual = (s: Sugerencia) => s.clave.startsWith(q);
  return lista
    .filter((s) => s.clave !== q && (empiezaIgual(s) || s.clave.split(' ').some((p) => p.startsWith(q))))
    .sort(
      (a, b) =>
        Number(empiezaIgual(b)) - Number(empiezaIgual(a)) || b.veces - a.veces || b.ultima.localeCompare(a.ultima),
    )
    .slice(0, max);
}

/** La que coincide exacto con lo escrito, para completar la categoría sola. */
export function coincidencia(lista: Sugerencia[], texto: string): Sugerencia | undefined {
  const q = normalizarTexto(texto);
  return q ? lista.find((s) => s.clave === q) : undefined;
}

/**
 * Tus gastos de siempre: notas usadas 2 veces o más en los últimos 90 días,
 * las más repetidas primero. Son los "favoritos" sin tener que armarlos.
 */
export function frecuentes(movimientos: Movimiento[], tipo: TipoMovimiento, hoyStr: string, max = 4): Sugerencia[] {
  const desde = sumarDias(hoyStr, -90);
  return aprenderNotas(
    movimientos.filter((m) => m.fecha >= desde && m.fecha <= hoyStr),
    tipo,
  )
    .filter((s) => s.veces >= 2)
    .sort((a, b) => b.veces - a.veces || b.ultima.localeCompare(a.ultima))
    .slice(0, max);
}

/**
 * Un movimiento ya cargado igual: mismo tipo, monto, cuenta y día (y mismo
 * destino si es transferencia). Para avisar antes de cargarlo dos veces.
 */
export function posibleDuplicado(
  datos: Pick<Movimiento, 'tipo' | 'monto' | 'cuentaId' | 'fecha' | 'cuentaDestinoId'>,
  movimientos: Movimiento[],
): Movimiento | undefined {
  return movimientos.find(
    (m) =>
      !m.borrado &&
      m.tipo === datos.tipo &&
      m.monto === datos.monto &&
      m.cuentaId === datos.cuentaId &&
      m.fecha === datos.fecha &&
      (datos.tipo !== 'transferencia' || m.cuentaDestinoId === datos.cuentaDestinoId),
  );
}

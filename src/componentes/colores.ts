import type { Categoria, Cuenta } from '../dominio/tipos';

/** El ícono de cada tipo de cuenta: el mismo en Inicio y en Ajustes. */
export const ICONO_CUENTA: Record<Cuenta['tipo'], string> = {
  efectivo: '💵',
  banco: '🏦',
  virtual: '📱',
  otro: '💳',
};

/**
 * Un color fijo por categoría, para el círculo de su ícono. Sale del orden de
 * la categoría (no de cuánto se gastó), así no cambia de color con el tiempo.
 * El nombre y el emoji siempre van al lado: el color nunca es lo único que
 * la identifica.
 */
// Once: las once categorías de gasto de ejemplo tienen cada una el suyo. Los
// tres últimos se sumaron después; los ocho primeros no cambian.
const COLORES = [
  '#2A78D6', '#EB6834', '#1BAF7A', '#EDA100', '#E87BA4', '#008300', '#6250D6', '#E34948',
  '#0E9AA7', '#C026D3', '#A0673A',
];

export function colorCategoria(c: Categoria | undefined): string | undefined {
  return c ? COLORES[c.orden % COLORES.length] : undefined;
}

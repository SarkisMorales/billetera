import type { Categoria } from '../dominio/tipos';

/**
 * Un color fijo por categoría, para el círculo de su ícono. Sale del orden de
 * la categoría (no de cuánto se gastó), así no cambia de color con el tiempo.
 * El nombre y el emoji siempre van al lado: el color nunca es lo único que
 * la identifica.
 */
const COLORES = ['#2A78D6', '#EB6834', '#1BAF7A', '#EDA100', '#E87BA4', '#008300', '#6250D6', '#E34948'];

export function colorCategoria(c: Categoria | undefined): string | undefined {
  return c ? COLORES[c.orden % COLORES.length] : undefined;
}

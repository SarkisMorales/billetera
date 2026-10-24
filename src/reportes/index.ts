/**
 * Módulo de Reportes. Única puerta de entrada: la app sólo importa esto.
 *
 * Sólo lee. No escribe en la base de la app ni cambia nada de los otros
 * módulos; lo único propio que guarda es un caché de inflación y dólar
 * histórico en localStorage. Borrando esta carpeta y la pestaña en App.tsx,
 * la app queda exactamente como antes.
 */
export { Reportes } from './Reportes';

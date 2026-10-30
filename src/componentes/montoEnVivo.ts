import { OPERADORES, SEPARA, canonico } from '../dominio/calculadora';

/**
 * Formatea un monto mientras se escribe: "5000000" se ve "5.000.000" y
 * "1500,5" se ve "1.500,5". La coma es el decimal (máximo dos).
 *
 * Lo que devuelve lo sigue leyendo igual `leerMonto`, así que el monto que se
 * guarda no cambia: sólo cambia cómo se ve el campo.
 */
export function montoEnVivo(texto: string, { negativo = false } = {}): string {
  const signo = negativo && /^\s*[-−]/.test(texto) ? '-' : '';
  let t = texto.replace(/[^\d.,]/g, '');

  // Un punto recién tecleado al final (teclado con punto decimal) es la coma.
  // Los puntos de miles que pone esta función nunca quedan al final.
  if (t.endsWith('.') && !t.includes(',')) t = `${t.slice(0, -1)},`;

  const coma = t.indexOf(',');
  const entera = (coma === -1 ? t : t.slice(0, coma)).replace(/[.,]/g, '').replace(/^0+(?=\d)/, '');
  const decimales = coma === -1 ? null : t.slice(coma + 1).replace(/[.,]/g, '').slice(0, 2);

  const conPuntos = entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (decimales === null) return signo + conPuntos;
  return `${signo}${conPuntos || '0'},${decimales}`;
}

/**
 * Formatea mientras se escribe: cada número con sus puntos de miles y los
 * operadores con un espacio a cada lado. Un operador al principio se
 * descarta y dos seguidos se reemplazan por el último.
 */
export function expresionEnVivo(texto: string): string {
  const partes = canonico(texto).split(SEPARA);
  const salida: string[] = [];
  for (const parte of partes) {
    if ((OPERADORES as readonly string[]).includes(parte)) {
      const ultimo = salida[salida.length - 1];
      if (ultimo === undefined) continue;
      if ((OPERADORES as readonly string[]).includes(ultimo)) salida[salida.length - 1] = parte;
      else salida.push(parte);
    } else {
      const numero = montoEnVivo(parte);
      if (numero) salida.push(numero);
    }
  }
  return salida.join(' ');
}

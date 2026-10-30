import { leerMonto } from './dinero';
import type { Centavos } from './tipos';

/**
 * La calculadora del monto: "1.500 + 300" o "2.500 × 3". El teclado numérico
 * del iPhone no tiene + ni ×, así que los operadores vienen de botones; en la
 * compu también se pueden escribir (+ - * x /). El formateo mientras se
 * escribe está en `componentes/montoEnVivo.ts`.
 *
 * El resultado se redondea a centavos enteros, como todo monto de la app.
 */
export const OPERADORES = ['+', '−', '×', '÷'] as const;
export type Operador = (typeof OPERADORES)[number];

/** Parte un texto en números y operadores, dejando los operadores. */
export const SEPARA = /([+−×÷])/;

/** Pasa "-", "*", "x" y "/" a los símbolos que se muestran. */
export function canonico(texto: string): string {
  return texto.replace(/-/g, '−').replace(/[*xX]/g, '×').replace(/\//g, '÷');
}

export function tieneOperador(texto: string): boolean {
  return SEPARA.test(canonico(texto));
}

/**
 * El monto en centavos. Respeta la precedencia (× y ÷ antes que + y −) e
 * ignora un operador colgando al final ("1.500 +" vale 1.500). Null si algo
 * no es un número, si se divide por cero o si el resultado no es positivo.
 */
export function evaluarMonto(texto: string): Centavos | null {
  const tokens = canonico(texto)
    .split(SEPARA)
    .map((t) => t.trim())
    .filter(Boolean);
  while (tokens.length && (OPERADORES as readonly string[]).includes(tokens[tokens.length - 1]!)) tokens.pop();
  if (!tokens.length) return null;

  const numeros: number[] = [];
  const operadores: Operador[] = [];
  tokens.forEach((t, i) => {
    if (i % 2 === 0) {
      const c = leerMonto(t);
      numeros.push(c === null ? NaN : c / 100);
    } else {
      operadores.push(t as Operador);
    }
  });
  if (numeros.some(Number.isNaN) || numeros.length !== operadores.length + 1) return null;

  // Primero × y ÷.
  const sumandos: number[] = [numeros[0]!];
  const signos: Operador[] = [];
  operadores.forEach((op, i) => {
    const n = numeros[i + 1]!;
    if (op === '×') sumandos[sumandos.length - 1]! *= n;
    else if (op === '÷') sumandos[sumandos.length - 1]! /= n;
    else {
      signos.push(op);
      sumandos.push(n);
    }
  });
  // Después + y −.
  let total = sumandos[0]!;
  signos.forEach((op, i) => {
    total = op === '+' ? total + sumandos[i + 1]! : total - sumandos[i + 1]!;
  });

  const centavos = Math.round(total * 100);
  return Number.isFinite(centavos) && centavos > 0 ? centavos : null;
}

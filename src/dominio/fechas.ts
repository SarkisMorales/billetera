/** `AAAA-MM-DD` de hoy en hora local (no UTC: a las 22 hs seguiría siendo hoy). */
export function hoy(fecha: Date = new Date()): string {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

/** `AAAA-MM` del día dado. */
export function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

export function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const d = new Date(a, m - 1 + n, 1);
  return hoy(d).slice(0, 7);
}

export function diasDelMes(mes: string): number {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  return new Date(a, m, 0).getDate();
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function nombreMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const nombre = MESES[m - 1] ?? '';
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${a}`;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "Hoy", "Ayer" o "martes 21". */
export function nombreDia(fecha: string, referencia: string = hoy()): string {
  if (fecha === referencia) return 'Hoy';
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const dia = new Date(a, m - 1, d);
  const [ra, rm, rd] = referencia.split('-').map(Number) as [number, number, number];
  const ayer = new Date(ra, rm - 1, rd - 1);
  if (hoy(ayer) === fecha) return 'Ayer';
  return `${DIAS[dia.getDay()]} ${d}`;
}

/**
 * "Hoy", "Ayer", "martes 21 de octubre" o, si es de otro año,
 * "martes 21 de octubre de 2025". Para listas que mezclan meses.
 */
export function fechaLarga(fecha: string, referencia: string = hoy()): string {
  const corto = nombreDia(fecha, referencia);
  if (corto === 'Hoy' || corto === 'Ayer') return corto;
  const mes = MESES[Number(fecha.slice(5, 7)) - 1];
  const anio = fecha.slice(0, 4) === referencia.slice(0, 4) ? '' : ` de ${fecha.slice(0, 4)}`;
  return `${corto} de ${mes}${anio}`;
}

/** `AAAA-MM-DD` sumándole n días (n puede ser negativo). */
export function sumarDias(fecha: string, n: number): string {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return hoy(new Date(a, m - 1, d + n));
}

/** Días de `desde` a `hasta`, contando los dos: del 29 al 31 son 3. */
export function diasIncluidos(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split('-').map(Number) as [number, number, number];
  const [a2, m2, d2] = hasta.split('-').map(Number) as [number, number, number];
  return Math.round((new Date(a2, m2 - 1, d2).getTime() - new Date(a1, m1 - 1, d1).getTime()) / 86_400_000) + 1;
}

/** "29/10". */
export function diaYMes(fecha: string): string {
  return `${Number(fecha.slice(8, 10))}/${Number(fecha.slice(5, 7))}`;
}

export function diasEntre(desdeIso: string, hastaIso: string): number {
  return Math.floor((Date.parse(hastaIso) - Date.parse(desdeIso)) / 86_400_000);
}

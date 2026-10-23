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

export function diasEntre(desdeIso: string, hastaIso: string): number {
  return Math.floor((Date.parse(hastaIso) - Date.parse(desdeIso)) / 86_400_000);
}

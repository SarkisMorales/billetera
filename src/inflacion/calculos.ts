/**
 * Inflación mensual: cuentas puras sobre la serie del INDEC más las
 * correcciones cargadas a mano. Los porcentajes van como vienen de la fuente
 * (1.9 = 1,9% en el mes).
 */
import { sumarMeses } from '../dominio/fechas';

export interface MesInflacion {
  mes: string;
  valor: number;
  /** Cargado o corregido a mano. */
  manual: boolean;
}

/** La serie de internet con las correcciones a mano encima, ordenada por mes. */
export function serieEfectiva(
  deInternet: [string, number][],
  manual: Record<string, number> = {},
): MesInflacion[] {
  const porMes = new Map<string, MesInflacion>();
  for (const [mes, valor] of deInternet) porMes.set(mes, { mes, valor, manual: false });
  for (const [mes, valor] of Object.entries(manual)) porMes.set(mes, { mes, valor, manual: true });
  return [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

/**
 * Inflación compuesta de varios meses: no se suman, se multiplican.
 * 2% y 3% dan 5,06%, no 5%.
 */
export function acumulada(valores: number[]): number {
  return (valores.reduce((f, v) => f * (1 + v / 100), 1) - 1) * 100;
}

export interface Resumen {
  ultimo: MesInflacion;
  /** Del último año con datos: enero hasta el último mes publicado. */
  anio: { anio: string; hasta: string; valor: number; meses: number };
  /** Los últimos N meses publicados, del más viejo al más nuevo. */
  meses: (MesInflacion & {
    /** Diferencia en puntos contra el mes anterior; null si no hay mes anterior. */
    cambio: number | null;
  })[];
  /** Acumulada de esos N meses. */
  periodo: number;
  /** Si en la serie falta algún mes dentro de la ventana pedida. */
  huecos: string[];
}

export function resumir(serie: MesInflacion[], cuantos: number): Resumen | null {
  const ultimo = serie[serie.length - 1];
  if (!ultimo) return null;
  const porMes = new Map(serie.map((m) => [m.mes, m]));

  const anio = ultimo.mes.slice(0, 4);
  const delAnio = serie.filter((m) => m.mes.startsWith(anio));

  // La ventana va por calendario, no por posición: si falta un mes, se ve.
  const ventana = Array.from({ length: cuantos }, (_, i) => sumarMeses(ultimo.mes, i - cuantos + 1));
  const huecos = ventana.filter((mes) => !porMes.has(mes));
  const meses = ventana
    .filter((mes) => porMes.has(mes))
    .map((mes) => {
      const m = porMes.get(mes)!;
      const previo = porMes.get(sumarMeses(mes, -1));
      return { ...m, cambio: previo ? Math.round((m.valor - previo.valor) * 10) / 10 : null };
    });

  return {
    ultimo,
    anio: { anio, hasta: ultimo.mes, valor: acumulada(delAnio.map((m) => m.valor)), meses: delAnio.length },
    meses,
    periodo: acumulada(meses.map((m) => m.valor)),
    huecos,
  };
}

/** Lee lo que se escribe a mano: "1,9", "1.9", "-0,3". Null si no es un % razonable. */
export function leerPorcentaje(texto: string): number | null {
  const t = texto.trim().replace('%', '').replace(',', '.');
  if (!/^-?\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const v = Number(t);
  return v > -50 && v < 100 ? v : null;
}

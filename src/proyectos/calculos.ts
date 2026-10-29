/**
 * Cálculos de Proyectos y Notas. Funciones puras: reciben las listas y
 * devuelven números o listas ordenadas. No leen ni escriben la base.
 */
import { diaYMes, sumarDias } from '../dominio/fechas';
import type { Centavos } from '../dominio/tipos';
import type { Nota, Objetivo, Prioridad, Proyecto } from './tipos';

/* ---------- Avance de un proyecto ---------- */

export interface Avance {
  total: number;
  hechos: number;
  /** Suma de los montos de los objetivos tildados. */
  cubierto: Centavos;
  /** Suma de los montos de todos los objetivos, hechos o no. */
  asignado: Centavos;
  /** Presupuesto − cubierto. Null sin presupuesto. Puede ser negativo. */
  falta: Centavos | null;
  /**
   * Para la barra, de 0 a 1: con presupuesto, la plata cubierta; sin
   * presupuesto, los objetivos hechos. Null si no hay con qué medir.
   */
  parte: number | null;
}

export function avance(p: Proyecto, objetivos: Objetivo[]): Avance {
  const propios = objetivos.filter((o) => o.proyectoId === p.id && !o.borrado);
  const hechos = propios.filter((o) => o.hecho);
  const cubierto = hechos.reduce((a, o) => a + (o.monto ?? 0), 0);
  const asignado = propios.reduce((a, o) => a + (o.monto ?? 0), 0);
  const parte = p.presupuesto
    ? Math.min(1, cubierto / p.presupuesto)
    : propios.length
      ? hechos.length / propios.length
      : null;
  return {
    total: propios.length,
    hechos: hechos.length,
    cubierto,
    asignado,
    falta: p.presupuesto ? p.presupuesto - cubierto : null,
    parte,
  };
}

/** Pendientes primero, en el orden en que se cargaron; los hechos al final. */
export function ordenarObjetivos(objetivos: Objetivo[]): Objetivo[] {
  return [...objetivos].sort((a, b) => Number(a.hecho) - Number(b.hecho) || a.orden - b.orden);
}

/* ---------- Fechas de las notas ---------- */

export type Vencimiento = 'vencida' | 'hoy' | 'manana' | 'futura';

export function vencimiento(fecha: string, hoyStr: string): Vencimiento {
  if (fecha < hoyStr) return 'vencida';
  if (fecha === hoyStr) return 'hoy';
  if (fecha === sumarDias(hoyStr, 1)) return 'manana';
  return 'futura';
}

/** "Hoy", "Mañana", "15/11". */
export function textoFecha(fecha: string, hoyStr: string): string {
  const v = vencimiento(fecha, hoyStr);
  return v === 'hoy' ? 'Hoy' : v === 'manana' ? 'Mañana' : diaYMes(fecha);
}

/* ---------- Orden y filtros de las notas ---------- */

export interface NotasOrdenadas {
  fijadas: Nota[];
  pendientes: Nota[];
  /** La última que tildaste, primero. */
  hechas: Nota[];
}

/**
 * Pendientes: primero las vencidas, después por prioridad (alta arriba), por
 * fecha (las sin fecha al final) y, a igualdad, la más nueva arriba. Las
 * fijadas van aparte, con el mismo orden, salvo que ya estén hechas.
 */
export function ordenarNotas(notas: Nota[], hoyStr: string): NotasOrdenadas {
  const clave = (n: Nota) => [
    n.fecha && n.fecha < hoyStr ? 0 : 1,
    n.prioridad,
    n.fecha ?? '9999-99-99',
  ] as const;
  const comparar = (a: Nota, b: Nota) => {
    const ka = clave(a);
    const kb = clave(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i]! < kb[i]!) return -1;
      if (ka[i]! > kb[i]!) return 1;
    }
    return b.creadoEn.localeCompare(a.creadoEn);
  };
  const vivas = notas.filter((n) => !n.borrado);
  const abiertas = vivas.filter((n) => !n.hecha).sort(comparar);
  return {
    fijadas: abiertas.filter((n) => n.fijada),
    pendientes: abiertas.filter((n) => !n.fijada),
    hechas: vivas
      .filter((n) => n.hecha)
      .sort((a, b) => (b.hechaEn ?? b.actualizadoEn).localeCompare(a.hechaEn ?? a.actualizadoEn)),
  };
}

/** Sin acentos ni mayúsculas: "camion" encuentra "Camión". */
function plano(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Busca en el texto, el detalle y las etiquetas. Con etiqueta, sólo las que la tienen. */
export function filtrarNotas(notas: Nota[], busqueda: string, etiqueta: string | null): Nota[] {
  const q = plano(busqueda.trim().replace(/^#/, ''));
  return notas.filter(
    (n) =>
      (!etiqueta || n.etiquetas.includes(etiqueta)) &&
      (!q || plano(`${n.texto}\n${n.detalle}\n${n.etiquetas.join(' ')}`).includes(q)),
  );
}

/** Las etiquetas en uso (en notas sin borrar), de la más usada a la menos. */
export function etiquetasEnUso(notas: Nota[]): string[] {
  const cuenta = new Map<string, number>();
  for (const n of notas) {
    if (n.borrado) continue;
    for (const e of n.etiquetas) cuenta.set(e, (cuenta.get(e) ?? 0) + 1);
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([e]) => e);
}

/* ---------- Etiquetas y carga rápida ---------- */

/** "#Auto", "auto," → "auto". Vacío si no queda nada. */
export function normalizarEtiqueta(e: string): string {
  return e.trim().replace(/^#+/, '').replace(/[\s,]+/g, '-').toLowerCase();
}

/** "auto, #casa  viaje" → ["auto", "casa", "viaje"], sin repetidas. */
export function leerEtiquetas(texto: string): string[] {
  return [...new Set(texto.split(/[\s,]+/).map(normalizarEtiqueta).filter(Boolean))];
}

const ETIQUETA_EN_TEXTO = /(^|\s)#([\p{L}\p{N}_-]+)/gu;
const PRIORIDAD_EN_TEXTO = /(^|\s)!([123])(?=\s|$)/;

/**
 * Carga rápida, como en Todoist: "Pagar patente #auto !1" se guarda como
 * "Pagar patente", con la etiqueta "auto" y prioridad alta. Si después de
 * sacar las etiquetas no queda texto, el texto es lo que se escribió.
 */
export function leerNotaRapida(entrada: string): { texto: string; etiquetas: string[]; prioridad: Prioridad } {
  const etiquetas: string[] = [];
  let prioridad: Prioridad = 3;
  let texto = entrada.replace(PRIORIDAD_EN_TEXTO, (_, antes: string, p: string) => {
    prioridad = Number(p) as Prioridad;
    return antes;
  });
  texto = texto.replace(ETIQUETA_EN_TEXTO, (_, antes: string, e: string) => {
    etiquetas.push(normalizarEtiqueta(e));
    return antes;
  });
  texto = texto.replace(/\s+/g, ' ').trim();
  return { texto: texto || entrada.trim(), etiquetas: [...new Set(etiquetas)], prioridad };
}

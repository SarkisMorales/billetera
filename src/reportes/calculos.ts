/**
 * Cálculos del módulo de Reportes. Funciones puras: reciben lo que la app ya
 * tiene (cuentas, categorías, movimientos, cotización) más los históricos de
 * inflación y dólar, y devuelven números. No leen ni escriben la base.
 *
 * La dependencia es en un solo sentido: Reportes usa el núcleo, el núcleo no
 * sabe que Reportes existe.
 */
import { enPesos } from '../dominio/calculos';
import { diasDelMes, mesDe, sumarMeses } from '../dominio/fechas';
import type { Categoria, Centavos, Cuenta, Movimiento } from '../dominio/tipos';

/* ---------- Períodos ---------- */

export type IdPeriodo = 'mes' | 'mesPasado' | 'trimestre' | 'semestre' | 'anio';

export const PERIODOS: { id: IdPeriodo; nombre: string }[] = [
  { id: 'mes', nombre: 'Este mes' },
  { id: 'mesPasado', nombre: 'Mes pasado' },
  { id: 'trimestre', nombre: 'Últimos 3 meses' },
  { id: 'semestre', nombre: 'Últimos 6 meses' },
  { id: 'anio', nombre: 'Últimos 12 meses' },
];

export interface Rango {
  desde: string;
  hasta: string;
}

export interface Periodo extends Rango {
  anterior: Rango;
  /** Para los textos: "vs. el mes pasado al día 23". */
  contraQue: string;
}

function primerDia(mes: string): string {
  return `${mes}-01`;
}

function ultimoDia(mes: string): string {
  return `${mes}-${String(diasDelMes(mes)).padStart(2, '0')}`;
}

/**
 * Los meses "cerrados" (trimestre, semestre, año) no incluyen el mes en curso:
 * un mes a medias tira el promedio para abajo. "Este mes" se compara contra
 * el mes pasado hasta el mismo día, no contra el mes pasado entero.
 */
export function rangoPeriodo(id: IdPeriodo, hoyStr: string): Periodo {
  const mes = mesDe(hoyStr);
  const dia = Number(hoyStr.slice(8));

  if (id === 'mes') {
    const previo = sumarMeses(mes, -1);
    const diaPrevio = Math.min(dia, diasDelMes(previo));
    return {
      desde: primerDia(mes),
      hasta: hoyStr,
      anterior: { desde: primerDia(previo), hasta: `${previo}-${String(diaPrevio).padStart(2, '0')}` },
      contraQue: `el mes pasado al día ${diaPrevio}`,
    };
  }

  const meses = id === 'mesPasado' ? 1 : id === 'trimestre' ? 3 : id === 'semestre' ? 6 : 12;
  const ultimo = sumarMeses(mes, -1);
  const primero = sumarMeses(mes, -meses);
  return {
    desde: primerDia(primero),
    hasta: ultimoDia(ultimo),
    anterior: { desde: primerDia(sumarMeses(primero, -meses)), hasta: ultimoDia(sumarMeses(primero, -1)) },
    contraQue: meses === 1 ? 'el mes anterior' : `los ${meses} meses anteriores`,
  };
}

function aFecha(s: string): Date {
  const [a, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(a, m - 1, d);
}

export function diasEnRango(r: Rango): number {
  return Math.round((aFecha(r.hasta).getTime() - aFecha(r.desde).getTime()) / 86_400_000) + 1;
}

function enRango(fecha: string, r: Rango): boolean {
  return fecha >= r.desde && fecha <= r.hasta;
}

/* ---------- Contexto común ---------- */

export interface Datos {
  cuentas: Cuenta[];
  categorias: Categoria[];
  movimientos: Movimiento[];
  /** Pesos por dólar vigente en la app (puede no haber). */
  cotizacion: number | null;
}

function porId<T extends { id: string }>(xs: T[]): Map<string, T> {
  return new Map(xs.map((x) => [x.id, x]));
}

function gastosEn(d: Datos, r: Rango): Movimiento[] {
  return d.movimientos.filter((m) => !m.borrado && m.tipo === 'gasto' && enRango(m.fecha, r));
}

/* ---------- Resumen del período ---------- */

export interface Resumen {
  gastos: Centavos;
  ingresos: Centavos;
  /** (ingresos − gastos) / ingresos. Null si no entró nada. */
  tasaAhorro: number | null;
  promedioDiario: Centavos;
  dias: number;
  diasSinGastos: number;
  cantidadGastos: number;
}

export function resumen(d: Datos, r: Rango): Resumen {
  const cuentas = porId(d.cuentas);
  let gastos = 0;
  let ingresos = 0;
  let cantidadGastos = 0;
  const diasConGasto = new Set<string>();
  for (const m of d.movimientos) {
    if (m.borrado || m.tipo === 'transferencia' || !enRango(m.fecha, r)) continue;
    const pesos = enPesos(m, cuentas, d.cotizacion);
    if (m.tipo === 'ingreso') ingresos += pesos;
    else {
      gastos += pesos;
      cantidadGastos++;
      diasConGasto.add(m.fecha);
    }
  }
  const dias = diasEnRango(r);
  return {
    gastos,
    ingresos,
    tasaAhorro: ingresos > 0 ? (ingresos - gastos) / ingresos : null,
    promedioDiario: Math.round(gastos / dias),
    dias,
    diasSinGastos: dias - diasConGasto.size,
    cantidadGastos,
  };
}

/** Variación relativa; null si no hay base para comparar. */
export function variacion(actual: number, anterior: number): number | null {
  return anterior > 0 ? actual / anterior - 1 : null;
}

/* ---------- Día de la semana ---------- */

export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  const medio = Math.floor(o.length / 2);
  return o.length % 2 ? o[medio]! : (o[medio - 1]! + o[medio]!) / 2;
}

/**
 * Lo que gastás un día típico de cada día de la semana: la mediana de lo
 * gastado en cada lunes, cada martes, etc. Mediana y no promedio: si el
 * alquiler cae un lunes, el promedio diría que los lunes gastás fortunas. Y
 * por día y no total: en un mes puede haber cinco sábados y cuatro lunes.
 * Índice 0 = lunes.
 */
export function gastoPorDiaSemana(d: Datos, r: Rango): Centavos[] {
  const cuentas = porId(d.cuentas);
  const porFecha = new Map<string, number>();
  for (const m of gastosEn(d, r)) {
    porFecha.set(m.fecha, (porFecha.get(m.fecha) ?? 0) + enPesos(m, cuentas, d.cotizacion));
  }
  const dias: number[][] = Array.from({ length: 7 }, () => []);
  for (let f = aFecha(r.desde); f <= aFecha(r.hasta); f.setDate(f.getDate() + 1)) {
    const clave = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
    dias[(f.getDay() + 6) % 7]!.push(porFecha.get(clave) ?? 0);
  }
  return dias.map((xs) => Math.round(mediana(xs)));
}

/**
 * Desde cuándo hay datos: el primer movimiento o la primera cuenta creada,
 * lo que sea antes. Antes de eso no hay con qué comparar.
 */
export function inicioDeDatos(d: Datos): string | null {
  let inicio: string | null = null;
  for (const c of d.cuentas) {
    const f = c.creadoEn.slice(0, 10);
    if (f && (!inicio || f < inicio)) inicio = f;
  }
  for (const m of d.movimientos) if (!m.borrado && (!inicio || m.fecha < inicio)) inicio = m.fecha;
  return inicio;
}

/** Si el rango entero cae dentro de lo que la app conoce. */
export function hayDatosDesde(d: Datos, r: Rango): boolean {
  const inicio = inicioDeDatos(d);
  return inicio !== null && inicio <= r.desde;
}

/* ---------- Categorías y cuentas ---------- */

export interface Fila {
  id: string;
  total: Centavos;
  anterior: Centavos;
  /** Parte del total del período, 0 a 1. */
  parte: number;
}

function agrupar(
  d: Datos,
  periodo: Periodo,
  clave: (m: Movimiento) => string,
): Fila[] {
  const cuentas = porId(d.cuentas);
  const actual = new Map<string, number>();
  const anterior = new Map<string, number>();
  for (const [r, destino] of [
    [periodo, actual],
    [periodo.anterior, anterior],
  ] as const) {
    for (const m of gastosEn(d, r)) {
      const k = clave(m);
      destino.set(k, (destino.get(k) ?? 0) + enPesos(m, cuentas, d.cotizacion));
    }
  }
  const total = [...actual.values()].reduce((a, b) => a + b, 0);
  return [...actual.entries()]
    .map(([id, t]) => ({ id, total: t, anterior: anterior.get(id) ?? 0, parte: total ? t / total : 0 }))
    .sort((a, b) => b.total - a.total);
}

export function porCategoria(d: Datos, p: Periodo): Fila[] {
  return agrupar(d, p, (m) => m.categoriaId ?? '');
}

export function porCuenta(d: Datos, p: Periodo): Fila[] {
  return agrupar(d, p, (m) => m.cuentaId);
}

export function mayoresGastos(d: Datos, r: Rango, cuantos = 5): Movimiento[] {
  const cuentas = porId(d.cuentas);
  return gastosEn(d, r)
    .sort((a, b) => enPesos(b, cuentas, d.cotizacion) - enPesos(a, cuentas, d.cotizacion))
    .slice(0, cuantos);
}

/* ---------- Hallazgos ---------- */

export interface Hallazgo {
  icono: string;
  texto: string;
}

/** Gasto chico: menos de esto en dólares. En dólares para que la inflación no lo vuelva viejo. */
export const UMBRAL_HORMIGA_USD = 5;

/**
 * Frases cortas con lo que más llama la atención del período. Sólo se dicen
 * cuando hay datos suficientes para que no sean ruido.
 */
export function hallazgos(
  d: Datos,
  p: Periodo,
  formato: (c: Centavos) => string,
): Hallazgo[] {
  const res = resumen(d, p);
  if (res.cantidadGastos === 0) return [];
  const lista: Hallazgo[] = [];
  const categorias = porId(d.categorias);
  const cuentas = porId(d.cuentas);

  // La categoría que más subió, en pesos, contra el período anterior.
  const subas = (hayDatosDesde(d, p.anterior) ? porCategoria(d, p) : [])
    .filter((f) => f.anterior > 0 && f.total - f.anterior > 0)
    .sort((a, b) => b.total - b.anterior - (a.total - a.anterior));
  const suba = subas[0];
  if (suba) {
    const c = categorias.get(suba.id);
    const v = variacion(suba.total, suba.anterior)!;
    lista.push({
      icono: '📈',
      texto: `${c?.nombre ?? 'Sin categoría'} es lo que más subió: ${formato(suba.total - suba.anterior)} más que ${p.contraQue} (+${Math.round(v * 100)}%).`,
    });
  }

  // Día de la semana caro, con tres semanas o más de datos (la mediana con
  // dos valores es un promedio y no protege de nada).
  if (res.dias >= 21) {
    const porDia = gastoPorDiaSemana(d, p);
    const max = Math.max(...porDia);
    const i = porDia.indexOf(max);
    const tipico = porDia.reduce((a, b) => a + b, 0) / 7;
    const veces = tipico > 0 ? max / tipico : 0;
    if (veces >= 1.5) {
      const nombres = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
      lista.push({
        icono: '📅',
        texto: `Un ${nombres[i]} típico gastás ${veces.toLocaleString('es-AR', { maximumFractionDigits: 1 })} veces lo de un día típico de la semana.`,
      });
    }
  }

  // Gasto hormiga.
  if (d.cotizacion) {
    const umbral = UMBRAL_HORMIGA_USD * 100 * d.cotizacion;
    const chicos = gastosEn(d, p)
      .map((m) => enPesos(m, cuentas, d.cotizacion))
      .filter((c) => c < umbral);
    const suma = chicos.reduce((a, b) => a + b, 0);
    if (chicos.length >= 5 && suma / res.gastos >= 0.05) {
      lista.push({
        icono: '🐜',
        texto: `${chicos.length} gastos chicos (menos de US$ ${UMBRAL_HORMIGA_USD} cada uno) suman ${formato(suma)}: el ${Math.round((suma / res.gastos) * 100)}% del total.`,
      });
    }
  }

  // De qué cuenta sale la plata.
  const cuenta = porCuenta(d, p)[0];
  if (cuenta && cuenta.parte >= 0.5 && d.cuentas.length > 1) {
    lista.push({
      icono: '💳',
      texto: `El ${Math.round(cuenta.parte * 100)}% de lo que gastaste salió de ${cuentas.get(cuenta.id)?.nombre ?? 'una cuenta'}.`,
    });
  }

  if (res.diasSinGastos > 0 && res.dias >= 7) {
    lista.push({
      icono: '🌱',
      texto: `${res.diasSinGastos} de ${res.dias} días sin ningún gasto cargado.`,
    });
  }

  return lista.slice(0, 4);
}

/* ---------- Históricos: inflación y dólar ---------- */

export interface Historicos {
  /** Inflación mensual INDEC: 'AAAA-MM' → % del mes. */
  inflacion: Map<string, number>;
  /** Dólar de la casa elegida, venta diaria ordenada por fecha. */
  dolar: { fecha: string; venta: number }[];
}

/** Último mes con dato de inflación publicado. */
export function ultimoMesInflacion(h: Historicos): string | null {
  let ultimo: string | null = null;
  for (const mes of h.inflacion.keys()) if (!ultimo || mes > ultimo) ultimo = mes;
  return ultimo;
}

/**
 * Por cuánto multiplicar pesos de `mes` para llevarlos a pesos del último mes
 * con inflación publicada. Los meses posteriores a ése valen 1: no inventamos
 * inflación que todavía no se publicó. Null si falta algún mes en el medio.
 */
export function factorInflacion(mes: string, h: Historicos): number | null {
  const ultimo = ultimoMesInflacion(h);
  if (!ultimo) return null;
  let factor = 1;
  for (let m = sumarMeses(mes, 1); m <= ultimo; m = sumarMeses(m, 1)) {
    const v = h.inflacion.get(m);
    if (v === undefined) return null;
    factor *= 1 + v / 100;
  }
  return factor;
}

/** Venta promedio del dólar en el mes. */
export function dolarPromedio(mes: string, h: Historicos): number | null {
  const delMes = h.dolar.filter((x) => mesDe(x.fecha) === mes);
  if (!delMes.length) return null;
  return delMes.reduce((a, x) => a + x.venta, 0) / delMes.length;
}

/** Último dólar publicado hasta esa fecha (máximo 10 días antes, si no es un dato viejo). */
export function dolarAl(fecha: string, h: Historicos): number | null {
  let ultimo: { fecha: string; venta: number } | null = null;
  for (const x of h.dolar) {
    if (x.fecha > fecha) break;
    ultimo = x;
  }
  if (!ultimo) return null;
  const dias = (aFecha(fecha).getTime() - aFecha(ultimo.fecha).getTime()) / 86_400_000;
  return dias <= 10 ? ultimo.venta : null;
}

/* ---------- Tendencia mes a mes ---------- */

export type Unidad = 'pesos' | 'reales' | 'dolares';

export interface Mes {
  mes: string;
  enCurso: boolean;
  /** En la unidad pedida; null si falta el dato para convertir. */
  gastos: Centavos | null;
  ingresos: Centavos | null;
  tasaAhorro: number | null;
}

export function tendencia(
  d: Datos,
  h: Historicos,
  unidad: Unidad,
  hoyStr: string,
  cuantos = 6,
): Mes[] {
  const cuentas = porId(d.cuentas);
  const mesActual = mesDe(hoyStr);
  const meses = Array.from({ length: cuantos }, (_, i) => sumarMeses(mesActual, i - cuantos + 1));

  return meses.map((mes) => {
    const enCurso = mes === mesActual;
    const factor = unidad === 'reales' ? factorInflacion(mes, h) : 1;
    const dolar = unidad === 'dolares' ? (dolarPromedio(mes, h) ?? (enCurso ? d.cotizacion : null)) : null;

    let gastos = 0;
    let ingresos = 0;
    let falta = factor === null;
    for (const m of d.movimientos) {
      if (m.borrado || m.tipo === 'transferencia' || mesDe(m.fecha) !== mes) continue;
      let valor: number;
      if (unidad === 'dolares') {
        // Lo que ya está en dólares no se convierte ida y vuelta.
        if (cuentas.get(m.cuentaId)?.moneda === 'USD') valor = m.monto;
        else if (dolar) valor = m.monto / dolar;
        else {
          falta = true;
          continue;
        }
      } else {
        valor = enPesos(m, cuentas, d.cotizacion) * (factor ?? 1);
      }
      if (m.tipo === 'gasto') gastos += valor;
      else ingresos += valor;
    }
    return {
      mes,
      enCurso,
      gastos: falta ? null : Math.round(gastos),
      ingresos: falta ? null : Math.round(ingresos),
      tasaAhorro: !falta && ingresos > 0 ? (ingresos - gastos) / ingresos : null,
    };
  });
}

/* ---------- Patrimonio en dólares a fin de mes ---------- */

export interface PuntoPatrimonio {
  mes: string;
  enCurso: boolean;
  /** Centavos de dólar; null si no hay cotización para ese día. */
  dolares: Centavos | null;
}

/**
 * Cuánto tenías en dólares (pesos convertidos + dólares) al cierre de cada
 * mes. Una cuenta cuenta desde que la creaste en la app; los meses anteriores
 * a la primera cuenta no se muestran. Las archivadas no suman, igual que en
 * el inicio.
 */
export function patrimonioMensual(
  d: Datos,
  h: Historicos,
  hoyStr: string,
  cuantos = 6,
): PuntoPatrimonio[] {
  const vivas = d.cuentas.filter((c) => !c.archivada);
  if (!vivas.length) return [];
  const desdeMes = vivas.map((c) => mesDe(c.creadoEn.slice(0, 10))).sort()[0]!;
  const mesActual = mesDe(hoyStr);
  const movs = d.movimientos.filter((m) => !m.borrado);

  const puntos: PuntoPatrimonio[] = [];
  for (let i = cuantos - 1; i >= 0; i--) {
    const mes = sumarMeses(mesActual, -i);
    if (mes < desdeMes) continue;
    const enCurso = mes === mesActual;
    const corte = enCurso ? hoyStr : ultimoDia(mes);
    const saldos = new Map<string, number>();
    for (const c of vivas) {
      if (c.creadoEn.slice(0, 10) <= corte) saldos.set(c.id, c.saldoInicial);
    }
    for (const m of movs) {
      if (m.fecha > corte) continue;
      const sumar = (id: string | null, delta: number) => {
        if (id && saldos.has(id)) saldos.set(id, saldos.get(id)! + delta);
      };
      if (m.tipo === 'ingreso') sumar(m.cuentaId, m.monto);
      else if (m.tipo === 'gasto') sumar(m.cuentaId, -m.monto);
      else {
        sumar(m.cuentaId, -m.monto);
        sumar(m.cuentaDestinoId, m.montoDestino ?? m.monto);
      }
    }
    let pesos = 0;
    let dolares = 0;
    for (const c of vivas) {
      const s = saldos.get(c.id);
      if (s === undefined) continue;
      if (c.moneda === 'ARS') pesos += s;
      else dolares += s;
    }
    const tasa = enCurso ? d.cotizacion : dolarAl(corte, h);
    puntos.push({
      mes,
      enCurso,
      dolares: pesos !== 0 && !tasa ? null : Math.round(dolares + (tasa ? pesos / tasa : 0)),
    });
  }
  return puntos;
}

/* ---------- Tus dólares ---------- */

export interface Dolares {
  usdComprados: Centavos;
  pesosPagados: Centavos;
  /** Pesos por dólar promedio que pagaste. */
  tcCompra: number | null;
  usdVendidos: Centavos;
  pesosRecibidos: Centavos;
  tcVenta: number | null;
  /** Lo comprado valuado a la cotización de hoy. */
  valorHoy: Centavos | null;
  /** valorHoy − pesosPagados. */
  resultado: Centavos | null;
  /** Lo pagado llevado a pesos de hoy con la inflación. */
  costoReal: Centavos | null;
  resultadoReal: Centavos | null;
  gastadoEnDolares: Centavos;
}

/**
 * Compras y ventas de dólares (transferencias entre cuentas de distinta
 * moneda) y si te convino: lo que pagaste contra lo que valen hoy, en pesos
 * nominales y descontando la inflación del medio.
 */
export function dolares(d: Datos, h: Historicos): Dolares {
  const cuentas = porId(d.cuentas);
  let usdComprados = 0;
  let pesosPagados = 0;
  let usdVendidos = 0;
  let pesosRecibidos = 0;
  let costoReal: number | null = 0;
  let gastadoEnDolares = 0;

  for (const m of d.movimientos) {
    if (m.borrado) continue;
    const origen = cuentas.get(m.cuentaId);
    if (m.tipo === 'gasto' && origen?.moneda === 'USD') gastadoEnDolares += m.monto;
    if (m.tipo !== 'transferencia' || !m.cuentaDestinoId) continue;
    const destino = cuentas.get(m.cuentaDestinoId);
    if (!origen || !destino || origen.moneda === destino.moneda) continue;
    const recibido = m.montoDestino ?? m.monto;
    if (origen.moneda === 'ARS') {
      usdComprados += recibido;
      pesosPagados += m.monto;
      const f = factorInflacion(mesDe(m.fecha), h);
      costoReal = costoReal === null || f === null ? null : costoReal + m.monto * f;
    } else {
      usdVendidos += m.monto;
      pesosRecibidos += recibido;
    }
  }

  const valorHoy = d.cotizacion && usdComprados ? Math.round(usdComprados * d.cotizacion) : null;
  const real = usdComprados && costoReal !== null && h.inflacion.size ? Math.round(costoReal) : null;
  return {
    usdComprados,
    pesosPagados,
    tcCompra: usdComprados ? pesosPagados / usdComprados : null,
    usdVendidos,
    pesosRecibidos,
    tcVenta: usdVendidos ? pesosRecibidos / usdVendidos : null,
    valorHoy,
    resultado: valorHoy !== null ? valorHoy - pesosPagados : null,
    costoReal: real,
    resultadoReal: valorHoy !== null && real !== null ? valorHoy - real : null,
    gastadoEnDolares,
  };
}

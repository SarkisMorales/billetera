import { acumulada, leerPorcentaje, resumir, serieEfectiva } from './calculos';
import { necesitaActualizar, leerSerie } from './inflacion';

const API: [string, number][] = [
  ['2025-11', 2.5],
  ['2025-12', 2.8],
  ['2026-01', 2.9],
  ['2026-02', 2.9],
  ['2026-03', 3.4],
  ['2026-04', 2.6],
  ['2026-05', 2.1],
  ['2026-06', 1.9],
  ['2026-07', 2.1],
  ['2026-08', 1.7],
  ['2026-09', 1.9],
];

describe('inflación', () => {
  it('acumula multiplicando, no sumando', () => {
    expect(acumulada([2, 3])).toBeCloseTo(5.06);
    expect(acumulada([])).toBe(0);
  });

  it('último dato, acumulado del año y mes a mes', () => {
    const r = resumir(serieEfectiva(API), 3)!;
    expect(r.ultimo).toEqual({ mes: '2026-09', valor: 1.9, manual: false });
    expect(r.anio.meses).toBe(9);
    expect(r.anio.valor).toBeCloseTo(acumulada([2.9, 2.9, 3.4, 2.6, 2.1, 1.9, 2.1, 1.7, 1.9]));
    expect(r.meses.map((m) => [m.mes, m.cambio])).toEqual([
      ['2026-07', 0.2],
      ['2026-08', -0.4],
      ['2026-09', 0.2],
    ]);
    expect(r.periodo).toBeCloseTo(acumulada([2.1, 1.7, 1.9]));
    expect(resumir(serieEfectiva(API), 6)!.meses).toHaveLength(6);
  });

  it('la corrección a mano pisa al dato de internet y puede agregar un mes nuevo', () => {
    const r = resumir(serieEfectiva(API, { '2026-09': 2.0, '2026-10': 2.2 }), 3)!;
    expect(r.ultimo).toEqual({ mes: '2026-10', valor: 2.2, manual: true });
    expect(r.meses.find((m) => m.mes === '2026-09')).toMatchObject({ valor: 2.0, manual: true });
  });

  it('avisa si falta un mes en el medio en vez de saltearlo callado', () => {
    const conHueco = API.filter(([m]) => m !== '2026-08');
    const r = resumir(serieEfectiva(conHueco), 3)!;
    expect(r.huecos).toEqual(['2026-08']);
    expect(r.meses.find((m) => m.mes === '2026-09')!.cambio).toBeNull();
  });

  it('sin datos no hay resumen', () => {
    expect(resumir([], 3)).toBeNull();
  });

  it('lee porcentajes escritos a mano', () => {
    expect(['1,9', '1.9', '2', '-0,3', '2,5%'].map(leerPorcentaje)).toEqual([1.9, 1.9, 2, -0.3, 2.5]);
    expect(['', 'abc', '1,234', '150', '1.9.1'].map(leerPorcentaje)).toEqual([null, null, null, null, null]);
  });
});

describe('caché diario', () => {
  it('pide a la API como mucho una vez por día', () => {
    const ahora = new Date(2026, 9, 24, 22, 0);
    expect(necesitaActualizar(null, ahora)).toBe(true);
    expect(necesitaActualizar(new Date(2026, 9, 24, 8, 0).toISOString(), ahora)).toBe(false);
    expect(necesitaActualizar(new Date(2026, 9, 23, 23, 59).toISOString(), ahora)).toBe(true);
  });

  it('lee la respuesta real de la API y descarta lo que no entiende', () => {
    expect(
      leerSerie([
        { fecha: '2026-09-30', valor: 1.9 },
        { fecha: '2026-08-31', valor: 2 },
        { fecha: 'x', valor: 1 },
        { fecha: '2026-07-31', valor: '2' },
        null,
      ]),
    ).toEqual([
      ['2026-08', 2],
      ['2026-09', 1.9],
    ]);
    expect(leerSerie({ error: 'caída' })).toEqual([]);
  });
});

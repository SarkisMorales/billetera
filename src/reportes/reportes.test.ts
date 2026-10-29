import type { Categoria, Cuenta, Movimiento } from '../dominio/tipos';
import {
  dolares,
  factorInflacion,
  hallazgos,
  hayDatosDesde,
  patrimonioMensual,
  porCategoria,
  rangoPeriodo,
  resumen,
  tendencia,
  type Datos,
  type Historicos,
} from './calculos';
import { leerDolar, leerInflacion } from './historicos';
import { topeEje } from './Graficos';

/* Datos armados a mano: los reportes son funciones puras, no necesitan base. */

function cuenta(id: string, moneda: 'ARS' | 'USD', saldoInicial = 0, creadoEn = '2026-01-01T12:00:00.000Z'): Cuenta {
  return { id, nombre: id, moneda, tipo: 'banco', saldoInicial, archivada: false, orden: 0, creadoEn, actualizadoEn: creadoEn };
}

function categoria(id: string, tipo: 'gasto' | 'ingreso' = 'gasto', orden = 0): Categoria {
  return { id, nombre: id, tipo, emoji: '•', presupuesto: null, archivada: false, orden, creadoEn: '', actualizadoEn: '' };
}

let n = 0;
function mov(p: Partial<Movimiento> & Pick<Movimiento, 'fecha' | 'monto' | 'cuentaId'>): Movimiento {
  return {
    id: `m${++n}`,
    tipo: 'gasto',
    categoriaId: 'super',
    cuentaDestinoId: null,
    montoDestino: null,
    cotizacion: null,
    nota: '',
    borrado: false,
    creadoEn: '',
    actualizadoEn: '',
    ...p,
  };
}

const CUENTAS = [cuenta('banco', 'ARS', 1_000_000_00), cuenta('usd', 'USD', 0)];
const CATEGORIAS = [categoria('super'), categoria('salidas', 'gasto', 1), categoria('sueldo', 'ingreso', 2)];

function datos(movimientos: Movimiento[], cotizacion: number | null = 1500): Datos {
  return { cuentas: CUENTAS, categorias: CATEGORIAS, movimientos, cotizacion };
}

const SIN_HISTORICOS: Historicos = { inflacion: new Map(), dolar: [] };

describe('períodos', () => {
  it('este mes se compara con el mes pasado hasta el mismo día', () => {
    expect(rangoPeriodo('mes', '2026-10-23')).toMatchObject({
      desde: '2026-10-01',
      hasta: '2026-10-23',
      anterior: { desde: '2026-09-01', hasta: '2026-09-23' },
    });
    // 31 de marzo contra febrero: hasta el último día que tiene febrero.
    expect(rangoPeriodo('mes', '2026-03-31').anterior.hasta).toBe('2026-02-28');
  });

  it('los períodos largos usan meses cerrados, sin el mes en curso', () => {
    expect(rangoPeriodo('trimestre', '2026-10-23')).toMatchObject({
      desde: '2026-07-01',
      hasta: '2026-09-30',
      anterior: { desde: '2026-04-01', hasta: '2026-06-30' },
    });
    expect(rangoPeriodo('anio', '2026-10-23')).toMatchObject({ desde: '2025-10-01', hasta: '2026-09-30' });
    expect(rangoPeriodo('mesPasado', '2026-01-10')).toMatchObject({
      desde: '2025-12-01',
      hasta: '2025-12-31',
      anterior: { desde: '2025-11-01', hasta: '2025-11-30' },
    });
  });
});

describe('resumen', () => {
  // Del jueves 1 al miércoles 14 de octubre de 2026.
  const r = { desde: '2026-10-01', hasta: '2026-10-14' };
  const movs = [
    mov({ fecha: '2026-10-03', monto: 100_00, cuentaId: 'banco' }), // sábado
    mov({ fecha: '2026-10-10', monto: 300_00, cuentaId: 'banco' }), // sábado
    mov({ fecha: '2026-10-05', monto: 50_00, cuentaId: 'banco' }), // lunes
    mov({ fecha: '2026-10-05', monto: 1_00, cuentaId: 'usd', categoriaId: 'salidas' }), // lunes, US$ 1
    mov({ tipo: 'ingreso', fecha: '2026-10-02', monto: 1_000_00, cuentaId: 'banco', categoriaId: 'sueldo' }),
    mov({ fecha: '2026-10-06', monto: 999_00, cuentaId: 'banco', borrado: true }),
    mov({ fecha: '2026-10-20', monto: 999_00, cuentaId: 'banco' }), // fuera del rango
  ];

  it('suma ingresos, gastos, ahorro y días sin gastos', () => {
    const res = resumen(datos(movs), r);
    expect(res.gastos).toBe(100_00 + 300_00 + 50_00 + 1500_00);
    expect(res.ingresos).toBe(1_000_00);
    expect(res.tasaAhorro).toBeCloseTo((1_000_00 - 1_950_00) / 1_000_00);
    expect(res.dias).toBe(14);
    expect(res.diasSinGastos).toBe(14 - 3);
    expect(res.cantidadGastos).toBe(4);
  });
});

describe('categorías', () => {
  it('compara contra el período anterior y calcula la parte de cada una', () => {
    const p = rangoPeriodo('mes', '2026-10-15');
    const movs = [
      mov({ fecha: '2026-10-02', monto: 300_00, cuentaId: 'banco' }),
      mov({ fecha: '2026-10-03', monto: 100_00, cuentaId: 'banco', categoriaId: 'salidas' }),
      mov({ fecha: '2026-09-05', monto: 200_00, cuentaId: 'banco' }),
      // Después del 15 de septiembre: no entra en la comparación.
      mov({ fecha: '2026-09-20', monto: 5_000_00, cuentaId: 'banco' }),
    ];
    const filas = porCategoria(datos(movs), p);
    expect(filas).toEqual([
      { id: 'super', total: 300_00, anterior: 200_00, parte: 0.75 },
      { id: 'salidas', total: 100_00, anterior: 0, parte: 0.25 },
    ]);

    const textos = hallazgos(datos(movs), p, (c) => String(c / 100)).map((h) => h.texto.replace(/\u00a0/g, ' '));
    expect(textos[0]).toBe('super es lo que más subió: 100 más que el mes pasado al día 15 (▲ 50% más).');
  });

  it('no compara contra un período en el que la app todavía no tenía datos', () => {
    const p = rangoPeriodo('mes', '2026-10-15');
    const nuevas = [cuenta('banco', 'ARS', 0, '2026-09-10T12:00:00.000Z')];
    const movs = [
      mov({ fecha: '2026-10-02', monto: 300_00, cuentaId: 'banco' }),
      mov({ fecha: '2026-09-12', monto: 100_00, cuentaId: 'banco' }),
    ];
    const d = { cuentas: nuevas, categorias: CATEGORIAS, movimientos: movs, cotizacion: 1500 };
    expect(hayDatosDesde(d, p.anterior)).toBe(false); // desde el 10/9, falta el 1 al 9
    expect(hallazgos(d, p, String).some((h) => h.texto.includes('subió'))).toBe(false);
  });
});

describe('inflación', () => {
  const h: Historicos = {
    inflacion: new Map([
      ['2026-07', 1],
      ['2026-08', 2],
      ['2026-09', 3],
    ]),
    dolar: [],
  };

  it('lleva pesos viejos a pesos del último mes publicado', () => {
    expect(factorInflacion('2026-07', h)).toBeCloseTo(1.02 * 1.03);
    expect(factorInflacion('2026-08', h)).toBeCloseTo(1.03);
    expect(factorInflacion('2026-09', h)).toBe(1);
    // Octubre todavía no tiene dato: no se inventa.
    expect(factorInflacion('2026-10', h)).toBe(1);
  });

  it('si falta un mes en el medio, no hay factor', () => {
    expect(factorInflacion('2026-05', h)).toBeNull();
    expect(factorInflacion('2026-09', SIN_HISTORICOS)).toBeNull();
  });
});

describe('tendencia', () => {
  const h: Historicos = {
    inflacion: new Map([['2026-09', 10]]),
    dolar: [
      { fecha: '2026-09-10', venta: 1400 },
      { fecha: '2026-09-20', venta: 1600 },
    ],
  };
  const movs = [
    mov({ fecha: '2026-09-05', monto: 150_000_00, cuentaId: 'banco' }),
    mov({ fecha: '2026-09-06', monto: 10_00, cuentaId: 'usd', cotizacion: 1500 }),
    mov({ tipo: 'ingreso', fecha: '2026-09-01', monto: 600_000_00, cuentaId: 'banco', categoriaId: 'sueldo' }),
    mov({ fecha: '2026-10-02', monto: 30_000_00, cuentaId: 'banco' }),
  ];

  it('en dólares usa el promedio del mes y no reconvierte lo que ya es USD', () => {
    const t = tendencia(datos(movs), h, 'dolares', '2026-10-23', 3);
    expect(t.map((m) => m.mes)).toEqual(['2026-08', '2026-09', '2026-10']);
    const sep = t[1]!;
    expect(sep.gastos).toBe(100_00 + 10_00); // 150.000 / 1.500 + US$ 10
    expect(sep.ingresos).toBe(400_00);
    // Octubre todavía no tiene histórico: usa la cotización de hoy.
    expect(t[2]).toMatchObject({ enCurso: true, gastos: 20_00 });
  });

  it('en pesos de hoy ajusta los meses viejos y deja igual los nuevos', () => {
    const t = tendencia(datos(movs), h, 'reales', '2026-10-23', 3);
    expect(t[1]!.gastos).toBe(150_000_00 + 15_000_00); // septiembre ya es el último publicado: × 1
    expect(t[0]!.gastos).toBe(0); // agosto: × 1,10, pero no hubo gastos
    expect(t[1]!.tasaAhorro).toBeCloseTo((600_000 - 165_000) / 600_000);
  });

  it('sin históricos, dólares y pesos de hoy quedan sin dato en vez de inventar', () => {
    const t = tendencia(datos(movs), SIN_HISTORICOS, 'dolares', '2026-10-23', 3);
    expect(t[1]!.gastos).toBeNull();
    expect(tendencia(datos(movs), SIN_HISTORICOS, 'reales', '2026-10-23', 3)[1]!.gastos).toBeNull();
  });
});

describe('patrimonio en dólares', () => {
  it('reconstruye el saldo al cierre de cada mes al dólar de ese día', () => {
    const cuentas = [cuenta('banco', 'ARS', 300_000_00, '2026-08-15T12:00:00.000Z'), cuenta('usd', 'USD', 100_00, '2026-08-15T12:00:00.000Z')];
    const h: Historicos = {
      inflacion: new Map(),
      dolar: [
        { fecha: '2026-08-29', venta: 1500 },
        { fecha: '2026-09-30', venta: 2000 },
      ],
    };
    const movs = [
      mov({ fecha: '2026-09-10', monto: 100_000_00, cuentaId: 'banco' }),
      mov({ fecha: '2026-10-05', monto: 50_00, cuentaId: 'usd' }),
    ];
    const p = patrimonioMensual({ cuentas, categorias: CATEGORIAS, movimientos: movs, cotizacion: 2000 }, h, '2026-10-23', 6);
    // Antes de agosto no había cuentas: no aparecen.
    expect(p.map((x) => [x.mes, x.dolares])).toEqual([
      ['2026-08', 100_00 + 200_00], // $ 300.000 a 1.500 + US$ 100
      ['2026-09', 100_00 + 100_00], // $ 200.000 a 2.000 + US$ 100
      ['2026-10', 50_00 + 100_00], // hoy: US$ 50 + $ 200.000 a 2.000
    ]);
  });
});

describe('tus dólares', () => {
  it('compara lo que pagaste con lo que valen hoy, nominal y real', () => {
    const h: Historicos = { inflacion: new Map([['2026-09', 10]]), dolar: [] };
    const movs = [
      mov({ tipo: 'transferencia', fecha: '2026-08-10', monto: 150_000_00, cuentaId: 'banco', cuentaDestinoId: 'usd', montoDestino: 100_00, categoriaId: null }),
      mov({ tipo: 'transferencia', fecha: '2026-10-01', monto: 10_00, cuentaId: 'usd', cuentaDestinoId: 'banco', montoDestino: 16_000_00, categoriaId: null }),
      mov({ fecha: '2026-10-02', monto: 5_00, cuentaId: 'usd', categoriaId: 'salidas' }),
    ];
    const d = dolares(datos(movs, 1600), h);
    expect(d).toMatchObject({
      usdComprados: 100_00,
      pesosPagados: 150_000_00,
      tcCompra: 1500,
      usdVendidos: 10_00,
      tcVenta: 1600,
      valorHoy: 160_000_00,
      resultado: 10_000_00,
      costoReal: 165_000_00, // agosto × 1,10 de septiembre
      resultadoReal: -5_000_00,
      gastadoEnDolares: 5_00,
    });
  });
});

describe('lectura de las APIs', () => {
  it('inflación y dólar: toma lo válido, ignora lo demás', () => {
    expect(leerInflacion([{ fecha: '2026-09-30', valor: 1.9 }, { fecha: 'x', valor: 1 }, null])).toEqual([['2026-09', 1.9]]);
    expect(
      leerDolar([
        { casa: 'bolsa', compra: 1, venta: 1563.9, fecha: '2026-10-24' },
        { casa: 'bolsa', venta: 1553.6, fecha: '2026-10-23' },
        { venta: 0, fecha: '2026-10-22' },
      ]),
    ).toEqual([
      { fecha: '2026-10-23', venta: 1553.6 },
      { fecha: '2026-10-24', venta: 1563.9 },
    ]);
    expect(leerDolar({ error: true })).toEqual([]);
  });

  it('el eje redondea a números limpios', () => {
    expect([1, 7, 13, 240, 2600, 49_000].map(topeEje)).toEqual([1, 10, 20, 250, 5000, 50_000]);
  });
});

describe('lo que llama la atención', () => {
  const textos = (d: Datos, p: ReturnType<typeof rangoPeriodo>, o?: Parameters<typeof hallazgos>[3]) =>
    hallazgos(d, p, (c) => String(Math.round(c / 100)), o).map((h) => h.texto.replace(/\u00a0/g, ' '));

  it('avisa si una cuenta quedó en negativo, sólo mirando el mes en curso', () => {
    const p = rangoPeriodo('mes', '2026-10-15');
    const cuentas = [cuenta('banco', 'ARS', 1_000_00), cuenta('mp', 'ARS', 0)];
    const movs = [mov({ fecha: '2026-10-02', monto: 500_00, cuentaId: 'mp' })];
    const d = { cuentas, categorias: CATEGORIAS, movimientos: movs, cotizacion: 1500 };
    expect(textos(d, p, { enCurso: true })[0]).toBe(
      'mp está en negativo (−$ 500): seguro falta cargar un ingreso o una transferencia.',
    );
    expect(textos(d, p).some((t) => t.includes('negativo'))).toBe(false);
  });

  it('dice si te pasaste del tope o si lo respetaste', () => {
    const p = rangoPeriodo('mesPasado', '2026-10-15');
    const conTope = [{ ...categoria('super'), presupuesto: 1_000_00 }, categoria('salidas', 'gasto', 1)];
    const pasado = [mov({ fecha: '2026-09-02', monto: 1_200_00, cuentaId: 'banco' })];
    const d = { cuentas: CUENTAS, categorias: conTope, movimientos: pasado, cotizacion: 1500 };
    expect(textos(d, p)[0]).toBe('Te pasaste del tope de super por 200 (▲ 20% más de lo previsto).');

    const bien = [mov({ fecha: '2026-09-02', monto: 800_00, cuentaId: 'banco' })];
    expect(textos({ ...d, movimientos: bien }, p)[0]).toBe('Respetaste el tope de super.');
  });

  it('compara descontando inflación sólo con meses ya publicados', () => {
    const movs = [
      mov({ fecha: '2026-08-10', monto: 1_000_00, cuentaId: 'banco' }),
      mov({ fecha: '2026-09-10', monto: 1_050_00, cuentaId: 'banco' }),
    ];
    const h: Historicos = { inflacion: new Map([['2026-08', 2], ['2026-09', 10]]), dolar: [] };
    // Septiembre: +5% en pesos, pero con 10% de inflación es menos.
    const p = rangoPeriodo('mesPasado', '2026-10-15');
    expect(textos(datos(movs), p, { historicos: h })).toContain(
      'Descontando la inflación, gastaste ▼ 5% menos que el mes anterior (en pesos fue ▲ 5% más).',
    );
    // Octubre todavía no tiene dato: no se dice nada.
    const octubre = [...movs, mov({ fecha: '2026-10-05', monto: 1_000_00, cuentaId: 'banco' })];
    expect(textos(datos(octubre), rangoPeriodo('mes', '2026-10-15'), { historicos: h }).some((t) => t.includes('inflación'))).toBe(
      false,
    );
  });

  it('cuenta a cuánto compraste dólares contra el dólar de hoy', () => {
    const p = rangoPeriodo('mes', '2026-10-15');
    const movs = [
      mov({ fecha: '2026-10-02', monto: 100_00, cuentaId: 'banco' }),
      mov({
        fecha: '2026-10-03',
        tipo: 'transferencia',
        monto: 1_400_000_00,
        cuentaId: 'banco',
        categoriaId: null,
        cuentaDestinoId: 'usd',
        montoDestino: 1_000_00,
      }),
    ];
    expect(textos(datos(movs, 1500), p)).toContain(
      'Compraste US$ 1.000 a 1400 promedio. Hoy el dólar está 1500: ▲ 7% más que lo que pagaste.',
    );
  });

  it('marca gastos sin categoría y el que se lleva buena parte del total', () => {
    const p = rangoPeriodo('mes', '2026-10-15');
    const movs = [
      mov({ fecha: '2026-10-01', monto: 100_00, cuentaId: 'banco' }),
      mov({ fecha: '2026-10-02', monto: 100_00, cuentaId: 'banco' }),
      mov({ fecha: '2026-10-03', monto: 100_00, cuentaId: 'banco', categoriaId: null }),
      mov({ fecha: '2026-10-04', monto: 700_00, cuentaId: 'banco', nota: 'Alquiler' }),
    ];
    const t = textos(datos(movs), p);
    expect(t).toContain('Un solo gasto se llevó el 70% del total: Alquiler, 700 el 4/10.');
    expect(t).toContain('Un gasto sin categoría (100): asignales una para saber en qué se fue.');
  });

  it('la racha sin gastar cuenta desde que empezaste a usar la app', () => {
    const p = rangoPeriodo('mes', '2026-10-15');
    const nuevas = [cuenta('banco', 'ARS', 0, '2026-10-08T12:00:00.000Z')];
    const movs = [
      mov({ fecha: '2026-10-08', monto: 100_00, cuentaId: 'banco' }),
      mov({ fecha: '2026-10-13', monto: 100_00, cuentaId: 'banco' }),
    ];
    const d = { cuentas: nuevas, categorias: CATEGORIAS, movimientos: movs, cotizacion: 1500 };
    // Del 1 al 7 la app no existía: la racha es del 9 al 12, no del 1 al 7.
    expect(textos(d, p)).toContain('Tu racha más larga sin gastar: 4 días seguidos, del 9/10 al 12/10.');
  });

  it('el efectivo en pesos contra la última inflación', () => {
    const p = rangoPeriodo('mes', '2026-10-15');
    const cuentas = [{ ...cuenta('billetera', 'ARS', 200_000_00), tipo: 'efectivo' as const }];
    const movs = [mov({ fecha: '2026-10-02', monto: 100_00, cuentaId: 'billetera' })];
    const h: Historicos = { inflacion: new Map([['2026-09', 2]]), dolar: [] };
    const d = { cuentas, categorias: CATEGORIAS, movimientos: movs, cotizacion: 1500 };
    expect(textos(d, p, { historicos: h, enCurso: true })).toContain(
      'Tenés 199900 en efectivo: con la inflación de septiembre (2%) pierden unos 3998 por mes.',
    );
  });

  it('una suba de menos de 10% no es noticia', () => {
    const p = rangoPeriodo('mes', '2026-10-15');
    const movs = [
      mov({ fecha: '2026-10-02', monto: 105_00, cuentaId: 'banco' }),
      mov({ fecha: '2026-09-02', monto: 100_00, cuentaId: 'banco' }),
    ];
    expect(textos(datos(movs), p).some((t) => t.includes('subió'))).toBe(false);
  });

  it('nunca muestra más de seis', () => {
    const p = rangoPeriodo('mes', '2026-10-15');
    const movs = Array.from({ length: 12 }, (_, i) =>
      mov({ fecha: `2026-10-${String(i + 1).padStart(2, '0')}`, monto: 1_00, cuentaId: 'banco', categoriaId: null }),
    );
    expect(textos(datos(movs), p, { enCurso: true }).length).toBeLessThanOrEqual(6);
  });
});

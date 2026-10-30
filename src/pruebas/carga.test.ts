import { describe, expect, it } from 'vitest';
import { expresionEnVivo } from '../componentes/montoEnVivo';
import { evaluarMonto, tieneOperador } from '../dominio/calculadora';
import {
  aprenderNotas,
  coincidencia,
  frecuentes,
  normalizarTexto,
  posibleDuplicado,
  sugerir,
} from '../dominio/sugerencias';
import type { Movimiento } from '../dominio/tipos';

describe('calculadora del monto', () => {
  it('formatea cada número y los operadores mientras se escribe', () => {
    expect(expresionEnVivo('1500+300')).toBe('1.500 + 300');
    expect(expresionEnVivo('2500*3')).toBe('2.500 × 3');
    expect(expresionEnVivo('10000/4')).toBe('10.000 ÷ 4');
    expect(expresionEnVivo('1500-200')).toBe('1.500 − 200');
    // Operador al principio: afuera. Dos seguidos: queda el último.
    expect(expresionEnVivo('+1500')).toBe('1.500');
    expect(expresionEnVivo('1500+-300')).toBe('1.500 − 300');
    // Colgando al final se muestra, para seguir escribiendo.
    expect(expresionEnVivo('1.500 + ')).toBe('1.500 +');
    expect(expresionEnVivo('1500')).toBe('1.500');
  });

  it('calcula con precedencia y en centavos enteros', () => {
    expect(evaluarMonto('1.500 + 300')).toBe(1_800_00);
    expect(evaluarMonto('2.500 × 3')).toBe(7_500_00);
    expect(evaluarMonto('1.000 + 2.500 × 2')).toBe(6_000_00);
    expect(evaluarMonto('10.000 ÷ 3')).toBe(3_333_33);
    expect(evaluarMonto('1.500,10 + 200,20')).toBe(1_700_30);
    expect(evaluarMonto('1.500 −  500')).toBe(1_000_00);
    expect(evaluarMonto('1.500 +')).toBe(1_500_00);
    expect(evaluarMonto('1.500')).toBe(1_500_00);
  });

  it('lo que no da un monto positivo no vale', () => {
    expect(evaluarMonto('')).toBeNull();
    expect(evaluarMonto('500 − 500')).toBeNull();
    expect(evaluarMonto('500 − 800')).toBeNull();
    expect(evaluarMonto('500 ÷ 0')).toBeNull();
    expect(evaluarMonto('abc')).toBeNull();
    expect(tieneOperador('1.500')).toBe(false);
    expect(tieneOperador('1.500 + 2')).toBe(true);
  });
});

let n = 0;
function mov(p: Partial<Movimiento> & Pick<Movimiento, 'fecha' | 'nota'>): Movimiento {
  return {
    id: `m${++n}`,
    tipo: 'gasto',
    monto: 1_000_00,
    cuentaId: 'mp',
    categoriaId: 'super',
    cuentaDestinoId: null,
    montoDestino: null,
    cotizacion: null,
    borrado: false,
    creadoEn: `${p.fecha}T12:00:00.000Z`,
    actualizadoEn: '',
    ...p,
  };
}

describe('sugerencias que aprenden de tus notas', () => {
  const historia = [
    mov({ fecha: '2026-09-01', nota: 'Coto', monto: 30_000_00, categoriaId: 'super', cuentaId: 'banco' }),
    mov({ fecha: '2026-10-01', nota: 'coto ', monto: 35_000_00, categoriaId: 'super', cuentaId: 'mp' }),
    mov({ fecha: '2026-10-05', nota: 'Café', monto: 2_500_00, categoriaId: 'salidas' }),
    mov({ fecha: '2026-10-12', nota: 'cafe', monto: 2_800_00, categoriaId: 'salidas' }),
    mov({ fecha: '2026-10-20', nota: 'Carrefour', categoriaId: 'super' }),
    mov({ fecha: '2026-10-21', nota: 'Peaje Costanera', categoriaId: 'auto' }),
    mov({ fecha: '2026-10-22', nota: 'Borrado', borrado: true }),
    mov({ fecha: '2026-10-23', nota: 'Sueldo', tipo: 'ingreso', categoriaId: 'sueldo' }),
  ];
  const lista = aprenderNotas(historia, 'gasto');

  it('junta la misma nota escrita distinto y se queda con lo último', () => {
    expect(normalizarTexto('  Café  CON leche ')).toBe('cafe con leche');
    const coto = lista.find((s) => s.clave === 'coto')!;
    expect(coto).toMatchObject({ nota: 'coto', veces: 2, monto: 35_000_00, cuentaId: 'mp', ultima: '2026-10-01' });
    expect(lista.some((s) => s.clave === 'borrado')).toBe(false);
    expect(lista.some((s) => s.clave === 'sueldo')).toBe(false);
  });

  it('sugiere lo que empieza igual primero, después por palabra', () => {
    expect(sugerir(lista, 'c').map((s) => s.clave)).toEqual(['cafe', 'coto', 'carrefour']);
    expect(sugerir(lista, 'cos').map((s) => s.clave)).toEqual(['peaje costanera']);
    expect(sugerir(lista, 'Coto')).toEqual([]);
    expect(coincidencia(lista, 'COTO')?.categoriaId).toBe('super');
    expect(sugerir(lista, '')).toEqual([]);
  });

  it('frecuentes: lo que repetiste en los últimos 90 días', () => {
    expect(frecuentes(historia, 'gasto', '2026-10-30').map((s) => s.clave)).toEqual(['cafe', 'coto']);
    // En febrero ya pasaron más de 90 días: nada.
    expect(frecuentes(historia, 'gasto', '2027-02-01')).toEqual([]);
  });

  it('avisa si ya cargaste uno igual ese día', () => {
    const igual = { tipo: 'gasto' as const, monto: 2_500_00, cuentaId: 'mp', fecha: '2026-10-05', cuentaDestinoId: null };
    expect(posibleDuplicado(igual, historia)?.nota).toBe('Café');
    expect(posibleDuplicado({ ...igual, fecha: '2026-10-06' }, historia)).toBeUndefined();
    expect(posibleDuplicado({ ...igual, cuentaId: 'banco' }, historia)).toBeUndefined();
  });
});

describe('borrar un movimiento y deshacer', () => {
  it('vuelve tal cual estaba', async () => {
    const { preparar, mov: datosMov } = await import('./ayudas');
    const { repo, db } = preparar();
    const cuenta = await repo.crearCuenta({ nombre: 'MP', moneda: 'ARS', tipo: 'virtual', saldoInicial: 0 });
    const cat = await repo.crearCategoria({ nombre: 'Súper', tipo: 'gasto', emoji: '🛒', presupuesto: null });
    const m = await repo.crearMovimiento(datosMov({ cuentaId: cuenta.id, categoriaId: cat.id, nota: 'Coto' }));
    await repo.borrarMovimiento(m.id);
    expect((await db.movimientos.get(m.id))!.borrado).toBe(true);
    await repo.restaurarMovimiento(m.id);
    const vuelto = (await db.movimientos.get(m.id))!;
    expect(vuelto.borrado).toBe(false);
    expect({ ...vuelto, actualizadoEn: '' }).toEqual({ ...m, actualizadoEn: '' });
    expect(vuelto.actualizadoEn > m.actualizadoEn).toBe(true);
  });
});

describe('totales de una lista de varios meses', () => {
  it('suma gastos e ingresos en pesos, sin transferencias ni borrados', async () => {
    const { totales } = await import('../dominio/calculos');
    const cuentas = [
      { id: 'mp', nombre: 'MP', moneda: 'ARS' as const, tipo: 'virtual' as const, saldoInicial: 0, archivada: false, orden: 0, creadoEn: '', actualizadoEn: '' },
      { id: 'usd', nombre: 'USD', moneda: 'USD' as const, tipo: 'efectivo' as const, saldoInicial: 0, archivada: false, orden: 1, creadoEn: '', actualizadoEn: '' },
    ];
    const lista = [
      mov({ fecha: '2026-09-01', nota: '', monto: 1_000_00 }),
      mov({ fecha: '2026-10-01', nota: '', monto: 10_00, cuentaId: 'usd', cotizacion: 1500 }),
      mov({ fecha: '2026-10-02', nota: '', monto: 5_000_00, tipo: 'ingreso' }),
      mov({ fecha: '2026-10-03', nota: '', monto: 9_999_00, tipo: 'transferencia', cuentaDestinoId: 'usd' }),
      mov({ fecha: '2026-10-04', nota: '', monto: 7_777_00, borrado: true }),
    ];
    expect(totales(lista, cuentas, 1600)).toEqual({ ingresos: 5_000_00, gastos: 1_000_00 + 15_000_00 });
  });
});

describe('cuánto queda para gastar', () => {
  it('lo que entró, menos lo gastado y los fijos que faltan, repartido en los días que quedan', async () => {
    const { libreHastaFinDeMes } = await import('../dominio/calculos');
    // 30 de octubre: quedan 2 días (30 y 31).
    expect(libreHastaFinDeMes(900_000_00, 381_800_00, 293_000_00, '2026-10-30')).toEqual({ libre: 225_200_00, porDia: 112_600_00, dias: 2 });
    // 1 de noviembre: los 30 días.
    expect(libreHastaFinDeMes(300_000_00, 0, 0, '2026-11-01').dias).toBe(30);
    expect(libreHastaFinDeMes(100_00, 300_00, 0, '2026-11-15')).toEqual({ libre: -200_00, porDia: 0, dias: 16 });
  });
});

describe('planilla para Excel', () => {
  it('formato argentino: punto y coma, coma decimal, sin miles, fechas DD/MM/AAAA', async () => {
    const { movimientosACsv } = await import('../datos/planilla');
    const cuentas = [
      { id: 'mp', nombre: 'Mercado Pago', moneda: 'ARS' as const, tipo: 'virtual' as const, saldoInicial: 0, archivada: false, orden: 0, creadoEn: '', actualizadoEn: '' },
      { id: 'usd', nombre: 'Dólares', moneda: 'USD' as const, tipo: 'efectivo' as const, saldoInicial: 0, archivada: false, orden: 1, creadoEn: '', actualizadoEn: '' },
    ];
    const categorias = [{ id: 'super', nombre: 'Súper', tipo: 'gasto' as const, emoji: '🛒', presupuesto: null, archivada: false, orden: 0, creadoEn: '', actualizadoEn: '' }];
    const csv = movimientosACsv(
      [
        mov({ fecha: '2026-10-02', nota: 'Coto; "grande"', monto: 1_234_567_50 }),
        mov({ fecha: '2026-10-01', nota: '', monto: 10_00, cuentaId: 'usd', cotizacion: 1500.5 }),
        mov({ fecha: '2026-10-03', nota: 'Compra', tipo: 'transferencia', categoriaId: null, monto: 1_500_000_00, cuentaDestinoId: 'usd', montoDestino: 1_000_00, cotizacion: 1500 }),
        mov({ fecha: '2026-10-04', nota: 'Borrado', borrado: true }),
      ],
      cuentas,
      categorias,
      1600,
    );
    const filas = csv.replace('﻿', '').trim().split('\r\n');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(filas[0]).toBe('Fecha;Tipo;Monto;Moneda;Cuenta;Categoría;Nota;Hacia;Monto que entró;Moneda que entró;En pesos;Cotización');
    expect(filas[1]).toBe('01/10/2026;Gasto;10,00;USD;Dólares;Súper;;;;;15005,00;1500,5');
    expect(filas[2]).toBe('02/10/2026;Gasto;1234567,50;ARS;Mercado Pago;Súper;"Coto; ""grande""";;;;1234567,50;');
    expect(filas[3]).toBe('03/10/2026;Transferencia;1500000,00;ARS;Mercado Pago;;Compra;Dólares;1000,00;USD;;1500');
    expect(filas).toHaveLength(4);
  });
});

describe('topes e inflación', () => {
  it('sube sólo los topes mensuales, redondeando para arriba a $ 100', async () => {
    const { topesConInflacion } = await import('../dominio/calculos');
    const cat = (id: string, presupuesto: number | null, extra = {}) => ({
      id, nombre: id, tipo: 'gasto' as const, emoji: '', presupuesto, archivada: false, orden: 0, creadoEn: '', actualizadoEn: '', ...extra,
    });
    const categorias = [
      cat('super', 120_000_00),
      cat('salidas', 30_000_00),
      cat('sin', null),
      cat('archivada', 50_000_00, { archivada: true }),
      cat('finde', 50_000_00, { presupuestoDesde: '2026-10-29', presupuestoHasta: '2026-10-31' }),
      { ...cat('sueldo', null), tipo: 'ingreso' as const },
    ];
    expect(topesConInflacion(categorias, 1.9)).toEqual([
      { id: 'super', antes: 120_000_00, despues: 122_300_00 },
      { id: 'salidas', antes: 30_000_00, despues: 30_600_00 },
    ]);
    expect(topesConInflacion(categorias, 0)).toEqual([]);
  });

  it('subir y deshacer, todo junto, y anota con qué mes quedaron', async () => {
    const { preparar } = await import('./ayudas');
    const { repo, db } = preparar();
    const a = await repo.crearCategoria({ nombre: 'Súper', tipo: 'gasto', emoji: '🛒', presupuesto: 120_000_00 });
    await repo.ajustarTopes([{ id: a.id, presupuesto: 122_300_00 }], '2026-09');
    expect((await db.categorias.get(a.id))!.presupuesto).toBe(122_300_00);
    expect((await repo.ajustes()).topesAjustadosHasta).toBe('2026-09');
    await repo.ajustarTopes([{ id: a.id, presupuesto: 120_000_00 }], null);
    expect((await db.categorias.get(a.id))!.presupuesto).toBe(120_000_00);
    expect((await repo.ajustes()).topesAjustadosHasta).toBeNull();
    await expect(repo.ajustarTopes([{ id: a.id, presupuesto: 0 }], null)).rejects.toThrow('Un tope quedó en un monto inválido.');
  });
});

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

import { describe, expect, it } from 'vitest';
import type { Cuenta, Movimiento } from '../dominio/tipos';
import { gastoDeLaSemana, inicioElegido, semanaDe } from './calculos';
import { textoSemana } from './TarjetaSemana';

const cuentas = [
  { id: 'ars', moneda: 'ARS' },
  { id: 'usd', moneda: 'USD' },
] as Cuenta[];

function mov(datos: Partial<Movimiento>): Movimiento {
  return { id: Math.random().toString(), tipo: 'gasto', monto: 100_00, cuentaId: 'ars', fecha: '2026-11-11', borrado: false, ...datos } as Movimiento;
}

describe('semana', () => {
  it('arranca el día elegido y dura 7 días', () => {
    // 11/11/2026 es miércoles.
    expect(semanaDe('2026-11-11', 1)).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' });
    expect(semanaDe('2026-11-11', 0)).toEqual({ desde: '2026-11-08', hasta: '2026-11-14' });
    expect(semanaDe('2026-11-11', 3)).toEqual({ desde: '2026-11-11', hasta: '2026-11-17' });
    expect(semanaDe('2026-11-11', 4)).toEqual({ desde: '2026-11-05', hasta: '2026-11-11' });
    // Cruza de mes y de año.
    expect(semanaDe('2027-01-01', 1)).toEqual({ desde: '2026-12-28', hasta: '2027-01-03' });
  });

  it('el día que empieza la semana vuelve a cero', () => {
    const movs = [mov({ fecha: '2026-11-15', monto: 45_000_00 })]; // domingo
    expect(gastoDeLaSemana(movs, cuentas, null, '2026-11-15', 1).gastado).toBe(45_000_00);
    expect(gastoDeLaSemana(movs, cuentas, null, '2026-11-16', 1).gastado).toBe(0); // lunes
  });

  it('suma sólo gastos vivos de la semana, con los dólares en pesos', () => {
    const movs = [
      mov({ fecha: '2026-11-09', monto: 10_000_00 }),
      mov({ fecha: '2026-11-11', monto: 20_00, cuentaId: 'usd', cotizacion: 1500 }),
      mov({ fecha: '2026-11-08', monto: 99_000_00 }), // semana anterior
      mov({ fecha: '2026-11-10', monto: 5_000_00, borrado: true }),
      mov({ fecha: '2026-11-10', monto: 7_000_00, tipo: 'ingreso' }),
      mov({ fecha: '2026-11-10', monto: 8_000_00, tipo: 'transferencia' }),
    ];
    expect(gastoDeLaSemana(movs, cuentas, null, '2026-11-11', 1)).toEqual({
      desde: '2026-11-09',
      hasta: '2026-11-15',
      gastado: 10_000_00 + 30_000_00,
    });
  });

  it('sin ajuste o con uno roto, lunes', () => {
    expect(inicioElegido(undefined)).toBe(1);
    expect(inicioElegido(9)).toBe(1);
    expect(inicioElegido(0)).toBe(0);
  });

  it('describe la semana', () => {
    expect(textoSemana('2026-11-09', '2026-11-15', 1)).toBe('Del lunes 9 al domingo 15');
    expect(textoSemana('2026-10-27', '2026-11-02', 2)).toBe('Del martes 27/10 al lunes 2/11');
  });
});

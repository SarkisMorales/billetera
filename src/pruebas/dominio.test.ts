import { convertir, formatearMonto, leerMonto, montoParaEditar } from '../dominio/dinero';
import { diaYMes, diasDelMes, diasIncluidos, nombreDia, nombreMes, sumarDias, sumarMeses } from '../dominio/fechas';
import { proyeccionGasto, type ResumenMes } from '../dominio/calculos';

describe('leerMonto', () => {
  it.each([
    ['1500', 150000],
    ['1.500', 150000],
    ['1.500,50', 150050],
    ['1500,5', 150050],
    ['12.5', 1250],
    ['12.50', 1250],
    ['1.500.000', 150000000],
    ['$ 2.300', 230000],
    ['US$ 40', 4000],
    ['0,99', 99],
  ])('"%s" → %i centavos', (texto, esperado) => {
    expect(leerMonto(texto)).toBe(esperado);
  });

  it.each(['', '0', '-5', 'abc', '1,2,3', '1.50.000', '12.345,678', '1.'])('rechaza "%s"', (texto) => {
    expect(leerMonto(texto)).toBeNull();
  });
});

describe('formatearMonto', () => {
  it('oculta los centavos cuando son cero', () => {
    expect(formatearMonto(150000, 'ARS')).toBe('$ 1.500');
    expect(formatearMonto(150050, 'ARS')).toBe('$ 1.500,50');
    expect(formatearMonto(4000, 'USD')).toBe('US$ 40');
  });

  it('marca signo', () => {
    expect(formatearMonto(-150000, 'ARS')).toBe('−$ 1.500');
    expect(formatearMonto(150000, 'ARS', { signo: true })).toBe('+$ 1.500');
  });

  it('montoParaEditar vuelve a leerse igual', () => {
    for (const c of [1, 99, 100, 150050, 123456789]) {
      expect(leerMonto(montoParaEditar(c))).toBe(c);
    }
  });
});

describe('convertir', () => {
  it('usa pesos por dólar en los dos sentidos', () => {
    expect(convertir(100_00, 'USD', 'ARS', 1500)).toBe(150_000_00);
    expect(convertir(150_000_00, 'ARS', 'USD', 1500)).toBe(100_00);
    expect(convertir(500, 'ARS', 'ARS', 1500)).toBe(500);
  });
});

describe('fechas', () => {
  it('meses', () => {
    expect(sumarMeses('2026-01', -1)).toBe('2025-12');
    expect(sumarMeses('2026-12', 1)).toBe('2027-01');
    expect(diasDelMes('2028-02')).toBe(29);
    expect(nombreMes('2026-10')).toBe('Octubre 2026');
  });

  it('días', () => {
    expect(sumarDias('2026-10-30', 2)).toBe('2026-11-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(diasIncluidos('2026-10-29', '2026-10-31')).toBe(3);
    expect(diasIncluidos('2026-10-31', '2026-10-31')).toBe(1);
    expect(diaYMes('2026-03-07')).toBe('7/3');
  });

  it('nombreDia', () => {
    expect(nombreDia('2026-10-23', '2026-10-23')).toBe('Hoy');
    expect(nombreDia('2026-10-22', '2026-10-23')).toBe('Ayer');
    expect(nombreDia('2026-10-01', '2026-10-01')).toBe('Hoy');
    expect(nombreDia('2026-09-30', '2026-10-01')).toBe('Ayer');
    expect(nombreDia('2026-10-20', '2026-10-23')).toBe('martes 20');
  });
});

describe('proyeccionGasto', () => {
  const resumen: ResumenMes = { mes: '2026-10', ingresos: 0, gastos: 100_000_00, porCategoria: new Map() };

  it('no proyecta la primera semana', () => {
    expect(proyeccionGasto(resumen, 6)).toBeNull();
  });

  it('proyecta lineal al resto del mes', () => {
    expect(proyeccionGasto(resumen, 10)).toBe(310_000_00);
  });
});

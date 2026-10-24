import { montoEnVivo } from '../componentes/montoEnVivo';
import { leerMonto, montoParaEditar } from '../dominio/dinero';

describe('montoEnVivo', () => {
  it.each([
    ['5000000', '5.000.000'],
    ['5000', '5.000'],
    ['500', '500'],
    ['1500,5', '1.500,5'],
    ['1500,567', '1.500,56'],
    ['1500.', '1.500,'], // punto tecleado al final = coma decimal
    [',5', '0,5'],
    ['007', '7'],
    ['$ 2300', '2.300'],
    ['', ''],
  ])('"%s" se ve "%s"', (escrito, visto) => {
    expect(montoEnVivo(escrito)).toBe(visto);
  });

  it('tecleando dígito por dígito se reacomoda solo', () => {
    let campo = '';
    for (const tecla of '5000000') campo = montoEnVivo(campo + tecla);
    expect(campo).toBe('5.000.000');
    // Borrar el último dígito: no queda un punto colgando.
    expect(montoEnVivo(campo.slice(0, -1))).toBe('500.000');
  });

  it('lo que muestra se guarda igual que antes', () => {
    for (const c of [1, 99, 100, 150050, 500000000, 123456789]) {
      expect(leerMonto(montoEnVivo(montoParaEditar(c)))).toBe(c);
    }
  });

  it('el saldo puede ser negativo', () => {
    expect(montoEnVivo('-45000', { negativo: true })).toBe('-45.000');
    expect(montoEnVivo('-45000')).toBe('45.000');
  });
});

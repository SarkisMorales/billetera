import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { BilleteraDB } from '../datos/db';
import { borrarTodo, exportar, importar, reemplazar } from '../datos/respaldo';
import { preparar, mov } from '../pruebas/ayudas';
import {
  faltaPagarEsteMes,
  fechaDelMes,
  paraConfirmar,
  primerVencimiento,
  proximos,
  siguienteVencimiento,
  textoVencimiento,
} from './calculos';
import { RepositorioFijos } from './repositorio';

async function prepararFijos() {
  const base = preparar();
  const fijos = new RepositorioFijos(base.db, base.reloj);
  const mp = await base.repo.crearCuenta({ nombre: 'MP', moneda: 'ARS', tipo: 'virtual', saldoInicial: 0 });
  const usd = await base.repo.crearCuenta({ nombre: 'Dólares', moneda: 'USD', tipo: 'efectivo', saldoInicial: 0 });
  const casa = await base.repo.crearCategoria({ nombre: 'Casa', tipo: 'gasto', emoji: '🏠', presupuesto: null });
  const sueldo = await base.repo.crearCategoria({ nombre: 'Sueldo', tipo: 'ingreso', emoji: '💼', presupuesto: null });
  return { ...base, fijos, mp, usd, casa, sueldo };
}

describe('fechas de los gastos fijos', () => {
  it('el 31 en un mes corto es el último día', () => {
    expect(fechaDelMes('2026-02', 31)).toBe('2026-02-28');
    expect(fechaDelMes('2028-02', 30)).toBe('2028-02-29');
    expect(fechaDelMes('2026-11', 31)).toBe('2026-11-30');
    expect(fechaDelMes('2026-10', 5)).toBe('2026-10-05');
  });

  it('el siguiente vencimiento respeta el día original aunque un mes haya sido corto', () => {
    expect(siguienteVencimiento('2026-01-31', 31, 1)).toBe('2026-02-28');
    expect(siguienteVencimiento('2026-02-28', 31, 1)).toBe('2026-03-31');
    expect(siguienteVencimiento('2026-11-10', 10, 2)).toBe('2027-01-10');
    expect(siguienteVencimiento('2026-10-01', 1, 12)).toBe('2027-10-01');
  });

  it('el primer vencimiento: este mes si no pasó el día, si no el que viene', () => {
    expect(primerVencimiento('2026-10-30', 31)).toBe('2026-10-31');
    expect(primerVencimiento('2026-10-30', 30)).toBe('2026-10-30');
    expect(primerVencimiento('2026-10-30', 5)).toBe('2026-11-05');
  });

  it('cómo se dice cuándo vence', () => {
    expect(textoVencimiento('2026-10-30', '2026-10-30')).toBe('vence hoy');
    expect(textoVencimiento('2026-10-29', '2026-10-30')).toBe('venció ayer');
    expect(textoVencimiento('2026-10-01', '2026-10-30')).toBe('venció el 1/10');
    expect(textoVencimiento('2026-10-31', '2026-10-30')).toBe('vence mañana');
    expect(textoVencimiento('2026-11-05', '2026-10-30')).toBe('vence el 5/11');
  });
});

describe('gastos fijos', () => {
  it('"se repite" al cargar: el próximo es el mes que viene', async () => {
    const { repo, fijos, mp, casa } = await prepararFijos();
    const m = await repo.crearMovimiento(mov({ cuentaId: mp.id, categoriaId: casa.id, monto: 250_000_00, fecha: '2026-10-01', nota: ' Alquiler ' }));
    const f = await fijos.crearDesdeMovimiento(m, 1);
    expect(f).toMatchObject({ nota: 'Alquiler', dia: 1, cadaMeses: 1, proxima: '2026-11-01', monto: 250_000_00, activo: true });
  });

  it('para confirmar, próximos y lo que falta pagar este mes', async () => {
    const { db, fijos, mp, usd, casa, sueldo } = await prepararFijos();
    const base = { tipo: 'gasto' as const, cuentaId: mp.id, categoriaId: casa.id, cadaMeses: 1 };
    await fijos.crearFijo({ ...base, nota: 'Alquiler', monto: 250_000_00, dia: 1, proxima: '2026-10-01' });
    await fijos.crearFijo({ ...base, nota: 'Luz', monto: 18_000_00, dia: 30, proxima: '2026-10-30' });
    await fijos.crearFijo({ ...base, nota: 'Netflix', monto: 8_500_00, dia: 5, proxima: '2026-11-05' });
    await fijos.crearFijo({ ...base, nota: 'iCloud', monto: 3_00, cuentaId: usd.id, dia: 31, proxima: '2026-10-31' });
    await fijos.crearFijo({ ...base, nota: '', tipo: 'ingreso', categoriaId: sueldo.id, monto: 900_000_00, dia: 31, proxima: '2026-10-31' });
    const pausado = await fijos.crearFijo({ ...base, nota: 'Gimnasio', monto: 20_000_00, dia: 2, proxima: '2026-10-02' });
    await fijos.editarFijo(pausado.id, { activo: false });

    const lista = await db.fijos.toArray();
    expect(lista.find((f) => f.tipo === 'ingreso')!.nota).toBe('Sueldo'); // sin nota, la de la categoría

    expect(paraConfirmar(lista, '2026-10-30').map((f) => f.nota)).toEqual(['Alquiler', 'Luz']);
    expect(proximos(lista, '2026-10-30').map((f) => f.nota)).toEqual(['iCloud', 'Sueldo', 'Netflix']);
    // Gastos hasta el 31: alquiler + luz + iCloud (US$ 3 a $ 1.500). El ingreso y Netflix (noviembre) no.
    expect(faltaPagarEsteMes(lista, [mp, usd], '2026-10-30', 1500)).toEqual({ total: 268_000_00 + 4_500_00, cuantos: 3 });
    expect(faltaPagarEsteMes(lista, [mp, usd], '2026-10-30', null)).toEqual({ total: 268_000_00, cuantos: 2 });
  });

  it('confirmar pasa al siguiente con el monto pagado; saltear sólo pasa; deshacer vuelve', async () => {
    const { db, fijos, mp, casa } = await prepararFijos();
    const f = await fijos.crearFijo({ tipo: 'gasto', nota: 'Alquiler', monto: 250_000_00, cuentaId: mp.id, categoriaId: casa.id, dia: 1, cadaMeses: 1, proxima: '2026-10-01' });
    const antes = await fijos.confirmar(f.id, 275_000_00);
    expect(await db.fijos.get(f.id)).toMatchObject({ proxima: '2026-11-01', monto: 275_000_00 });
    await fijos.restaurar(antes);
    expect(await db.fijos.get(f.id)).toMatchObject({ proxima: '2026-10-01', monto: 250_000_00 });
    await fijos.saltear(f.id);
    expect(await db.fijos.get(f.id)).toMatchObject({ proxima: '2026-11-01', monto: 250_000_00 });
  });

  it('valida lo que no tiene sentido', async () => {
    const { fijos, mp, casa, sueldo } = await prepararFijos();
    const ok = { tipo: 'gasto' as const, nota: 'X', monto: 100_00, cuentaId: mp.id, categoriaId: casa.id, dia: 1, cadaMeses: 1, proxima: '2026-11-01' };
    await expect(fijos.crearFijo({ ...ok, monto: 0 })).rejects.toThrow('El monto tiene que ser mayor a cero.');
    await expect(fijos.crearFijo({ ...ok, dia: 32 })).rejects.toThrow('El día tiene que ser del 1 al 31.');
    await expect(fijos.crearFijo({ ...ok, cadaMeses: 5 })).rejects.toThrow('Elegí cada cuánto se repite.');
    await expect(fijos.crearFijo({ ...ok, categoriaId: sueldo.id })).rejects.toThrow('Elegí una categoría.');
    await expect(fijos.crearFijo({ ...ok, cuentaId: 'no' })).rejects.toThrow('Elegí una cuenta.');
  });
});

describe('gastos fijos en el archivo y en la base', () => {
  it('viajan en el archivo; uno viejo (versión 2) no borra los de esta billetera', async () => {
    const { db, fijos, mp, casa } = await prepararFijos();
    await fijos.crearFijo({ tipo: 'gasto', nota: 'Alquiler', monto: 1_00, cuentaId: mp.id, categoriaId: casa.id, dia: 1, cadaMeses: 1, proxima: '2026-11-01' });
    const archivo = JSON.parse(JSON.stringify(await exportar(db)));
    const antes = await db.fijos.toArray();
    await borrarTodo(db);
    await importar(archivo, db);
    expect(await db.fijos.toArray()).toEqual(antes);

    const viejo = { ...archivo, version: 2 };
    delete viejo.fijos;
    await reemplazar(viejo, db);
    expect(await db.fijos.toArray()).toEqual(antes);

    const roto = { ...archivo, fijos: [{ ...archivo.fijos[0], dia: 40 }] };
    await expect(reemplazar(roto, db)).rejects.toThrow('El archivo está dañado');
  });

  it('un teléfono con la base versión 2 (con notas) pasa a la 3 sin perder nada', async () => {
    const nombre = 'billetera-v2';
    const v2 = new Dexie(nombre);
    v2.version(1).stores({
      cuentas: 'id, orden',
      categorias: 'id, tipo, orden',
      movimientos: 'id, fecha, cuentaId, cuentaDestinoId, categoriaId, creadoEn',
      ajustes: 'id',
    });
    v2.version(2).stores({ proyectos: 'id, orden', objetivos: 'id, proyectoId', notas: 'id, proyectoId' });
    await v2.table('notas').add({ id: 'n1', texto: 'Mi nota', proyectoId: null });
    await v2.table('proyectos').add({ id: 'p1', nombre: 'Autos', orden: 0 });
    await v2.table('cuentas').add({ id: 'c1', nombre: 'MP', orden: 0 });
    v2.close();

    const v3 = new BilleteraDB(nombre);
    expect((await v3.notas.toArray()).map((n) => n.texto)).toEqual(['Mi nota']);
    expect((await v3.proyectos.toArray()).map((p) => p.nombre)).toEqual(['Autos']);
    expect(await v3.cuentas.count()).toBe(1);
    expect(await v3.fijos.count()).toBe(0);
    expect(v3.verno).toBe(3);
  });
});

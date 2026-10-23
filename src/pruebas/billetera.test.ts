import {
  cotizacionVigente,
  estadoPresupuestos,
  patrimonio,
  resumenMes,
  saldos,
} from '../dominio/calculos';
import { ErrorDeValidacion } from '../datos/repositorio';
import { exportar, importar } from '../datos/respaldo';
import { leerRespuesta } from '../datos/cotizacion';
import { mov, preparar } from './ayudas';

async function conCuentas() {
  const ctx = preparar();
  const { repo } = ctx;
  const pesos = await repo.crearCuenta({ nombre: 'Banco', moneda: 'ARS', tipo: 'banco', saldoInicial: 100_000_00 });
  const mp = await repo.crearCuenta({ nombre: 'MP', moneda: 'ARS', tipo: 'virtual', saldoInicial: 0 });
  const usd = await repo.crearCuenta({ nombre: 'Dólares', moneda: 'USD', tipo: 'efectivo', saldoInicial: 200_00 });
  const super_ = await repo.crearCategoria({ nombre: 'Súper', tipo: 'gasto', emoji: '🛒', presupuesto: 50_000_00 });
  const salidas = await repo.crearCategoria({ nombre: 'Salidas', tipo: 'gasto', emoji: '🍻', presupuesto: 20_000_00 });
  const sueldo = await repo.crearCategoria({ nombre: 'Retiro', tipo: 'ingreso', emoji: '💼', presupuesto: 999 });
  await repo.guardarAjustes({
    casa: 'bolsa',
    cotizaciones: [{ casa: 'bolsa', compra: 1480, venta: 1500, fechaActualizacion: '' }],
  });
  return { ...ctx, pesos, mp, usd, super_, salidas, sueldo };
}

async function todo(ctx: Awaited<ReturnType<typeof conCuentas>>) {
  const [cuentas, categorias, movimientos, ajustes] = await Promise.all([
    ctx.db.cuentas.toArray(),
    ctx.db.categorias.toArray(),
    ctx.db.movimientos.toArray(),
    ctx.repo.ajustes(),
  ]);
  return { cuentas, categorias, movimientos, ajustes };
}

describe('saldos', () => {
  it('gastos restan, ingresos suman, transferencias mueven sin crear plata', async () => {
    const ctx = await conCuentas();
    const { repo, pesos, mp, super_, sueldo } = ctx;
    await repo.crearMovimiento(mov({ cuentaId: pesos.id, categoriaId: super_.id, monto: 30_000_00 }));
    await repo.crearMovimiento(mov({ tipo: 'ingreso', cuentaId: mp.id, categoriaId: sueldo.id, monto: 500_000_00 }));
    await repo.crearMovimiento(
      mov({ tipo: 'transferencia', cuentaId: mp.id, cuentaDestinoId: pesos.id, monto: 100_000_00 }),
    );

    const { cuentas, movimientos } = await todo(ctx);
    const s = saldos(cuentas, movimientos);
    expect(s.get(pesos.id)).toBe(100_000_00 - 30_000_00 + 100_000_00);
    expect(s.get(mp.id)).toBe(500_000_00 - 100_000_00);
  });

  it('comprar dólares: sale en pesos, entra en dólares y guarda el tipo de cambio', async () => {
    const ctx = await conCuentas();
    const m = await ctx.repo.crearMovimiento(
      mov({
        tipo: 'transferencia',
        cuentaId: ctx.pesos.id,
        cuentaDestinoId: ctx.usd.id,
        monto: 75_500_00,
        montoDestino: 50_00,
      }),
    );
    expect(m.cotizacion).toBe(1510);

    const { cuentas, movimientos, ajustes } = await todo(ctx);
    const s = saldos(cuentas, movimientos);
    expect(s.get(ctx.pesos.id)).toBe(100_000_00 - 75_500_00);
    expect(s.get(ctx.usd.id)).toBe(250_00);

    // No es gasto: el resumen del mes no se entera.
    const r = resumenMes('2026-10', movimientos, cuentas, cotizacionVigente(ajustes));
    expect(r.gastos).toBe(0);
  });

  it('los movimientos borrados no cuentan', async () => {
    const ctx = await conCuentas();
    const m = await ctx.repo.crearMovimiento(mov({ cuentaId: ctx.pesos.id, categoriaId: ctx.super_.id }));
    await ctx.repo.borrarMovimiento(m.id);
    const { cuentas, movimientos } = await todo(ctx);
    expect(saldos(cuentas, movimientos).get(ctx.pesos.id)).toBe(100_000_00);
  });
});

describe('patrimonio', () => {
  it('suma pesos y dólares con la cotización vigente', async () => {
    const ctx = await conCuentas();
    const { cuentas, movimientos, ajustes } = await todo(ctx);
    const p = patrimonio(cuentas, movimientos, cotizacionVigente(ajustes));
    expect(p.pesos).toBe(100_000_00);
    expect(p.dolares).toBe(200_00);
    expect(p.totalEnPesos).toBe(100_000_00 + 300_000_00);
    expect(p.totalEnDolares).toBe(200_00 + Math.round(100_000_00 / 1500));
  });

  it('sin cotización no inventa un total mezclado', async () => {
    const ctx = await conCuentas();
    const { cuentas, movimientos } = await todo(ctx);
    const p = patrimonio(cuentas, movimientos, null);
    expect(p.totalEnPesos).toBeNull();
  });

  it('la cotización manual pisa a la de internet', async () => {
    const ctx = await conCuentas();
    const ajustes = await ctx.repo.guardarAjustes({ cotizacionManual: 2000 });
    expect(cotizacionVigente(ajustes)).toBe(2000);
  });

  it('las cuentas archivadas no suman', async () => {
    const ctx = await conCuentas();
    await ctx.repo.editarCuenta(ctx.usd.id, { archivada: true });
    const { cuentas, movimientos, ajustes } = await todo(ctx);
    expect(patrimonio(cuentas, movimientos, cotizacionVigente(ajustes)).dolares).toBe(0);
  });
});

describe('gastos en dólares', () => {
  it('se valúan con la cotización del día en que se cargaron', async () => {
    const ctx = await conCuentas();
    await ctx.repo.crearMovimiento(mov({ cuentaId: ctx.usd.id, categoriaId: ctx.salidas.id, monto: 10_00 }));
    // Sube el dólar después.
    await ctx.repo.guardarAjustes({
      cotizaciones: [{ casa: 'bolsa', compra: 1900, venta: 2000, fechaActualizacion: '' }],
    });
    const { cuentas, movimientos, ajustes } = await todo(ctx);
    const r = resumenMes('2026-10', movimientos, cuentas, cotizacionVigente(ajustes));
    expect(r.gastos).toBe(15_000_00);
  });

  it('corregir la nota no revalúa el gasto', async () => {
    const ctx = await conCuentas();
    const m = await ctx.repo.crearMovimiento(mov({ cuentaId: ctx.usd.id, categoriaId: ctx.salidas.id, monto: 10_00 }));
    await ctx.repo.guardarAjustes({ cotizacionManual: 2000 });
    const editado = await ctx.repo.editarMovimiento(m.id, mov({ cuentaId: ctx.usd.id, categoriaId: ctx.salidas.id, monto: 10_00, nota: 'cena' }));
    expect(editado.cotizacion).toBe(1500);
  });
});

describe('presupuestos', () => {
  it('ok, cerca (80%) y pasado', async () => {
    const ctx = await conCuentas();
    const { repo, pesos, super_, salidas, sueldo } = ctx;
    await repo.crearMovimiento(mov({ cuentaId: pesos.id, categoriaId: super_.id, monto: 40_000_00 }));
    await repo.crearMovimiento(mov({ cuentaId: pesos.id, categoriaId: salidas.id, monto: 25_000_00 }));
    // Otro mes: no cuenta.
    await repo.crearMovimiento(mov({ cuentaId: pesos.id, categoriaId: salidas.id, monto: 99_000_00, fecha: '2026-09-30' }));

    const { cuentas, categorias, movimientos, ajustes } = await todo(ctx);
    const r = resumenMes('2026-10', movimientos, cuentas, cotizacionVigente(ajustes));
    const estados = estadoPresupuestos(categorias, r);

    expect(estados.map((e) => [e.categoria.nombre, e.nivel])).toEqual([
      ['Súper', 'cerca'],
      ['Salidas', 'pasado'],
    ]);
    // Las de ingreso no tienen presupuesto aunque se lo pasen.
    expect(categorias.find((c) => c.id === sueldo.id)?.presupuesto).toBeNull();
  });
});

describe('validación', () => {
  it('rechaza lo que no tiene sentido', async () => {
    const ctx = await conCuentas();
    const { repo, pesos, usd, super_, sueldo } = ctx;
    const casos = [
      mov({ cuentaId: pesos.id, categoriaId: super_.id, monto: 0 }),
      mov({ cuentaId: pesos.id, categoriaId: null }),
      mov({ cuentaId: pesos.id, categoriaId: sueldo.id }),
      mov({ cuentaId: 'no-existe', categoriaId: super_.id }),
      mov({ tipo: 'transferencia', cuentaId: pesos.id, cuentaDestinoId: pesos.id }),
      mov({ tipo: 'transferencia', cuentaId: pesos.id, cuentaDestinoId: usd.id }),
    ];
    for (const caso of casos) {
      await expect(repo.crearMovimiento(caso)).rejects.toBeInstanceOf(ErrorDeValidacion);
    }
    expect(await ctx.db.movimientos.count()).toBe(0);
  });

  it('no deja cambiar la moneda de una cuenta con movimientos', async () => {
    const ctx = await conCuentas();
    await ctx.repo.crearMovimiento(mov({ cuentaId: ctx.mp.id, categoriaId: ctx.super_.id }));
    await expect(ctx.repo.editarCuenta(ctx.mp.id, { moneda: 'USD' })).rejects.toThrow(/moneda/);
    await ctx.repo.editarCuenta(ctx.pesos.id, { nombre: 'Galicia' });
  });
});

describe('respaldo', () => {
  it('exportar → borrar todo → importar deja todo idéntico', async () => {
    const ctx = await conCuentas();
    await ctx.repo.crearMovimiento(mov({ cuentaId: ctx.pesos.id, categoriaId: ctx.super_.id }));
    const antes = await exportar(ctx.db);

    const otro = preparar();
    const resumen = await importar(JSON.parse(JSON.stringify(antes)), otro.db);
    expect(resumen.nuevos).toBe(3 + 3 + 1);

    const despues = await exportar(otro.db);
    expect({ ...despues, exportadoEn: '' }).toEqual({ ...antes, exportadoEn: '' });
  });

  it('importar dos veces no duplica', async () => {
    const ctx = await conCuentas();
    await ctx.repo.crearMovimiento(mov({ cuentaId: ctx.pesos.id, categoriaId: ctx.super_.id }));
    const respaldo = await exportar(ctx.db);
    const r = await importar(respaldo, ctx.db);
    expect(r.nuevos).toBe(0);
    expect(await ctx.db.movimientos.count()).toBe(1);
  });

  it('un backup viejo no revive lo borrado ni pisa lo editado', async () => {
    const ctx = await conCuentas();
    const a = await ctx.repo.crearMovimiento(mov({ cuentaId: ctx.pesos.id, categoriaId: ctx.super_.id, nota: 'a' }));
    const b = await ctx.repo.crearMovimiento(mov({ cuentaId: ctx.pesos.id, categoriaId: ctx.super_.id, nota: 'b' }));
    const viejo = await exportar(ctx.db);

    await ctx.repo.borrarMovimiento(a.id);
    await ctx.repo.editarMovimiento(b.id, mov({ cuentaId: ctx.pesos.id, categoriaId: ctx.super_.id, nota: 'b nueva' }));
    await importar(viejo, ctx.db);

    expect((await ctx.db.movimientos.get(a.id))?.borrado).toBe(true);
    expect((await ctx.db.movimientos.get(b.id))?.nota).toBe('b nueva');
  });

  it('rechaza archivos que no son de la billetera', async () => {
    const { db } = preparar();
    await expect(importar({ proyectos: [], eventos: [] }, db)).rejects.toThrow(/Billetera/);
  });
});

describe('primer uso', () => {
  it('siembra una sola vez', async () => {
    const { repo, db } = preparar();
    expect(await repo.sembrarSiVacia()).toBe(true);
    expect(await repo.sembrarSiVacia()).toBe(false);
    expect(await db.cuentas.count()).toBe(4);
  });

  it('dos llamadas simultáneas no duplican', async () => {
    const { repo, db } = preparar();
    const r = await Promise.all([repo.sembrarSiVacia(), repo.sembrarSiVacia()]);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect(await db.cuentas.count()).toBe(4);
  });
});

describe('cotización', () => {
  it('lee dolarapi y descarta lo que no entiende', () => {
    const r = leerRespuesta([
      { moneda: 'USD', casa: 'bolsa', nombre: 'Bolsa', compra: 1480, venta: 1500, fechaActualizacion: 'x' },
      { moneda: 'USD', casa: 'mayorista', compra: 1, venta: 2 },
      { casa: 'blue', venta: null },
      'basura',
    ]);
    expect(r).toEqual([{ casa: 'bolsa', compra: 1480, venta: 1500, fechaActualizacion: 'x' }]);
    expect(leerRespuesta({ error: true })).toEqual([]);
  });
});

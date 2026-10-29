import {
  cotizacionVigente,
  estadoPresupuestos,
  estadoPresupuestosPorFechas,
  patrimonio,
  resumenMes,
  saldos,
} from '../dominio/calculos';
import { ErrorDeValidacion } from '../datos/repositorio';
import { contarMovimientos, exportar, importar, leerArchivo, reemplazar } from '../datos/respaldo';
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

describe('pasar a otra billetera', () => {
  async function origen() {
    const ctx = await conCuentas();
    await ctx.repo.crearMovimiento(mov({ cuentaId: ctx.pesos.id, categoriaId: ctx.super_.id, monto: 1_500_00 }));
    const borrado = await ctx.repo.crearMovimiento(mov({ cuentaId: ctx.pesos.id, categoriaId: ctx.super_.id }));
    await ctx.repo.borrarMovimiento(borrado.id);
    return ctx;
  }

  it('una billetera recién instalada queda idéntica, sin duplicar cuentas ni categorías', async () => {
    const { db } = await origen();
    const archivo = JSON.stringify(await exportar(db));

    const nueva = preparar();
    await nueva.repo.sembrarSiVacia(); // la de ejemplo, como al abrirla por primera vez
    expect(await contarMovimientos(nueva.db)).toBe(0);

    const r = await reemplazar(leerArchivo(archivo), nueva.db);
    expect(r).toMatchObject({ cuentas: 3, categorias: 3, movimientos: 1 });

    const a = await exportar(db);
    const b = await exportar(nueva.db);
    expect({ ...b, exportadoEn: '' }).toEqual({ ...a, exportadoEn: '' });
  });

  it('un archivo dañado no toca nada', async () => {
    const { db } = await origen();
    const datos = await exportar(db);
    datos.movimientos[0]!.monto = 'mil' as unknown as number;

    const otra = await origen();
    const antes = await exportar(otra.db);
    await expect(reemplazar(datos, otra.db)).rejects.toThrow(/dañado/);
    expect({ ...(await exportar(otra.db)), exportadoEn: '' }).toEqual({ ...antes, exportadoEn: '' });
  });

  it('explica en castellano por qué no sirve un archivo', () => {
    expect(() => leerArchivo('no es json')).toThrow(/no es de la Billetera/);
    expect(() => leerArchivo('{"app":"otra"}')).toThrow(/no es de la Billetera/);
    expect(() =>
      leerArchivo(JSON.stringify({ app: 'billetera', version: 99, cuentas: [], categorias: [], movimientos: [] })),
    ).toThrow(/versión más nueva/);
  });
});

describe('presupuesto entre fechas', () => {
  async function conTopeDeTresDias() {
    const ctx = await conCuentas();
    const comida = await ctx.repo.crearCategoria({
      nombre: 'Comida',
      tipo: 'gasto',
      emoji: '🍔',
      presupuesto: 50_000_00,
      presupuestoDesde: '2026-10-30',
      presupuestoHasta: '2026-11-01',
    });
    const gasto = (fecha: string, monto: number) =>
      ctx.repo.crearMovimiento(mov({ cuentaId: ctx.pesos.id, categoriaId: comida.id, fecha, monto }));
    await gasto('2026-10-29', 99_000_00); // el día antes: no cuenta
    await gasto('2026-10-30', 20_000_00);
    await gasto('2026-11-01', 22_000_00); // cruza de mes: cuenta igual
    await gasto('2026-11-02', 99_000_00); // el día después: no cuenta
    const { cuentas, categorias, movimientos, ajustes } = await todo(ctx);
    const estado = (hoy: string) =>
      estadoPresupuestosPorFechas(categorias, movimientos, cuentas, cotizacionVigente(ajustes), hoy);
    return { ctx, comida, categorias, estado };
  }

  it('cuenta sólo lo gastado entre esas fechas, aunque cruce de mes', async () => {
    const { estado } = await conTopeDeTresDias();
    const [e] = estado('2026-10-31');
    expect(e).toMatchObject({
      gastado: 42_000_00,
      tope: 50_000_00,
      nivel: 'cerca', // 84%
      periodo: { desde: '2026-10-30', hasta: '2026-11-01', diasRestantes: 2 },
    });
  });

  it('no aparece antes de empezar ni después de terminar', async () => {
    const { estado } = await conTopeDeTresDias();
    expect(estado('2026-10-29')).toEqual([]);
    expect(estado('2026-11-01')[0]!.periodo!.diasRestantes).toBe(1);
    expect(estado('2026-11-02')).toEqual([]);
  });

  it('no se mezcla con los topes mensuales', async () => {
    const { ctx, comida, categorias } = await conTopeDeTresDias();
    const { cuentas, movimientos, ajustes } = await todo(ctx);
    const mensuales = estadoPresupuestos(categorias, resumenMes('2026-10', movimientos, cuentas, cotizacionVigente(ajustes)));
    expect(mensuales.map((e) => e.categoria.id)).not.toContain(comida.id);
    expect(mensuales.map((e) => e.categoria.nombre)).toEqual(['Súper', 'Salidas']);
  });

  it('valida las fechas y al sacar el tope se van las fechas', async () => {
    const { ctx, comida } = await conTopeDeTresDias();
    await expect(
      ctx.repo.editarCategoria(comida.id, { presupuestoDesde: '2026-11-05', presupuestoHasta: '2026-11-01' }),
    ).rejects.toThrow(/antes de empezar/);
    await expect(
      ctx.repo.editarCategoria(comida.id, { presupuestoDesde: '2026-11-05', presupuestoHasta: null }),
    ).rejects.toThrow(/desde qué día/);
    await ctx.repo.editarCategoria(comida.id, { presupuesto: null });
    expect(await ctx.db.categorias.get(comida.id)).toMatchObject({
      presupuesto: null,
      presupuestoDesde: null,
      presupuestoHasta: null,
    });
  });

  it('una categoría vieja sin fechas sigue siendo mensual', async () => {
    const ctx = await conCuentas();
    const { categorias } = await todo(ctx);
    expect(categorias.find((c) => c.nombre === 'Súper')!.presupuestoDesde ?? null).toBeNull();
  });
});

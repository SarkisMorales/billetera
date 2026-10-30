import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { BilleteraDB } from '../datos/db';
import { ErrorDeValidacion } from '../datos/repositorio';
import { borrarTodo, exportar, importar, reemplazar } from '../datos/respaldo';
import { preparar } from '../pruebas/ayudas';
import {
  avance,
  etiquetasEnUso,
  filtrarNotas,
  leerEtiquetas,
  leerNotaRapida,
  ordenarNotas,
  ordenarObjetivos,
  textoFecha,
  vencimiento,
} from './calculos';
import { RepositorioProyectos } from './repositorio';
import type { Nota } from './tipos';

function prepararProyectos() {
  const base = preparar();
  return { ...base, proyectos: new RepositorioProyectos(base.db, base.reloj) };
}

describe('proyectos y objetivos', () => {
  it('el avance cuenta objetivos hechos y suma la plata cubierta', async () => {
    const { db, proyectos } = prepararProyectos();
    const p = await proyectos.crearProyecto({ nombre: ' Autos ', emoji: '🚗', moneda: 'ARS', presupuesto: 1_200_000_00 });
    expect(p.nombre).toBe('Autos');
    expect(p.estado).toBe('activo');
    const cubiertas = await proyectos.crearObjetivo(p.id, { texto: 'Cubiertas', monto: 400_000_00 });
    const seguro = await proyectos.crearObjetivo(p.id, { texto: 'Seguro', monto: 90_000_00 });
    await proyectos.crearObjetivo(p.id, { texto: 'Service', monto: 300_000_00 });
    await proyectos.crearObjetivo(p.id, { texto: 'Turno VTV', monto: null });
    const lavado = await proyectos.crearObjetivo(p.id, { texto: 'Lavado', monto: 20_000_00 });
    await proyectos.editarObjetivo(cubiertas.id, { hecho: true });
    await proyectos.editarObjetivo(seguro.id, { hecho: true });
    await proyectos.editarObjetivo(lavado.id, { borrado: true });

    const a = avance(p, await db.objetivos.toArray());
    expect(a).toEqual({
      total: 4,
      hechos: 2,
      cubierto: 490_000_00,
      asignado: 790_000_00,
      falta: 710_000_00,
      parte: 490_000_00 / 1_200_000_00,
    });
  });

  it('sin presupuesto, la barra mide objetivos hechos', async () => {
    const { db, proyectos } = prepararProyectos();
    const p = await proyectos.crearProyecto({ nombre: 'Mudanza', emoji: '', moneda: 'USD', presupuesto: null });
    expect(p.emoji).toBe('📁');
    expect(avance(p, []).parte).toBeNull();
    const o = await proyectos.crearObjetivo(p.id, { texto: 'Cajas', monto: null });
    await proyectos.crearObjetivo(p.id, { texto: 'Flete', monto: null });
    await proyectos.editarObjetivo(o.id, { hecho: true });
    const a = avance(p, await db.objetivos.toArray());
    expect(a.parte).toBe(0.5);
    expect(a.falta).toBeNull();
  });

  it('pasarse del presupuesto no rompe la barra', async () => {
    const { db, proyectos } = prepararProyectos();
    const p = await proyectos.crearProyecto({ nombre: 'Viaje', emoji: '✈️', moneda: 'USD', presupuesto: 1_000_00 });
    const o = await proyectos.crearObjetivo(p.id, { texto: 'Pasajes', monto: 1_500_00 });
    await proyectos.editarObjetivo(o.id, { hecho: true });
    const a = avance(p, await db.objetivos.toArray());
    expect(a.parte).toBe(1);
    expect(a.falta).toBe(-500_00);
  });

  it('pendientes primero, hechos al final', () => {
    const o = (orden: number, hecho: boolean) =>
      ({ id: String(orden), proyectoId: 'p', texto: '', monto: null, hecho, orden, borrado: false, creadoEn: '', actualizadoEn: '' });
    expect(ordenarObjetivos([o(0, true), o(2, false), o(1, false)]).map((x) => x.id)).toEqual(['1', '2', '0']);
  });

  it('valida nombres, montos y que el proyecto exista', async () => {
    const { proyectos } = prepararProyectos();
    await expect(proyectos.crearProyecto({ nombre: ' ', emoji: '', moneda: 'ARS', presupuesto: null })).rejects.toThrow(
      ErrorDeValidacion,
    );
    await expect(proyectos.crearProyecto({ nombre: 'X', emoji: '', moneda: 'ARS', presupuesto: 10.5 })).rejects.toThrow(
      'El presupuesto tiene que ser un monto mayor a cero.',
    );
    await expect(proyectos.crearObjetivo('no-existe', { texto: 'Algo', monto: null })).rejects.toThrow('Ese proyecto no existe.');
  });

  it('borrar un proyecto se lleva sus objetivos y notas, y se puede deshacer', async () => {
    const { db, proyectos } = prepararProyectos();
    const p = await proyectos.crearProyecto({ nombre: 'Autos', emoji: '🚗', moneda: 'ARS', presupuesto: null });
    await proyectos.crearObjetivo(p.id, { texto: 'Seguro', monto: null });
    await proyectos.crearNota({ texto: 'Ver precios', proyectoId: p.id });
    const suelta = await proyectos.crearNota({ texto: 'Comprar pan' });
    await proyectos.borrarProyecto(p.id);
    expect((await db.proyectos.get(p.id))!.borrado).toBe(true);
    expect((await db.objetivos.toArray()).every((o) => o.borrado)).toBe(true);
    expect((await db.notas.get(suelta.id))!.borrado).toBe(false);
    await proyectos.borrarProyecto(p.id, false);
    expect((await db.notas.toArray()).every((n) => !n.borrado)).toBe(true);
  });
});

describe('notas', () => {
  it('tildar guarda cuándo, destildar lo limpia', async () => {
    const { db, proyectos } = prepararProyectos();
    const n = await proyectos.crearNota({ texto: 'Llamar al seguro', etiquetas: ['#Auto', 'auto', 'Casa'] });
    expect(n.etiquetas).toEqual(['auto', 'casa']);
    expect(n.prioridad).toBe(3);
    await proyectos.editarNota(n.id, { hecha: true });
    expect((await db.notas.get(n.id))!.hechaEn).not.toBeNull();
    await proyectos.editarNota(n.id, { hecha: false });
    expect((await db.notas.get(n.id))!.hechaEn).toBeNull();
  });

  it('las notas de un proyecto quedan sólo en ese proyecto', async () => {
    const { db, proyectos } = prepararProyectos();
    const autos = await proyectos.crearProyecto({ nombre: 'Autos', emoji: '🚗', moneda: 'ARS', presupuesto: null });
    const casa = await proyectos.crearProyecto({ nombre: 'Casa', emoji: '🏠', moneda: 'ARS', presupuesto: null });
    await proyectos.crearNota({ texto: 'Cubiertas Michelin', proyectoId: autos.id });
    await proyectos.crearNota({ texto: 'Pintor', proyectoId: casa.id });
    await proyectos.crearNota({ texto: 'Idea suelta' });
    const notas = await db.notas.toArray();
    expect(notas.filter((n) => n.proyectoId === autos.id).map((n) => n.texto)).toEqual(['Cubiertas Michelin']);
    expect(notas.filter((n) => n.proyectoId === null).map((n) => n.texto)).toEqual(['Idea suelta']);
  });

  it('rechaza notas vacías y fechas o prioridades raras', async () => {
    const { proyectos } = prepararProyectos();
    await expect(proyectos.crearNota({ texto: '  ' })).rejects.toThrow('La nota está vacía.');
    await expect(proyectos.crearNota({ texto: 'a', fecha: '15/11' })).rejects.toThrow('La fecha no es válida.');
    await expect(proyectos.crearNota({ texto: 'a', prioridad: 7 as 1 })).rejects.toThrow('La prioridad no es válida.');
  });

  it('carga rápida: #etiquetas y !1 salen del texto', () => {
    expect(leerNotaRapida('Pagar patente #Auto !1')).toEqual({ texto: 'Pagar patente', etiquetas: ['auto'], prioridad: 1 });
    expect(leerNotaRapida('Comprar #pan y #leche')).toEqual({ texto: 'Comprar y', etiquetas: ['pan', 'leche'], prioridad: 3 });
    expect(leerNotaRapida('#idea')).toEqual({ texto: '#idea', etiquetas: ['idea'], prioridad: 3 });
    // Un "!" suelto o un número largo no es prioridad.
    expect(leerNotaRapida('Ganamos!! 10 a 0').prioridad).toBe(3);
    expect(leerEtiquetas('auto, #casa  viaje casa')).toEqual(['auto', 'casa', 'viaje']);
  });

  it('vencida, hoy, mañana o más adelante', () => {
    expect(vencimiento('2026-10-28', '2026-10-29')).toBe('vencida');
    expect(vencimiento('2026-10-29', '2026-10-29')).toBe('hoy');
    expect(vencimiento('2026-10-30', '2026-10-29')).toBe('manana');
    expect(textoFecha('2026-11-15', '2026-10-29')).toBe('15/11');
    expect(textoFecha('2026-11-01', '2026-10-31')).toBe('Mañana');
  });

  const nota = (p: Partial<Nota> & Pick<Nota, 'id'>): Nota => ({
    proyectoId: null,
    texto: p.id,
    detalle: '',
    etiquetas: [],
    fecha: null,
    prioridad: 3,
    fijada: false,
    hecha: false,
    hechaEn: null,
    borrado: false,
    creadoEn: '2026-10-01',
    actualizadoEn: '2026-10-01',
    ...p,
  });

  it('ordena: fijadas aparte, vencidas arriba, después prioridad y fecha', () => {
    const r = ordenarNotas(
      [
        nota({ id: 'normal-sin-fecha' }),
        nota({ id: 'alta', prioridad: 1 }),
        nota({ id: 'vencida', fecha: '2026-10-20' }),
        nota({ id: 'normal-con-fecha', fecha: '2026-11-15' }),
        nota({ id: 'nueva', creadoEn: '2026-10-05' }),
        nota({ id: 'fijada', fijada: true }),
        nota({ id: 'hecha-antes', hecha: true, hechaEn: '2026-10-02' }),
        nota({ id: 'hecha-despues', hecha: true, hechaEn: '2026-10-09', fijada: true }),
        nota({ id: 'borrada', borrado: true }),
      ],
      '2026-10-29',
    );
    expect(r.fijadas.map((n) => n.id)).toEqual(['fijada']);
    expect(r.pendientes.map((n) => n.id)).toEqual(['vencida', 'alta', 'normal-con-fecha', 'nueva', 'normal-sin-fecha']);
    expect(r.hechas.map((n) => n.id)).toEqual(['hecha-despues', 'hecha-antes']);
  });

  it('busca sin acentos en texto, detalle y etiquetas, y filtra por etiqueta', () => {
    const notas = [
      nota({ id: 'a', texto: 'Comprar camión', etiquetas: ['auto'] }),
      nota({ id: 'b', texto: 'Pintar', detalle: 'Presupuesto del pintor', etiquetas: ['casa'] }),
      nota({ id: 'c', texto: 'Otra', etiquetas: ['casa', 'auto'] }),
    ];
    expect(filtrarNotas(notas, 'CAMION', null).map((n) => n.id)).toEqual(['a']);
    expect(filtrarNotas(notas, 'pintor', null).map((n) => n.id)).toEqual(['b']);
    expect(filtrarNotas(notas, '#casa', null).map((n) => n.id)).toEqual(['b', 'c']);
    expect(filtrarNotas(notas, '', 'auto').map((n) => n.id)).toEqual(['a', 'c']);
    expect(etiquetasEnUso(notas)).toEqual(['auto', 'casa']);
  });
});

describe('proyectos y notas en Archivos y Transferencias', () => {
  it('viajan en el archivo y vuelven idénticos', async () => {
    const { db, proyectos } = prepararProyectos();
    const p = await proyectos.crearProyecto({ nombre: 'Autos', emoji: '🚗', moneda: 'USD', presupuesto: 15_000_00 });
    await proyectos.crearObjetivo(p.id, { texto: 'Seguro', monto: 500_00 });
    await proyectos.crearNota({ texto: 'Idea', etiquetas: ['x'], fecha: '2026-11-15', prioridad: 1 });
    const archivo = JSON.parse(JSON.stringify(await exportar(db)));
    expect(archivo.version).toBe(3);
    const antes = { p: await db.proyectos.toArray(), o: await db.objetivos.toArray(), n: await db.notas.toArray() };
    await borrarTodo(db);
    expect(await db.notas.count()).toBe(0);
    await importar(archivo, db);
    expect({ p: await db.proyectos.toArray(), o: await db.objetivos.toArray(), n: await db.notas.toArray() }).toEqual(antes);
  });

  it('un archivo viejo, sin proyectos ni notas, no borra los de esta billetera', async () => {
    const { db, proyectos } = prepararProyectos();
    await proyectos.crearNota({ texto: 'No me borres' });
    const viejo = { version: 1, app: 'billetera', exportadoEn: '2026-10-01', cuentas: [], categorias: [], movimientos: [], ajustes: null };
    await reemplazar(viejo, db);
    expect((await db.notas.toArray()).map((n) => n.texto)).toEqual(['No me borres']);
  });

  it('un archivo nuevo sí reemplaza las notas, y uno con una nota dañada no carga nada', async () => {
    const { db, proyectos } = prepararProyectos();
    await proyectos.crearNota({ texto: 'Local' });
    const archivo = JSON.parse(JSON.stringify(await exportar(db)));
    archivo.notas[0].texto = 'Del archivo';
    archivo.notas[0].id = 'otra';
    await reemplazar(archivo, db);
    expect((await db.notas.toArray()).map((n) => n.texto)).toEqual(['Del archivo']);

    const roto = { ...archivo, notas: [{ ...archivo.notas[0], prioridad: 9 }] };
    await expect(reemplazar(roto, db)).rejects.toThrow('El archivo está dañado');
    expect((await db.notas.toArray()).map((n) => n.texto)).toEqual(['Del archivo']);
  });
});

describe('actualizar la base del teléfono', () => {
  it('una billetera con la base vieja (versión 1) pasa a la actual sin perder nada', async () => {
    const nombre = 'billetera-vieja';
    const vieja = new Dexie(nombre);
    vieja.version(1).stores({
      cuentas: 'id, orden',
      categorias: 'id, tipo, orden',
      movimientos: 'id, fecha, cuentaId, cuentaDestinoId, categoriaId, creadoEn',
      ajustes: 'id',
    });
    await vieja.table('cuentas').add({ id: 'c1', nombre: 'Mercado Pago', orden: 0 });
    await vieja.table('movimientos').add({ id: 'm1', fecha: '2026-10-01', cuentaId: 'c1', monto: 100_00, creadoEn: '' });
    vieja.close();

    const nueva = new BilleteraDB(nombre);
    expect((await nueva.cuentas.toArray()).map((c) => c.nombre)).toEqual(['Mercado Pago']);
    expect(await nueva.movimientos.count()).toBe(1);
    expect(nueva.verno).toBe(3);
    const proyectos = new RepositorioProyectos(nueva);
    await proyectos.crearNota({ texto: 'Primera nota' });
    expect(await nueva.notas.count()).toBe(1);
  });

  it('una versión vieja de la app (sin Proyectos) abriendo la base nueva no borra proyectos ni notas', async () => {
    const nombre = 'billetera-ida-y-vuelta';
    const nueva = new BilleteraDB(nombre);
    const proyectos = new RepositorioProyectos(nueva);
    await proyectos.crearProyecto({ nombre: 'Autos', emoji: '🚗', moneda: 'ARS', presupuesto: null });
    await proyectos.crearNota({ texto: 'No me pierdas' });
    nueva.close();

    // Lo que hace un iPhone que todavía corre la versión anterior desde el caché.
    const vieja = new Dexie(nombre);
    vieja.version(1).stores({
      cuentas: 'id, orden',
      categorias: 'id, tipo, orden',
      movimientos: 'id, fecha, cuentaId, cuentaDestinoId, categoriaId, creadoEn',
      ajustes: 'id',
    });
    await vieja.table('cuentas').add({ id: 'c1', nombre: 'Efectivo', orden: 0 });
    vieja.close();

    const otraVez = new BilleteraDB(nombre);
    expect((await otraVez.proyectos.toArray()).map((p) => p.nombre)).toEqual(['Autos']);
    expect((await otraVez.notas.toArray()).map((n) => n.texto)).toEqual(['No me pierdas']);
    expect(await otraVez.cuentas.count()).toBe(1);
  });
});

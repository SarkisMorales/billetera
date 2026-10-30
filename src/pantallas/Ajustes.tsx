import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type CSSProperties } from 'react';
import { ArchivosTransferencias } from '../componentes/ArchivosTransferencias';
import { colorCategoria } from '../componentes/colores';
import { EditorCategoria, EditorCuenta } from '../componentes/Editores';
import { NOMBRE_DONDE, dondeCorre } from '../datos/actualizacion';
import { actualizarCotizaciones } from '../datos/cotizacion';
import { repositorio } from '../datos/repositorio';
import { borrarTodo, contenidoLocal } from '../datos/respaldo';
import { saldos, tienePeriodo } from '../dominio/calculos';
import { diaYMes, hoy } from '../dominio/fechas';
import { formatearMonto } from '../dominio/dinero';
import { NOMBRE_CASA, type Categoria, type Cuenta, type Tema, type TipoCategoria } from '../dominio/tipos';
import type { Billetera } from '../estado/useBilletera';
import { SeccionFijos } from '../fijos/SeccionFijos';

type Editando =
  | { que: 'cuenta'; cuenta: Cuenta | null }
  | { que: 'categoria'; categoria: Categoria | null; tipo: TipoCategoria }
  | null;

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Ajustes({
  billetera,
  enLinea,
  avisar,
}: {
  billetera: Billetera;
  enLinea: boolean;
  avisar: (texto: string, deshacer?: () => void) => void;
}) {
  const { cuentas, categorias, movimientos, ajustes } = billetera;
  const [editando, setEditando] = useState<Editando>(null);
  const hoyStr = hoy();
  const [bajando, setBajando] = useState(false);
  const [manualTexto, setManualTexto] = useState(ajustes.cotizacionManual?.toString() ?? '');
  const s = useMemo(() => saldos(cuentas, movimientos), [cuentas, movimientos]);
  const guardado = useLiveQuery(() => contenidoLocal(), []);

  const usos = useMemo(() => {
    const n = new Map<string, number>();
    for (const m of movimientos) {
      n.set(m.cuentaId, (n.get(m.cuentaId) ?? 0) + 1);
      if (m.cuentaDestinoId) n.set(m.cuentaDestinoId, (n.get(m.cuentaDestinoId) ?? 0) + 1);
    }
    return n;
  }, [movimientos]);

  async function refrescar() {
    setBajando(true);
    const ok = await actualizarCotizaciones(true);
    setBajando(false);
    avisar(ok ? 'Cotización actualizada' : 'No se pudo bajar la cotización');
  }

  async function guardarManual() {
    const valor = Number(manualTexto.replace(/\./g, '').replace(',', '.'));
    await repositorio.guardarAjustes({ cotizacionManual: manualTexto.trim() && valor > 0 ? valor : null });
    avisar(manualTexto.trim() ? 'Cotización manual guardada' : 'Se usa la cotización de internet');
  }

  async function borrar() {
    const respuesta = prompt('Esto borra TODO de este teléfono. Escribí BORRAR para confirmar.');
    if (respuesta?.trim().toUpperCase() !== 'BORRAR') return;
    await borrarTodo();
    await repositorio.sembrarSiVacia();
    avisar('Datos borrados');
  }

  const grupos: [TipoCategoria, string][] = [
    ['gasto', 'Categorías de gasto'],
    ['ingreso', 'Categorías de ingreso'],
  ];

  return (
    <div className="pantalla">
      <section className="bloque">
        <h2 className="bloque-titulo">Dólar</h2>
        <p className="ayuda">
          Con éste se valúan tus dólares y los gastos en USD. Se actualiza solo cuando hay conexión.
        </p>
        <div className="fichas">
          {(Object.keys(NOMBRE_CASA) as (keyof typeof NOMBRE_CASA)[]).map((casa) => {
            const c = ajustes.cotizaciones.find((x) => x.casa === casa);
            return (
              <button
                key={casa}
                type="button"
                className="ficha"
                aria-pressed={ajustes.casa === casa}
                onClick={() => repositorio.guardarAjustes({ casa })}
              >
                <span>{NOMBRE_CASA[casa]}</span>
                <span className="ficha-sub num">{c ? `$ ${c.venta.toLocaleString('es-AR')}` : '—'}</span>
              </button>
            );
          })}
        </div>
        <div className="fila-ajuste">
          <span className="ayuda">
            {ajustes.cotizacionesBajadasEn
              ? `Bajada ${fechaHora(ajustes.cotizacionesBajadasEn)} · dolarapi.com`
              : 'Nunca se bajó'}
          </span>
          <button type="button" className="btn chico" onClick={refrescar} disabled={!enLinea || bajando}>
            {bajando ? 'Bajando…' : enLinea ? 'Actualizar' : 'Sin conexión'}
          </button>
        </div>
        <div className="fila-campos">
          <label className="campo crece">
            <span>Cotización manual (pisa a la de internet)</span>
            <input
              inputMode="decimal"
              placeholder="Vacío = usar internet"
              value={manualTexto}
              onChange={(e) => setManualTexto(e.target.value)}
            />
          </label>
          <button type="button" className="btn alinear-abajo" onClick={guardarManual}>
            Usar
          </button>
        </div>
      </section>

      <section className="bloque">
        <div className="bloque-cabecera">
          <h2 className="bloque-titulo">Cuentas</h2>
          <button type="button" className="btn-texto" onClick={() => setEditando({ que: 'cuenta', cuenta: null })}>
            + Agregar
          </button>
        </div>
        <div className="lista">
          {cuentas.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`fila${c.archivada ? ' archivada' : ''}`}
              onClick={() => setEditando({ que: 'cuenta', cuenta: c })}
            >
              <span className="fila-texto">
                <span className="fila-titulo">{c.nombre}</span>
                <span className="fila-sub">
                  {c.moneda} {c.archivada && '· archivada'}
                </span>
              </span>
              <span className="fila-monto num">{formatearMonto(s.get(c.id) ?? 0, c.moneda)}</span>
            </button>
          ))}
        </div>
      </section>

      {grupos.map(([tipo, titulo]) => (
        <section className="bloque" key={tipo}>
          <div className="bloque-cabecera">
            <h2 className="bloque-titulo">{titulo}</h2>
            <button
              type="button"
              className="btn-texto"
              onClick={() => setEditando({ que: 'categoria', categoria: null, tipo })}
            >
              + Agregar
            </button>
          </div>
          <div className="lista">
            {categorias
              .filter((c) => c.tipo === tipo)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`fila${c.archivada ? ' archivada' : ''}`}
                  onClick={() => setEditando({ que: 'categoria', categoria: c, tipo })}
                >
                  <span className="fila-icono" aria-hidden style={{ '--c': colorCategoria(c) } as CSSProperties}>
                    {c.emoji}
                  </span>
                  <span className="fila-texto">
                    <span className="fila-titulo">{c.nombre}</span>
                    {(c.archivada || (tipo === 'gasto' && c.presupuesto && tienePeriodo(c))) && (
                      <span className="fila-sub">
                        {c.archivada
                          ? 'archivada'
                          : c.presupuestoHasta! < hoyStr
                            ? `El tope terminó el ${diaYMes(c.presupuestoHasta!)}`
                            : c.presupuestoDesde! > hoyStr
                              ? `Tope del ${diaYMes(c.presupuestoDesde!)} al ${diaYMes(c.presupuestoHasta!)} · todavía no empezó`
                              : `Tope del ${diaYMes(c.presupuestoDesde!)} al ${diaYMes(c.presupuestoHasta!)}`}
                      </span>
                    )}
                  </span>
                  {tipo === 'gasto' && (
                    <span className="fila-monto num suave">
                      {c.presupuesto && !(tienePeriodo(c) && c.presupuestoHasta! < hoyStr)
                        ? `tope ${formatearMonto(c.presupuesto, 'ARS', { sinDecimales: true })}${tienePeriodo(c) ? '' : '/mes'}`
                        : 'sin tope'}
                    </span>
                  )}
                </button>
              ))}
          </div>
        </section>
      ))}

      <SeccionFijos cuentas={cuentas} categorias={categorias} avisar={avisar} />

      <ArchivosTransferencias
        ultimoGuardado={ajustes.ultimoBackup}
        movimientosAhora={movimientos.length}
        avisar={avisar}
      />

      <section className="bloque">
        <h2 className="bloque-titulo">Apariencia</h2>
        <div className="segmentado">
          {(
            [
              ['sistema', 'Automático'],
              ['oscuro', 'Oscuro'],
              ['claro', 'Claro'],
            ] as [Tema, string][]
          ).map(([t, nombre]) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={ajustes.tema === t}
              onClick={() => repositorio.guardarAjustes({ tema: t })}
            >
              {nombre}
            </button>
          ))}
        </div>
      </section>

      <section className="bloque">
        <button type="button" className="btn peligro ancho" onClick={borrar}>
          Borrar todos los datos
        </button>
      </section>

      {/* Para saber qué versión corre y dónde están los datos, si algo "desaparece". */}
      <p className="ayuda version">
        Versión {__VERSION__} · abierta desde {NOMBRE_DONDE[dondeCorre()]}.
        {guardado && (
          <>
            {' '}
            Guardado acá: {guardado.movimientos} movimientos, {guardado.proyectos}{' '}
            {guardado.proyectos === 1 ? 'proyecto' : 'proyectos'} y {guardado.notas} {guardado.notas === 1 ? 'nota' : 'notas'}.
          </>
        )}
      </p>

      {editando?.que === 'cuenta' && (
        <EditorCuenta
          cuenta={editando.cuenta}
          saldoActual={editando.cuenta ? (s.get(editando.cuenta.id) ?? 0) : 0}
          tieneMovimientos={editando.cuenta ? (usos.get(editando.cuenta.id) ?? 0) > 0 : false}
          alCerrar={() => setEditando(null)}
        />
      )}
      {editando?.que === 'categoria' && (
        <EditorCategoria
          categoria={editando.categoria}
          tipoNueva={editando.tipo}
          alCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

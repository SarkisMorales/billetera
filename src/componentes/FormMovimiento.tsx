import { useMemo, useState } from 'react';
import { Hoja } from './Hoja';
import { ErrorDeValidacion, repositorio } from '../datos/repositorio';
import { cotizacionVigente, saldos } from '../dominio/calculos';
import { convertir, formatearMonto, leerMonto, montoParaEditar } from '../dominio/dinero';
import { hoy } from '../dominio/fechas';
import type { Movimiento, TipoMovimiento } from '../dominio/tipos';
import type { Billetera } from '../estado/useBilletera';

const CLAVE_ULTIMA_CUENTA = 'billetera.ultimaCuenta';

function ultimaCuenta(): string | null {
  try {
    return localStorage.getItem(CLAVE_ULTIMA_CUENTA);
  } catch {
    return null;
  }
}

function recordarCuenta(id: string) {
  try {
    localStorage.setItem(CLAVE_ULTIMA_CUENTA, id);
  } catch {
    /* Sin almacenamiento local: no pasa nada, sólo no se recuerda. */
  }
}

const TIPOS: { id: TipoMovimiento; nombre: string }[] = [
  { id: 'gasto', nombre: 'Gasto' },
  { id: 'ingreso', nombre: 'Ingreso' },
  { id: 'transferencia', nombre: 'Transferencia' },
];

export function FormMovimiento({
  billetera,
  existente,
  alCerrar,
  alGuardar,
}: {
  billetera: Billetera;
  existente: Movimiento | null;
  alCerrar: () => void;
  alGuardar: (m: Movimiento, esNuevo: boolean) => void;
}) {
  const { cuentas, categorias, movimientos, ajustes } = billetera;
  const activas = cuentas.filter((c) => !c.archivada || c.id === existente?.cuentaId);
  const s = useMemo(() => saldos(cuentas, movimientos), [cuentas, movimientos]);

  const cuentaInicial =
    existente?.cuentaId ??
    activas.find((c) => c.id === ultimaCuenta())?.id ??
    activas[0]?.id ??
    '';

  const [tipo, setTipo] = useState<TipoMovimiento>(existente?.tipo ?? 'gasto');
  const [montoTexto, setMontoTexto] = useState(existente ? montoParaEditar(existente.monto) : '');
  const [cuentaId, setCuentaId] = useState(cuentaInicial);
  const [categoriaId, setCategoriaId] = useState<string | null>(existente?.categoriaId ?? null);
  const [destinoId, setDestinoId] = useState<string | null>(existente?.cuentaDestinoId ?? null);
  const [montoDestinoTexto, setMontoDestinoTexto] = useState(
    existente?.montoDestino ? montoParaEditar(existente.montoDestino) : '',
  );
  const [fecha, setFecha] = useState(existente?.fecha ?? hoy());
  const [nota, setNota] = useState(existente?.nota ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const origen = cuentas.find((c) => c.id === cuentaId);
  const destino = cuentas.find((c) => c.id === destinoId);
  const monto = leerMonto(montoTexto);
  const montoDestino = leerMonto(montoDestinoTexto);
  const cambiaMoneda = tipo === 'transferencia' && origen && destino && origen.moneda !== destino.moneda;
  const cotizacion = cotizacionVigente(ajustes);

  const categoriasDelTipo = categorias.filter(
    (c) => c.tipo === tipo && (!c.archivada || c.id === existente?.categoriaId),
  );

  /** En una compra/venta de dólares, el tipo de cambio que surge de los dos montos. */
  const cambioImplicito =
    cambiaMoneda && monto && montoDestino
      ? origen.moneda === 'ARS'
        ? monto / montoDestino
        : montoDestino / monto
      : null;

  const sugerenciaDestino =
    cambiaMoneda && monto && cotizacion
      ? formatearMonto(convertir(monto, origen.moneda, destino.moneda, cotizacion), destino.moneda)
      : null;

  function cambiarTipo(t: TipoMovimiento) {
    setTipo(t);
    setError(null);
    if (t !== tipo) setCategoriaId(null);
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (guardando) return;
    setError(null);
    if (!monto) {
      setError('Escribí un monto mayor a cero.');
      return;
    }
    const datos = {
      tipo,
      fecha,
      monto,
      cuentaId,
      categoriaId: tipo === 'transferencia' ? null : categoriaId,
      cuentaDestinoId: tipo === 'transferencia' ? destinoId : null,
      montoDestino: cambiaMoneda ? montoDestino : null,
      nota,
    };
    setGuardando(true);
    try {
      const m = existente
        ? await repositorio.editarMovimiento(existente.id, datos)
        : await repositorio.crearMovimiento(datos);
      recordarCuenta(cuentaId);
      alGuardar(m, !existente);
    } catch (e) {
      if (e instanceof ErrorDeValidacion) setError(e.message);
      else throw e;
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!existente || !confirm('¿Borrar este movimiento?')) return;
    await repositorio.borrarMovimiento(existente.id);
    alCerrar();
  }

  return (
    <Hoja
      titulo={existente ? 'Editar' : 'Nuevo'}
      alCerrar={alCerrar}
      acciones={
        <button type="submit" form="form-movimiento" className="btn-texto fuerte" disabled={guardando}>
          Guardar
        </button>
      }
    >
      <form id="form-movimiento" onSubmit={guardar} className="form">
        <div className="segmentado" role="radiogroup" aria-label="Tipo">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tipo === t.id}
              data-tipo={t.id}
              onClick={() => cambiarTipo(t.id)}
            >
              {t.nombre}
            </button>
          ))}
        </div>

        <label className="campo-monto" data-tipo={tipo}>
          <span className="moneda">{origen?.moneda === 'USD' ? 'US$' : '$'}</span>
          <input
            autoFocus={!existente}
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="0"
            value={montoTexto}
            onChange={(e) => setMontoTexto(e.target.value)}
            // Ancho según lo escrito (la fuente es monoespaciada): el signo
            // queda pegado al número en vez de flotar en el borde.
            style={{ width: `${Math.max(1, montoTexto.length) + 0.5}ch` }}
            aria-label="Monto"
          />
        </label>

        <fieldset className="grupo">
          <legend>{tipo === 'transferencia' ? 'Desde' : 'Cuenta'}</legend>
          <div className="fichas">
            {activas.map((c) => (
              <button
                key={c.id}
                type="button"
                className="ficha"
                aria-pressed={cuentaId === c.id}
                onClick={() => {
                  setCuentaId(c.id);
                  if (destinoId === c.id) setDestinoId(null);
                }}
              >
                <span>{c.nombre}</span>
                <span className="ficha-sub num">{formatearMonto(s.get(c.id) ?? 0, c.moneda)}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {tipo === 'transferencia' ? (
          <>
            <fieldset className="grupo">
              <legend>Hacia</legend>
              <div className="fichas">
                {activas
                  .filter((c) => c.id !== cuentaId)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="ficha"
                      aria-pressed={destinoId === c.id}
                      onClick={() => setDestinoId(c.id)}
                    >
                      <span>{c.nombre}</span>
                      <span className="ficha-sub">{c.moneda}</span>
                    </button>
                  ))}
              </div>
            </fieldset>

            {cambiaMoneda && (
              <label className="campo">
                <span>Entran en {destino.nombre}</span>
                <input
                  inputMode="decimal"
                  placeholder={sugerenciaDestino ? `≈ ${sugerenciaDestino}` : '0'}
                  value={montoDestinoTexto}
                  onChange={(e) => setMontoDestinoTexto(e.target.value)}
                />
                {cambioImplicito && (
                  <small className="ayuda num">
                    Tipo de cambio: $ {cambioImplicito.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                    {cotizacion && ` · referencia $ ${cotizacion.toLocaleString('es-AR')}`}
                  </small>
                )}
              </label>
            )}
          </>
        ) : (
          <fieldset className="grupo">
            <legend>Categoría</legend>
            <div className="fichas categorias">
              {categoriasDelTipo.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="ficha"
                  aria-pressed={categoriaId === c.id}
                  onClick={() => setCategoriaId(c.id)}
                >
                  <span className="emoji" aria-hidden>
                    {c.emoji}
                  </span>
                  <span>{c.nombre}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="fila-campos">
          <label className="campo">
            <span>Fecha</span>
            <input type="date" value={fecha} max="2100-12-31" onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label className="campo crece">
            <span>Nota</span>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" />
          </label>
        </div>

        {origen?.moneda === 'USD' && tipo !== 'transferencia' && (
          <p className="ayuda">
            Se valúa en pesos a{' '}
            {existente?.cotizacion
              ? `$ ${existente.cotizacion.toLocaleString('es-AR')} (la del día que lo cargaste)`
              : cotizacion
                ? `$ ${cotizacion.toLocaleString('es-AR')} (la de hoy)`
                : 'la próxima cotización que baje: todavía no hay ninguna'}
            .
          </p>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn principal ancho" disabled={guardando}>
          Guardar
        </button>

        {existente && (
          <button type="button" className="btn peligro ancho" onClick={borrar}>
            Borrar movimiento
          </button>
        )}
      </form>
    </Hoja>
  );
}

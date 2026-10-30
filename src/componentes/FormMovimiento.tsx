import { useMemo, useRef, useState } from 'react';
import { Hoja } from './Hoja';
import { expresionEnVivo, montoEnVivo } from './montoEnVivo';
import { ErrorDeValidacion, repositorio } from '../datos/repositorio';
import { OPERADORES, evaluarMonto, tieneOperador, type Operador } from '../dominio/calculadora';
import { cotizacionVigente, saldos } from '../dominio/calculos';
import { convertir, formatearMonto, leerMonto, montoParaEditar } from '../dominio/dinero';
import { diaYMes, hoy, sumarDias } from '../dominio/fechas';
import { aprenderNotas, coincidencia, frecuentes, posibleDuplicado, sugerir, type Sugerencia } from '../dominio/sugerencias';
import type { Movimiento, TipoMovimiento } from '../dominio/tipos';
import type { DatosMovimiento } from '../dominio/validar';
import type { Billetera } from '../estado/useBilletera';
import { repoFijos } from '../fijos/repositorio';
import { FRECUENCIAS, type Fijo } from '../fijos/tipos';

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

const NOMBRE_OPERADOR: Record<Operador, string> = { '+': 'Más', '−': 'Menos', '×': 'Por', '÷': 'Dividido' };

export function FormMovimiento({
  billetera,
  existente,
  inicial,
  esFijo = false,
  alCerrar,
  alGuardar,
  alBorrar,
}: {
  billetera: Billetera;
  existente: Movimiento | null;
  /** Para uno nuevo que viene armado (por ejemplo, un gasto fijo para confirmar). */
  inicial?: Partial<DatosMovimiento>;
  /** Viene de confirmar un gasto fijo: no se ofrece "Se repite" (ya se repite). */
  esFijo?: boolean;
  alCerrar: () => void;
  /** `fijoNuevo`: si tocaste "Se repite", el fijo que se creó (para que "Deshacer" también lo saque). */
  alGuardar: (m: Movimiento, esNuevo: boolean, fijoNuevo?: Fijo) => void;
  alBorrar: (m: Movimiento) => void;
}) {
  const { cuentas, categorias, movimientos, ajustes } = billetera;
  const base = existente ?? inicial;
  const activas = cuentas.filter((c) => !c.archivada || c.id === base?.cuentaId);
  const s = useMemo(() => saldos(cuentas, movimientos), [cuentas, movimientos]);
  const hoyStr = hoy();
  const entradaMonto = useRef<HTMLInputElement>(null);

  const cuentaInicial =
    activas.find((c) => c.id === base?.cuentaId)?.id ??
    activas.find((c) => c.id === ultimaCuenta())?.id ??
    activas[0]?.id ??
    '';
  const montoInicial = base?.monto ? montoEnVivo(montoParaEditar(base.monto)) : '';

  const [tipo, setTipo] = useState<TipoMovimiento>(base?.tipo ?? 'gasto');
  const [montoTexto, setMontoTexto] = useState(montoInicial);
  const [cuentaId, setCuentaId] = useState(cuentaInicial);
  const [categoriaId, setCategoriaId] = useState<string | null>(base?.categoriaId ?? null);
  const [destinoId, setDestinoId] = useState<string | null>(base?.cuentaDestinoId ?? null);
  const [montoDestinoTexto, setMontoDestinoTexto] = useState(
    base?.montoDestino ? montoEnVivo(montoParaEditar(base.montoDestino)) : '',
  );
  const [fecha, setFecha] = useState(base?.fecha ?? hoyStr);
  const [nota, setNota] = useState(base?.nota ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  /** "Se repite": cada cuántos meses, o null si no se repite. */
  const [repetir, setRepetir] = useState<number | null>(null);
  /** El duplicado que ya te mostramos: si guardás de nuevo con lo mismo, va. */
  const [duplicadoVisto, setDuplicadoVisto] = useState<string | null>(null);

  const origen = cuentas.find((c) => c.id === cuentaId);
  const destino = cuentas.find((c) => c.id === destinoId);
  const moneda = origen?.moneda ?? 'ARS';
  const monto = evaluarMonto(montoTexto);
  const calculando = tieneOperador(montoTexto);
  const montoDestino = leerMonto(montoDestinoTexto);
  const cambiaMoneda = tipo === 'transferencia' && origen && destino && origen.moneda !== destino.moneda;
  const cotizacion = cotizacionVigente(ajustes);

  const categoriasDelTipo = categorias.filter(
    (c) => c.tipo === tipo && (!c.archivada || c.id === base?.categoriaId),
  );
  const porIdCategoria = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);

  /* Lo aprendido de tus notas. Sólo al cargar uno nuevo: editando, cambiar la categoría sola sorprende. */
  const aprendidas = useMemo(
    () => (existente || tipo === 'transferencia' ? [] : aprenderNotas(movimientos, tipo)),
    [movimientos, tipo, existente],
  );
  const deSiempre = useMemo(
    () => (existente || tipo === 'transferencia' ? [] : frecuentes(movimientos, tipo, hoyStr)),
    [movimientos, tipo, existente, hoyStr],
  );
  const sugeridas = nota.trim() ? sugerir(aprendidas, nota) : deSiempre;

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

  const claveDuplicado = `${tipo}|${monto}|${cuentaId}|${fecha}|${destinoId}`;
  const duplicado =
    !existente && monto
      ? posibleDuplicado(
          { tipo, monto, cuentaId, fecha, cuentaDestinoId: tipo === 'transferencia' ? destinoId : null },
          movimientos,
        )
      : undefined;
  const avisarDuplicado = duplicado && duplicadoVisto === claveDuplicado;
  const puedeRepetir = !existente && !esFijo && tipo !== 'transferencia';

  /** Si hay algo escrito que se perdería al cerrar. */
  const sinCambios = existente
    ? montoTexto === montoInicial &&
      nota === existente.nota &&
      fecha === existente.fecha &&
      tipo === existente.tipo &&
      cuentaId === existente.cuentaId &&
      categoriaId === existente.categoriaId &&
      destinoId === existente.cuentaDestinoId
    : montoTexto === montoInicial && nota.trim() === (inicial?.nota ?? '').trim();

  function antesDeCerrar(): boolean {
    return sinCambios || confirm(existente ? '¿Salir sin guardar los cambios?' : '¿Descartar lo que cargaste?');
  }

  function cambiarTipo(t: TipoMovimiento) {
    setTipo(t);
    setError(null);
    if (t !== tipo) setCategoriaId(null);
  }

  function cambiarNota(texto: string) {
    setNota(texto);
    // Si escribiste entera una nota conocida y todavía no elegiste categoría, va la de siempre.
    const conocida = coincidencia(aprendidas, texto);
    const categoria = conocida?.categoriaId ? porIdCategoria.get(conocida.categoriaId) : undefined;
    if (!categoriaId && categoria && !categoria.archivada && categoria.tipo === tipo) setCategoriaId(categoria.id);
  }

  /** Un toque en una sugerencia completa nota, categoría y cuenta; el monto, sólo si no pusiste uno. */
  function aplicar(sug: Sugerencia) {
    setNota(sug.nota);
    const categoria = sug.categoriaId ? porIdCategoria.get(sug.categoriaId) : undefined;
    if (categoria && !categoria.archivada && categoria.tipo === tipo) setCategoriaId(categoria.id);
    const cuenta = activas.find((c) => c.id === sug.cuentaId);
    if (cuenta) {
      setCuentaId(cuenta.id);
      if (!monto) setMontoTexto(montoEnVivo(montoParaEditar(sug.monto)));
    }
  }

  function operar(op: Operador) {
    setMontoTexto(expresionEnVivo(`${montoTexto}${op}`));
    // En el iPhone, tocar un botón puede cerrar el teclado: se vuelve a abrir.
    entradaMonto.current?.focus();
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (guardando) return;
    setError(null);
    if (!monto) {
      setError(calculando ? 'La cuenta no da un monto mayor a cero.' : 'Escribí un monto mayor a cero.');
      return;
    }
    if (duplicado && duplicadoVisto !== claveDuplicado) {
      setDuplicadoVisto(claveDuplicado);
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
      // El movimiento ya está guardado: si el fijo fallara, no se deja el formulario abierto (un
      // segundo "Guardar" lo duplicaría). Se guarda igual, sin repetir.
      const fijoNuevo =
        puedeRepetir && repetir ? await repoFijos.crearDesdeMovimiento(m, repetir).catch(() => undefined) : undefined;
      alGuardar(m, !existente, fijoNuevo);
    } catch (e) {
      if (e instanceof ErrorDeValidacion) setError(e.message);
      else throw e;
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!existente) return;
    // Sin confirmación: el aviso de abajo tiene "Deshacer".
    await repositorio.borrarMovimiento(existente.id);
    alBorrar(existente);
  }

  const descripcionDuplicado = duplicado
    ? [
        duplicado.nota || (duplicado.categoriaId ? porIdCategoria.get(duplicado.categoriaId)?.nombre : null) || null,
        formatearMonto(duplicado.monto, moneda),
        origen?.nombre,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <Hoja
      titulo={existente ? 'Editar' : 'Nuevo'}
      alCerrar={alCerrar}
      antesDeCerrar={antesDeCerrar}
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

        <div className="monto-bloque">
          <label className={`campo-monto${calculando ? ' calculando' : ''}`} data-tipo={tipo}>
            <span className="moneda">{moneda === 'USD' ? 'US$' : '$'}</span>
            <input
              ref={entradaMonto}
              autoFocus={!existente && !inicial?.monto}
              inputMode="decimal"
              enterKeyHint="done"
              placeholder="0"
              value={montoTexto}
              onChange={(e) => setMontoTexto(expresionEnVivo(e.target.value))}
              // Ancho según lo escrito (la fuente es monoespaciada): el signo
              // queda pegado al número en vez de flotar en el borde.
              style={{ width: `${Math.max(1, montoTexto.length) + 0.5}ch` }}
              aria-label="Monto"
            />
          </label>
          {calculando && (
            <p className="calc-resultado num" aria-live="polite">
              {monto ? `= ${formatearMonto(monto, moneda)}` : 'Revisá la cuenta'}
            </p>
          )}
          <div className="calc" role="group" aria-label="Calculadora">
            {OPERADORES.map((op) => (
              <button
                key={op}
                type="button"
                className="calc-boton"
                aria-label={NOMBRE_OPERADOR[op]}
                // Que el toque no le saque el foco al monto (y no se cierre el teclado).
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => operar(op)}
                disabled={!montoTexto}
              >
                {op}
              </button>
            ))}
            {calculando && (
              <button
                type="button"
                className="calc-boton igual"
                aria-label="Igual"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => monto && setMontoTexto(montoEnVivo(montoParaEditar(monto)))}
                disabled={!monto}
              >
                =
              </button>
            )}
          </div>
        </div>

        <div className="nota-bloque">
          <label className="campo">
            <span className="sr-solo">Nota</span>
            <input
              value={nota}
              onChange={(e) => cambiarNota(e.target.value)}
              placeholder={tipo === 'transferencia' ? 'Nota (opcional)' : '¿En qué? Ej.: Coto, nafta, alquiler'}
              aria-label="Nota"
              autoComplete="off"
              enterKeyHint="done"
            />
          </label>
          {sugeridas.length > 0 && (
            <div className="sugerencias" role="group" aria-label={nota.trim() ? 'Sugerencias' : 'Tus gastos frecuentes'}>
              {!nota.trim() && <span className="sugerencias-titulo">Frecuentes</span>}
              {sugeridas.map((sug) => {
                const categoria = sug.categoriaId ? porIdCategoria.get(sug.categoriaId) : undefined;
                const monedaSug = cuentas.find((c) => c.id === sug.cuentaId)?.moneda ?? 'ARS';
                return (
                  <button key={sug.clave} type="button" className="sugerencia" onClick={() => aplicar(sug)}>
                    <span aria-hidden>{categoria?.emoji ?? '•'}</span>
                    <span className="sugerencia-nota">{sug.nota}</span>
                    <span className="sugerencia-monto num">{formatearMonto(sug.monto, monedaSug, { sinDecimales: true })}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

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
                  onChange={(e) => setMontoDestinoTexto(montoEnVivo(e.target.value))}
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

        <fieldset className="grupo">
          <legend>Fecha</legend>
          <div className="fecha-rapida">
            <button type="button" className="ficha" aria-pressed={fecha === hoyStr} onClick={() => setFecha(hoyStr)}>
              Hoy
            </button>
            <button
              type="button"
              className="ficha"
              aria-pressed={fecha === sumarDias(hoyStr, -1)}
              onClick={() => setFecha(sumarDias(hoyStr, -1))}
            >
              Ayer
            </button>
            <label className="campo crece">
              <span className="sr-solo">Otro día</span>
              <input
                type="date"
                value={fecha}
                max="2100-12-31"
                onChange={(e) => e.target.value && setFecha(e.target.value)}
                aria-label="Fecha"
              />
            </label>
          </div>
          {fecha > hoyStr && (
            <small className="ayuda aviso-fecha">⚠️ Es una fecha futura ({diaYMes(fecha)}): el saldo ya lo descuenta desde hoy.</small>
          )}
        </fieldset>

        {puedeRepetir && (
          <fieldset className="grupo">
            <legend className="sr-solo">Se repite</legend>
            <button type="button" className="ficha repetir" aria-pressed={repetir !== null} onClick={() => setRepetir(repetir ? null : 1)}>
              🔁 {repetir ? 'Se repite' : '¿Se repite? (alquiler, servicios, suscripciones…)'}
            </button>
            {repetir !== null && (
              <>
                <div className="fichas">
                  {FRECUENCIAS.map((f) => (
                    <button
                      key={f.cadaMeses}
                      type="button"
                      className="ficha"
                      aria-pressed={repetir === f.cadaMeses}
                      onClick={() => setRepetir(f.cadaMeses)}
                    >
                      {f.nombre}
                    </button>
                  ))}
                </div>
                <small className="ayuda">
                  Cuando vuelva a vencer aparece en el Inicio para confirmarlo con un toque. Nunca se carga solo.
                </small>
              </>
            )}
          </fieldset>
        )}

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

        {avisarDuplicado && (
          <div className="alerta" role="alert">
            <span>
              ⚠️ Ya cargaste uno igual {fecha === hoyStr ? 'hoy' : `el ${diaYMes(fecha)}`}: {descripcionDuplicado}. Si es otro,
              tocá <strong>Guardar igual</strong>.
            </span>
          </div>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn principal ancho" disabled={guardando}>
          {avisarDuplicado ? 'Guardar igual' : 'Guardar'}
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

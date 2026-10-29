import { useState } from 'react';
import { Hoja } from './Hoja';
import { montoEnVivo } from './montoEnVivo';
import { ErrorDeValidacion, repositorio } from '../datos/repositorio';
import { tienePeriodo } from '../dominio/calculos';
import { leerMonto, montoParaEditar } from '../dominio/dinero';
import { diaYMes, diasIncluidos, hoy, sumarDias } from '../dominio/fechas';
import type { Categoria, Centavos, Cuenta, Moneda, TipoCategoria, TipoCuenta } from '../dominio/tipos';

/** Como `leerMonto`, pero acepta cero y negativos (un saldo puede serlo). */
function leerSaldo(texto: string): Centavos | null {
  const t = texto.trim();
  if (!t || t === '0') return 0;
  const negativo = t.startsWith('-') || t.startsWith('−');
  const valor = leerMonto(negativo ? t.slice(1) : t);
  return valor === null ? null : negativo ? -valor : valor;
}

function saldoParaEditar(c: Centavos): string {
  return c < 0 ? `-${montoEnVivo(montoParaEditar(-c))}` : c === 0 ? '0' : montoEnVivo(montoParaEditar(c));
}

const TIPOS_CUENTA: { id: TipoCuenta; nombre: string }[] = [
  { id: 'efectivo', nombre: 'Efectivo' },
  { id: 'banco', nombre: 'Banco' },
  { id: 'virtual', nombre: 'Billetera virtual' },
  { id: 'otro', nombre: 'Otro' },
];

/**
 * Se edita el saldo ACTUAL, no el inicial: es el número que ves en el home
 * banking. Por dentro se corrige el saldo inicial por la diferencia, así el
 * ajuste no aparece como gasto ni ingreso y no ensucia el mes.
 */
export function EditorCuenta({
  cuenta,
  saldoActual,
  tieneMovimientos,
  alCerrar,
}: {
  cuenta: Cuenta | null;
  saldoActual: Centavos;
  tieneMovimientos: boolean;
  alCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(cuenta?.nombre ?? '');
  const [moneda, setMoneda] = useState<Moneda>(cuenta?.moneda ?? 'ARS');
  const [tipo, setTipo] = useState<TipoCuenta>(cuenta?.tipo ?? 'banco');
  const [saldoTexto, setSaldoTexto] = useState(cuenta ? saldoParaEditar(saldoActual) : '');
  const [error, setError] = useState<string | null>(null);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    const saldo = leerSaldo(saldoTexto);
    if (saldo === null) {
      setError('El saldo no es un número válido.');
      return;
    }
    try {
      if (cuenta) {
        await repositorio.editarCuenta(cuenta.id, {
          nombre,
          moneda,
          tipo,
          saldoInicial: cuenta.saldoInicial + (saldo - saldoActual),
        });
      } else {
        await repositorio.crearCuenta({ nombre, moneda, tipo, saldoInicial: saldo });
      }
      alCerrar();
    } catch (e) {
      if (e instanceof ErrorDeValidacion) setError(e.message);
      else throw e;
    }
  }

  async function archivar() {
    if (!cuenta) return;
    await repositorio.editarCuenta(cuenta.id, { archivada: !cuenta.archivada });
    alCerrar();
  }

  return (
    <Hoja
      titulo={cuenta ? 'Cuenta' : 'Nueva cuenta'}
      alCerrar={alCerrar}
      acciones={
        <button type="submit" form="form-cuenta" className="btn-texto fuerte">
          Guardar
        </button>
      }
    >
      <form id="form-cuenta" className="form" onSubmit={guardar}>
        <label className="campo">
          <span>Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus={!cuenta} />
        </label>

        <fieldset className="grupo">
          <legend>Moneda</legend>
          <div className="segmentado">
            {(['ARS', 'USD'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={moneda === m}
                disabled={tieneMovimientos && m !== cuenta?.moneda}
                onClick={() => setMoneda(m)}
              >
                {m === 'ARS' ? 'Pesos' : 'Dólares'}
              </button>
            ))}
          </div>
          {tieneMovimientos && <small className="ayuda">Tiene movimientos: la moneda ya no se puede cambiar.</small>}
        </fieldset>

        <fieldset className="grupo">
          <legend>Tipo</legend>
          <div className="fichas">
            {TIPOS_CUENTA.map((t) => (
              <button key={t.id} type="button" className="ficha" aria-pressed={tipo === t.id} onClick={() => setTipo(t.id)}>
                {t.nombre}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="campo">
          <span>{cuenta ? 'Saldo actual' : 'Saldo hoy'}</span>
          <input inputMode="decimal" placeholder="0" value={saldoTexto} onChange={(e) => setSaldoTexto(montoEnVivo(e.target.value, { negativo: true }))} />
          {cuenta && (
            <small className="ayuda">
              Si no coincide con lo real, corregilo acá. El ajuste no cuenta como gasto ni ingreso.
            </small>
          )}
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn principal ancho">
          Guardar
        </button>
        {cuenta && (
          <button type="button" className="btn ancho" onClick={archivar}>
            {cuenta.archivada ? 'Desarchivar' : 'Archivar (deja de sumar y de aparecer)'}
          </button>
        )}
      </form>
    </Hoja>
  );
}

export function EditorCategoria({
  categoria,
  tipoNueva,
  alCerrar,
}: {
  categoria: Categoria | null;
  tipoNueva: TipoCategoria;
  alCerrar: () => void;
}) {
  const tipo = categoria?.tipo ?? tipoNueva;
  const [nombre, setNombre] = useState(categoria?.nombre ?? '');
  const [emoji, setEmoji] = useState(categoria?.emoji ?? (tipo === 'gasto' ? '📦' : '💰'));
  const [presupuestoTexto, setPresupuestoTexto] = useState(
    categoria?.presupuesto ? montoEnVivo(montoParaEditar(categoria.presupuesto)) : '',
  );
  const hoyStr = hoy();
  const [porFechas, setPorFechas] = useState(categoria ? tienePeriodo(categoria) : false);
  const [desde, setDesde] = useState(categoria?.presupuestoDesde ?? hoyStr);
  const [hasta, setHasta] = useState(categoria?.presupuestoHasta ?? sumarDias(hoyStr, 2));
  const [error, setError] = useState<string | null>(null);

  /** Atajo: desde hoy, n días contando hoy. */
  function proximosDias(n: number) {
    setDesde(hoyStr);
    setHasta(sumarDias(hoyStr, n - 1));
  }
  const dias = desde && hasta && desde <= hasta ? diasIncluidos(desde, hasta) : null;

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    const presupuesto = presupuestoTexto.trim() ? leerMonto(presupuestoTexto) : null;
    if (presupuestoTexto.trim() && presupuesto === null) {
      setError('El presupuesto no es un número válido.');
      return;
    }
    if (porFechas && presupuesto === null) {
      setError('Poné el monto del tope para esas fechas.');
      return;
    }
    const periodo =
      porFechas && presupuesto !== null
        ? { presupuestoDesde: desde, presupuestoHasta: hasta }
        : { presupuestoDesde: null, presupuestoHasta: null };
    // Un emoji puede ocupar varios "caracteres": nos quedamos con el primer grafema.
    const primero = [...new Intl.Segmenter().segment(emoji.trim())][0]?.segment ?? '•';
    try {
      if (categoria) {
        await repositorio.editarCategoria(categoria.id, { nombre, emoji: primero, presupuesto, ...periodo });
      } else {
        await repositorio.crearCategoria({ nombre, tipo, emoji: primero, presupuesto, ...periodo });
      }
      alCerrar();
    } catch (e) {
      if (e instanceof ErrorDeValidacion) setError(e.message);
      else throw e;
    }
  }

  async function archivar() {
    if (!categoria) return;
    await repositorio.editarCategoria(categoria.id, { archivada: !categoria.archivada });
    alCerrar();
  }

  return (
    <Hoja
      titulo={categoria ? 'Categoría' : tipo === 'gasto' ? 'Nueva categoría de gasto' : 'Nueva categoría de ingreso'}
      alCerrar={alCerrar}
      acciones={
        <button type="submit" form="form-categoria" className="btn-texto fuerte">
          Guardar
        </button>
      }
    >
      <form id="form-categoria" className="form" onSubmit={guardar}>
        <div className="fila-campos">
          <label className="campo emoji-campo">
            <span>Ícono</span>
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} />
          </label>
          <label className="campo crece">
            <span>Nombre</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus={!categoria} />
          </label>
        </div>

        {tipo === 'gasto' && (
          <fieldset className="grupo">
            <legend>Tope de gasto</legend>
            <div className="segmentado" role="radiogroup" aria-label="Período del tope">
              <button type="button" role="radio" aria-checked={!porFechas} onClick={() => setPorFechas(false)}>
                Por mes
              </button>
              <button type="button" role="radio" aria-checked={porFechas} onClick={() => setPorFechas(true)}>
                Entre fechas
              </button>
            </div>

            <label className="campo">
              <span>{porFechas ? 'Tope para esas fechas (pesos)' : 'Tope por mes (pesos)'}</span>
              <input
                inputMode="decimal"
                placeholder="Sin tope"
                value={presupuestoTexto}
                onChange={(e) => setPresupuestoTexto(montoEnVivo(e.target.value))}
              />
            </label>

            {porFechas ? (
              <>
                <div className="fichas">
                  {[3, 7, 15].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="ficha"
                      aria-pressed={desde === hoyStr && hasta === sumarDias(hoyStr, n - 1)}
                      onClick={() => proximosDias(n)}
                    >
                      Próximos {n} días
                    </button>
                  ))}
                </div>
                <div className="fila-campos">
                  <label className="campo crece">
                    <span>Desde</span>
                    <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
                  </label>
                  <label className="campo crece">
                    <span>Hasta</span>
                    <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
                  </label>
                </div>
                <small className="ayuda">
                  {dias
                    ? `${dias === 1 ? 'Un día' : `${dias} días`}: del ${diaYMes(desde)} al ${diaYMes(hasta)}, contando los dos. Cuenta sólo lo que gastes en esta categoría entre esas fechas. Cuando termina, la categoría vuelve a quedar sin tope.`
                    : 'La fecha "hasta" tiene que ser igual o posterior a "desde".'}
                </small>
              </>
            ) : (
              <small className="ayuda">
                Vale para cada mes calendario. Revisalo cada tanto: con inflación, un tope fijo en pesos se vuelve más
                fácil de cumplir mes a mes.
              </small>
            )}
          </fieldset>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn principal ancho">
          Guardar
        </button>
        {categoria && (
          <button type="button" className="btn ancho" onClick={archivar}>
            {categoria.archivada ? 'Desarchivar' : 'Archivar'}
          </button>
        )}
      </form>
    </Hoja>
  );
}

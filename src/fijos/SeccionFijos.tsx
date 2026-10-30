import { useState, type CSSProperties } from 'react';
import { Hoja } from '../componentes/Hoja';
import { colorCategoria } from '../componentes/colores';
import { montoEnVivo } from '../componentes/montoEnVivo';
import { ErrorDeValidacion } from '../datos/repositorio';
import { formatearMonto, leerMonto, montoParaEditar } from '../dominio/dinero';
import { diaYMes, hoy } from '../dominio/fechas';
import type { Categoria, Cuenta } from '../dominio/tipos';
import { nombreFrecuencia, primerVencimiento, textoVencimiento } from './calculos';
import { repoFijos } from './repositorio';
import { FRECUENCIAS, type Fijo } from './tipos';
import { useFijos } from './useFijos';
import './fijos.css';

type Avisar = (texto: string, deshacer?: () => void) => void;

const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Ajustes → Gastos e ingresos fijos: la lista para revisarlos, cambiarlos, pausarlos o agregar uno. */
export function SeccionFijos({
  cuentas,
  categorias,
  avisar,
}: {
  cuentas: Cuenta[];
  categorias: Categoria[];
  avisar: Avisar;
}) {
  const fijos = useFijos();
  const [editando, setEditando] = useState<Fijo | 'nuevo' | null>(null);
  const hoyStr = hoy();
  const porIdCuenta = new Map(cuentas.map((c) => [c.id, c]));
  const porIdCategoria = new Map(categorias.map((c) => [c.id, c]));
  const ordenados = [...fijos].sort(
    (a, b) => Number(b.activo) - Number(a.activo) || a.tipo.localeCompare(b.tipo) || a.proxima.localeCompare(b.proxima),
  );

  return (
    <section className="bloque">
      <div className="bloque-cabecera">
        <h2 className="bloque-titulo">Gastos e ingresos fijos</h2>
        <button type="button" className="btn-texto" onClick={() => setEditando('nuevo')}>
          + Agregar
        </button>
      </div>
      {ordenados.length === 0 ? (
        <p className="ayuda">
          Alquiler, servicios, suscripciones o el sueldo: cuando vencen aparecen en el Inicio para cargarlos con un toque.
          También se agregan tocando "Se repite" al cargar un gasto.
        </p>
      ) : (
        <div className="lista">
          {ordenados.map((f) => {
            const categoria = porIdCategoria.get(f.categoriaId);
            const moneda = porIdCuenta.get(f.cuentaId)?.moneda ?? 'ARS';
            return (
              <button
                key={f.id}
                type="button"
                className={`fila fijo-fila${f.activo ? '' : ' pausado'}`}
                onClick={() => setEditando(f)}
              >
                <span className="fila-icono" aria-hidden style={{ '--c': colorCategoria(categoria) } as CSSProperties}>
                  {categoria?.emoji ?? '🔁'}
                </span>
                <span className="fila-texto">
                  <span className="fila-titulo">{f.nota}</span>
                  <span className="fila-sub">
                    {f.activo
                      ? `Día ${f.dia}, ${nombreFrecuencia(f.cadaMeses)} · ${textoVencimiento(f.proxima, hoyStr)}`
                      : `⏸ Pausado · día ${f.dia}, ${nombreFrecuencia(f.cadaMeses)}`}
                  </span>
                </span>
                <span className={`fila-monto num${f.tipo === 'ingreso' ? ' ingreso' : ''}`}>
                  {formatearMonto(f.monto, moneda, { sinDecimales: true })}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {editando && (
        <EditorFijo
          fijo={editando === 'nuevo' ? null : editando}
          cuentas={cuentas}
          categorias={categorias}
          alCerrar={() => setEditando(null)}
          avisar={avisar}
        />
      )}
    </section>
  );
}

function EditorFijo({
  fijo,
  cuentas,
  categorias,
  alCerrar,
  avisar,
}: {
  fijo: Fijo | null;
  cuentas: Cuenta[];
  categorias: Categoria[];
  alCerrar: () => void;
  avisar: Avisar;
}) {
  const hoyStr = hoy();
  const activas = cuentas.filter((c) => !c.archivada || c.id === fijo?.cuentaId);
  const [tipo, setTipo] = useState<Fijo['tipo']>(fijo?.tipo ?? 'gasto');
  const [nota, setNota] = useState(fijo?.nota ?? '');
  const [montoTexto, setMontoTexto] = useState(fijo ? montoEnVivo(montoParaEditar(fijo.monto)) : '');
  const [cuentaId, setCuentaId] = useState(fijo?.cuentaId ?? activas[0]?.id ?? '');
  const [categoriaId, setCategoriaId] = useState(fijo?.categoriaId ?? '');
  const [dia, setDia] = useState(fijo?.dia ?? Number(hoyStr.slice(8, 10)));
  const [cadaMeses, setCadaMeses] = useState(fijo?.cadaMeses ?? 1);
  const [proxima, setProxima] = useState(fijo?.proxima ?? primerVencimiento(hoyStr, Number(hoyStr.slice(8, 10))));
  /** Si tocaste la fecha a mano, cambiar el día ya no la mueve. */
  const [proximaAMano, setProximaAMano] = useState(Boolean(fijo));
  const [activo, setActivo] = useState(fijo?.activo ?? true);
  const [error, setError] = useState<string | null>(null);

  const moneda = cuentas.find((c) => c.id === cuentaId)?.moneda ?? 'ARS';
  const delTipo = categorias.filter((c) => c.tipo === tipo && (!c.archivada || c.id === fijo?.categoriaId));

  function elegirDia(d: number) {
    setDia(d);
    if (!proximaAMano) setProxima(primerVencimiento(hoyStr, d));
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    const monto = leerMonto(montoTexto);
    if (!monto) {
      setError('Escribí cuánto es, más o menos: lo vas a poder corregir cada vez que lo cargues.');
      return;
    }
    const datos = { tipo, nota, monto, cuentaId, categoriaId, dia, cadaMeses, proxima };
    try {
      if (fijo) await repoFijos.editarFijo(fijo.id, { ...datos, activo });
      else await repoFijos.crearFijo(datos);
      alCerrar();
    } catch (e) {
      if (e instanceof ErrorDeValidacion) setError(e.message);
      else throw e;
    }
  }

  async function borrar() {
    if (!fijo) return;
    await repoFijos.borrarFijo(fijo.id);
    alCerrar();
    avisar(`${fijo.nota} ya no se repite`, () => repoFijos.borrarFijo(fijo.id, false));
  }

  return (
    <Hoja
      titulo={fijo ? 'Fijo' : 'Nuevo fijo'}
      alCerrar={alCerrar}
      acciones={
        <button type="submit" form="form-fijo" className="btn-texto fuerte">
          Guardar
        </button>
      }
    >
      <form id="form-fijo" className="form" onSubmit={guardar}>
        {!fijo && (
          <div className="segmentado" role="radiogroup" aria-label="Tipo">
            {(['gasto', 'ingreso'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tipo === t}
                data-tipo={t}
                onClick={() => {
                  setTipo(t);
                  setCategoriaId('');
                }}
              >
                {t === 'gasto' ? 'Gasto' : 'Ingreso'}
              </button>
            ))}
          </div>
        )}

        <label className="campo">
          <span>Qué es</span>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Alquiler, Netflix, luz…" />
        </label>

        <label className="campo">
          <span>Monto de referencia ({moneda === 'USD' ? 'US$' : '$'})</span>
          <input
            className="num"
            inputMode="decimal"
            value={montoTexto}
            onChange={(e) => setMontoTexto(montoEnVivo(e.target.value))}
            placeholder="0"
          />
          <small className="ayuda">Al confirmarlo podés cambiarlo; se queda con el último que cargaste.</small>
        </label>

        <label className="campo">
          <span>Cuenta</span>
          <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            {activas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.moneda})
              </option>
            ))}
          </select>
        </label>

        <label className="campo">
          <span>Categoría</span>
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="" disabled>
              Elegí una
            </option>
            {delTipo.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <div className="fila-campos">
          <label className="campo fijo-dia">
            <span>Vence el día</span>
            <select value={dia} onChange={(e) => elegirDia(Number(e.target.value))}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="campo crece">
            <span>Se repite</span>
            <select value={cadaMeses} onChange={(e) => setCadaMeses(Number(e.target.value))}>
              {FRECUENCIAS.map((f) => (
                <option key={f.cadaMeses} value={f.cadaMeses}>
                  {f.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        {dia > 28 && <small className="ayuda">En los meses que no tienen el {dia}, vence el último día.</small>}

        <label className="campo">
          <span>Próximo vencimiento</span>
          <input
            type="date"
            value={proxima}
            onChange={(e) => {
              if (!e.target.value) return;
              setProxima(e.target.value);
              setProximaAMano(true);
            }}
          />
          <small className="ayuda">
            {proxima <= hoyStr
              ? `${conMayuscula(textoVencimiento(proxima, hoyStr))}: aparece ya en el Inicio para confirmar.`
              : `Aparece en el Inicio para confirmar el ${diaYMes(proxima)}.`}
          </small>
        </label>

        {fijo && (
          <button type="button" className="ficha" aria-pressed={!activo} onClick={() => setActivo(!activo)}>
            ⏸ {activo ? 'Pausar (no aparece para confirmar)' : 'Pausado: tocá para reactivarlo'}
          </button>
        )}

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn principal ancho">
          Guardar
        </button>
        {fijo && (
          <button type="button" className="btn peligro ancho" onClick={borrar}>
            Dejar de repetir
          </button>
        )}
      </form>
    </Hoja>
  );
}

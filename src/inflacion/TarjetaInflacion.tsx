import { useEffect, useMemo, useState } from 'react';
import { Hoja } from '../componentes/Hoja';
import { repositorio } from '../datos/repositorio';
import { hoy, mesDe, nombreMes, sumarMeses } from '../dominio/fechas';
import type { Ajustes } from '../dominio/tipos';
import { leerPorcentaje, resumir, serieEfectiva } from './calculos';
import { actualizarInflacion, inflacionGuardada, type ResultadoActualizacion } from './inflacion';
import './inflacion.css';

const pct = (v: number) => `${v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const mesSolo = (mes: string) => nombreMes(mes).split(' ')[0]!;

/** "22/10 a las 13:00". */
function fecha(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' });
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${dia} a las ${hora}`;
}

/** "▲ 0,2 más" en rojo, "▼ 0,4 menos" en verde: que la inflación suba es malo. */
function Cambio({ puntos }: { puntos: number | null }) {
  if (puntos === null) return <span className="infl-cambio neutro">—</span>;
  if (puntos === 0) return <span className="infl-cambio neutro">igual</span>;
  const sube = puntos > 0;
  return (
    <span className={`infl-cambio ${sube ? 'sube' : 'baja'}`}>
      {sube ? '▲' : '▼'} {Math.abs(puntos).toLocaleString('es-AR')} {sube ? 'más' : 'menos'}
    </span>
  );
}

/**
 * Inicio → Inflación. Último mes, acumulada del año y cómo viene mes a mes
 * (3 o 6 meses), con la posibilidad de cargar o corregir un mes a mano.
 */
export function TarjetaInflacion({ ajustes, enLinea }: { ajustes: Ajustes; enLinea: boolean }) {
  const [cuantos, setCuantos] = useState<3 | 6>(3);
  const [resultado, setResultado] = useState<ResultadoActualizacion | null>(null);
  const [version, setVersion] = useState(0);
  const [corrigiendo, setCorrigiendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    actualizarInflacion().then((r) => {
      if (!vivo) return;
      setResultado(r);
      setVersion((v) => v + 1);
    });
    return () => {
      vivo = false;
    };
  }, [enLinea]);

  const guardado = useMemo(() => inflacionGuardada(), [version]);
  const manual = useMemo(() => ajustes.inflacionManual ?? {}, [ajustes.inflacionManual]);
  const serie = useMemo(() => serieEfectiva(guardado.serie, manual), [guardado, manual]);
  const r = resumir(serie, cuantos);

  const desactualizada = resultado === 'fallo' || resultado === 'sin-conexion';
  const estado = !guardado.bajadaEn
    ? desactualizada
      ? 'No se pudo bajar la inflación. Conectate una vez o cargá un mes a mano.'
      : 'Bajando la inflación…'
    : desactualizada
      ? `${resultado === 'sin-conexion' ? 'Sin conexión' : 'La fuente no respondió'}: datos guardados el ${fecha(guardado.bajadaEn)}.`
      : `INDEC vía argentinadatos.com · actualizado ${fecha(guardado.bajadaEn)}.`;

  const maximo = r ? Math.max(...r.meses.map((m) => m.valor), 0.1) : 1;
  // El INDEC publica a mitad del mes siguiente: hoy 24/10, el último es septiembre.
  const proximo = r ? sumarMeses(r.ultimo.mes, 1) : null;

  return (
    <section className="bloque">
      <div className="bloque-cabecera">
        <h2 className="bloque-titulo">Inflación</h2>
        <div className="segmentado infl-selector" role="radiogroup" aria-label="Meses">
          {([3, 6] as const).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={cuantos === n} onClick={() => setCuantos(n)}>
              {n} meses
            </button>
          ))}
        </div>
      </div>

      <div className="infl-tarjeta">
        {!r ? (
          <p className="ayuda">{estado}</p>
        ) : (
          <>
            <div className="infl-arriba">
              <div className="infl-ultimo">
                <span className="infl-rotulo">{nombreMes(r.ultimo.mes)}</span>
                <span className="infl-grande">{pct(r.ultimo.valor)}</span>
                <span className="infl-sub">
                  {r.meses[r.meses.length - 1]?.cambio != null ? (
                    <>
                      <Cambio puntos={r.meses[r.meses.length - 1]!.cambio} /> que {mesSolo(sumarMeses(r.ultimo.mes, -1)).toLowerCase()}
                    </>
                  ) : (
                    'último dato'
                  )}
                  {r.ultimo.manual && ' · cargado a mano'}
                </span>
              </div>
              <div className="infl-anio">
                <span className="infl-rotulo">Acumulada {r.anio.anio}</span>
                <span className="infl-mediana">{pct(r.anio.valor)}</span>
                <span className="infl-sub">
                  enero a {mesSolo(r.anio.hasta).toLowerCase()}
                </span>
              </div>
            </div>

            <ul className="infl-meses" aria-label={`Inflación de los últimos ${cuantos} meses`}>
              {[...r.meses].reverse().map((m) => (
                <li key={m.mes}>
                  <span className="infl-mes" title={nombreMes(m.mes)}>
                    {mesSolo(m.mes).slice(0, 3)}
                    {m.manual && <span className="infl-manual" title="Cargado a mano"> ✎</span>}
                  </span>
                  <span className="infl-pista" aria-hidden>
                    <span className="infl-relleno" style={{ width: `${(Math.max(m.valor, 0) / maximo) * 100}%` }} />
                  </span>
                  <span className="infl-valor">{pct(m.valor)}</span>
                  <Cambio puntos={m.cambio} />
                </li>
              ))}
            </ul>

            <p className="infl-periodo">
              En estos {cuantos} meses los precios subieron <strong>{pct(r.periodo)}</strong> en total.
              {r.huecos.length > 0 && (
                <span className="infl-aviso">
                  {' '}Falta el dato de {r.huecos.map((m) => mesSolo(m).toLowerCase()).join(', ')}: cargalo a mano para
                  que el total sea correcto.
                </span>
              )}
            </p>

            <p className="ayuda">
              Las flechas comparan cada mes con el anterior, en puntos: ▼ es que la inflación bajó (bien). El dato de{' '}
              {proximo && mesSolo(proximo).toLowerCase()} sale a mediados del mes que viene.
            </p>
          </>
        )}

        <div className="infl-pie">
          {r && <span className={desactualizada ? 'infl-estado atrasado' : 'infl-estado'}>{estado}</span>}
          <button type="button" className="btn-texto" onClick={() => setCorrigiendo(true)}>
            Cargar o corregir un mes
          </button>
        </div>
      </div>

      {corrigiendo && (
        <CorregirMes
          serie={serie}
          manual={manual}
          alCerrar={() => setCorrigiendo(false)}
        />
      )}
    </section>
  );
}

function CorregirMes({
  serie,
  manual,
  alCerrar,
}: {
  serie: { mes: string; valor: number; manual: boolean }[];
  manual: Record<string, number>;
  alCerrar: () => void;
}) {
  // Los últimos 12 meses cerrados: el mes en curso todavía no tiene inflación.
  const ultimoCerrado = sumarMeses(mesDe(hoy()), -1);
  const opciones = Array.from({ length: 12 }, (_, i) => sumarMeses(ultimoCerrado, -i));
  const valorDe = (mes: string) => serie.find((m) => m.mes === mes)?.valor;
  // De entrada, el primer mes que falta; si no falta ninguno, el último.
  const inicial = [...opciones].reverse().find((m) => valorDe(m) === undefined) ?? opciones[0]!;

  const [mes, setMes] = useState(inicial);
  const [texto, setTexto] = useState(valorDe(inicial)?.toString().replace('.', ',') ?? '');
  const [error, setError] = useState<string | null>(null);

  function elegirMes(m: string) {
    setMes(m);
    setTexto(valorDe(m)?.toString().replace('.', ',') ?? '');
    setError(null);
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    const v = leerPorcentaje(texto);
    if (v === null) {
      setError('Escribí el porcentaje del mes, por ejemplo 1,9.');
      return;
    }
    await repositorio.guardarAjustes({ inflacionManual: { ...manual, [mes]: v } });
    alCerrar();
  }

  async function quitar(m: string) {
    const resto = { ...manual };
    delete resto[m];
    await repositorio.guardarAjustes({ inflacionManual: resto });
  }

  const corregidos = Object.keys(manual).sort().reverse();

  return (
    <Hoja
      titulo="Inflación a mano"
      alCerrar={alCerrar}
      acciones={
        <button type="submit" form="form-inflacion" className="btn-texto fuerte">
          Guardar
        </button>
      }
    >
      <form id="form-inflacion" className="form" onSubmit={guardar}>
        <p className="ayuda">
          Para cuando la fuente se atrasa o tiene un error. Lo que cargues acá pisa al dato de internet de ese mes, se
          usa también en Reportes y viaja en el archivo de Archivos y Transferencias.
        </p>
        <div className="fila-campos">
          <label className="campo crece">
            <span>Mes</span>
            <select className="infl-select" value={mes} onChange={(e) => elegirMes(e.target.value)}>
              {opciones.map((m) => (
                <option key={m} value={m}>
                  {nombreMes(m)}
                  {valorDe(m) === undefined ? ' (sin dato)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="campo infl-campo-pct">
            <span>Inflación %</span>
            <input inputMode="decimal" placeholder="1,9" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn principal ancho">
          Guardar
        </button>

        {corregidos.length > 0 && (
          <div className="grupo">
            <span className="infl-rotulo">Cargados a mano</span>
            <ul className="lista">
              {corregidos.map((m) => (
                <li key={m} className="fila">
                  <span className="fila-texto">
                    <span className="fila-titulo">{nombreMes(m)}</span>
                    <span className="fila-sub">{pct(manual[m]!)}</span>
                  </span>
                  <button type="button" className="btn chico" onClick={() => quitar(m)}>
                    Usar el de internet
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Hoja>
  );
}

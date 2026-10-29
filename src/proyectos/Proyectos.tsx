import { useMemo, useState } from 'react';
import { Hoja } from '../componentes/Hoja';
import { montoEnVivo } from '../componentes/montoEnVivo';
import { ErrorDeValidacion } from '../datos/repositorio';
import { formatearMonto, leerMonto, montoParaEditar } from '../dominio/dinero';
import type { Centavos, Moneda } from '../dominio/tipos';
import { avance, ordenarObjetivos, type Avance } from './calculos';
import { ListaNotas, type Avisar } from './Notas';
import { repoProyectos } from './repositorio';
import type { EstadoProyecto, Objetivo, Proyecto } from './tipos';
import { useProyectos, type DatosProyectos } from './useProyectos';
import './proyectos.css';

const CLAVE_VISTA = 'billetera.proyectos.vista';

function leerVista(): 'proyectos' | 'notas' {
  try {
    return localStorage.getItem(CLAVE_VISTA) === 'notas' ? 'notas' : 'proyectos';
  } catch {
    return 'proyectos';
  }
}

const ESTADOS: { id: EstadoProyecto; nombre: string }[] = [
  { id: 'activo', nombre: 'Activo' },
  { id: 'pausado', nombre: 'Pausado' },
  { id: 'terminado', nombre: 'Terminado' },
];

/** Con espacio que no corta línea: que "$ 1.200.000" no quede partido en dos renglones. */
const plata = (c: Centavos, moneda: Moneda) => formatearMonto(c, moneda, { sinDecimales: true }).replace(' ', '\u00a0');

/** "3 de 5 objetivos hechos". */
function textoObjetivos(a: Avance): string {
  if (!a.total) return 'Sin objetivos todavía';
  return `${a.hechos} de ${a.total} ${a.total === 1 ? 'objetivo hecho' : 'objetivos hechos'}`;
}

/** "$ 490.000 de $ 1.200.000 ya cubiertos". */
function textoCubierto(p: Proyecto, a: Avance): string | null {
  if (p.presupuesto) return `${plata(a.cubierto, p.moneda)} de ${plata(p.presupuesto, p.moneda)} ya cubiertos`;
  return a.cubierto ? `${plata(a.cubierto, p.moneda)} ya cubiertos` : null;
}

/** Pestaña Proyectos: proyectos con presupuesto y objetivos, y aparte las notas sueltas. */
export function Proyectos({ avisar }: { avisar: Avisar }) {
  const datos = useProyectos();
  const [vista, setVista] = useState(leerVista);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const abierto = datos.proyectos.find((p) => p.id === abiertoId) ?? null;

  function elegirVista(v: 'proyectos' | 'notas') {
    setVista(v);
    setAbiertoId(null);
    try {
      localStorage.setItem(CLAVE_VISTA, v);
    } catch {
      /* Sin almacenamiento: vale para esta sesión. */
    }
  }

  function abrir(id: string | null) {
    setAbiertoId(id);
    window.scrollTo(0, 0);
  }

  if (datos.cargando) return <p className="vacio">Cargando…</p>;

  return (
    <div className="pantalla proy">
      <div className="segmentado" role="radiogroup" aria-label="Vista">
        <button type="button" role="radio" aria-checked={vista === 'proyectos'} onClick={() => elegirVista('proyectos')}>
          Proyectos
        </button>
        <button type="button" role="radio" aria-checked={vista === 'notas'} onClick={() => elegirVista('notas')}>
          Notas
        </button>
      </div>

      {vista === 'notas' ? (
        <ListaNotas
          notas={datos.notas.filter((n) => n.proyectoId === null)}
          todas={datos.notas}
          proyectoId={null}
          avisar={avisar}
        />
      ) : abierto ? (
        <DetalleProyecto proyecto={abierto} datos={datos} alVolver={() => abrir(null)} avisar={avisar} />
      ) : (
        <ListaProyectos datos={datos} alAbrir={abrir} />
      )}
    </div>
  );
}

/* ---------- Lista ---------- */

function ListaProyectos({ datos, alAbrir }: { datos: DatosProyectos; alAbrir: (id: string) => void }) {
  const [creando, setCreando] = useState(false);
  const [verTerminados, setVerTerminados] = useState(false);
  const enCurso = datos.proyectos.filter((p) => p.estado !== 'terminado');
  const terminados = datos.proyectos.filter((p) => p.estado === 'terminado');

  const tarjeta = (p: Proyecto) => (
    <TarjetaProyecto
      key={p.id}
      proyecto={p}
      a={avance(p, datos.objetivos)}
      notas={datos.notas.filter((n) => n.proyectoId === p.id && !n.hecha).length}
      alAbrir={() => alAbrir(p.id)}
    />
  );

  return (
    <>
      <section className="bloque">
        <div className="bloque-cabecera">
          <h2 className="bloque-titulo">Tus proyectos</h2>
          <button type="button" className="btn-texto fuerte" onClick={() => setCreando(true)}>
            + Nuevo
          </button>
        </div>
        {enCurso.length === 0 ? (
          <div className="proy-vacio">
            <p className="vacio">
              Un proyecto junta un presupuesto, objetivos con su costo y notas. Por ejemplo: "Autos", con cubiertas,
              seguro y service.
            </p>
            <button type="button" className="btn principal ancho" onClick={() => setCreando(true)}>
              Crear un proyecto
            </button>
          </div>
        ) : (
          <div className="proy-lista">{enCurso.map(tarjeta)}</div>
        )}
      </section>

      {terminados.length > 0 && (
        <section className="bloque">
          <button
            type="button"
            className="notas-plegar"
            aria-expanded={verTerminados}
            onClick={() => setVerTerminados(!verTerminados)}
          >
            <span aria-hidden>{verTerminados ? '▾' : '▸'}</span> Terminados ({terminados.length})
          </button>
          {verTerminados && <div className="proy-lista terminados">{terminados.map(tarjeta)}</div>}
        </section>
      )}

      {creando && <EditorProyecto proyecto={null} alCerrar={() => setCreando(false)} />}
    </>
  );
}

function TarjetaProyecto({
  proyecto: p,
  a,
  notas,
  alAbrir,
}: {
  proyecto: Proyecto;
  a: Avance;
  notas: number;
  alAbrir: () => void;
}) {
  const cubierto = textoCubierto(p, a);
  return (
    <button type="button" className="proy-tarjeta" onClick={alAbrir}>
      <span className="proy-tarjeta-arriba">
        <span className="proy-emoji" aria-hidden>
          {p.emoji}
        </span>
        <span className="proy-nombre">
          <span className="proy-titulo">{p.nombre}</span>
          {p.estado !== 'activo' && (
            <span className={`proy-estado ${p.estado}`}>{p.estado === 'pausado' ? '⏸ Pausado' : '✓ Terminado'}</span>
          )}
        </span>
        {p.presupuesto !== null && <span className="proy-presupuesto num">{plata(p.presupuesto, p.moneda)}</span>}
      </span>
      {a.parte !== null && (
        <span className="barra-pista" data-nivel="ok" aria-hidden>
          <span className="barra-relleno" style={{ width: `${a.parte * 100}%` }} />
        </span>
      )}
      <span className="proy-sub">
        {textoObjetivos(a)}
        {cubierto && <> · {cubierto}</>}
        {notas > 0 && <> · {notas === 1 ? '1 nota' : `${notas} notas`}</>}
      </span>
    </button>
  );
}

/* ---------- Detalle ---------- */

function DetalleProyecto({
  proyecto: p,
  datos,
  alVolver,
  avisar,
}: {
  proyecto: Proyecto;
  datos: DatosProyectos;
  alVolver: () => void;
  avisar: Avisar;
}) {
  const [editando, setEditando] = useState(false);
  const [objetivoAbierto, setObjetivoAbierto] = useState<Objetivo | null>(null);
  const propios = useMemo(() => datos.objetivos.filter((o) => o.proyectoId === p.id), [datos.objetivos, p.id]);
  const a = avance(p, propios);
  const cubierto = textoCubierto(p, a);

  async function tildar(o: Objetivo) {
    await repoProyectos.editarObjetivo(o.id, { hecho: !o.hecho });
  }

  return (
    <>
      <button type="button" className="btn-texto proy-volver" onClick={alVolver}>
        ‹ Proyectos
      </button>

      <section className="proy-hero">
        <div className="proy-hero-arriba">
          <span className="proy-hero-emoji" aria-hidden>
            {p.emoji}
          </span>
          <h2>{p.nombre}</h2>
          <button type="button" className="proy-hero-editar" onClick={() => setEditando(true)}>
            Editar
          </button>
        </div>
        {p.estado !== 'activo' && (
          <span className="proy-hero-estado">{p.estado === 'pausado' ? '⏸ Pausado' : '✓ Terminado'}</span>
        )}
        <span className="proy-hero-rotulo">Presupuesto</span>
        <span className="proy-hero-valor num">{p.presupuesto !== null ? plata(p.presupuesto, p.moneda) : 'Sin presupuesto'}</span>
        {a.parte !== null && (
          <span className="proy-hero-pista" aria-hidden>
            <span style={{ width: `${a.parte * 100}%` }} />
          </span>
        )}
        <span className="proy-hero-sub">
          {textoObjetivos(a)}
          {cubierto && (
            <>
              <br />
              {cubierto}
              {p.presupuesto ? ` (${Math.round((a.cubierto / p.presupuesto) * 100)}%)` : ''}
            </>
          )}
        </span>
        {a.falta !== null && (
          <span className="proy-hero-falta">
            {a.falta > 0
              ? `Te faltan ${plata(a.falta, p.moneda)}`
              : a.falta === 0
                ? 'Presupuesto cubierto'
                : `▲ ${plata(-a.falta, p.moneda)} más que el presupuesto`}
          </span>
        )}
      </section>

      <section className="bloque">
        <h2 className="bloque-titulo">Objetivos</h2>
        <div className="proy-objetivos">
          {propios.length > 0 && (
            <ul className="objetivos">
              {ordenarObjetivos(propios).map((o) => (
                <li key={o.id} className="objetivo" data-hecho={o.hecho}>
                  <button
                    type="button"
                    className="nota-tilde"
                    role="checkbox"
                    aria-checked={o.hecho}
                    aria-label={`${o.hecho ? 'Desmarcar' : 'Marcar como hecho'}: ${o.texto}`}
                    onClick={() => tildar(o)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d="M6 12.5l4 4 8-9" />
                    </svg>
                  </button>
                  <button type="button" className="objetivo-cuerpo" onClick={() => setObjetivoAbierto(o)}>
                    <span className="objetivo-texto">{o.texto}</span>
                    {o.monto !== null && <span className="objetivo-monto num">{plata(o.monto, p.moneda)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <NuevoObjetivo proyecto={p} />
        </div>
        {p.presupuesto !== null && a.asignado > 0 && (
          <p className="ayuda">
            {a.asignado > p.presupuesto
              ? `Los objetivos suman ${plata(a.asignado, p.moneda)}: ▲ ${plata(a.asignado - p.presupuesto, p.moneda)} más que el presupuesto.`
              : a.asignado < p.presupuesto
                ? `Los objetivos suman ${plata(a.asignado, p.moneda)}. Quedan ${plata(p.presupuesto - a.asignado, p.moneda)} del presupuesto sin asignar.`
                : 'Los objetivos suman justo el presupuesto.'}
          </p>
        )}
      </section>

      <section className="bloque">
        <h2 className="bloque-titulo">Notas del proyecto</h2>
        <ListaNotas
          notas={datos.notas.filter((n) => n.proyectoId === p.id)}
          todas={datos.notas}
          proyectoId={p.id}
          avisar={avisar}
        />
      </section>

      {editando && (
        <EditorProyecto
          proyecto={p}
          alCerrar={() => setEditando(false)}
          alBorrar={() => {
            setEditando(false);
            alVolver();
            avisar('Proyecto borrado', () => repoProyectos.borrarProyecto(p.id, false));
          }}
        />
      )}
      {objetivoAbierto && (
        <EditorObjetivo
          objetivo={objetivoAbierto}
          moneda={p.moneda}
          alCerrar={() => setObjetivoAbierto(null)}
          avisar={avisar}
        />
      )}
    </>
  );
}

/** Carga rápida de un objetivo: texto y, si querés, cuánto cuesta. */
function NuevoObjetivo({ proyecto }: { proyecto: Proyecto }) {
  const [texto, setTexto] = useState('');
  const [monto, setMonto] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function agregar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!texto.trim()) return;
    const centavos = monto.trim() ? leerMonto(monto) : null;
    if (monto.trim() && centavos === null) {
      setError('El monto no es un número válido.');
      return;
    }
    await repoProyectos.crearObjetivo(proyecto.id, { texto, monto: centavos });
    setTexto('');
    setMonto('');
    setError(null);
  }

  return (
    <form className="objetivo-nuevo" onSubmit={agregar}>
      <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nuevo objetivo" aria-label="Nuevo objetivo" />
      <input
        className="num"
        value={monto}
        onChange={(e) => setMonto(montoEnVivo(e.target.value))}
        placeholder={proyecto.moneda === 'USD' ? 'US$' : '$'}
        aria-label={`Monto en ${proyecto.moneda === 'USD' ? 'dólares' : 'pesos'} (opcional)`}
        inputMode="decimal"
        enterKeyHint="done"
      />
      <button type="submit" className="notas-agregar" aria-label="Agregar objetivo" disabled={!texto.trim()}>
        +
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

/* ---------- Editores ---------- */

function EditorProyecto({
  proyecto,
  alCerrar,
  alBorrar,
}: {
  proyecto: Proyecto | null;
  alCerrar: () => void;
  alBorrar?: () => void;
}) {
  const [nombre, setNombre] = useState(proyecto?.nombre ?? '');
  const [emoji, setEmoji] = useState(proyecto?.emoji ?? '📁');
  const [moneda, setMoneda] = useState<Moneda>(proyecto?.moneda ?? 'ARS');
  const [presupuesto, setPresupuesto] = useState(
    proyecto?.presupuesto ? montoEnVivo(montoParaEditar(proyecto.presupuesto)) : '',
  );
  const [estado, setEstado] = useState<EstadoProyecto>(proyecto?.estado ?? 'activo');
  const [error, setError] = useState<string | null>(null);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    const centavos = presupuesto.trim() ? leerMonto(presupuesto) : null;
    if (presupuesto.trim() && centavos === null) {
      setError('El presupuesto no es un número válido.');
      return;
    }
    try {
      if (proyecto) {
        await repoProyectos.editarProyecto(proyecto.id, { nombre, emoji, moneda, presupuesto: centavos, estado });
      } else {
        await repoProyectos.crearProyecto({ nombre, emoji, moneda, presupuesto: centavos });
      }
      alCerrar();
    } catch (e) {
      if (e instanceof ErrorDeValidacion) setError(e.message);
      else throw e;
    }
  }

  async function borrar() {
    if (!proyecto || !alBorrar) return;
    const ok = confirm(
      `¿Borrar "${proyecto.nombre}" con sus objetivos y notas? Si lo terminaste, mejor marcalo como Terminado: queda guardado.`,
    );
    if (!ok) return;
    await repoProyectos.borrarProyecto(proyecto.id);
    alBorrar();
  }

  return (
    <Hoja
      titulo={proyecto ? 'Proyecto' : 'Nuevo proyecto'}
      alCerrar={alCerrar}
      acciones={
        <button type="submit" form="form-proyecto" className="btn-texto fuerte">
          Guardar
        </button>
      }
    >
      <form id="form-proyecto" className="form" onSubmit={guardar}>
        <div className="fila-campos">
          <label className="campo emoji-campo">
            <span>Ícono</span>
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} />
          </label>
          <label className="campo crece">
            <span>Nombre</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Autos" autoFocus={!proyecto} />
          </label>
        </div>

        <fieldset className="grupo">
          <legend>Presupuesto en</legend>
          <div className="segmentado" role="radiogroup" aria-label="Moneda del presupuesto">
            {(['ARS', 'USD'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={moneda === m} onClick={() => setMoneda(m)}>
                {m === 'ARS' ? 'Pesos' : 'Dólares'}
              </button>
            ))}
          </div>
          {proyecto && moneda !== proyecto.moneda && (
            <small className="ayuda">Los montos de los objetivos no se convierten: pasan a leerse en {moneda === 'USD' ? 'dólares' : 'pesos'}.</small>
          )}
        </fieldset>

        <label className="campo">
          <span>Presupuesto (opcional)</span>
          <input
            className="num"
            value={presupuesto}
            onChange={(e) => setPresupuesto(montoEnVivo(e.target.value))}
            placeholder={moneda === 'USD' ? 'US$ 0' : '$ 0'}
            inputMode="decimal"
          />
        </label>

        {proyecto && (
          <fieldset className="grupo">
            <legend>Estado</legend>
            <div className="segmentado" role="radiogroup" aria-label="Estado">
              {ESTADOS.map((e) => (
                <button key={e.id} type="button" role="radio" aria-checked={estado === e.id} onClick={() => setEstado(e.id)}>
                  {e.nombre}
                </button>
              ))}
            </div>
            <small className="ayuda">Los terminados se archivan en "Terminados": no se borran.</small>
          </fieldset>
        )}

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn principal ancho">
          {proyecto ? 'Guardar' : 'Crear proyecto'}
        </button>
        {proyecto && (
          <button type="button" className="btn peligro ancho" onClick={borrar}>
            Borrar proyecto
          </button>
        )}
      </form>
    </Hoja>
  );
}

function EditorObjetivo({
  objetivo,
  moneda,
  alCerrar,
  avisar,
}: {
  objetivo: Objetivo;
  moneda: Moneda;
  alCerrar: () => void;
  avisar: Avisar;
}) {
  const [texto, setTexto] = useState(objetivo.texto);
  const [monto, setMonto] = useState(objetivo.monto ? montoEnVivo(montoParaEditar(objetivo.monto)) : '');
  const [error, setError] = useState<string | null>(null);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    const centavos = monto.trim() ? leerMonto(monto) : null;
    if (monto.trim() && centavos === null) {
      setError('El monto no es un número válido.');
      return;
    }
    try {
      await repoProyectos.editarObjetivo(objetivo.id, { texto, monto: centavos });
      alCerrar();
    } catch (e) {
      if (e instanceof ErrorDeValidacion) setError(e.message);
      else throw e;
    }
  }

  async function borrar() {
    await repoProyectos.editarObjetivo(objetivo.id, { borrado: true });
    alCerrar();
    avisar('Objetivo borrado', () => repoProyectos.editarObjetivo(objetivo.id, { borrado: false }));
  }

  return (
    <Hoja
      titulo="Objetivo"
      alCerrar={alCerrar}
      acciones={
        <button type="submit" form="form-objetivo" className="btn-texto fuerte">
          Guardar
        </button>
      }
    >
      <form id="form-objetivo" className="form" onSubmit={guardar}>
        <label className="campo">
          <span>Objetivo</span>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
        <label className="campo">
          <span>Monto en {moneda === 'USD' ? 'dólares' : 'pesos'} (opcional)</span>
          <input className="num" value={monto} onChange={(e) => setMonto(montoEnVivo(e.target.value))} inputMode="decimal" />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn principal ancho">
          Guardar
        </button>
        <button type="button" className="btn peligro ancho" onClick={borrar}>
          Borrar objetivo
        </button>
      </form>
    </Hoja>
  );
}

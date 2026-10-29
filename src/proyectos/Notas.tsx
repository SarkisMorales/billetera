import { useMemo, useState } from 'react';
import { Hoja } from '../componentes/Hoja';
import { ErrorDeValidacion } from '../datos/repositorio';
import { hoy, sumarDias } from '../dominio/fechas';
import {
  etiquetasEnUso,
  filtrarNotas,
  leerEtiquetas,
  leerNotaRapida,
  ordenarNotas,
  textoFecha,
  vencimiento,
} from './calculos';
import { repoProyectos } from './repositorio';
import type { Nota, Prioridad } from './tipos';

export type Avisar = (texto: string, deshacer?: () => void) => void;

const PRIORIDADES: { id: Prioridad; nombre: string }[] = [
  { id: 3, nombre: 'Normal' },
  { id: 2, nombre: 'Media' },
  { id: 1, nombre: 'Alta' },
];

/**
 * Una lista de notas al estilo Todoist: carga rápida arriba, buscador,
 * etiquetas, fijadas, pendientes y las hechas plegadas. La misma para las
 * notas sueltas y para las de cada proyecto: cambia sólo `proyectoId`.
 */
export function ListaNotas({
  notas,
  todas,
  proyectoId,
  avisar,
}: {
  /** Las de esta lista (sueltas o de un proyecto), sin borradas. */
  notas: Nota[];
  /** Todas, para sugerir etiquetas que ya usás en otro lado. */
  todas: Nota[];
  proyectoId: string | null;
  avisar: Avisar;
}) {
  const [entrada, setEntrada] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [etiqueta, setEtiqueta] = useState<string | null>(null);
  const [verHechas, setVerHechas] = useState(false);
  const [editando, setEditando] = useState<Nota | null>(null);
  const hoyStr = hoy();

  const etiquetas = useMemo(() => etiquetasEnUso(notas), [notas]);
  const filtradas = useMemo(() => filtrarNotas(notas, busqueda, etiqueta), [notas, busqueda, etiqueta]);
  const { fijadas, pendientes, hechas } = useMemo(() => ordenarNotas(filtradas, hoyStr), [filtradas, hoyStr]);
  const filtrando = busqueda.trim() !== '' || etiqueta !== null;

  async function agregar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!entrada.trim()) return;
    const rapida = leerNotaRapida(entrada);
    // Con una etiqueta elegida, la nota nueva la lleva: si no, desaparecería de la vista.
    const conEtiqueta = etiqueta ? [...rapida.etiquetas, etiqueta] : rapida.etiquetas;
    await repoProyectos.crearNota({ ...rapida, etiquetas: conEtiqueta, proyectoId });
    setEntrada('');
  }

  async function tildar(n: Nota) {
    await repoProyectos.editarNota(n.id, { hecha: !n.hecha });
    if (!n.hecha) avisar('Nota hecha', () => repoProyectos.editarNota(n.id, { hecha: false }));
  }

  const fila = (n: Nota) => (
    <FilaNota key={n.id} nota={n} hoyStr={hoyStr} alTildar={() => tildar(n)} alAbrir={() => setEditando(n)} />
  );

  return (
    <div className="notas">
      <form className="notas-rapida" onSubmit={agregar}>
        <input
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          placeholder={proyectoId ? 'Agregar una nota al proyecto' : 'Agregar una nota'}
          aria-label="Nueva nota"
          enterKeyHint="done"
        />
        <button type="submit" className="notas-agregar" aria-label="Agregar nota" disabled={!entrada.trim()}>
          +
        </button>
      </form>
      <p className="ayuda">
        Enter para guardar. Con <strong>#etiqueta</strong> la etiquetás y con <strong>!1</strong> o <strong>!2</strong> le
        ponés prioridad alta o media.
      </p>

      {notas.length > 0 && (
        <input
          className="notas-buscar"
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar en las notas"
          aria-label="Buscar en las notas"
        />
      )}

      {etiquetas.length > 0 && (
        <div className="notas-etiquetas" role="group" aria-label="Filtrar por etiqueta">
          {etiquetas.map((e) => (
            <button
              key={e}
              type="button"
              className="etiqueta-ficha"
              aria-pressed={etiqueta === e}
              onClick={() => setEtiqueta(etiqueta === e ? null : e)}
            >
              #{e}
            </button>
          ))}
        </div>
      )}

      {notas.length === 0 ? (
        <p className="vacio">
          {proyectoId ? 'Este proyecto todavía no tiene notas.' : 'Todavía no hay notas. Escribí la primera arriba.'}
        </p>
      ) : fijadas.length + pendientes.length + hechas.length === 0 ? (
        <p className="vacio">Ninguna nota coincide{filtrando && etiqueta ? ` con #${etiqueta}` : ''}.</p>
      ) : (
        <>
          {fijadas.length > 0 && (
            <section className="notas-grupo" aria-label="Fijadas">
              <h3 className="notas-grupo-titulo">📌 Fijadas</h3>
              <ul className="notas-lista">{fijadas.map(fila)}</ul>
            </section>
          )}
          {pendientes.length > 0 && (
            <section className="notas-grupo" aria-label="Pendientes">
              {fijadas.length > 0 && <h3 className="notas-grupo-titulo">Pendientes</h3>}
              <ul className="notas-lista">{pendientes.map(fila)}</ul>
            </section>
          )}
          {fijadas.length + pendientes.length === 0 && <p className="vacio">No queda nada pendiente. 🎉</p>}
          {hechas.length > 0 && (
            <section className="notas-grupo">
              <button
                type="button"
                className="notas-plegar"
                aria-expanded={verHechas}
                onClick={() => setVerHechas(!verHechas)}
              >
                <span aria-hidden>{verHechas ? '▾' : '▸'}</span> Hechas ({hechas.length})
              </button>
              {verHechas && <ul className="notas-lista hechas">{hechas.map(fila)}</ul>}
            </section>
          )}
        </>
      )}

      {editando && (
        <EditorNota
          nota={editando}
          sugeridas={etiquetasEnUso(todas)}
          alCerrar={() => setEditando(null)}
          avisar={avisar}
        />
      )}
    </div>
  );
}

function FilaNota({
  nota,
  hoyStr,
  alTildar,
  alAbrir,
}: {
  nota: Nota;
  hoyStr: string;
  alTildar: () => void;
  alAbrir: () => void;
}) {
  const v = nota.fecha ? vencimiento(nota.fecha, hoyStr) : null;
  const prioridad = PRIORIDADES.find((p) => p.id === nota.prioridad)!;
  return (
    <li className="nota" data-prioridad={nota.prioridad}>
      <button
        type="button"
        className="nota-tilde"
        role="checkbox"
        aria-checked={nota.hecha}
        aria-label={`${nota.hecha ? 'Desmarcar' : 'Marcar como hecha'}: ${nota.texto}`}
        onClick={alTildar}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M6 12.5l4 4 8-9" />
        </svg>
      </button>
      <button type="button" className="nota-cuerpo" onClick={alAbrir}>
        <span className="nota-texto">{nota.texto}</span>
        {nota.detalle && <span className="nota-detalle">{nota.detalle.split('\n')[0]}</span>}
        {(nota.fecha || nota.prioridad < 3 || nota.etiquetas.length > 0 || nota.detalle.includes('\n')) && (
          <span className="nota-meta">
            {nota.prioridad < 3 && <span className={`nota-prioridad p${nota.prioridad}`}>{prioridad.nombre}</span>}
            {nota.fecha && !nota.hecha && (
              <span className={`nota-fecha ${v}`}>
                {v === 'vencida' ? `⚠️ Vencida · ${textoFecha(nota.fecha, hoyStr)}` : `📅 ${textoFecha(nota.fecha, hoyStr)}`}
              </span>
            )}
            {nota.etiquetas.map((e) => (
              <span key={e} className="nota-etiqueta">
                #{e}
              </span>
            ))}
          </span>
        )}
      </button>
    </li>
  );
}

function EditorNota({
  nota,
  sugeridas,
  alCerrar,
  avisar,
}: {
  nota: Nota;
  sugeridas: string[];
  alCerrar: () => void;
  avisar: Avisar;
}) {
  const [texto, setTexto] = useState(nota.texto);
  const [detalle, setDetalle] = useState(nota.detalle);
  const [fecha, setFecha] = useState(nota.fecha ?? '');
  const [prioridad, setPrioridad] = useState<Prioridad>(nota.prioridad);
  const [etiquetasTexto, setEtiquetasTexto] = useState(nota.etiquetas.join(' '));
  const [fijada, setFijada] = useState(nota.fijada);
  const [error, setError] = useState<string | null>(null);
  const hoyStr = hoy();
  const elegidas = leerEtiquetas(etiquetasTexto);

  function alternarEtiqueta(e: string) {
    setEtiquetasTexto((elegidas.includes(e) ? elegidas.filter((x) => x !== e) : [...elegidas, e]).join(' '));
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    try {
      await repoProyectos.editarNota(nota.id, { texto, detalle, fecha: fecha || null, prioridad, etiquetas: elegidas, fijada });
      alCerrar();
    } catch (e) {
      if (e instanceof ErrorDeValidacion) setError(e.message);
      else throw e;
    }
  }

  async function borrar() {
    await repoProyectos.borrarNota(nota.id);
    alCerrar();
    avisar('Nota borrada', () => repoProyectos.borrarNota(nota.id, false));
  }

  return (
    <Hoja
      titulo="Nota"
      alCerrar={alCerrar}
      acciones={
        <button type="submit" form="form-nota" className="btn-texto fuerte">
          Guardar
        </button>
      }
    >
      <form id="form-nota" className="form" onSubmit={guardar}>
        <label className="campo">
          <span>Nota</span>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>

        <label className="campo">
          <span>Detalle</span>
          <textarea
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            rows={4}
            placeholder="Todo lo que quieras agregar: links, pasos, números…"
          />
        </label>

        <fieldset className="grupo">
          <legend>Para cuándo</legend>
          <div className="fichas">
            {[
              ['Hoy', hoyStr],
              ['Mañana', sumarDias(hoyStr, 1)],
              ['En una semana', sumarDias(hoyStr, 7)],
              ['Sin fecha', ''],
            ].map(([nombre, valor]) => (
              <button key={nombre} type="button" className="ficha" aria-pressed={fecha === valor} onClick={() => setFecha(valor!)}>
                {nombre}
              </button>
            ))}
          </div>
          <label className="campo">
            <span className="sr-solo">Fecha</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha" />
          </label>
        </fieldset>

        <fieldset className="grupo">
          <legend>Prioridad</legend>
          <div className="segmentado" role="radiogroup" aria-label="Prioridad">
            {PRIORIDADES.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={prioridad === p.id}
                data-prioridad={p.id}
                onClick={() => setPrioridad(p.id)}
              >
                {p.nombre}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="grupo">
          <legend>Etiquetas</legend>
          <label className="campo">
            <span className="sr-solo">Etiquetas</span>
            <input
              value={etiquetasTexto}
              onChange={(e) => setEtiquetasTexto(e.target.value)}
              placeholder="auto casa ideas"
              aria-label="Etiquetas, separadas por espacio"
              autoCapitalize="none"
            />
          </label>
          {sugeridas.length > 0 && (
            <div className="fichas">
              {sugeridas.map((e) => (
                <button key={e} type="button" className="etiqueta-ficha" aria-pressed={elegidas.includes(e)} onClick={() => alternarEtiqueta(e)}>
                  #{e}
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <button type="button" className="ficha" aria-pressed={fijada} onClick={() => setFijada(!fijada)}>
          📌 {fijada ? 'Fijada arriba' : 'Fijar arriba'}
        </button>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn principal ancho">
          Guardar
        </button>
        <button type="button" className="btn peligro ancho" onClick={borrar}>
          Borrar nota
        </button>
      </form>
    </Hoja>
  );
}

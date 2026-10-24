import { useCallback, useEffect, useRef, useState } from 'react';
import { FormMovimiento } from './componentes/FormMovimiento';
import { guardarRespaldo, tocaBackup } from './datos/backup';
import { actualizarCotizaciones } from './datos/cotizacion';
import { pedirAlmacenamientoPersistente } from './datos/db';
import { repositorio } from './datos/repositorio';
import { hoy, mesDe } from './dominio/fechas';
import type { Movimiento } from './dominio/tipos';
import { useBilletera } from './estado/useBilletera';
import { Ajustes } from './pantallas/Ajustes';
import { Inicio } from './pantallas/Inicio';
import { Movimientos } from './pantallas/Movimientos';
import { Reportes } from './reportes';

type IdPantalla = 'inicio' | 'movimientos' | 'reportes' | 'ajustes';

const TITULO: Record<IdPantalla, string> = {
  inicio: 'Billetera',
  movimientos: 'Movimientos',
  reportes: 'Reportes',
  ajustes: 'Ajustes',
};

const GUARDADO = { gasto: 'Gasto guardado', ingreso: 'Ingreso guardado', transferencia: 'Transferencia guardada' } as const;

interface Aviso {
  texto: string;
  deshacer?: () => void;
}

function Icono({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const ICONOS: Record<IdPantalla, string> = {
  inicio: 'M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5zM16 12h2',
  movimientos: 'M4 6h16M4 12h16M4 18h10',
  reportes: 'M6 20V12M12 20V5M18 20v-6',
  ajustes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 10h0a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};

export function App() {
  const billetera = useBilletera();
  const { ajustes, cargando } = billetera;
  const [pantalla, setPantalla] = useState<IdPantalla>('inicio');
  const [mes, setMes] = useState(mesDe(hoy()));
  const [filtroCategoria, setFiltroCategoria] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<{ existente: Movimiento | null } | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  const [ofrecerBackup, setOfrecerBackup] = useState(false);
  const temporizador = useRef<number>(undefined);

  const avisar = useCallback((texto: string, deshacer?: () => void) => {
    window.clearTimeout(temporizador.current);
    setAviso({ texto, deshacer });
    temporizador.current = window.setTimeout(() => setAviso(null), deshacer ? 5000 : 2500);
  }, []);

  /* Primer uso, almacenamiento persistente y cotización. */
  useEffect(() => {
    repositorio.sembrarSiVacia();
    pedirAlmacenamientoPersistente();
    actualizarCotizaciones();
  }, []);

  /* Al volver la señal o volver a la app, refrescar la cotización si está vieja. */
  useEffect(() => {
    const alConectar = () => {
      setEnLinea(true);
      actualizarCotizaciones();
    };
    const alDesconectar = () => setEnLinea(false);
    const alVolver = () => document.visibilityState === 'visible' && actualizarCotizaciones();
    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, []);

  useEffect(() => {
    tocaBackup().then(setOfrecerBackup);
  }, [billetera.movimientos.length, ajustes.ultimoBackup]);

  /* Tema. */
  useEffect(() => {
    const aplicar = () => {
      const oscuro = matchMedia('(prefers-color-scheme: dark)').matches;
      const tema = ajustes.tema === 'sistema' ? (oscuro ? 'oscuro' : 'claro') : ajustes.tema;
      document.documentElement.dataset.tema = tema;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', tema === 'oscuro' ? '#0A0F1C' : '#F5F7FB');
    };
    aplicar();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
  }, [ajustes.tema]);

  function irA(p: IdPantalla) {
    setPantalla(p);
    window.scrollTo(0, 0);
  }

  const alGuardar = useCallback(
    (m: Movimiento, esNuevo: boolean) => {
      setFormulario(null);
      if (esNuevo) {
        avisar(GUARDADO[m.tipo], () => {
          repositorio.borrarMovimiento(m.id);
          setAviso(null);
        });
      } else {
        avisar('Cambios guardados');
      }
    },
    [avisar],
  );

  const cerrarFormulario = useCallback(() => setFormulario(null), []);

  return (
    <div className="app">
      <header className="cabecera">
        <h1 className={pantalla === 'inicio' ? 'marca' : undefined}>{TITULO[pantalla]}</h1>
        {!enLinea && <span className="pastilla">Sin conexión</span>}
      </header>

      <main className="contenido">
        {ofrecerBackup && pantalla === 'inicio' && (
          <div className="alerta">
            <span>Hace más de una semana que no guardás un respaldo.</span>
            <button
              type="button"
              className="btn chico"
              onClick={async () => {
                if (await guardarRespaldo()) setOfrecerBackup(false);
              }}
            >
              Guardar
            </button>
          </div>
        )}

        {cargando ? (
          <p className="vacio">Cargando…</p>
        ) : pantalla === 'inicio' ? (
          <Inicio
            billetera={billetera}
            enLinea={enLinea}
            irAMovimientos={(categoriaId) => {
              setMes(mesDe(hoy()));
              setFiltroCategoria(categoriaId);
              irA('movimientos');
            }}
            irAAjustes={() => irA('ajustes')}
          />
        ) : pantalla === 'movimientos' ? (
          <Movimientos
            billetera={billetera}
            mes={mes}
            setMes={setMes}
            categoriaId={filtroCategoria}
            setCategoriaId={setFiltroCategoria}
            alEditar={(m) => {
              setAviso(null);
              setFormulario({ existente: m });
            }}
          />
        ) : pantalla === 'reportes' ? (
          <Reportes billetera={billetera} enLinea={enLinea} />
        ) : (
          <Ajustes billetera={billetera} enLinea={enLinea} avisar={avisar} />
        )}
      </main>

      {(pantalla === 'inicio' || pantalla === 'movimientos') && (
        <button
          type="button"
          className="boton-agregar"
          aria-label="Cargar movimiento"
          onClick={() => {
            setAviso(null);
            setFormulario({ existente: null });
          }}
        >
          <Icono d="M12 5v14M5 12h14" />
        </button>
      )}

      <nav className="barra-pestanas" aria-label="Secciones">
        {(['inicio', 'movimientos', 'reportes', 'ajustes'] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-current={pantalla === p ? 'page' : undefined}
            onClick={() => {
              if (p === 'movimientos' && pantalla !== 'movimientos') setFiltroCategoria(null);
              irA(p);
            }}
          >
            <Icono d={ICONOS[p]} />
            <span>{p === 'inicio' ? 'Inicio' : TITULO[p]}</span>
          </button>
        ))}
      </nav>

      {aviso && (
        <div className="aviso" role="status">
          <span>{aviso.texto}</span>
          {aviso.deshacer && (
            <button type="button" className="btn-texto fuerte" onClick={aviso.deshacer}>
              Deshacer
            </button>
          )}
        </div>
      )}

      {formulario && (
        <FormMovimiento
          billetera={billetera}
          existente={formulario.existente}
          alCerrar={cerrarFormulario}
          alGuardar={alGuardar}
        />
      )}
    </div>
  );
}

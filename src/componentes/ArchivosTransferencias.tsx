import { useRef, useState } from 'react';
import { Hoja } from './Hoja';
import { guardarRespaldo } from '../datos/backup';
import {
  contenido,
  contenidoLocal,
  importar,
  leerArchivo,
  reemplazar,
  type ContenidoArchivo,
  type Respaldo,
} from '../datos/respaldo';

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "12 movimientos, 3 proyectos y 1 nota": lo que es cero no se nombra (salvo que todo lo sea). */
function enumerar(partes: [number, string, string][]): string {
  const con = partes.filter(([n]) => n > 0).map(([n, uno, varios]) => `${n} ${n === 1 ? uno : varios}`);
  if (!con.length) return `0 ${partes[0]![2]}`;
  return con.length === 1 ? con[0]! : `${con.slice(0, -1).join(', ')} y ${con[con.length - 1]}`;
}

function describir(c: ContenidoArchivo): string {
  return enumerar([
    [c.movimientos, 'movimiento', 'movimientos'],
    [c.cuentas, 'cuenta', 'cuentas'],
    [c.categorias, 'categoría', 'categorías'],
    [c.proyectos, 'proyecto', 'proyectos'],
    [c.notas, 'nota', 'notas'],
  ]);
}

type Local = Awaited<ReturnType<typeof contenidoLocal>>;

function describirLocal(l: Local): string {
  return enumerar([
    [l.movimientos, 'movimiento', 'movimientos'],
    [l.proyectos, 'proyecto', 'proyectos'],
    [l.notas, 'nota', 'notas'],
  ]);
}

/**
 * Ajustes → Archivos y Transferencias. Un archivo con toda la billetera:
 * guardarlo es un toque, y cargarlo en otra billetera la deja idéntica.
 *
 * Si la billetera que recibe está vacía (recién instalada), carga directo.
 * Si ya tiene movimientos, muestra qué trae el archivo y pregunta si
 * reemplazar todo o sumar lo nuevo: pisar datos sin preguntar no se hace.
 */
export function ArchivosTransferencias({
  ultimoGuardado,
  movimientosAhora,
  avisar,
}: {
  ultimoGuardado: string | null;
  movimientosAhora: number;
  avisar: (texto: string) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [pendiente, setPendiente] = useState<{ respaldo: Respaldo; nombre: string; hay: Local } | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function guardar() {
    if (await guardarRespaldo()) avisar('Archivo guardado');
  }

  async function alElegir(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    let respaldo: Respaldo;
    try {
      respaldo = leerArchivo(await f.text());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
      return;
    }
    const hay = await contenidoLocal();
    if (hay.movimientos + hay.proyectos + hay.notas === 0) {
      // Billetera vacía: no hay nada que perder, se carga directo.
      const c = await reemplazar(respaldo);
      avisar(`Listo: se cargaron ${describir(c)}`);
      return;
    }
    setPendiente({ respaldo, nombre: f.name, hay });
  }

  async function reemplazarTodo() {
    if (!pendiente) return;
    // Un archivo viejo no trae proyectos ni notas: esos se quedan.
    const traeProyectos = pendiente.respaldo.proyectos !== undefined;
    const seBorra = traeProyectos ? pendiente.hay : { ...pendiente.hay, proyectos: 0, notas: 0 };
    const ok = confirm(
      `Se borra lo que tiene esta billetera (${describirLocal(seBorra)}) y queda igual a la del archivo.${
        traeProyectos ? '' : ' Tus proyectos y notas se quedan: el archivo es de antes de que existieran.'
      } ¿Seguir?`,
    );
    if (!ok) return;
    setTrabajando(true);
    try {
      const c = await reemplazar(pendiente.respaldo);
      setPendiente(null);
      avisar(`Listo: la billetera quedó igual al archivo (${c.movimientos} movimientos)`);
    } finally {
      setTrabajando(false);
    }
  }

  async function sumar() {
    if (!pendiente) return;
    setTrabajando(true);
    try {
      const r = await importar(pendiente.respaldo);
      setPendiente(null);
      avisar(`Listo: ${r.nuevos} nuevos, ${r.actualizados} actualizados`);
    } finally {
      setTrabajando(false);
    }
  }

  const c = pendiente ? contenido(pendiente.respaldo) : null;

  return (
    <section className="bloque">
      <h2 className="bloque-titulo">Archivos y Transferencias</h2>

      <div className="tarjeta-opcion">
        <div className="tarjeta-opcion-texto">
          <h3>Guardar archivo</h3>
          <p className="ayuda">
            Todo en un archivo: {movimientosAhora} movimientos, cuentas, categorías, presupuestos, proyectos, notas
            y ajustes.
            En el iPhone elegí "Guardar en Archivos" → iCloud Drive.{' '}
            {ultimoGuardado ? `Último: ${fechaHora(ultimoGuardado)}.` : 'Todavía no guardaste ninguno.'}
          </p>
        </div>
        <button type="button" className="btn principal ancho" onClick={guardar}>
          Guardar archivo
        </button>
      </div>

      <div className="tarjeta-opcion">
        <div className="tarjeta-opcion-texto">
          <h3>Cargar archivo</h3>
          <p className="ayuda">
            Para pasar tu billetera a otro teléfono o recuperar un archivo guardado.
            {movimientosAhora === 0
              ? ' Esta billetera está vacía: se carga todo directo y queda igual a la del archivo.'
              : ' Antes de cambiar nada te muestra qué trae y te pregunta.'}
          </p>
        </div>
        <button type="button" className="btn ancho" onClick={() => entrada.current?.click()}>
          Elegir archivo
        </button>
        <input ref={entrada} type="file" accept="application/json,.json" hidden onChange={alElegir} />
      </div>

      {pendiente && c && (
        <Hoja titulo="Cargar archivo" alCerrar={() => setPendiente(null)}>
          <div className="form">
            <div className="archivo-resumen">
              <span className="archivo-nombre">{pendiente.nombre}</span>
              <span className="ayuda">Guardado el {fechaHora(c.exportadoEn)}</span>
              <strong>{describir(c)}</strong>
            </div>
            <p className="ayuda">
              Esta billetera ya tiene {describirLocal(pendiente.hay)}. ¿Qué hacemos?
            </p>

            <button type="button" className="btn principal ancho" disabled={trabajando} onClick={reemplazarTodo}>
              Reemplazar todo
            </button>
            <p className="ayuda">
              Esta billetera queda idéntica a la del archivo. Lo que tiene ahora se borra. Es la opción para pasar
              la billetera a otro teléfono.
            </p>

            <button type="button" className="btn ancho" disabled={trabajando} onClick={sumar}>
              Sumar lo nuevo
            </button>
            <p className="ayuda">
              Agrega lo que falta y actualiza lo que se editó después, sin borrar nada. Sirve para un archivo de
              esta misma billetera; si viene de otra, puede duplicar cuentas y categorías.
            </p>

            <button type="button" className="btn-texto" onClick={guardar}>
              Antes, guardar un archivo de esta billetera
            </button>
          </div>
        </Hoja>
      )}
    </section>
  );
}

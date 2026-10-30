import { useEffect, type ReactNode } from 'react';

/**
 * Hoja que sube desde abajo, como las de iOS. En pantallas anchas queda
 * centrada. Se cierra tocando afuera o con Escape.
 */
export function Hoja({
  titulo,
  alCerrar,
  children,
  acciones,
  antesDeCerrar,
}: {
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
  acciones?: ReactNode;
  /** Si devuelve false, no se cierra: para no perder lo que se estaba cargando por un toque de más. */
  antesDeCerrar?: () => boolean;
}) {
  const cerrar = () => {
    if (!antesDeCerrar || antesDeCerrar()) alCerrar();
  };

  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (!antesDeCerrar || antesDeCerrar())) alCerrar();
    };
    window.addEventListener('keydown', alTeclado);
    document.body.classList.add('con-hoja');
    return () => {
      window.removeEventListener('keydown', alTeclado);
      document.body.classList.remove('con-hoja');
    };
  }, [alCerrar, antesDeCerrar]);

  return (
    <div className="velo" onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
      <section className="hoja" role="dialog" aria-modal="true" aria-label={titulo}>
        <header className="hoja-cabecera">
          <button type="button" className="btn-texto" onClick={cerrar}>
            Cancelar
          </button>
          <h2>{titulo}</h2>
          <div className="hoja-acciones">{acciones}</div>
        </header>
        <div className="hoja-cuerpo">{children}</div>
      </section>
    </div>
  );
}

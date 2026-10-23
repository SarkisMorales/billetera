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
}: {
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
  acciones?: ReactNode;
}) {
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    window.addEventListener('keydown', alTeclado);
    document.body.classList.add('con-hoja');
    return () => {
      window.removeEventListener('keydown', alTeclado);
      document.body.classList.remove('con-hoja');
    };
  }, [alCerrar]);

  return (
    <div className="velo" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <section className="hoja" role="dialog" aria-modal="true" aria-label={titulo}>
        <header className="hoja-cabecera">
          <button type="button" className="btn-texto" onClick={alCerrar}>
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

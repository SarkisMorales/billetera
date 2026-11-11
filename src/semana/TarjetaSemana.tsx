import { useMemo } from 'react';
import { formatearMonto } from '../dominio/dinero';
import type { Cuenta, Movimiento } from '../dominio/tipos';
import { gastoDeLaSemana, inicioElegido, nombreDiaSemana, type DiaSemana } from './calculos';
import './semana.css';

/** "Del lunes 9 al domingo 15", o con "27/10" si la semana cruza de mes. */
export function textoSemana(desde: string, hasta: string, inicio: DiaSemana): string {
  const fin = ((inicio + 6) % 7) as DiaSemana;
  const d1 = Number(desde.slice(8, 10));
  const d2 = Number(hasta.slice(8, 10));
  if (desde.slice(0, 7) === hasta.slice(0, 7)) {
    return `Del ${nombreDiaSemana(inicio)} ${d1} al ${nombreDiaSemana(fin)} ${d2}`;
  }
  const m1 = Number(desde.slice(5, 7));
  const m2 = Number(hasta.slice(5, 7));
  return `Del ${nombreDiaSemana(inicio)} ${d1}/${m1} al ${nombreDiaSemana(fin)} ${d2}/${m2}`;
}

/** Inicio: cuánto llevás gastado en la semana. Vuelve a cero el día que elegiste en Ajustes. */
export function TarjetaSemana({
  movimientos,
  cuentas,
  cotizacion,
  hoy,
  inicioSemana,
  oculto,
}: {
  movimientos: Movimiento[];
  cuentas: Cuenta[];
  cotizacion: number | null;
  hoy: string;
  inicioSemana: number | undefined;
  oculto: boolean;
}) {
  const inicio = inicioElegido(inicioSemana);
  const semana = useMemo(
    () => gastoDeLaSemana(movimientos, cuentas, cotizacion, hoy, inicio),
    [movimientos, cuentas, cotizacion, hoy, inicio],
  );

  return (
    <section className="semana" aria-label="Gasto de la semana">
      <span className="semana-icono" aria-hidden>
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M8 3v4M16 3v4M3 10h18" />
          <path d="M8 17v-2M12 17v-4M16 17v-3" strokeWidth="2.4" />
        </svg>
      </span>
      <span className="semana-texto">
        <span className="semana-titulo">Gastaste esta semana</span>
        <strong className="semana-monto num">
          {oculto ? '$ ••••' : formatearMonto(semana.gastado, 'ARS', { sinDecimales: true })}
        </strong>
        <span className="semana-rango">{textoSemana(semana.desde, semana.hasta, inicio)}</span>
      </span>
      <svg className="semana-onda" viewBox="0 0 120 80" preserveAspectRatio="none" aria-hidden>
        <path d="M0 80 C40 80 50 20 120 10 L120 80 Z" />
      </svg>
      <svg className="semana-flecha" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
      </svg>
    </section>
  );
}

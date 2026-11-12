import { useEffect, useState } from 'react';
import { hoy } from '../dominio/fechas';

/**
 * El día de hoy (`AAAA-MM-DD`), que se actualiza solo. En el iPhone la app
 * casi nunca arranca de cero: vuelve de segundo plano con lo que tenía en
 * memoria, a veces de ayer. Sin esto, "Gastaste esta semana", el mes de la
 * tarjeta azul y los fijos se quedaban en el día viejo hasta guardar algo.
 *
 * Se fija al volver a la app y, si la dejás abierta, a la medianoche.
 */
export function useHoy(): string {
  const [dia, setDia] = useState(hoy);

  useEffect(() => {
    const revisar = () => setDia(hoy());
    const alVolver = () => document.visibilityState === 'visible' && revisar();
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', revisar);

    // Hasta la próxima medianoche (un segundo después, por las dudas).
    const ahora = new Date();
    const medianoche = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 0, 0, 1);
    const temporizador = window.setTimeout(revisar, medianoche.getTime() - ahora.getTime());

    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', revisar);
      window.clearTimeout(temporizador);
    };
  }, [dia]);

  return dia;
}

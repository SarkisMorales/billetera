/**
 * Dónde corre la app y cómo se mantiene al día.
 *
 * En el iPhone, la app del ícono de inicio y Safari guardan los datos por
 * separado: lo que cargás en uno no aparece en el otro. Y la app del ícono
 * casi nunca arranca de cero: vuelve de segundo plano con el código que tenía
 * en memoria, a veces de hace días, así que por sí sola no se entera de que
 * hay una versión nueva.
 */

export type Donde = 'icono' | 'safari' | 'navegador';

export function dondeCorre(): Donde {
  // `navigator.standalone` sólo existe en Safari de iPhone/iPad: true desde el ícono, false en una pestaña.
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  if (standalone === true || matchMedia('(display-mode: standalone)').matches) return 'icono';
  if (standalone === false) return 'safari';
  return 'navegador';
}

export const NOMBRE_DONDE: Record<Donde, string> = {
  icono: 'la app del ícono de inicio',
  safari: 'Safari (separado de la app del ícono)',
  navegador: 'el navegador',
};

/** Hoja abierta o escribiendo en un campo: recargar ahora haría perder lo que estás cargando. */
function ocupado(): boolean {
  const a = document.activeElement;
  return (
    document.body.classList.contains('con-hoja') ||
    a instanceof HTMLInputElement ||
    a instanceof HTMLTextAreaElement ||
    a instanceof HTMLSelectElement
  );
}

/**
 * Registra el service worker y:
 * - cada vez que la app vuelve a primer plano, pregunta si hay versión nueva;
 * - cuando la nueva toma el control, recarga para usarla, pero nunca con una
 *   hoja abierta o escribiendo: espera a que termines.
 */
export function mantenerAlDia(): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  let habiaVersion = Boolean(navigator.serviceWorker.controller);
  let pendiente = false;

  const recargarSiSePuede = () => {
    if (pendiente && document.visibilityState === 'visible' && !ocupado()) location.reload();
  };

  navigator.serviceWorker
    .register('./sw.js', { scope: './' })
    .then((registro) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        recargarSiSePuede();
        registro.update().catch(() => {
          /* Sin red: se vuelve a preguntar la próxima vez. */
        });
      });
    })
    .catch(() => {
      /* Sin service worker la app anda igual, sólo que sin modo offline. */
    });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // La primera instalación también dispara esto, pero lo que se ve ya es lo último.
    if (!habiaVersion) {
      habiaVersion = true;
      return;
    }
    if (pendiente) return;
    pendiente = true;
    recargarSiSePuede();
    window.setInterval(recargarSiSePuede, 2000);
  });
}

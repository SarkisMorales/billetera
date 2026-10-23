import { BilleteraDB } from '../datos/db';
import { Repositorio, type Reloj } from '../datos/repositorio';
import type { DatosMovimiento } from '../dominio/validar';

/** Reloj controlable: cada llamada avanza un segundo, los ids son correlativos. */
export function relojDePrueba(inicio = '2026-10-01T12:00:00.000Z'): Reloj & { avanzar(ms: number): void } {
  let t = Date.parse(inicio);
  let n = 0;
  return {
    ahora: () => new Date((t += 1000)).toISOString(),
    id: () => `id-${++n}`,
    avanzar: (ms) => {
      t += ms;
    },
  };
}

let contador = 0;

/** Una base nueva y vacía por test, con su repositorio. */
export function preparar() {
  const db = new BilleteraDB(`prueba-${++contador}`);
  const reloj = relojDePrueba();
  const repo = new Repositorio(db, reloj);
  return { db, repo, reloj };
}

export function mov(parcial: Partial<DatosMovimiento> & Pick<DatosMovimiento, 'cuentaId'>): DatosMovimiento {
  return {
    tipo: 'gasto',
    fecha: '2026-10-10',
    monto: 100_00,
    categoriaId: null,
    cuentaDestinoId: null,
    montoDestino: null,
    nota: '',
    ...parcial,
  };
}

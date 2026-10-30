import { repositorio } from '../datos/repositorio';
import { topesConInflacion } from '../dominio/calculos';
import { formatearMonto } from '../dominio/dinero';
import { nombreMes } from '../dominio/fechas';
import type { Ajustes, Categoria } from '../dominio/tipos';
import { serieEfectiva } from './calculos';
import { inflacionGuardada } from './inflacion';

const pct = (v: number) => `${v.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
const pesos = (c: number) => formatearMonto(c, 'ARS', { sinDecimales: true });

/**
 * Ajustes → Categorías de gasto: subir todos los topes mensuales con la
 * inflación del último mes, con un toque y "Deshacer". Un tope en pesos que
 * no se toca alcanza cada mes para menos. Se ofrece una vez por dato.
 */
export function TopesInflacion({
  categorias,
  ajustes,
  avisar,
}: {
  categorias: Categoria[];
  ajustes: Ajustes;
  avisar: (texto: string, deshacer?: () => void) => void;
}) {
  const ultimo = serieEfectiva(inflacionGuardada().serie, ajustes.inflacionManual).at(-1);
  const cambios = ultimo ? topesConInflacion(categorias, ultimo.valor) : [];
  const hayTopes = categorias.some((c) => c.tipo === 'gasto' && !c.archivada && c.presupuesto && !c.presupuestoDesde);
  if (!hayTopes) return null;

  if (!ultimo) {
    return (
      <p className="ayuda">
        Para subir los topes con la inflación hace falta el dato del INDEC: se baja solo al abrir Reportes con conexión.
      </p>
    );
  }
  const mes = nombreMes(ultimo.mes).split(' ')[0]!.toLowerCase();
  if (ajustes.topesAjustadosHasta && ajustes.topesAjustadosHasta >= ultimo.mes) {
    return <p className="ayuda">✓ Tus topes ya tienen la inflación de {mes} ({pct(ultimo.valor)}).</p>;
  }
  if (!cambios.length) return null;

  const ejemplo = cambios[0]!;
  const nombreEjemplo = categorias.find((c) => c.id === ejemplo.id)?.nombre;

  async function subir() {
    const antes = ajustes.topesAjustadosHasta ?? null;
    await repositorio.ajustarTopes(
      cambios.map((c) => ({ id: c.id, presupuesto: c.despues })),
      ultimo!.mes,
    );
    avisar(`Topes subidos ${pct(ultimo!.valor)}`, () =>
      repositorio.ajustarTopes(
        cambios.map((c) => ({ id: c.id, presupuesto: c.antes })),
        antes,
      ),
    );
  }

  return (
    <div className="tarjeta-opcion">
      <div className="tarjeta-opcion-texto">
        <h3>Topes e inflación</h3>
        <p className="ayuda">
          La inflación de {mes} fue {pct(ultimo.valor)}. Subí {cambios.length === 1 ? 'tu tope mensual' : `tus ${cambios.length} topes mensuales`}{' '}
          eso para que alcancen para lo mismo. Por ejemplo, {nombreEjemplo}: {pesos(ejemplo.antes)} → {pesos(ejemplo.despues)}.
        </p>
      </div>
      <button type="button" className="btn ancho" onClick={subir}>
        Subir {cambios.length === 1 ? 'el tope' : 'los topes'} {pct(ultimo.valor)}
      </button>
    </div>
  );
}

import { formatearMonto } from '../dominio/dinero';
import { hoy } from '../dominio/fechas';
import type { Categoria, Cuenta } from '../dominio/tipos';
import { faltaPagarEsteMes, paraConfirmar, proximos, textoVencimiento } from './calculos';
import type { Fijo } from './tipos';
import './fijos.css';

/**
 * Inicio → Gastos fijos. Los que vencieron esperan que los confirmes (se
 * abre la carga con todo completo, para corregir el monto) o los saltees.
 * Abajo, los de la semana que viene. Sin fijos, no aparece.
 */
export function TarjetaFijos({
  fijos,
  cuentas,
  categorias,
  cotizacion,
  oculto,
  alCargar,
  alSaltear,
}: {
  fijos: Fijo[];
  cuentas: Cuenta[];
  categorias: Categoria[];
  cotizacion: number | null;
  /** El ojito de la tarjeta azul: tapa los montos acá también. */
  oculto: boolean;
  alCargar: (f: Fijo) => void;
  alSaltear: (f: Fijo) => void;
}) {
  const hoyStr = hoy();
  const pendientes = paraConfirmar(fijos, hoyStr);
  const siguientes = proximos(fijos, hoyStr);
  if (!pendientes.length && !siguientes.length) return null;

  const falta = faltaPagarEsteMes(fijos, cuentas, hoyStr, cotizacion);
  const porIdCuenta = new Map(cuentas.map((c) => [c.id, c]));
  const porIdCategoria = new Map(categorias.map((c) => [c.id, c]));
  const monto = (f: Fijo) =>
    oculto ? '••••' : formatearMonto(f.monto, porIdCuenta.get(f.cuentaId)?.moneda ?? 'ARS', { sinDecimales: true });

  return (
    <section className="bloque">
      <div className="bloque-cabecera">
        <h2 className="bloque-titulo">Gastos fijos</h2>
        {falta.cuantos > 0 && (
          <span className="fijos-falta">
            Faltan {oculto ? '••••' : formatearMonto(falta.total, 'ARS', { sinDecimales: true })} este mes
          </span>
        )}
      </div>

      {pendientes.length > 0 && (
        <ul className="fijos" aria-label="Para confirmar">
          {pendientes.map((f) => {
            const vencido = f.proxima < hoyStr;
            return (
              <li key={f.id} className="fijo">
                <div className="fijo-arriba">
                  <span className="fijo-icono" aria-hidden>
                    {porIdCategoria.get(f.categoriaId)?.emoji ?? '🔁'}
                  </span>
                  <span className="fijo-texto">
                    <span className="fijo-nota">{f.nota}</span>
                    <span className={`fijo-vence${vencido ? ' vencido' : ''}`}>
                      {vencido ? '⚠️ ' : ''}
                      {textoVencimiento(f.proxima, hoyStr)} · {porIdCuenta.get(f.cuentaId)?.nombre ?? 'cuenta borrada'}
                    </span>
                  </span>
                  <span className={`fijo-monto num${f.tipo === 'ingreso' ? ' ingreso' : ''}`}>{monto(f)}</span>
                </div>
                <div className="fijo-acciones">
                  <button type="button" className="btn chico principal" onClick={() => alCargar(f)}>
                    {f.tipo === 'ingreso' ? 'Cargar ingreso' : 'Cargar pago'}
                  </button>
                  <button type="button" className="btn chico" onClick={() => alSaltear(f)}>
                    Saltear
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {siguientes.length > 0 && (
        <p className="fijos-proximos">
          <strong>Próximos 7 días:</strong>{' '}
          {siguientes.map((f, i) => (
            <span key={f.id}>
              {i > 0 && ' · '}
              {f.nota} {textoVencimiento(f.proxima, hoyStr).replace('vence ', '')} <span className="num">{monto(f)}</span>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

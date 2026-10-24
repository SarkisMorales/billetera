import { useMemo, useState } from 'react';
import {
  cotizacionVigente,
  estadoPresupuestos,
  patrimonio,
  proyeccionGasto,
  resumenMes,
  saldos,
} from '../dominio/calculos';
import { formatearMonto } from '../dominio/dinero';
import { diasEntre, hoy, mesDe, nombreMes } from '../dominio/fechas';
import { NOMBRE_CASA, type Cuenta } from '../dominio/tipos';
import type { Billetera } from '../estado/useBilletera';

const ICONO_CUENTA: Record<Cuenta['tipo'], string> = {
  efectivo: '💵',
  banco: '🏦',
  virtual: '📱',
  otro: '💳',
};

const CLAVE_OCULTAR = 'billetera.ocultarMontos';

/** El ojito de la tarjeta: para abrir la app delante de otros sin mostrar cuánto tenés. */
function leerOculto(): boolean {
  try {
    return localStorage.getItem(CLAVE_OCULTAR) === '1';
  } catch {
    return false;
  }
}

function haceCuanto(iso: string): string {
  const minutos = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (minutos < 1) return 'recién';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = diasEntre(iso, new Date().toISOString());
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

export function Inicio({
  billetera,
  enLinea,
  irAMovimientos,
  irAAjustes,
}: {
  billetera: Billetera;
  enLinea: boolean;
  irAMovimientos: (categoriaId: string | null) => void;
  irAAjustes: () => void;
}) {
  const { cuentas, categorias, movimientos, ajustes } = billetera;
  const [oculto, setOculto] = useState(leerOculto);
  const cotizacion = cotizacionVigente(ajustes);

  function alternarOculto() {
    setOculto(!oculto);
    try {
      localStorage.setItem(CLAVE_OCULTAR, oculto ? '0' : '1');
    } catch {
      /* Sin almacenamiento: vale para esta sesión. */
    }
  }
  const hoyStr = hoy();
  const mes = mesDe(hoyStr);

  const s = useMemo(() => saldos(cuentas, movimientos), [cuentas, movimientos]);
  const p = useMemo(() => patrimonio(cuentas, movimientos, cotizacion), [cuentas, movimientos, cotizacion]);
  const resumen = useMemo(
    () => resumenMes(mes, movimientos, cuentas, cotizacion),
    [mes, movimientos, cuentas, cotizacion],
  );
  const presupuestos = estadoPresupuestos(categorias, resumen);
  const proyeccion = proyeccionGasto(resumen, Number(hoyStr.slice(8)));

  const porCategoria = categorias
    .filter((c) => c.tipo === 'gasto')
    .map((c) => ({ categoria: c, gastado: resumen.porCategoria.get(c.id) ?? 0 }))
    .filter((x) => x.gastado > 0)
    .sort((a, b) => b.gastado - a.gastado);
  const mayor = porCategoria[0]?.gastado ?? 1;
  const conPresupuesto = new Map(presupuestos.map((e) => [e.categoria.id, e]));

  const casa = ajustes.cotizacionManual ? 'manual' : NOMBRE_CASA[ajustes.casa];
  const visibles = cuentas.filter((c) => !c.archivada);

  return (
    <div className="pantalla">
      <section className="total" aria-label="Patrimonio">
        <div className="total-cabecera">
          <span className="rotulo">Tenés en total</span>
          <button
            type="button"
            className="ojo"
            aria-pressed={oculto}
            aria-label={oculto ? 'Mostrar montos' : 'Ocultar montos'}
            onClick={alternarOculto}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
              {oculto && <path d="M4 4l16 16" />}
            </svg>
          </button>
          <button type="button" className="total-ir" aria-label="Ver movimientos" onClick={() => irAMovimientos(null)}>
            ›
          </button>
        </div>
        <span className="total-valor">
          {oculto ? '$ ••••••' : p.totalEnPesos !== null ? formatearMonto(p.totalEnPesos, 'ARS', { sinDecimales: true }) : '—'}
        </span>
        <span className="total-sub">
          {p.totalEnDolares !== null &&
            `≈ ${oculto ? 'US$ ••••' : formatearMonto(p.totalEnDolares, 'USD', { sinDecimales: true })}`}
        </span>
        <div className="total-division">
          <div>
            <span className="rotulo">Entró en {nombreMes(mes).split(' ')[0]!.toLowerCase()}</span>
            <span className="total-mes">{oculto ? '••••' : formatearMonto(resumen.ingresos, 'ARS', { sinDecimales: true })}</span>
          </div>
          <div>
            <span className="rotulo">Gastaste</span>
            <span className="total-mes">{oculto ? '••••' : formatearMonto(resumen.gastos, 'ARS', { sinDecimales: true })}</span>
          </div>
        </div>
        <button type="button" className="cotizacion" onClick={irAAjustes}>
          {cotizacion ? (
            <>
              Dólar {casa} <span className="num">$ {cotizacion.toLocaleString('es-AR')}</span>
              {!ajustes.cotizacionManual && ajustes.cotizacionesBajadasEn && (
                <> · {haceCuanto(ajustes.cotizacionesBajadasEn)}</>
              )}
              {!enLinea && <span className="sin-red"> · sin conexión</span>}
            </>
          ) : (
            <span className="sin-red">
              {enLinea ? 'Bajando cotización…' : 'Sin cotización: conectate o cargala a mano'}
            </span>
          )}
        </button>
      </section>

      <section className="bloque">
        <h2 className="bloque-titulo">Cuentas</h2>
        <ul className="cuentas">
          {visibles.map((c) => {
            const saldo = s.get(c.id) ?? 0;
            return (
              <li key={c.id} className="cuenta">
                <span className="cuenta-icono" aria-hidden>
                  {ICONO_CUENTA[c.tipo]}
                </span>
                <span className="cuenta-nombre">{c.nombre}</span>
                <span className={`num cuenta-saldo${saldo < 0 ? ' negativo' : ''}`}>
                  {formatearMonto(saldo, c.moneda)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="bloque">
        <div className="bloque-cabecera">
          <h2 className="bloque-titulo">{nombreMes(mes)}</h2>
          <button type="button" className="btn-texto" onClick={() => irAMovimientos(null)}>
            Ver movimientos
          </button>
        </div>

        {/* Lo gastado y lo que entró en el mes están en la tarjeta azul de arriba. */}
        {proyeccion !== null && (
          <div className="kpis">
            <div className="kpi">
              <span className="rotulo">A este ritmo cerrás el mes en</span>
              <span className="kpi-valor num">{formatearMonto(proyeccion, 'ARS', { sinDecimales: true })}</span>
            </div>
          </div>
        )}

        {porCategoria.length === 0 && presupuestos.length === 0 ? (
          <p className="vacio">Todavía no cargaste gastos este mes. Tocá + para el primero.</p>
        ) : (
          <ul className="barras">
            {porCategoria.map(({ categoria, gastado }) => {
              const pres = conPresupuesto.get(categoria.id);
              return (
                <li key={categoria.id}>
                  <button type="button" className="barra" onClick={() => irAMovimientos(categoria.id)}>
                    <span className="barra-texto">
                      <span>
                        {categoria.emoji} {categoria.nombre}
                      </span>
                      <span className="num">
                        {formatearMonto(gastado, 'ARS', { sinDecimales: true })}
                        {pres && (
                          <span className="suave"> / {formatearMonto(pres.tope, 'ARS', { sinDecimales: true })}</span>
                        )}
                      </span>
                    </span>
                    <span className="barra-pista" data-nivel={pres?.nivel ?? 'sin'}>
                      <span
                        className="barra-relleno"
                        style={{
                          width: `${Math.min(100, (pres ? pres.proporcion : gastado / mayor) * 100)}%`,
                        }}
                      />
                    </span>
                    {pres && pres.nivel !== 'ok' && (
                      <span className={`barra-aviso ${pres.nivel}`}>
                        {pres.nivel === 'pasado'
                          ? `Te pasaste ${formatearMonto(pres.gastado - pres.tope, 'ARS', { sinDecimales: true })}`
                          : `Quedan ${formatearMonto(pres.tope - pres.gastado, 'ARS', { sinDecimales: true })}`}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            {presupuestos
              .filter((e) => e.gastado === 0)
              .map((e) => (
                <li key={e.categoria.id}>
                  <div className="barra">
                    <span className="barra-texto">
                      <span>
                        {e.categoria.emoji} {e.categoria.nombre}
                      </span>
                      <span className="num suave">
                        $ 0 / {formatearMonto(e.tope, 'ARS', { sinDecimales: true })}
                      </span>
                    </span>
                    <span className="barra-pista" data-nivel="ok">
                      <span className="barra-relleno" style={{ width: 0 }} />
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

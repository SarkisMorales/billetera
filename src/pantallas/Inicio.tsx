import { useMemo } from 'react';
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
  const cotizacion = cotizacionVigente(ajustes);
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
        <span className="rotulo">Tenés en total</span>
        <span className="total-valor num">
          {p.totalEnPesos !== null ? formatearMonto(p.totalEnPesos, 'ARS', { sinDecimales: true }) : '—'}
        </span>
        <span className="total-sub num">
          {p.totalEnDolares !== null && `≈ ${formatearMonto(p.totalEnDolares, 'USD', { sinDecimales: true })}`}
        </span>
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

        <div className="kpis">
          <div className="kpi">
            <span className="rotulo">Gastaste</span>
            <span className="kpi-valor num">{formatearMonto(resumen.gastos, 'ARS', { sinDecimales: true })}</span>
          </div>
          <div className="kpi">
            <span className="rotulo">Entró</span>
            <span className="kpi-valor num ingreso">
              {formatearMonto(resumen.ingresos, 'ARS', { sinDecimales: true })}
            </span>
          </div>
          {proyeccion !== null && (
            <div className="kpi">
              <span className="rotulo">A este ritmo</span>
              <span className="kpi-valor num suave">{formatearMonto(proyeccion, 'ARS', { sinDecimales: true })}</span>
            </div>
          )}
        </div>

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

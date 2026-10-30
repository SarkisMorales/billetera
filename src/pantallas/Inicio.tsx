import { useMemo, useState } from 'react';
import {
  cotizacionVigente,
  estadoPresupuestos,
  estadoPresupuestosPorFechas,
  libreHastaFinDeMes,
  patrimonio,
  resumenMes,
  saldos,
} from '../dominio/calculos';
import { formatearMonto } from '../dominio/dinero';
import { diasEntre, diaYMes, hoy, mesDe, nombreMes } from '../dominio/fechas';
import { NOMBRE_CASA, type Cuenta } from '../dominio/tipos';
import type { Billetera } from '../estado/useBilletera';
import { faltaPagarEsteMes } from '../fijos/calculos';
import { TarjetaFijos } from '../fijos/TarjetaFijos';
import type { Fijo } from '../fijos/tipos';
import { useFijos } from '../fijos/useFijos';

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
  alCargarFijo,
  alSaltearFijo,
}: {
  billetera: Billetera;
  enLinea: boolean;
  irAMovimientos: (categoriaId: string | null) => void;
  irAAjustes: () => void;
  alCargarFijo: (f: Fijo) => void;
  alSaltearFijo: (f: Fijo) => void;
}) {
  const fijos = useFijos();
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
  // Topes mensuales contra el mes, y topes entre fechas contra sus fechas.
  const presupuestos = [
    ...estadoPresupuestos(categorias, resumen),
    ...estadoPresupuestosPorFechas(categorias, movimientos, cuentas, cotizacion, hoyStr),
  ];
  const conPresupuesto = new Map(presupuestos.map((e) => [e.categoria.id, e]));

  // Una fila por categoría con gasto este mes o con un tope corriendo. Con
  // tope entre fechas, lo que se muestra es lo gastado en esas fechas.
  const filas = categorias
    .filter((c) => c.tipo === 'gasto')
    .map((c) => {
      const pres = conPresupuesto.get(c.id);
      const delMes = resumen.porCategoria.get(c.id) ?? 0;
      return { categoria: c, pres, gastado: pres?.periodo ? pres.gastado : delMes };
    })
    .filter((x) => x.gastado > 0 || x.pres)
    .sort((a, b) => b.gastado - a.gastado);
  const mayor = Math.max(...filas.filter((f) => !f.pres).map((f) => f.gastado), 1);

  // Cuánto queda para gastar: sólo si este mes ya entró algo (si no, no hay de dónde).
  const falta = faltaPagarEsteMes(fijos, cuentas, hoyStr, cotizacion);
  const libre = resumen.ingresos > 0 ? libreHastaFinDeMes(resumen.ingresos, resumen.gastos, falta.total, hoyStr) : null;
  // Con espacio que no corta línea: que "$ 250.100" no quede partido.
  const pesos = (c: number) => formatearMonto(c, 'ARS', { sinDecimales: true }).replace(' ', '\u00a0');

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
        {libre && (
          <p className={`total-libre${libre.libre <= 0 ? ' pasado' : ''}`}>
            <span>
              {oculto ? (
                'Te quedan •••• para el mes'
              ) : libre.libre > 0 ? (
                <>
                  Te quedan <strong className="num">{pesos(libre.libre)}</strong> para el mes ·{' '}
                  <strong className="num">{pesos(libre.porDia)}</strong> por día
                </>
              ) : resumen.gastos > resumen.ingresos ? (
                <>
                  ⚠️ Gastaste <strong className="num">{pesos(resumen.gastos - resumen.ingresos)}</strong> más de lo que entró
                </>
              ) : (
                <>
                  ⚠️ Con los fijos que faltan, te faltan <strong className="num">{pesos(-libre.libre)}</strong> para cerrar el
                  mes
                </>
              )}
            </span>
            <small>
              Lo que entró, menos lo gastado{falta.cuantos > 0 ? ' y los fijos que faltan' : ''}.
            </small>
          </p>
        )}
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

      <TarjetaFijos
        fijos={fijos}
        cuentas={cuentas}
        categorias={categorias}
        cotizacion={cotizacion}
        oculto={oculto}
        alCargar={alCargarFijo}
        alSaltear={alSaltearFijo}
      />

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


        {filas.length === 0 ? (
          <p className="vacio">Todavía no cargaste gastos este mes. Tocá + para el primero.</p>
        ) : (
          <ul className="barras">
            {filas.map(({ categoria, gastado, pres }) => (
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
                      style={{ width: `${Math.min(100, (pres ? pres.proporcion : gastado / mayor) * 100)}%` }}
                    />
                  </span>
                  {pres?.periodo && (
                    <span className="barra-periodo">
                      Tope del {diaYMes(pres.periodo.desde)} al {diaYMes(pres.periodo.hasta)} ·{' '}
                      {pres.periodo.diasRestantes === 1 ? 'hoy es el último día' : `quedan ${pres.periodo.diasRestantes} días`}
                    </span>
                  )}
                  {pres && pres.nivel !== 'ok' && (
                    <span className={`barra-aviso ${pres.nivel}`}>
                      {pres.nivel === 'pasado'
                        ? `Te pasaste ${formatearMonto(pres.gastado - pres.tope, 'ARS', { sinDecimales: true })}`
                        : `Quedan ${formatearMonto(pres.tope - pres.gastado, 'ARS', { sinDecimales: true })}`}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

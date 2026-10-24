import { useEffect, useMemo, useState } from 'react';
import { cotizacionVigente } from '../dominio/calculos';
import { formatearMonto } from '../dominio/dinero';
import { hoy, nombreMes } from '../dominio/fechas';
import { NOMBRE_CASA, type Centavos, type Moneda } from '../dominio/tipos';
import type { Billetera } from '../estado/useBilletera';
import {
  DIAS_SEMANA,
  PERIODOS,
  dolares,
  gastoPorDiaSemana,
  hallazgos,
  hayDatosDesde,
  mayoresGastos,
  patrimonioMensual,
  porCategoria,
  porCuenta,
  rangoPeriodo,
  resumen,
  tendencia,
  variacion,
  type Datos,
  type Historicos,
  type IdPeriodo,
  type Unidad,
} from './calculos';
import { Barras, Columnas, Variacion, type Barra } from './Graficos';
import { actualizarHistoricos, historicosGuardados } from './historicos';
import './reportes.css';

const DIAS_LARGOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const pesos = (c: Centavos) => formatearMonto(c, 'ARS', { sinDecimales: true });
const usd = (c: Centavos) => formatearMonto(c, 'USD', { sinDecimales: true });
const compacto = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });
const eje = (moneda: Moneda) => (c: number) =>
  c === 0 ? '0' : `${moneda === 'USD' ? 'US$' : '$'} ${compacto.format(c / 100)}`;
const porcentaje = (x: number) => `${Math.round(x * 100)}%`;
const mesCorto = (mes: string) => nombreMes(mes).slice(0, 3);

function Seccion({ titulo, extra, children }: { titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rep-seccion">
      <div className="rep-seccion-cabecera">
        <h2>{titulo}</h2>
        {extra}
      </div>
      <div className="rep-tarjeta">{children}</div>
    </section>
  );
}

export function Reportes({ billetera, enLinea }: { billetera: Billetera; enLinea: boolean }) {
  const { cuentas, categorias, movimientos, ajustes } = billetera;
  const [vista, setVista] = useState<'periodo' | 'tendencias'>('periodo');
  const [version, setVersion] = useState(0);

  // Los históricos se bajan sólo al entrar a Reportes, y como mucho cada 12 h.
  useEffect(() => {
    let vivo = true;
    actualizarHistoricos(ajustes.casa).then((cambio) => vivo && cambio && setVersion((v) => v + 1));
    return () => {
      vivo = false;
    };
  }, [ajustes.casa, enLinea]);

  const historicos = useMemo(() => historicosGuardados(ajustes.casa), [ajustes.casa, version]);
  const datos: Datos = useMemo(
    () => ({ cuentas, categorias, movimientos, cotizacion: cotizacionVigente(ajustes) }),
    [cuentas, categorias, movimientos, ajustes],
  );

  return (
    <div className="pantalla rep">
      <div className="segmentado" role="radiogroup" aria-label="Vista">
        <button type="button" role="radio" aria-checked={vista === 'periodo'} onClick={() => setVista('periodo')}>
          Período
        </button>
        <button type="button" role="radio" aria-checked={vista === 'tendencias'} onClick={() => setVista('tendencias')}>
          Tendencias
        </button>
      </div>

      {vista === 'periodo' ? (
        <VistaPeriodo datos={datos} />
      ) : (
        <VistaTendencias
          datos={datos}
          historicos={historicos}
          inflacionHasta={historicos.inflacionHasta}
          casa={NOMBRE_CASA[ajustes.casa]}
          enLinea={enLinea}
        />
      )}
    </div>
  );
}

/* ---------- Período ---------- */

function VistaPeriodo({ datos }: { datos: Datos }) {
  const [id, setId] = useState<IdPeriodo>('mes');
  const hoyStr = hoy();
  const periodo = rangoPeriodo(id, hoyStr);

  const actual = useMemo(() => resumen(datos, periodo), [datos, periodo.desde, periodo.hasta]);
  const previo = useMemo(
    () => resumen(datos, periodo.anterior),
    [datos, periodo.anterior.desde, periodo.anterior.hasta],
  );
  const categoriasPorId = useMemo(() => new Map(datos.categorias.map((c) => [c.id, c])), [datos.categorias]);
  const cuentasPorId = useMemo(() => new Map(datos.cuentas.map((c) => [c.id, c])), [datos.cuentas]);

  const filtro = (
    <div className="rep-filtro">
      <span>Período</span>
      <label className="rep-pastilla-select">
        <select value={id} onChange={(e) => setId(e.target.value as IdPeriodo)} aria-label="Período">
          {PERIODOS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  if (actual.cantidadGastos === 0 && actual.ingresos === 0) {
    return (
      <>
        {filtro}
        <p className="vacio">No hay gastos ni ingresos en este período.</p>
      </>
    );
  }

  const ahorro = actual.ingresos - actual.gastos;
  // Sin datos del período anterior entero, comparar mentiría: no se compara.
  const comparable = hayDatosDesde(datos, periodo.anterior);
  const lista = hallazgos(datos, periodo, pesos);
  const porDia = gastoPorDiaSemana(datos, periodo);

  // Categorías: las 6 más grandes y el resto junto, para no pasar de 7 filas.
  const filasCat = porCategoria(datos, periodo);
  const visibles = filasCat.slice(0, 6);
  const resto = filasCat.slice(6);
  const barrasCat: Barra[] = visibles.map((f) => {
    const c = categoriasPorId.get(f.id);
    return {
      clave: f.id || 'sin',
      icono: c?.emoji ?? '•',
      nombre: c?.nombre ?? 'Sin categoría',
      valor: f.total,
      parte: f.parte,
      variacion: comparable ? variacion(f.total, f.anterior) : undefined,
    };
  });
  if (resto.length) {
    const total = resto.reduce((a, f) => a + f.total, 0);
    const anterior = resto.reduce((a, f) => a + f.anterior, 0);
    barrasCat.push({
      clave: 'otras',
      icono: '⋯',
      nombre: `Otras ${resto.length}`,
      valor: total,
      parte: resto.reduce((a, f) => a + f.parte, 0),
      variacion: comparable ? variacion(total, anterior) : undefined,
    });
  }

  const barrasCuenta: Barra[] = porCuenta(datos, periodo).map((f) => ({
    clave: f.id,
    nombre: cuentasPorId.get(f.id)?.nombre ?? 'Cuenta borrada',
    valor: f.total,
    parte: f.parte,
  }));

  const grandes = mayoresGastos(datos, periodo);

  return (
    <>
      {filtro}

      <section className="rep-hero">
        <span className="rep-hero-rotulo">Gastaste</span>
        <span className="rep-hero-valor">{pesos(actual.gastos)}</span>
        <span className="rep-hero-delta">
          {!comparable || variacion(actual.gastos, previo.gastos) === null ? (
            `Todavía no hay datos de ${periodo.contraQue} para comparar`
          ) : (
            <>
              <Variacion v={variacion(actual.gastos, previo.gastos)} /> que {periodo.contraQue}
            </>
          )}
        </span>
        <div className="rep-hero-division">
          <div>
            <span className="rep-hero-rotulo">Entró</span>
            <span className="rep-hero-sub">{pesos(actual.ingresos)}</span>
          </div>
          <div>
            <span className="rep-hero-rotulo">{ahorro >= 0 ? 'Te quedó' : 'Te faltó'}</span>
            <span className="rep-hero-sub">{pesos(Math.abs(ahorro))}</span>
            {actual.tasaAhorro !== null && ahorro >= 0 && (
              <span className="rep-hero-pct">{porcentaje(actual.tasaAhorro)} de lo que entró</span>
            )}
          </div>
        </div>
      </section>

      <div className="rep-cifras">
        <div className="rep-cifra">
          <span className="rotulo">Por día</span>
          <span className="rep-cifra-valor">{pesos(actual.promedioDiario)}</span>
        </div>
        <div className="rep-cifra">
          <span className="rotulo">Gastos</span>
          <span className="rep-cifra-valor">{actual.cantidadGastos}</span>
        </div>
        <div className="rep-cifra">
          <span className="rotulo">Días sin gastar</span>
          <span className="rep-cifra-valor">{actual.diasSinGastos}</span>
        </div>
      </div>

      {lista.length > 0 && (
        <Seccion titulo="Lo que llama la atención">
          <ul className="rep-hallazgos">
            {lista.map((h) => (
              <li key={h.texto}>
                <span className="rep-hallazgo-icono" aria-hidden>
                  {h.icono}
                </span>
                <span>{h.texto}</span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {actual.cantidadGastos > 0 && (
        <>
          <Seccion titulo="Un día típico de la semana">
            <Columnas
              key={id}
              datos={porDia.map((v, i) => ({
                clave: String(i),
                etiqueta: DIAS_SEMANA[i]!,
                nombre: `Un ${DIAS_LARGOS[i]!.toLowerCase()} típico`,
                valor: v,
              }))}
              formato={pesos}
              formatoEje={eje('ARS')}
              destacar
              nota="Lo que gastás un día típico (la mediana): un pago grande aislado, como el alquiler, no lo distorsiona."
            />
          </Seccion>

          <Seccion titulo="En qué se fue">
            <Barras datos={barrasCat} formato={pesos} />
            {comparable && (
              <p className="grafico-nota">Cada porcentaje compara lo que gastaste en esa categoría con {periodo.contraQue}.</p>
            )}
          </Seccion>

          {barrasCuenta.length > 1 && (
            <Seccion titulo="De dónde salió">
              <Barras datos={barrasCuenta} formato={pesos} />
            </Seccion>
          )}

          <Seccion titulo="Los gastos más grandes">
            <ol className="rep-ranking">
              {grandes.map((m, i) => {
                const c = m.categoriaId ? categoriasPorId.get(m.categoriaId) : undefined;
                const cuenta = cuentasPorId.get(m.cuentaId);
                return (
                  <li key={m.id}>
                    <span className="rep-ranking-pos num">{i + 1}</span>
                    <span className="rep-ranking-texto">
                      <span className="rep-ranking-titulo">
                        {c?.emoji} {m.nota || c?.nombre || 'Gasto'}
                      </span>
                      <span className="rep-ranking-sub">
                        {m.fecha.split('-').reverse().slice(0, 2).join('/')} · {cuenta?.nombre}
                      </span>
                    </span>
                    <span className="rep-ranking-monto num">
                      {formatearMonto(m.monto, cuenta?.moneda ?? 'ARS', { sinDecimales: true })}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Seccion>
        </>
      )}
    </>
  );
}

/* ---------- Tendencias ---------- */

function VistaTendencias({
  datos,
  historicos,
  inflacionHasta,
  casa,
  enLinea,
}: {
  datos: Datos;
  historicos: Historicos;
  inflacionHasta: string | null;
  casa: string;
  enLinea: boolean;
}) {
  const [unidad, setUnidad] = useState<Unidad>('pesos');
  const hoyStr = hoy();
  const hayInflacion = historicos.inflacion.size > 0;
  const hayDolar = historicos.dolar.length > 0;

  const meses = useMemo(() => tendencia(datos, historicos, unidad, hoyStr), [datos, historicos, unidad, hoyStr]);
  const patrimonio = useMemo(() => patrimonioMensual(datos, historicos, hoyStr), [datos, historicos, hoyStr]);
  const d = useMemo(() => dolares(datos, historicos), [datos, historicos]);

  const moneda: Moneda = unidad === 'dolares' ? 'USD' : 'ARS';
  const fmt = moneda === 'USD' ? usd : pesos;

  // El último mes cerrado contra el promedio de los tres anteriores.
  const cerrados = meses.filter((m) => !m.enCurso);
  const ultimo = cerrados[cerrados.length - 1];
  const previos = cerrados.slice(-4, -1).filter((m) => m.gastos !== null);
  const promedioPrevio = previos.length === 3 ? previos.reduce((a, m) => a + m.gastos!, 0) / 3 : null;
  const cambio = ultimo?.gastos != null && promedioPrevio ? variacion(ultimo.gastos, promedioPrevio) : null;

  const conPatrimonio = patrimonio.filter((p) => p.dolares !== null);
  const primero = conPatrimonio[0];
  const ultimoP = conPatrimonio[conPatrimonio.length - 1];

  const notaUnidad =
    unidad === 'reales'
      ? `Todo llevado a pesos de ${inflacionHasta ? nombreMes(inflacionHasta).toLowerCase() : 'hoy'} con la inflación del INDEC. Los meses sin dato publicado quedan como están.`
      : unidad === 'dolares'
        ? `Pesos convertidos al dólar ${casa} promedio de cada mes. Lo gastado desde cuentas en dólares va directo.`
        : 'Pesos de cada mes, sin ajustar. Con inflación, comparar meses así exagera las subas.';

  return (
    <>
      <div className="segmentado chico" role="radiogroup" aria-label="Unidad">
        {(
          [
            ['pesos', 'Pesos', true],
            ['reales', 'Pesos de hoy', hayInflacion],
            ['dolares', 'Dólares', hayDolar],
          ] as [Unidad, string, boolean][]
        ).map(([u, nombre, disponible]) => (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={unidad === u}
            disabled={!disponible}
            onClick={() => setUnidad(u)}
          >
            {nombre}
          </button>
        ))}
      </div>
      {(!hayInflacion || !hayDolar) && (
        <p className="ayuda">
          {enLinea
            ? 'Bajando inflación y dólar histórico…'
            : 'Pesos de hoy y Dólares necesitan conectarse una vez para bajar la inflación y el dólar histórico.'}
        </p>
      )}

      <Seccion titulo="Gasto mes a mes">
        <Columnas
          key={unidad}
          datos={meses.map((m) => ({
            clave: m.mes,
            etiqueta: mesCorto(m.mes),
            nombre: nombreMes(m.mes),
            valor: m.gastos,
            parcial: m.enCurso,
          }))}
          formato={fmt}
          formatoEje={eje(moneda)}
          inicial={Math.max(0, meses.length - 2)}
          nota={
            <>
              {cambio !== null && ultimo && (
                <>
                  En <strong>{nombreMes(ultimo.mes).split(' ')[0]!.toLowerCase()}</strong> gastaste <Variacion v={cambio} /> que
                  el promedio de los 3 meses anteriores.{' '}
                </>
              )}
              {notaUnidad}
            </>
          }
        />
      </Seccion>

      <Seccion titulo="Cuánto te quedó cada mes">
        <table className="rep-tabla">
          <thead>
            <tr>
              <th scope="col">Mes</th>
              <th scope="col">Entró</th>
              <th scope="col">Gastaste</th>
              <th scope="col">Quedó</th>
            </tr>
          </thead>
          <tbody>
            {[...meses].reverse().map((m) => (
              <tr key={m.mes}>
                <th scope="row">
                  {mesCorto(m.mes)}
                  {m.enCurso && <small> en curso</small>}
                </th>
                <td className="num">{m.ingresos !== null ? fmt(m.ingresos) : '—'}</td>
                <td className="num">{m.gastos !== null ? fmt(m.gastos) : '—'}</td>
                <td className={`num ${m.tasaAhorro !== null && m.tasaAhorro < 0 ? 'negativo' : ''}`}>
                  {m.tasaAhorro !== null ? porcentaje(m.tasaAhorro) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="grafico-nota">"Quedó" es qué parte de lo que entró no gastaste.</p>
      </Seccion>

      {conPatrimonio.length > 0 && (
        <Seccion titulo="Tu patrimonio en dólares">
          <Columnas
            datos={patrimonio.map((p) => ({
              clave: p.mes,
              etiqueta: mesCorto(p.mes),
              nombre: p.enCurso ? 'Hoy' : `Fin de ${nombreMes(p.mes).toLowerCase()}`,
              valor: p.dolares,
              parcial: p.enCurso,
            }))}
            formato={usd}
            formatoEje={eje('USD')}
            inicial={patrimonio.length - 1}
            nota={
              <>
                {primero && ultimoP && primero !== ultimoP && (
                  <>
                    Desde {nombreMes(primero.mes).split(' ')[0]!.toLowerCase()}:{' '}
                    <strong>
                      {ultimoP.dolares! - primero.dolares! >= 0 ? '+' : '−'}
                      {usd(Math.abs(ultimoP.dolares! - primero.dolares!))}
                    </strong>
                    {variacion(ultimoP.dolares!, primero.dolares!) !== null && (
                      <>
                        {' '}
                        ({variacion(ultimoP.dolares!, primero.dolares!)! >= 0 ? '+' : ''}
                        {porcentaje(variacion(ultimoP.dolares!, primero.dolares!)!)})
                      </>
                    )}
                    .{' '}
                  </>
                )}
                Saldos al cierre de cada mes, al dólar {casa} de ese día. Si corregiste un saldo a mano, el ajuste
                se ve también en los meses anteriores.
              </>
            }
          />
        </Seccion>
      )}

      <Seccion titulo="Tus dólares">
        {d.usdComprados === 0 && d.usdVendidos === 0 ? (
          <p className="ayuda">
            Cuando cargues una compra de dólares (una transferencia de una cuenta en pesos a una en dólares), acá vas a
            ver si te convino contra el dólar de hoy y contra la inflación.
          </p>
        ) : (
          <dl className="rep-datos">
            {d.usdComprados > 0 && (
              <>
                <dt>Compraste</dt>
                <dd>
                  {usd(d.usdComprados)} <small>a {pesos(Math.round(d.tcCompra! * 100))} promedio</small>
                </dd>
                <dt>Pagaste</dt>
                <dd>{pesos(d.pesosPagados)}</dd>
              </>
            )}
            {d.valorHoy !== null && d.resultado !== null && (
              <>
                <dt>Hoy valen</dt>
                <dd>
                  {pesos(d.valorHoy)} <small>al {casa}</small>
                </dd>
                <dt>Diferencia</dt>
                <dd className={d.resultado >= 0 ? 'bien' : 'mal'}>
                  {d.resultado >= 0 ? '▲ +' : '▼ −'}
                  {pesos(Math.abs(d.resultado))}{' '}
                  <small>({porcentaje(Math.abs(d.resultado / d.pesosPagados))})</small>
                </dd>
              </>
            )}
            {d.resultadoReal !== null && d.costoReal !== null && (
              <>
                <dt>Descontando inflación</dt>
                <dd className={d.resultadoReal >= 0 ? 'bien' : 'mal'}>
                  {d.resultadoReal >= 0 ? '▲ +' : '▼ −'}
                  {pesos(Math.abs(d.resultadoReal))} <small>({porcentaje(Math.abs(d.resultadoReal / d.costoReal))})</small>
                </dd>
              </>
            )}
            {d.usdVendidos > 0 && (
              <>
                <dt>Vendiste</dt>
                <dd>
                  {usd(d.usdVendidos)} <small>a {pesos(Math.round(d.tcVenta! * 100))} promedio</small>
                </dd>
              </>
            )}
            {d.gastadoEnDolares > 0 && (
              <>
                <dt>Gastaste en dólares</dt>
                <dd>{usd(d.gastadoEnDolares)}</dd>
              </>
            )}
          </dl>
        )}
        {d.resultadoReal !== null && (
          <p className="grafico-nota">
            "Descontando inflación" compara lo que valen hoy contra lo que pagaste llevado a pesos de hoy: si da
            positivo, comprar dólares le ganó a la inflación.
          </p>
        )}
      </Seccion>
    </>
  );
}

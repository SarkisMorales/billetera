import { useMemo, useState } from 'react';
import { FilaMovimiento } from '../componentes/FilaMovimiento';
import { cotizacionVigente, resumenMes } from '../dominio/calculos';
import { formatearMonto } from '../dominio/dinero';
import { hoy, mesDe, nombreDia, nombreMes, sumarMeses } from '../dominio/fechas';
import type { Movimiento } from '../dominio/tipos';
import type { Billetera } from '../estado/useBilletera';

export function Movimientos({
  billetera,
  mes,
  setMes,
  categoriaId,
  setCategoriaId,
  alEditar,
}: {
  billetera: Billetera;
  mes: string;
  setMes: (m: string) => void;
  categoriaId: string | null;
  setCategoriaId: (id: string | null) => void;
  alEditar: (m: Movimiento) => void;
}) {
  const { cuentas, categorias, movimientos, ajustes } = billetera;
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const porIdCuenta = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas]);
  const porIdCategoria = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);

  const delMes = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return movimientos
      .filter((m) => mesDe(m.fecha) === mes)
      .filter((m) => !cuentaId || m.cuentaId === cuentaId || m.cuentaDestinoId === cuentaId)
      .filter((m) => !categoriaId || m.categoriaId === categoriaId)
      .filter(
        (m) =>
          !texto ||
          m.nota.toLowerCase().includes(texto) ||
          (m.categoriaId && porIdCategoria.get(m.categoriaId)?.nombre.toLowerCase().includes(texto)),
      )
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn.localeCompare(a.creadoEn));
  }, [movimientos, mes, cuentaId, categoriaId, busqueda, porIdCategoria]);

  const resumen = resumenMes(mes, delMes, cuentas, cotizacionVigente(ajustes));

  const porDia: [string, Movimiento[]][] = [];
  for (const m of delMes) {
    const ultimo = porDia[porDia.length - 1];
    if (ultimo && ultimo[0] === m.fecha) ultimo[1].push(m);
    else porDia.push([m.fecha, [m]]);
  }

  const esMesActual = mes === mesDe(hoy());
  const hayFiltros = cuentaId || categoriaId || busqueda;

  return (
    <div className="pantalla">
      <div className="selector-mes">
        <button type="button" className="btn-icono" onClick={() => setMes(sumarMeses(mes, -1))} aria-label="Mes anterior">
          ‹
        </button>
        <h2>{nombreMes(mes)}</h2>
        <button
          type="button"
          className="btn-icono"
          onClick={() => setMes(sumarMeses(mes, 1))}
          disabled={esMesActual}
          aria-label="Mes siguiente"
        >
          ›
        </button>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="rotulo">Gastos</span>
          <span className="kpi-valor num">{formatearMonto(resumen.gastos, 'ARS', { sinDecimales: true })}</span>
        </div>
        <div className="kpi">
          <span className="rotulo">Ingresos</span>
          <span className="kpi-valor num ingreso">{formatearMonto(resumen.ingresos, 'ARS', { sinDecimales: true })}</span>
        </div>
        <div className="kpi">
          <span className="rotulo">Neto</span>
          <span className={`kpi-valor num ${resumen.ingresos - resumen.gastos < 0 ? 'gasto' : ''}`}>
            {formatearMonto(resumen.ingresos - resumen.gastos, 'ARS', { sinDecimales: true, signo: true })}
          </span>
        </div>
      </div>

      <div className="filtros">
        <input
          type="search"
          placeholder="Buscar nota o categoría"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar"
        />
        <div className="filtros-fila">
          <select value={cuentaId ?? ''} onChange={(e) => setCuentaId(e.target.value || null)} aria-label="Cuenta">
            <option value="">Todas las cuentas</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <select
            value={categoriaId ?? ''}
            onChange={(e) => setCategoriaId(e.target.value || null)}
            aria-label="Categoría"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {porDia.length === 0 ? (
        <p className="vacio">{hayFiltros ? 'Nada con esos filtros.' : 'No hay movimientos este mes.'}</p>
      ) : (
        porDia.map(([fecha, lista]) => (
          <section key={fecha} className="dia">
            <h3 className="dia-titulo">{nombreDia(fecha)}</h3>
            <div className="lista">
              {lista.map((m) => (
                <FilaMovimiento
                  key={m.id}
                  m={m}
                  cuentas={porIdCuenta}
                  categorias={porIdCategoria}
                  alTocar={() => alEditar(m)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

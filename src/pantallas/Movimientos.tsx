import { useMemo, useState } from 'react';
import { FilaMovimiento } from '../componentes/FilaMovimiento';
import { cotizacionVigente, enPesos, totales } from '../dominio/calculos';
import { formatearMonto, leerMonto } from '../dominio/dinero';
import { fechaLarga, hoy, mesDe, nombreDia, nombreMes, sumarMeses } from '../dominio/fechas';
import { normalizarTexto } from '../dominio/sugerencias';
import type { Movimiento } from '../dominio/tipos';
import type { Billetera } from '../estado/useBilletera';

const pesos = (c: number) => formatearMonto(c, 'ARS', { sinDecimales: true });
const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
  const cotizacion = cotizacionVigente(ajustes);

  const porIdCuenta = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas]);
  const porIdCategoria = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);

  // Buscando, se busca en todos los meses: "¿cuándo pagué el seguro?" no sabe de meses.
  const buscando = busqueda.trim() !== '';

  const lista = useMemo(() => {
    const texto = normalizarTexto(busqueda);
    const monto = leerMonto(busqueda);
    const coincide = (m: Movimiento) =>
      normalizarTexto(m.nota).includes(texto) ||
      (m.categoriaId !== null && normalizarTexto(porIdCategoria.get(m.categoriaId)?.nombre ?? '').includes(texto)) ||
      normalizarTexto(porIdCuenta.get(m.cuentaId)?.nombre ?? '').includes(texto) ||
      (monto !== null && (m.monto === monto || m.montoDestino === monto));
    return movimientos
      .filter((m) => (buscando ? coincide(m) : mesDe(m.fecha) === mes))
      .filter((m) => !cuentaId || m.cuentaId === cuentaId || m.cuentaDestinoId === cuentaId)
      .filter((m) => !categoriaId || m.categoriaId === categoriaId)
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn.localeCompare(a.creadoEn));
  }, [movimientos, mes, cuentaId, categoriaId, busqueda, buscando, porIdCategoria, porIdCuenta]);

  const resumen = totales(lista, cuentas, cotizacion);

  const porDia: { fecha: string; lista: Movimiento[]; gastado: number }[] = [];
  for (const m of lista) {
    let dia = porDia[porDia.length - 1];
    if (!dia || dia.fecha !== m.fecha) {
      dia = { fecha: m.fecha, lista: [], gastado: 0 };
      porDia.push(dia);
    }
    dia.lista.push(m);
    if (m.tipo === 'gasto') dia.gastado += enPesos(m, porIdCuenta, cotizacion);
  }

  // Se puede avanzar hasta el mes actual o, si cargaste algo con fecha futura, hasta ese mes.
  const ultimoMes = movimientos.reduce((max, m) => (mesDe(m.fecha) > max ? mesDe(m.fecha) : max), mesDe(hoy()));
  const hayFiltros = cuentaId || categoriaId || buscando;

  return (
    <div className="pantalla">
      {buscando ? (
        <div className="selector-mes">
          <h2>Todos los meses</h2>
          <span className="suave">
            {lista.length} {lista.length === 1 ? 'resultado' : 'resultados'}
          </span>
        </div>
      ) : (
        <div className="selector-mes">
          <button type="button" className="btn-icono" onClick={() => setMes(sumarMeses(mes, -1))} aria-label="Mes anterior">
            ‹
          </button>
          <h2>{nombreMes(mes)}</h2>
          <button
            type="button"
            className="btn-icono"
            onClick={() => setMes(sumarMeses(mes, 1))}
            disabled={mes >= ultimoMes}
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>
      )}

      <div className="kpis">
        <div className="kpi">
          <span className="rotulo">Gastos</span>
          <span className="kpi-valor num">{pesos(resumen.gastos)}</span>
        </div>
        <div className="kpi">
          <span className="rotulo">Ingresos</span>
          <span className="kpi-valor num ingreso">{pesos(resumen.ingresos)}</span>
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
          placeholder="Buscar en todos los meses: nota, categoría, cuenta o monto"
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
        <p className="vacio">
          {buscando ? `Nada con "${busqueda.trim()}" en ningún mes.` : hayFiltros ? 'Nada con esos filtros.' : 'No hay movimientos este mes.'}
        </p>
      ) : (
        porDia.map((dia) => (
          <section key={dia.fecha} className="dia">
            <h3 className="dia-titulo">
              <span>{conMayuscula(buscando ? fechaLarga(dia.fecha) : nombreDia(dia.fecha))}</span>
              {dia.gastado > 0 && <span className="dia-total num">−{pesos(dia.gastado)}</span>}
            </h3>
            <div className="lista">
              {dia.lista.map((m) => (
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

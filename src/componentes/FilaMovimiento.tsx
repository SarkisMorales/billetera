import { formatearMonto } from '../dominio/dinero';
import type { Categoria, Cuenta, Movimiento } from '../dominio/tipos';

export function FilaMovimiento({
  m,
  cuentas,
  categorias,
  alTocar,
}: {
  m: Movimiento;
  cuentas: Map<string, Cuenta>;
  categorias: Map<string, Categoria>;
  alTocar: () => void;
}) {
  const cuenta = cuentas.get(m.cuentaId);
  const moneda = cuenta?.moneda ?? 'ARS';

  if (m.tipo === 'transferencia') {
    const destino = m.cuentaDestinoId ? cuentas.get(m.cuentaDestinoId) : undefined;
    const cambio = destino && cuenta && destino.moneda !== cuenta.moneda;
    return (
      <button type="button" className="fila" onClick={alTocar}>
        <span className="fila-icono" aria-hidden>
          ⇄
        </span>
        <span className="fila-texto">
          <span className="fila-titulo">
            {cuenta?.nombre ?? '?'} → {destino?.nombre ?? '?'}
          </span>
          <span className="fila-sub">
            {cambio && m.montoDestino
              ? `${formatearMonto(m.montoDestino, destino.moneda)} · a $ ${m.cotizacion?.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
              : 'Transferencia'}
            {m.nota && ` · ${m.nota}`}
          </span>
        </span>
        <span className="fila-monto num neutro">{formatearMonto(m.monto, moneda)}</span>
      </button>
    );
  }

  const categoria = m.categoriaId ? categorias.get(m.categoriaId) : undefined;
  return (
    <button type="button" className="fila" onClick={alTocar}>
      <span className="fila-icono" aria-hidden>
        {categoria?.emoji ?? '•'}
      </span>
      <span className="fila-texto">
        <span className="fila-titulo">{m.nota || categoria?.nombre || 'Sin categoría'}</span>
        <span className="fila-sub">
          {m.nota && categoria ? `${categoria.nombre} · ` : ''}
          {cuenta?.nombre}
        </span>
      </span>
      <span className={`fila-monto num ${m.tipo}`}>
        {formatearMonto(m.tipo === 'gasto' ? -m.monto : m.monto, moneda, { signo: m.tipo === 'ingreso' })}
      </span>
    </button>
  );
}

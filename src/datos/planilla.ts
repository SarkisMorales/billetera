import { db as dbPorDefecto, type BilleteraDB } from './db';
import { cotizacionVigente, enPesos } from '../dominio/calculos';
import type { Ajustes, Categoria, Centavos, Cuenta, Movimiento } from '../dominio/tipos';
import { AJUSTES_POR_DEFECTO } from '../dominio/tipos';

/**
 * Los movimientos en una planilla (CSV) para Excel o Google Sheets. Sólo
 * lee: no es un respaldo (para eso está el archivo de la billetera) sino
 * para mirar o cruzar los números en otro lado.
 *
 * Formato argentino: punto y coma entre columnas, coma decimal y sin puntos
 * de miles, así Excel en castellano los toma como números. Fechas DD/MM/AAAA.
 */

const COLUMNAS = [
  'Fecha',
  'Tipo',
  'Monto',
  'Moneda',
  'Cuenta',
  'Categoría',
  'Nota',
  'Hacia',
  'Monto que entró',
  'Moneda que entró',
  'En pesos',
  'Cotización',
];

const TIPO: Record<Movimiento['tipo'], string> = { gasto: 'Gasto', ingreso: 'Ingreso', transferencia: 'Transferencia' };

/** "1500,5" → "1500,50": número sin miles, con coma decimal. */
function numero(c: Centavos): string {
  const negativo = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  return `${negativo}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** Entre comillas si hace falta (punto y coma, comillas o renglones). */
function celda(texto: string): string {
  return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function movimientosACsv(
  movimientos: Movimiento[],
  cuentas: Cuenta[],
  categorias: Categoria[],
  pesosPorDolar: number | null,
): string {
  const cuentasPorId = new Map(cuentas.map((c) => [c.id, c]));
  const categoriasPorId = new Map(categorias.map((c) => [c.id, c]));
  const filas = movimientos
    .filter((m) => !m.borrado)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creadoEn.localeCompare(b.creadoEn))
    .map((m) => {
      const cuenta = cuentasPorId.get(m.cuentaId);
      const destino = m.cuentaDestinoId ? cuentasPorId.get(m.cuentaDestinoId) : undefined;
      const esTransferencia = m.tipo === 'transferencia';
      return [
        m.fecha.split('-').reverse().join('/'),
        TIPO[m.tipo],
        numero(m.monto),
        cuenta?.moneda ?? '',
        cuenta?.nombre ?? '',
        m.categoriaId ? (categoriasPorId.get(m.categoriaId)?.nombre ?? '') : '',
        m.nota,
        destino?.nombre ?? '',
        esTransferencia && m.montoDestino ? numero(m.montoDestino) : '',
        esTransferencia ? (destino?.moneda ?? '') : '',
        esTransferencia ? '' : numero(enPesos(m, cuentasPorId, pesosPorDolar)),
        m.cotizacion ? String(m.cotizacion).replace('.', ',') : '',
      ]
        .map(celda)
        .join(';');
    });
  // La marca del principio (BOM) hace que Excel lea bien los acentos.
  return `﻿${[COLUMNAS.join(';'), ...filas].join('\r\n')}\r\n`;
}

/** Arma la planilla con todo y la comparte (iPhone: "Guardar en Archivos") o la descarga. */
export async function guardarPlanilla(db: BilleteraDB = dbPorDefecto): Promise<boolean> {
  const [movimientos, cuentas, categorias, ajustes] = await Promise.all([
    db.movimientos.toArray(),
    db.cuentas.toArray(),
    db.categorias.toArray(),
    db.ajustes.get('unico'),
  ]);
  const csv = movimientosACsv(movimientos, cuentas, categorias, cotizacionVigente((ajustes ?? AJUSTES_POR_DEFECTO) as Ajustes));
  const nombre = `billetera-movimientos-${new Date().toISOString().slice(0, 10)}.csv`;
  const archivo = new File([csv], nombre, { type: 'text/csv' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false;
      throw e;
    }
  } else {
    const url = URL.createObjectURL(archivo);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }
  return true;
}

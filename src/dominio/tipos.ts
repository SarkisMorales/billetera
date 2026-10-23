/**
 * Toda la plata se guarda en CENTAVOS, como entero. Nunca en float: con
 * decimales binarios 0,1 + 0,2 no da 0,3 y los saldos se desvían de a poco.
 */
export type Centavos = number;

export type Moneda = 'ARS' | 'USD';

export type TipoCuenta = 'efectivo' | 'banco' | 'virtual' | 'otro';

export interface Cuenta {
  id: string;
  nombre: string;
  moneda: Moneda;
  tipo: TipoCuenta;
  /** Lo que había en la cuenta cuando empezaste a usar la app. */
  saldoInicial: Centavos;
  archivada: boolean;
  orden: number;
  creadoEn: string;
  actualizadoEn: string;
}

export type TipoCategoria = 'gasto' | 'ingreso';

export interface Categoria {
  id: string;
  nombre: string;
  tipo: TipoCategoria;
  emoji: string;
  /** Tope mensual en pesos. Sólo tiene sentido en categorías de gasto. */
  presupuesto: Centavos | null;
  archivada: boolean;
  orden: number;
  creadoEn: string;
  actualizadoEn: string;
}

export type TipoMovimiento = 'gasto' | 'ingreso' | 'transferencia';

export interface Movimiento {
  id: string;
  tipo: TipoMovimiento;
  /** Día del movimiento, `AAAA-MM-DD`, en hora local. */
  fecha: string;
  /** Siempre positivo, en la moneda de `cuentaId`. */
  monto: Centavos;
  cuentaId: string;
  /** Gastos e ingresos. */
  categoriaId: string | null;
  /** Transferencias. */
  cuentaDestinoId: string | null;
  /**
   * Lo que entra en la cuenta destino, en SU moneda. Si las dos cuentas son
   * de la misma moneda es igual a `monto`; si no (comprar dólares), el
   * cociente entre los dos es el tipo de cambio que pagaste.
   */
  montoDestino: Centavos | null;
  /**
   * Pesos por dólar el día que se cargó. Se guarda para que un gasto en
   * dólares de marzo siga valiendo lo mismo en pesos aunque el dólar suba.
   */
  cotizacion: number | null;
  nota: string;
  /**
   * Borrado lógico. Un movimiento borrado tiene que seguir existiendo para
   * que importar un backup viejo no lo reviva.
   */
  borrado: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

/** Casas que publica dolarapi.com. `bolsa` es el MEP. */
export type CasaDolar = 'oficial' | 'blue' | 'bolsa' | 'contadoconliqui' | 'tarjeta' | 'cripto';

export const NOMBRE_CASA: Record<CasaDolar, string> = {
  oficial: 'Oficial',
  blue: 'Blue',
  bolsa: 'MEP',
  contadoconliqui: 'CCL',
  tarjeta: 'Tarjeta',
  cripto: 'Cripto',
};

export interface Cotizacion {
  casa: CasaDolar;
  compra: number;
  venta: number;
  /** Cuándo la publicó la fuente, no cuándo la bajamos. */
  fechaActualizacion: string;
}

export type Tema = 'sistema' | 'oscuro' | 'claro';

export interface Ajustes {
  id: 'unico';
  /** Qué dólar se usa para pasar de una moneda a la otra. */
  casa: CasaDolar;
  /** Última lista bajada de internet. Offline se usa ésta. */
  cotizaciones: Cotizacion[];
  cotizacionesBajadasEn: string | null;
  /** Si está, pisa a la de internet. Pesos por dólar. */
  cotizacionManual: number | null;
  ultimoBackup: string | null;
  tema: Tema;
}

export const AJUSTES_POR_DEFECTO: Ajustes = {
  id: 'unico',
  casa: 'bolsa',
  cotizaciones: [],
  cotizacionesBajadasEn: null,
  cotizacionManual: null,
  ultimoBackup: null,
  tema: 'sistema',
};

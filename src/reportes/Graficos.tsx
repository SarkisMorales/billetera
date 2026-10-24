import { useState, type ReactNode } from 'react';

/** Tope "lindo" para el eje: 1, 2, 2,5 o 5 por potencia de diez. */
export function topeEje(max: number): number {
  if (max <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(max));
  for (const paso of [1, 2, 2.5, 5, 10]) {
    if (paso * potencia >= max) return paso * potencia;
  }
  return 10 * potencia;
}

export interface Columna {
  clave: string;
  /** Lo que va debajo de la barra: "Lun", "Oct". */
  etiqueta: string;
  /** Nombre largo para la lectura y la tabla: "Lunes", "Octubre 2026". */
  nombre: string;
  valor: number | null;
  /** Dato parcial (mes en curso): se dibuja más claro. */
  parcial?: boolean;
}

/**
 * Columnas verticales de una sola serie. Al tocar una barra, su valor sube a
 * la lectura de arriba; la tabla de abajo tiene todos los valores sin tocar
 * nada. Si `destacar` es true, la barra más alta va en el color fuerte y el
 * resto en el claro: el gráfico cuenta una sola cosa.
 */
export function Columnas({
  datos,
  formato,
  formatoEje,
  destacar = false,
  inicial,
  nota,
}: {
  datos: Columna[];
  formato: (v: number) => string;
  formatoEje: (v: number) => string;
  destacar?: boolean;
  /** Índice que se lee de entrada; por defecto, el más alto. */
  inicial?: number;
  nota?: ReactNode;
}) {
  const valores = datos.map((d) => d.valor ?? 0);
  const max = Math.max(...valores);
  const iMax = valores.indexOf(max);
  const [elegido, setElegido] = useState<number>(inicial ?? iMax);
  const tope = topeEje(max);
  const actual = datos[elegido] ?? datos[iMax];

  return (
    <div className="grafico">
      <div className="grafico-lectura" aria-live="polite">
        <span className="lectura-valor">{actual?.valor != null ? formato(actual.valor) : 'Sin dato'}</span>
        <span className="lectura-nombre">
          {actual?.nombre}
          {actual?.parcial && ' · en curso'}
        </span>
      </div>

      <div className="grafico-cuerpo">
        <div className="grafico-eje-y" aria-hidden>
          <span>{formatoEje(tope)}</span>
          <span>{formatoEje(tope / 2)}</span>
          <span>{formatoEje(0)}</span>
        </div>
        <div className="grafico-plano">
          <div className="grafico-grilla" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <div className="grafico-columnas">
            {datos.map((d, i) => {
              const alto = d.valor ? Math.max(2, (d.valor / tope) * 100) : 0;
              const fuerte = !destacar || i === iMax;
              return (
                <button
                  key={d.clave}
                  type="button"
                  className="grafico-columna"
                  aria-pressed={i === elegido}
                  aria-label={`${d.nombre}: ${d.valor != null ? formato(d.valor) : 'sin dato'}`}
                  onClick={() => setElegido(i)}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setElegido(i)}
                  onFocus={() => setElegido(i)}
                >
                  <span
                    className="grafico-barra"
                    data-tono={d.parcial ? 'parcial' : fuerte ? 'fuerte' : 'suave'}
                    style={{ height: `${alto}%` }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="grafico-eje-x" aria-hidden>
        {datos.map((d, i) => (
          <span key={d.clave} data-elegido={i === elegido}>
            {d.etiqueta}
          </span>
        ))}
      </div>

      {nota && <p className="grafico-nota">{nota}</p>}

      <details className="grafico-tabla">
        <summary>Ver como tabla</summary>
        <table>
          <tbody>
            {datos.map((d) => (
              <tr key={d.clave}>
                <th scope="row">
                  {d.nombre}
                  {d.parcial && ' (en curso)'}
                </th>
                <td>{d.valor != null ? formato(d.valor) : 'Sin dato'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export interface Barra {
  clave: string;
  icono?: string;
  nombre: string;
  valor: number;
  /** 0 a 1, contra el total. */
  parte: number;
  /** Variación contra el período anterior; null si no hay con qué comparar. */
  variacion?: number | null;
}

/**
 * Barras horizontales de una sola serie, para partes de un total con nombres
 * largos (categorías, cuentas). El valor y el porcentaje van en texto; la
 * barra es la proporción.
 */
export function Barras({ datos, formato }: { datos: Barra[]; formato: (v: number) => string }) {
  const max = Math.max(...datos.map((d) => d.parte), 0.0001);
  return (
    <ul className="barras-h">
      {datos.map((d) => (
        <li key={d.clave} className="barra-h">
          <div className="barra-h-texto">
            <span className="barra-h-nombre">
              {d.icono && (
                <span className="barra-h-icono" aria-hidden>
                  {d.icono}
                </span>
              )}
              {d.nombre}
            </span>
            <span className="barra-h-valor num">{formato(d.valor)}</span>
          </div>
          <div className="barra-h-fila">
            <span className="barra-h-pista">
              <span className="barra-h-relleno" style={{ width: `${(d.parte / max) * 100}%` }} />
            </span>
            <span className="barra-h-parte num">{Math.round(d.parte * 100)}%</span>
            {d.variacion !== undefined && <Variacion v={d.variacion} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Variación de un gasto, dicha en palabras: "▲ 22% más", "▼ 4% menos".
 * Gastar más es malo (rojo), menos es bueno (verde). La palabra va siempre:
 * una flecha de color sola no dice qué subió ni si está bien.
 */
export function Variacion({ v, invertir = false }: { v: number | null; invertir?: boolean }) {
  if (v === null) return <span className="variacion neutra">antes $ 0</span>;
  const pct = Math.round(v * 100);
  if (pct === 0) return <span className="variacion neutra">igual</span>;
  const sube = pct > 0;
  const malo = invertir ? !sube : sube;
  return (
    <span className={`variacion ${malo ? 'mala' : 'buena'}`}>
      {sube ? '▲' : '▼'} {Math.abs(pct)}% {sube ? 'más' : 'menos'}
    </span>
  );
}

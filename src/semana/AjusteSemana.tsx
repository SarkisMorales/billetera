import { repositorio } from '../datos/repositorio';
import { hoy } from '../dominio/fechas';
import { DIAS_SEMANA, inicioElegido, nombreDiaSemana, semanaDe, type DiaSemana } from './calculos';
import './semana.css';

/** Ajustes → Semana: el día en que "Gastaste esta semana" vuelve a cero. */
export function AjusteSemana({ inicioSemana }: { inicioSemana: number | undefined }) {
  const inicio = inicioElegido(inicioSemana);
  const fin = ((inicio + 6) % 7) as DiaSemana;
  const { desde } = semanaDe(hoy(), inicio);
  const empezoHoy = desde === hoy();

  return (
    <section className="bloque">
      <h2 className="bloque-titulo">Semana</h2>
      <p className="ayuda">
        ¿Qué día empieza tu semana? Ese día "Gastaste esta semana" vuelve a cero.
      </p>
      <div className="segmentado semana-dias" role="radiogroup" aria-label="La semana empieza el">
        {DIAS_SEMANA.map((d) => (
          <button
            key={d.dia}
            type="button"
            role="radio"
            aria-checked={inicio === d.dia}
            aria-label={d.nombre}
            onClick={() => repositorio.guardarAjustes({ inicioSemana: d.dia })}
          >
            {d.corto}
          </button>
        ))}
      </div>
      <p className="ayuda">
        Va de {nombreDiaSemana(inicio)} a {nombreDiaSemana(fin)}.{' '}
        {empezoHoy ? 'Esta semana empezó hoy.' : `Esta empezó el ${nombreDiaSemana(inicio)} ${Number(desde.slice(8, 10))}/${Number(desde.slice(5, 7))}.`}
      </p>
    </section>
  );
}

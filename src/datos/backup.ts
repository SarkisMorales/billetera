import { db } from './db';
import { repositorio } from './repositorio';
import { exportar } from './respaldo';
import { diasEntre } from '../dominio/fechas';

/**
 * Guarda el respaldo. En el iPhone abre la hoja de Compartir, desde donde
 * va a "Guardar en Archivos" → iCloud Drive. En la compu lo descarga.
 * Devuelve false si cancelaste.
 */
export async function guardarRespaldo(): Promise<boolean> {
  const datos = await exportar(db);
  const nombre = `billetera-${datos.exportadoEn.slice(0, 10)}.json`;
  const contenido = JSON.stringify(datos, null, 2);
  const archivo = new File([contenido], nombre, { type: 'application/json' });

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
  await repositorio.guardarAjustes({ ultimoBackup: new Date().toISOString() });
  return true;
}

/**
 * Backup semanal. No se dispara solo: el navegador bloquea lo que el
 * usuario no pidió. Devuelve true si toca, y la app lo ofrece con un botón.
 */
export async function tocaBackup(): Promise<boolean> {
  const ahora = new Date().toISOString();
  const { ultimoBackup } = await repositorio.ajustes();
  if (ultimoBackup) return diasEntre(ultimoBackup, ahora) >= 7;

  // Nunca hubo backup: recién avisamos cuando hay algo que perder.
  const primero = await db.movimientos.orderBy('creadoEn').first();
  return primero !== undefined && diasEntre(primero.creadoEn, ahora) >= 3;
}

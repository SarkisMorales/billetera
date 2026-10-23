// IndexedDB no existe en Node, así que usamos una implementación en memoria.
// Los tests corren contra el mismo Dexie que la app real, no contra un mock.
import 'fake-indexeddb/auto';

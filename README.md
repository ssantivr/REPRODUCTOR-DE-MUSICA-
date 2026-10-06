# 🌌 Universo Musical

Reproductor de música experimental para el taller de **Estructuras de Datos**
(docente: Jhonatan Andres Mideros Narvaez). La playlist es una **lista doblemente
enlazada** implementada desde cero y cada canción es una partícula dentro de un
universo interactivo.

**Stack:** Next.js 16 (App Router) · TypeScript · React 19 · Tailwind CSS 3 · Framer Motion · Canvas API · Web Audio API

> Convención: todo el código, identificadores y comentarios están en inglés; todo el
> texto visible de la interfaz está en español y no muestra código.

## Contenido

- [Requisitos](#requisitos)
- [Ejecutar](#ejecutar)
- [Variables de entorno](#variables-de-entorno)
- [Cómo se usa](#cómo-se-usa)
- [Lista doblemente enlazada](#lista-doblemente-enlazada-srclibdoublylinkedlistts)
- [Pila: deshacer y rehacer](#pila-deshacer-y-rehacer-srclibstackts)
- [Cola: reproducir después](#cola-reproducir-después-srclibqueuets)
- [Montículo: las más escuchadas](#montículo-las-más-escuchadas-srclibheapts)
- [Tabla hash: de la canción a su nodo](#tabla-hash-de-la-canción-a-su-nodo-srclibhashtablets)
- [Índice secundario](#índice-secundario-srclibmusicindexts)
- [Trie: autocompletar la búsqueda](#trie-autocompletar-la-búsqueda-srclibtriets)
- [Estructuras por dentro](#estructuras-por-dentro)
- [Diagnóstico y prueba de estrés](#diagnóstico-y-prueba-de-estrés)
- [Modelo de datos](#modelo-de-datos-srctypesmusicts)
- [Búsqueda](#búsqueda-srclibsearch)
- [Reproducción](#reproducción)
- [Letra](#letra)
- [Galaxias, favoritas y guardado](#galaxias-favoritas-y-guardado)
- [Modos visuales](#modos-visuales-teclas-1-4)
- [Exportar, importar y compartir](#exportar-importar-y-compartir)
- [Estructura](#estructura)
- [Pruebas](#pruebas)
- [Mejoras recientes](#mejoras-recientes)
- [Problemas frecuentes](#problemas-frecuentes)

## Requisitos

- **Node.js 22.12 o superior** (Next.js 16 pide 20.9; las pruebas con Vitest 5 piden 22.12) y npm.
- Conexión a internet para la búsqueda global, el audio real, las carátulas, la letra y los
  reproductores de YouTube / Spotify. El catálogo local y el sintetizador funcionan sin conexión.

## Ejecutar

```bash
npm install
npm run dev        # http://localhost:3000
```

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en http://localhost:3000 |
| `npm run build` | Compilación de producción |
| `npm run start` | Sirve la compilación de producción (requiere `build` antes) |
| `npm run typecheck` | Revisa los tipos con `tsc --noEmit` |
| `npm test` | Pruebas automáticas con Vitest (estructuras y lógica de la playlist) |
| `npm run demo:dll` | Recorrido comentado por todas las estructuras, en consola |

La primera carga en modo desarrollo puede tardar: Next.js compila la página al abrirla.

## Variables de entorno

Todas son **opcionales**. Copia `.env.local.example` como `.env.local` y completa las que quieras:

| Variable | Para qué sirve | Sin ella |
|---|---|---|
| `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` | Buscar en Spotify y vincular pistas de Spotify ([panel de desarrolladores](https://developer.spotify.com/dashboard)) | La búsqueda global usa iTunes Search y las canciones nuevas no tienen pista de Spotify |
| `YOUTUBE_API_KEY` | Buscar videos con YouTube Data API v3 ([consola de Google Cloud](https://console.cloud.google.com)) | Los videos se obtienen de la página pública de resultados de YouTube |

`.env.local` está en `.gitignore`: las credenciales no se suben al repositorio.

## Cómo se usa

La pantalla tiene cuatro zonas:

- **Universo (fondo):** cada canción es una partícula. Clic en una partícula para viajar a ella.
  La rueda del ratón (o pellizcar con dos dedos) acerca y aleja, y arrastrar el fondo lo desplaza;
  los botones `−` `+` de la esquina hacen lo mismo y *Restablecer vista* vuelve a la vista completa.
- **Buscar (panel izquierdo):** busca canciones y agrégalas *Al inicio*, *En posición N* o
  *Al final*, o reprodúcelas de inmediato.
- **Constelación (panel derecho):** la lista en orden, con *Recorrer*, *Mezclar*,
  *Viajar a esa estrella*, quitar canciones y exportar / importar. Cada estrella se puede
  **arrastrar** desde su tirador (con el ratón o con el dedo) para cambiarla de posición y tiene un botón para ponerla **en la cola**. Arriba
  se elige la **galaxia** (lista de reproducción) y hay cuatro pestañas: *Constelación*,
  *Cola*, *Recientes* y *Top* (las más escuchadas y las favoritas).
- **Reproductor (abajo):** carátula, corazón de favorita, anterior, reproducir / pausar,
  siguiente, repetir, aleatorio, barra de progreso en la que se puede hacer clic o arrastrar
  para saltar, volumen y la fuente de reproducción (Audio, Sinte, YouTube o Spotify).

El botón **Letra** (o la tecla `L`) muestra la letra de la canción actual (ver [Letra](#letra)).

El botón **Filtros** muestra solo ciertos géneros o rangos de energía y tempo; las canciones
filtradas quedan como contornos tenues y no se pueden seleccionar.

El botón **Diagnóstico** (o la tecla `D`) abre un panel con las métricas en vivo de la lista
y la prueba de estrés (ver [Diagnóstico y prueba de estrés](#diagnóstico-y-prueba-de-estrés)).

El botón **Estructuras** (o la tecla `E`) dibuja en vivo las estructuras de datos que usa la app
(ver [Estructuras por dentro](#estructuras-por-dentro)).

**Atajos:** `Espacio` reproducir/pausar · `←` / `→` anterior/siguiente · `1-4` modos visuales · `D` diagnóstico · `E` estructuras · `L` letra · `Ctrl+Z` deshacer · `Ctrl+Y` rehacer.
Con el foco en el universo (tecla `Tab`): `↑` / `↓` recorren las estrellas en el orden de la lista,
`Inicio` / `Fin` van a los extremos, `Enter` viaja a la elegida, `+` / `-` acercan y alejan y `0`
restablece la vista.
Con el foco en el tirador de una estrella, `↑` / `↓` la mueven una posición. Las teclas
multimedia del teclado y los controles del sistema también funcionan (ver [Reproducción](#reproducción)).
No se activan mientras escribes en un campo; los demás atajos con Ctrl, Alt o Cmd se dejan
al navegador.

## Lista doblemente enlazada (`src/lib/DoublyLinkedList.ts`)

```
Lineal:    null ← [HEAD] ⇄ [1] ⇄ [2] ⇄ … ⇄ [TAIL] → null
Circular:  [TAIL].next = [HEAD]   y   [HEAD].prev = [TAIL]
```

Cada nodo guarda un valor (la canción) y dos punteros, `prev` y `next`. La lista mantiene
`head`, `tail`, `length` y un cursor `current` (la canción que suena).

| Método | Qué hace | Complejidad |
|---|---|---|
| `append(value)` | Agrega al final usando `tail` | O(1) |
| `prepend(value)` | Agrega al inicio usando `head` | O(1) |
| `traverseToIndex(index)` | Llega al nodo desde `head` (con `next`) o desde `tail` (con `prev`), según la mitad | O(n) |
| `insertAt(index, value)` | Enlaza el nodo entre `index-1` e `index` | O(n) |
| `insertAfter(node, value)` | Enlaza un valor justo después de un nodo que ya se tiene a mano | O(1) |
| `removeAt(index)` | Re-enlaza los vecinos y desconecta el nodo | O(n) |
| `removeNode(node)` | Desconecta un nodo que ya se tiene a mano: solo cambian sus dos vecinos | O(1) |
| `move(from, to)` | Cambia un nodo de posición solo re-enlazando `prev` / `next`; no crea ni destruye nodos | O(n) |
| `next()` / `prev()` | Mueven el cursor `current` por los punteros `next` / `prev` | O(1) |
| `moveTo(index)` | Coloca el cursor en una posición usando `traverseToIndex` | O(n) |
| `setCurrent(node)` | Coloca el cursor en un nodo que ya se tiene a mano | O(1) |
| `setCircular(bool)` | Modo repetir: enlaza `tail.next = head` y `head.prev = tail` (lista circular) | O(1) |
| `shuffle()` | Mezcla reasignando `prev` / `next` (Fisher–Yates sobre los nodos); no crea ni destruye nodos | O(n) |
| `jumpRandom(random, eligible)` | Mueve el cursor a un nodo aleatorio distinto del actual; con `eligible`, solo entre los que cumplen esa condición | O(n) |
| `toJSON()` / `importJSON()` / `fromJSON()` | Exporta e importa la lista completa (orden, cursor y modo circular) | O(n) |
| `clear()` | Desenlaza todos los nodos | O(n) |
| `printList()` | Imprime `HEAD ⇄ … ⇄ TAIL` en la consola del navegador | O(n) |

Las operaciones por posición son O(n) porque hay que llegar al nodo, aunque nunca dan más de
n/2 pasos: el recorrido empieza por el extremo más cercano. Enlazar o desenlazar en sí es O(1),
y por eso `insertAfter`, `removeNode` y `setCurrent`, que reciben el nodo directamente, no
recorren nada.

`removeAt` mantiene el cursor válido: si se borra el nodo actual, pasa a su vecino. Como la
lista circular no tiene `null` en los extremos, todos los recorridos se limitan por `length`.

**Historial** (`src/lib/PlaybackHistory.ts`): otra lista doble. Cada reproducción se agrega en
`tail` (O(1)); al superar 20 se quita la más antigua desde `head` (O(1)). La vista "Recientes"
recorre desde `tail` hacia atrás usando los punteros `prev`.

**Filtro espacial** (`src/lib/spatialFilter.ts`): género, rango de energía y rango de tempo en
tiempo real.

Cómo se conecta cada acción de la interfaz con la lista:

| Acción en la app | Operación de la lista |
|---|---|
| *Siguiente* / *Anterior* | `next()` / `prev()` |
| Clic en una partícula · "Viajar a esa estrella" | `moveTo` → `traverseToIndex` |
| "Al inicio" / "En posición N" / "Al final" | `prepend` / `insertAt` / `append` |
| Quitar una estrella | `removeAt` (si era la actual, suena su vecina) |
| Arrastrar una estrella a otra posición | `move` (el cursor sigue en la misma canción) |
| "Recorrer" | `printList` + un cometa que ilumina la constelación de inicio a fin |
| *Repetir* | `setCircular` (un arco punteado une el final con el inicio) |
| *Aleatorio* | `jumpRandom` en cada "Siguiente", solo entre las que aún no han sonado |
| Sale una canción de la cola | `setCurrent` sobre su nodo, que se obtiene de la tabla hash |
| "Mezclar" | `shuffle` |
| Exportar / Importar | `toJSON` / `importJSON` |

`src/hooks/usePlaylist.ts` conecta la lista con React: la lista vive en una referencia y se
modifica en el sitio, y cada operación emite un mensaje en español que aparece como
notificación flotante.

### Iteración nativa

La lista implementa `Symbol.iterator`, así que se recorre como cualquier colección de
JavaScript. El recorrido se limita por `length`, por lo que también termina en modo circular.

```ts
for (const track of playlist) console.log(track.title);
const [first, ...rest] = playlist;
const titles = [...playlist].map((track) => track.title);
```

## Pila: deshacer y rehacer (`src/lib/Stack.ts`)

`Stack<T>` es una pila genérica (LIFO) construida sobre la lista doble: la cima es `tail`, así
que `push`, `pop` y `peek` son O(1). Con capacidad, al llenarse descarta la entrada más
antigua desde `head`, también en O(1).

`usePlaylist` mantiene **dos pilas** de hasta 30 pasos. Cada cambio de estructura guarda en la
pila de deshacer su **operación inversa**, no una copia de la lista:

| Cambio | Lo que se guarda para deshacerlo | Memoria |
|---|---|---|
| Agregar en la posición `i` | "quitar la posición `i`" | O(1) |
| Quitar la posición `i` | "insertar esa canción en `i`" | O(1) |
| Mover de `a` a `b` | "mover de `b` a `a`" | O(1) |
| Mezclar · importar | el orden anterior completo (no tiene una inversa más corta) | O(n) |

Aplicar un paso devuelve a su vez su propia inversa, que es lo que recibe la otra pila:

| Acción | Pila de deshacer | Pila de rehacer |
|---|---|---|
| Cambio nuevo | `push` de su inversa | se vacía |
| Deshacer (`Ctrl+Z`) | `pop` → se aplica | `push` de la inversa de lo aplicado |
| Rehacer (`Ctrl+Y` o `Ctrl+Shift+Z`) | `push` de la inversa de lo aplicado | `pop` → se aplica |

También hay botones de deshacer y rehacer en el panel de la constelación. Al restaurar, la
canción que está sonando sigue sonando si todavía existe en la lista. La navegación, el modo
repetir y el modo aleatorio no se registran: solo los cambios de estructura.

## Cola: reproducir después (`src/lib/Queue.ts`)

`Queue<T>` es una cola genérica (FIFO) construida sobre la lista doble: se entra por `tail` y
se sale por `head`, así que `enqueue`, `dequeue` y `peek` son O(1).

| Acción en la app | Operación de la cola |
|---|---|
| Botón de cola de una estrella | `enqueue`: la canción toma el último turno |
| *Siguiente* (o termina la canción) con la cola ocupada | `dequeue`: suena la que entró primero, antes que el orden normal |
| Quitar un turno desde la pestaña *Cola* | `removeAt` |
| Se quita de la constelación una canción que estaba en la cola | `retain`: pierde su turno |

`retain` recorre los nodos una sola vez y desenlaza cada uno que sobra con `removeNode`, así que
es O(n) y no O(n²).

La cola guarda canciones de la constelación, no copias: al salir de la cola el cursor de la
lista viaja a esa estrella con `moveTo`. Cambiar de galaxia vacía la cola.

## Montículo: las más escuchadas (`src/lib/Heap.ts`)

`Heap<T>` es un montículo binario (cola de prioridad) guardado en un arreglo: los hijos de la
posición `i` están en `2i + 1` y `2i + 2`, y el de mayor prioridad siempre está en la posición 0.

| Método | Qué hace | Complejidad |
|---|---|---|
| `new Heap(compare, valores)` | Construye el montículo hundiendo la mitad superior (Floyd) | O(n) |
| `push(value)` | Agrega al final y lo hace flotar hasta su lugar | O(log n) |
| `pop()` | Saca el de mayor prioridad y hunde el último en su lugar | O(log n) |
| `peek()` | Consulta el de mayor prioridad | O(1) |
| `topK(valores, k, compare)` | Los `k` mejores: construye el montículo y saca `k` veces | O(n + k log n) |

La pestaña *Top* usa `topK` para mostrar las **cinco canciones más escuchadas** sin ordenar
todo el registro: gana la que tiene más reproducciones y, si empatan, la escuchada más
recientemente. Pausar y reanudar cuenta como una sola reproducción.

## Tabla hash: de la canción a su nodo (`src/lib/HashTable.ts`)

`HashTable<V>` es una tabla hash con claves de texto y **encadenamiento separado**: cada casilla
guarda una lista corta de pares clave-valor. `get`, `set`, `has` y `delete` son O(1) en promedio,
y la tabla se duplica cuando la carga pasa del 75 %.

`usePlaylist` mantiene una tabla `uid → nodo` al día con cada cambio de la lista. Con ella,
llegar al nodo de una canción concreta ya no exige recorrer la lista:

| Antes (recorrido, O(n)) | Ahora (tabla hash, O(1) promedio) |
|---|---|
| Buscar en la lista la canción que sale de la cola | `nodes.get(uid)` + `setCurrent` |
| Recorrer todos los nodos para vincular un video o una carátula | `nodes.get(uid)` |
| Armar un conjunto con toda la lista para depurar la cola | `nodes.has(uid)` |

El modo aleatorio usa otra tabla para recordar qué canciones ya sonaron: **ninguna se repite
hasta que han sonado todas**, y entonces empieza otra ronda. Una pila guarda los saltos, de modo
que *Anterior* los desanda uno por uno (hasta 50).

## Índice secundario (`src/lib/MusicIndex.ts`)

`MusicIndex` evita recorrer todas las canciones al buscar y filtrar. Combina dos estructuras
escritas desde cero:

| Operación | Estructura | Complejidad |
|---|---|---|
| `byGenre(genre)` | `HashTable` | O(1) promedio |
| `byArtist(artist)` | `HashTable`, sin distinguir mayúsculas ni tildes | O(1) promedio |
| `byTempo(min, max)` | `AvlTree` (`src/lib/AvlTree.ts`) | O(log n + k) |
| `filter(filter)` | Parte de los géneros elegidos o del rango de tempo | proporcional a los candidatos |
| `add(song)` / `remove(song)` | Las tres estructuras a la vez | O(log n) |
| `sync(songs)` | Agrega y quita solo las canciones que cambiaron | O(n + c log n), c = cambios |

El árbol por tempo es un **AVL**: un árbol binario de búsqueda que se rebalancea con rotaciones
después de cada inserción y cada borrado, de modo que su altura se mantiene en O(log n) llegue
como llegue el orden de las claves (4096 claves insertadas en orden quedan en 13 niveles, no en
una cadena de 4096).

Dónde se usa:

- **Filtros del universo:** `MusicUniverse` indexa la constelación y resuelve el filtro con
  `filter()`. Cuando la lista cambia, `sync` toca solo las canciones que entraron o salieron en
  vez de reconstruir el índice, y al mover un control no se toca nada.
- **Búsqueda:** `isInCatalog` usa `byArtist` para saber si una canción externa ya está en el
  catálogo.

`npm run demo:dll` comprueba que el índice devuelve exactamente lo mismo que un recorrido
completo para varios filtros.

## Trie: autocompletar la búsqueda (`src/lib/Trie.ts`)

`Trie<T>` es un árbol de prefijos: cada nodo es un carácter y el camino desde la raíz deletrea un
prefijo compartido por todas las palabras que cuelgan de él.

| Método | Qué hace | Complejidad |
|---|---|---|
| `insert(word, value)` | Baja o crea un nodo por carácter | O(m), m = largo de la palabra |
| `startsWith(prefix, limit)` | Llega al prefijo y recorre su subárbol por niveles (con la `Queue`), las palabras más cortas primero | O(m + k) |

El costo no depende de cuántas palabras guarde el trie. `SuggestionIndex`
(`src/lib/search/suggestions.ts`) lo usa para el **autocompletado del buscador**: guarda cada
título y cada artista una vez por palabra ("bohemian rhapsody" y "rhapsody"), así que el prefijo
coincide desde el inicio de cualquier palabra, sin distinguir mayúsculas ni tildes. Empieza con
el catálogo local y aprende cada canción real que trae la búsqueda global. Sugiere a partir de
dos letras; `↑` / `↓` recorren las sugerencias, `Enter` elige y `Esc` las cierra.

## Estructuras por dentro

El panel **Estructuras** (`src/components/structures/`, botón del encabezado o tecla `E`) no
muestra dibujos de ejemplo: cada pestaña lee la estructura real que la app está usando.

| Pestaña | Qué muestra | De dónde sale |
|---|---|---|
| **Punteros** | `insertAt`, `removeAt` y `move` paso a paso sobre una copia de las primeras estrellas: en cada paso cambia un puntero (cian = siguiente, magenta = anterior), con *Paso →*, *← Paso* y *Reproducir* | `src/lib/pointerSteps.ts`, que repite las asignaciones en el mismo orden que la lista |
| **Árbol** | El árbol AVL por tempo de la constelación; al agregar o quitar canciones los nodos se deslizan y los que giraron se iluminan. El *Laboratorio* permite insertar y quitar claves (por ejemplo, varias «en orden») para provocar giros | `AvlTree.snapshot()` y `AvlTree.onRotate` |
| **Montículo** | Los conteos de reproducción como árbol y como arreglo. *Sacar la más escuchada* repite un `pop`: la última sube a la raíz y se hunde intercambio a intercambio | `Heap.toArray()` y `Heap.onSwap` |
| **Tabla** | Las casillas de la tabla `uid → nodo` con sus cadenas, la ocupación frente al límite del 75 % y la última casilla consultada. Al elegir una canción se ilumina su casilla; cuando la tabla se duplica, cada clave vuela a su casilla nueva | `HashTable.snapshot()`, `bucketIndex()`, `lastBucket` y `resizes` |
| **Pilas** | Las dos pilas de deshacer y rehacer: al deshacer, la cima salta de una pila a la otra | `undoSteps` / `redoSteps` de `usePlaylist` |

El **trie** se ve donde se usa: debajo del buscador aparece el camino que recorre lo que escribes,
un nodo por letra. Se ilumina mientras el prefijo existe y se corta (en rojo, punteado) en la
primera letra por la que no sigue ninguna palabra guardada (`Trie.trace`).

Estos añadidos solo leen: ninguno cambia el comportamiento ni la complejidad de las estructuras.

## Diagnóstico y prueba de estrés

**Panel de diagnóstico** (`src/components/DiagnosticsPanel.tsx`, botón *Diagnóstico* o tecla
`D`): muestra en vivo, para `append`, `removeAt`, `traverseToIndex` y `shuffle`, cuántas veces
se ejecutó cada una, su complejidad teórica y el tiempo de la última llamada y la media.

`src/lib/ListMetrics.ts` hace la medición: `instrumentList` envuelve esos cuatro métodos en la
instancia de la lista y cronometra cada llamada con `performance.now()`, sin modificar la
clase. Las llamadas internas también cuentan (quitar una canción incluye su recorrido). El
navegador redondea su reloj, así que las operaciones muy rápidas aparecen como `<0,001` ms.

**Prueba de estrés** (`src/lib/stressTest.ts`, botón del panel o `npm run demo:dll`): sobre una
lista aparte (la constelación no cambia) inserta 500 nodos, ejecuta `shuffle()`, la recorre
completa y elimina 250 nodos al azar en modo circular. Tras cada fase comprueba que recorrer
con `prev` desde el final dé lo mismo que recorrer con `next` desde el inicio, y que los
extremos estén bien enlazados.

## Modelo de datos (`src/types/music.ts`)

Cada nodo guarda un `Track`: una canción (`Song`) más un `uid` único, para que la misma
canción pueda estar varias veces en la lista sin confundir sus nodos.

| Campo | Significado |
|---|---|
| `id`, `title`, `artist`, `year` | Identificación de la canción |
| `genre` | `electronic`, `rock`, `pop`, `urban`, `jazz`, `ambient`, `classical` o `indie` |
| `energy` | 0 = muy calmada, 1 = muy enérgica |
| `valence` | 0 = oscura / triste, 1 = brillante / alegre |
| `tempo` | Pulsaciones por minuto |
| `key` | Tonalidad: 0 = Do, 1 = Do#, …, 11 = Si |
| `durationSec` | Duración en segundos |
| `youtubeId`, `spotifyId` | Opcionales: video y pista vinculados |
| `previewUrl`, `artworkUrl` | Opcionales: fragmento de audio real de 30 s y carátula del álbum |

El catálogo local (`src/lib/catalog.ts`) tiene **28 canciones**; la primera vez la lista arranca
con las 10 primeras y después con lo que quedó guardado
(ver [Galaxias, favoritas y guardado](#galaxias-favoritas-y-guardado)). `src/lib/songSchema.ts` valida cualquier canción que llegue de fuera (peticiones a
la API o archivos importados).

## Búsqueda (`src/lib/search/`)

1. `GET /api/search?q=` → **catálogo local**; si hay menos de 3 coincidencias, agrega
   canciones globales de **Spotify** (con credenciales) o de **iTunes Search** (sin clave):
   título, artista, año, género y duración reales, más el fragmento de audio y la carátula.
2. Cada canción externa se convierte con `songFactory.createSong` en un objeto con
   **exactamente la misma forma** que las canciones del catálogo (`Song`).
3. Al agregarla, `POST /api/resolve` vincula su **video de YouTube** (API si hay clave; si no,
   la página pública de resultados) verificado con oEmbed, y su **pista de Spotify** si hay
   credenciales. Luego entra a la lista y aparece como partícula con un anillo expansivo.
4. Las canciones del catálogo sin video se vinculan igual la primera vez que se abren en
   YouTube/Spotify. Su fragmento de audio y su carátula se buscan en iTunes la primera vez
   que suenan con la fuente *Audio* (`POST /api/resolve` con `scope: "media"`).
5. Si nada coincide o no hay conexión: canciones simuladas.

Nunca lanza errores hacia la interfaz. Como Spotify ya no expone atributos de audio a apps
nuevas, la energía, la valencia y el tempo se estiman dentro del rango típico del género,
siempre con el mismo resultado para la misma canción.

Las respuestas externas se guardan en una caché en memoria durante 10 minutos (máximo 200
entradas) y cada petición a un proveedor tiene un límite de 6 segundos.

## Reproducción

- **Audio (fuente inicial):** reproduce el **fragmento real de 30 s** de la canción que publica
  iTunes. Pasa por el mismo grafo de Web Audio que el sintetizador, así que también alimenta
  el anillo espectral del canvas. Si una canción no tiene fragmento o no se puede cargar,
  suena sintetizada.
- **Sinte (Web Audio API):** no reproduce archivos; genera una vista previa de 45 s a
  partir del tempo, la tonalidad, la energía, la valencia y el género. Alimenta el anillo
  espectral del canvas. Al terminar pasa a la siguiente canción.
- **YouTube:** reproductor incrustado; reproducir / pausar se controla desde la app.
- **Spotify:** reproductor incrustado; la reproducción se controla desde el propio reproductor
  de Spotify.

Si una canción no tiene video o pista vinculada, la app la busca una vez y, si no la
encuentra, ofrece un enlace para buscarla en la plataforma.

Con las fuentes *Audio* y *Sinte* la **barra de progreso** permite saltar a cualquier momento
(clic o arrastre). La **carátula** aparece en el reproductor, en la lista, en los resultados
de búsqueda y sobre la partícula de la canción que suena.

**Controles del sistema (Media Session):** la app publica el título, el artista y la carátula
y responde a reproducir, pausar, anterior, siguiente y saltar. El navegador solo muestra estos
controles mientras suena un elemento de audio, es decir, con la fuente *Audio*; YouTube y
Spotify usan los controles de su propio reproductor.

## Letra

El panel **Letra** (botón del encabezado o tecla `L`) consulta `GET /api/lyrics`, que busca en
[LRCLIB](https://lrclib.net) (público, sin clave) y prefiere la versión del artista correcto,
con letra sincronizada y con la duración más parecida. `src/lib/lyrics.ts` convierte el formato
LRC (`[mm:ss.xx] verso`) en líneas con su tiempo.

Con la fuente **YouTube** la letra sincronizada avanza con la canción: el reproductor
incrustado informa su posición y la línea que se está cantando se localiza con **búsqueda
binaria** (`activeLineIndex`, O(log n)). Un video con introducción propia puede ir desfasado
respecto a la letra.

Con la fuente **Audio** el fragmento de 30 s empieza en un punto desconocido de la canción, así
que la app no puede saber sola qué verso suena: **toca el verso que estás oyendo** y desde ahí la
letra sigue al fragmento (la posición del fragmento más ese desfase). Se puede volver a tocar
para corregirlo. Con *Sinte* la letra se muestra completa sin resaltar.

## Galaxias, favoritas y guardado

- **Galaxias:** son listas de reproducción con nombre (hasta 12). Solo la activa vive en la
  lista doblemente enlazada; las demás esperan guardadas como `toJSON()` y se cargan con
  `importJSON()` al cambiar. Se crean, renombran y eliminan desde el panel de la constelación;
  cambiar de galaxia detiene la reproducción y reinicia deshacer / rehacer y la cola.
- **Favoritas:** el corazón del reproductor marca la canción actual. Se guardan por canción,
  así que valen en todas las galaxias, y se listan en la pestaña *Top*.
- **Guardado automático** (`src/hooks/useLibrary.ts`): las galaxias con su orden, su cursor y
  su modo repetir, las favoritas y el conteo de reproducciones se guardan en el navegador
  (`localStorage`) un instante después de cada cambio, y se recuperan al abrir la app. También
  se recuerdan el volumen, la fuente y el modo visual. Todo queda en ese navegador: para
  llevar una lista a otro equipo se usa exportar / importar.

## Modos visuales (teclas 1-4)

| Modo | Idea |
|---|---|
| **Universo** | Órbitas: radio = energía, velocidad = tempo, color = género |
| **Flujo** | La lista en orden como un río; pulsos viajan hacia adelante y hacia atrás |
| **Noche** | Constelaciones tenues y audio suavizado |
| **Energía/Calma** | Mapa tempo × energía |

### Animaciones del universo (`src/components/UniverseCanvas.tsx`)

Cada animación del fondo cuenta algo que le pasó a la lista:

| Qué pasa | Qué se ve |
|---|---|
| *Siguiente* / *Anterior* | Un cometa recorre el enlace entre las dos estrellas: cian si fue por `next`, magenta si fue por `prev` |
| Viajar a una posición | El cometa repite el camino real de `traverseToIndex`, desde el inicio o desde el final |
| Salto directo (cola, aleatorio) | Un cometa violeta en línea recta: no se recorrió la lista, el nodo vino de la tabla hash |
| Quitar una estrella | La estrella colapsa y el enlace nuevo entre sus dos vecinas destella mientras se «suelda» |
| *Mezclar* | Los enlaces se desvanecen, las estrellas giran en remolino y la cadena vuelve en el orden nuevo |
| Cambiar de galaxia | Salto hiperespacial: las estrellas del fondo se estiran y la galaxia nueva nace desde el centro |
| Cambiar de modo visual | El fondo se funde de un modo al otro |
| La música | Las estrellas del fondo laten con los graves y cada golpe fuerte lanza una onda desde la estrella que suena |
| Mover el puntero | Las estrellas del fondo se desplazan un poco, más las cercanas (paralaje) |

Con «reducir movimiento» activado en el sistema el universo queda quieto: sin órbitas, cometas,
ondas ni destellos, y los cambios de posición son inmediatos.

### Conexiones de la constelación (`src/lib/universe/painters.ts`)

Los enlaces entre canciones consecutivas se dibujan como **curvas de Bézier cúbicas**, no como
rectas. `buildCurves` calcula los puntos de control de cada enlace a partir de sus vecinos
(conversión Catmull-Rom → Bézier), de modo que la cadena pasa por cada estrella sin esquinas.
Los pulsos del modo Flujo y el cometa de "Recorrer" siguen esas mismas curvas.

Mientras suena música, una "energía de enlace" sigue el nivel de audio mediante un **resorte
amortiguado** (sube y se asienta en vez de saltar) y produce tres efectos: la cadena brilla y
engrosa, cada enlace vibra como una cuerda, y una chispa cian recorre cada enlace en el
sentido de `next`. Al pausar, todo vuelve suavemente al reposo.

## Exportar, importar y compartir

"Exportar constelación" descarga un archivo `constelacion-AAAA-MM-DD.json` con todas las
canciones en orden, la posición del cursor y el modo repetir. "Importar constelación"
reemplaza la lista de la galaxia activa por la del archivo; las canciones inválidas se omiten y un archivo
con otro formato se rechaza con un aviso.

**Compartir por enlace** (`src/lib/shareLink.ts`): el botón del eslabón copia un enlace que lleva
la galaxia activa completa. La lista viaja comprimida en la parte de la dirección que va después
de `#`, que el navegador no envía al servidor, así que no hace falta guardar nada en ninguna
parte. Quien abre el enlace la recibe como una **galaxia nueva**, sin tocar las que ya tenía, y
cada canción pasa por la misma validación que un archivo importado. El enlace no incluye las
carátulas ni los fragmentos de audio (son direcciones largas): la app los vuelve a buscar al
reproducir. Si el navegador no deja copiar, el enlace queda en la barra de direcciones.

## Estructura

```
src/
  app/                 layout, página, estilos y APIs /api/search, /api/resolve y /api/lyrics
  components/          MusicUniverse (orquestador), UniverseCanvas, ConstellationPanel,
                       SearchPanel, FilterPanel, DiagnosticsPanel, LyricsPanel, PlayerDock,
                       EmbedPlayer, EventToast, ModeSwitcher, icons
    structures/        StructuresPanel y sus vistas: PointerLab, AvlView, HeapView,
                       HashView, StacksView
  hooks/               usePlaylist, useLibrary (galaxias, favoritas y guardado), useMediaQuery
  lib/
    DoublyLinkedList.ts
    PlaybackHistory.ts
    Stack.ts           pila sobre la lista doble (deshacer / rehacer)
    Queue.ts           cola sobre la lista doble (reproducir después)
    Heap.ts            montículo binario (las más escuchadas)
    lyrics.ts          letra desde LRCLIB y lectura del formato LRC
    HashTable.ts       tabla hash con encadenamiento (uid → nodo, índice, aleatorio)
    AvlTree.ts         árbol AVL (canciones por tempo)
    Trie.ts            árbol de prefijos (autocompletado)
    MusicIndex.ts      tablas hash + árbol AVL (índice secundario)
    ListMetrics.ts     medición en vivo de las operaciones de la lista
    stressTest.ts      prueba de estrés y verificación de punteros
    pointerSteps.ts    insertar, quitar y mover puntero a puntero (panel de estructuras)
    shareLink.ts       una galaxia dentro de un enlace
    search/            searchGateway, itunesClient, spotifyClient, youtubeClient,
                       localSearch, songFactory, suggestions (autocompletado)
    universe/          layout (posiciones por modo), painters (dibujo en canvas)
    audioEngine.ts, catalog.ts, genres.ts, modes.ts, songSchema.ts,
    spatialFilter.ts, utils.ts
  types/               tipos del dominio
scripts/demo-dll.ts    recorrido comentado por todas las estructuras
tests/                 pruebas automáticas (Vitest)
.github/workflows/     integración continua: tipos, pruebas y demo en cada push
```

## Pruebas

```bash
npm test             # pruebas automáticas (Vitest)
npm run demo:dll     # lista doble e historial: inserción, borrado, recorridos, modo
                     # circular, mezcla, exportar / importar, iteración nativa,
                     # mover nodos, prueba de estrés de 500 nodos con sus métricas,
                     # pila (deshacer / rehacer), cola, montículo, letra en formato
                     # LRC, tabla hash, árbol AVL, índice y trie
npm run typecheck    # tipos de todo el proyecto
```

**`npm test`** ejecuta tres archivos:

- `tests/structures.test.ts` — **pruebas basadas en modelo**: cada estructura ejecuta cientos de
  operaciones al azar al lado de un arreglo o un `Map` que hace lo mismo, y ambos deben coincidir
  después de cada paso (la lista, además, con sus punteros `prev` / `next` verificados). El
  generador aleatorio tiene semilla fija, así que un fallo siempre se reproduce. También comprueba
  que el AVL no degenera con claves en orden y que `retain` es lineal con 20 000 valores.
- `tests/usePlaylist.test.ts` — la lógica de la playlist dentro de React: 500 acciones al azar
  (agregar, quitar, mover, mezclar, deshacer y rehacer) comparadas con un modelo que guarda copias
  completas, para comprobar que las operaciones inversas restauran exactamente lo mismo; el modo
  aleatorio sin repeticiones y su camino de vuelta; la cola; importar y cargar listas.

- `tests/visuals.test.ts` — lo que alimenta las vistas: los guiones paso a paso de insertar,
  quitar y mover terminan igual que la lista real en todas las posiciones y cambian como mucho dos
  punteros por paso; el AVL informa sus giros (incluido el caso doble); la tabla hash, el
  montículo y el trie exponen lo que se dibuja; y una galaxia sobrevive al viaje dentro de un
  enlace, mientras que un enlace alterado se rechaza.

`demo:dll` termina con `All checks passed ✔` y código de salida 0; si alguna comprobación
falla, la marca con `✘` y sale con código 1.

**Integración continua** (`.github/workflows/ci.yml`): en cada push a `main` y en cada pull
request, GitHub Actions ejecuta `typecheck`, `test` y `demo:dll`.

## Mejoras recientes

### Funciones nuevas

- **Panel «Estructuras»:** la lista paso a paso (puntero a puntero), el árbol AVL con sus giros
  y un laboratorio, el montículo, la tabla hash y las pilas de deshacer / rehacer, dibujados
  desde las estructuras reales. El trie se ve bajo el buscador mientras escribes.
- **Universo animado:** cometas que siguen a `next`, `prev` y `traverseToIndex`, estrellas que
  colapsan al salir, remolino al mezclar, salto entre galaxias, fundido entre modos y un fondo
  que late con la música (ver [Animaciones del universo](#animaciones-del-universo-srccomponentsuniversecanvastsx)).
- **Zoom y desplazamiento** del universo con rueda, pellizco, arrastre o teclado.
- **Universo con teclado:** las estrellas se recorren y se eligen sin ratón.
- **Letra sincronizada con la fuente Audio:** tocando el verso que suena.
- **Compartir una galaxia por enlace**, sin servidor.
- **Reducir movimiento** ahora también aquieta el universo del fondo.
- **Audio real:** la fuente *Audio* reproduce el fragmento de 30 s de iTunes, con el
  sintetizador como respaldo.
- **Carátulas:** en el reproductor, la lista, la búsqueda y la partícula actual.
- **Letra:** panel con la letra de LRCLIB; sincronizada con la canción en la fuente YouTube.
- **Reordenar arrastrando:** `move(from, to)` cambia un nodo de lugar solo re-enlazando punteros.
- **Cola "reproducir después":** una cola FIFO (`Queue`) sobre la lista doble.
- **Top y favoritas:** las cinco más escuchadas salen de un montículo (`Heap`).
- **Galaxias:** varias listas de reproducción con nombre.
- **Guardado automático:** listas, favoritas, conteos y preferencias sobreviven al recargar.
- **Barra de progreso con salto** y **controles multimedia del sistema**.
- **Deshacer / rehacer:** dos pilas (`Stack`) registran agregar, quitar, mover, mezclar e
  importar como operaciones inversas; `Ctrl+Z` / `Ctrl+Y` o los botones del panel de la
  constelación.
- **Índice secundario:** tablas hash por género y artista y un árbol AVL por tempo
  (`MusicIndex`) para filtrar y buscar sin recorrer toda la lista; sigue a la lista cambio a
  cambio en vez de reconstruirse.
- **Autocompletado:** el buscador sugiere títulos y artistas mientras escribes, con un trie.
- **Aleatorio sin repeticiones:** ninguna canción vuelve a sonar hasta que han sonado todas, y
  *Anterior* desanda los saltos.
- **Acceso directo a los nodos:** una tabla hash `uid → nodo` reemplaza los recorridos de la
  lista al sacar canciones de la cola y al vincular videos y carátulas.
- **Pruebas automáticas e integración continua:** Vitest y GitHub Actions.
- **Conexiones curvas:** los enlaces de la constelación son curvas de Bézier cúbicas que
  brillan, vibran y llevan chispas de energía mientras suena la música.
- **Animaciones de la lista:** al pulsar *Recorrer*, las estrellas del panel se iluminan una
  tras otra al ritmo del cometa; al viajar a una posición se ilumina el camino real de
  `traverseToIndex`, desde el inicio o desde el final según la mitad. La estrella que suena
  muestra un ecualizador, el *Top* se reacomoda cuando una canción sube de puesto, y el panel
  de diagnóstico resalta cada conteo que cambia y dibuja cuánto tardó cada fase de la prueba
  de estrés. Con "reducir movimiento" activado en el sistema, las de los paneles se apagan o
  pasan a ser fundidos y el universo del fondo queda quieto.
- **Iteración nativa:** la lista se recorre con `for...of`, spread y destructuración
  (ver [Iteración nativa](#iteración-nativa)).
- **Panel de diagnóstico:** métricas en vivo de `append`, `removeAt`, `traverseToIndex` y
  `shuffle` — veces ejecutadas, complejidad teórica y tiempos — con el botón *Diagnóstico* o
  la tecla `D`.
- **Prueba de estrés:** 500 nodos insertados, mezclados, recorridos y 250 eliminados al azar,
  verificando los punteros `prev` / `next` en cada fase; desde el panel o con
  `npm run demo:dll`.

### Errores corregidos

- **Sintetizador:** al terminar la vista previa de 45 s la canción no se podía volver a
  reproducir (última canción con *Repetir* apagado, o lista de una sola canción en bucle).
- **Pausa:** una pausa justo después de reproducir podía ignorarse.
- **Importar:** si el archivo traía canciones inválidas, el cursor quedaba en la canción
  equivocada.
- **Exportar:** en algunos navegadores la descarga se cancelaba.
- **Tooltip del universo:** si la lista cambiaba bajo el cursor, describía otra canción.
- **Atajos:** se disparaban también con Ctrl, Alt o Cmd (Alt + ← cambiaba de canción además
  de ir atrás en el navegador).
- **"Viajar a esa estrella":** con el campo vacío mostraba "No existe la posición 0".
- **Títulos de YouTube:** algunos caracteres especiales se decodificaban dos veces.
- **Servidor:** las cachés de búsqueda crecían sin límite; ahora tienen un tope de 200
  entradas.

### Rendimiento

- **Canvas:** el bucle de animación ya no recalcula el filtro ni crea colecciones nuevas en
  cada cuadro, y ya no busca la canción actual recorriendo la lista en cada cuadro: guarda la
  posición de cada canción y la rehace solo cuando la lista cambia.
- **YouTube:** los videos candidatos se verifican en paralelo en vez de uno por uno.
- **Búsqueda:** comprobar si una canción ya está en el catálogo es una consulta directa en
  lugar de un recorrido.
- **Paneles:** el historial y la barra de progreso hacen menos trabajo por actualización, y
  quitar una posición inexistente ya no redibuja la interfaz.

- **Cola:** depurar la cola pasó de O(n²) a O(n).
- **Deshacer:** agregar, quitar y mover guardan una posición en vez de una copia de la lista.

### Actualizaciones

- **Next.js 14 → 16 y React 18 → 19**, con sus tipos, y Vitest 5 para las pruebas.

### Limpieza

- Se eliminó la versión alternativa en Python (`python_app`) y sus referencias en la
  configuración del editor y en `.gitignore`. El proyecto es ahora solo la app web.

## Problemas frecuentes

- **No suena nada:** el navegador solo permite audio después de una interacción; pulsa
  reproducir o haz clic en una partícula.
- **Una canción suena sintetizada con la fuente *Audio*:** iTunes no tiene un fragmento de esa
  canción o no hay conexión.
- **Quiero empezar de cero:** borra los datos del sitio en el navegador; la app vuelve a la
  lista inicial.
- **El puerto 3000 está ocupado:** Next.js usa el siguiente libre (3001, …) y lo indica en la
  terminal.
- **Una canción dice que no tiene video o pista vinculada:** no se encontró un video que
  permita incrustarse, o faltan las credenciales de Spotify; usa el enlace "Buscar en…".
- **`npm audit` avisa de vulnerabilidades:** las que quedan vienen de dependencias de Tailwind
  CSS 3, que solo se usa al compilar los estilos y no forma parte de la app publicada. Se
  resuelven subiendo a Tailwind CSS 4, que cambia la forma de configurarlo.
- **`npm run build` falla en una unidad exFAT** (memorias USB y discos externos): copia el
  proyecto a un disco NTFS, por ejemplo `C:`, y compila allí.

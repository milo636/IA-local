# Atenea Local

Atenea Local es una IA/asistente local para Windows que corre en tu computadora desde `localhost`. Es gratuita, open source y local-first: no requiere cuentas, pagos, telemetria, analytics ni servidores externos del proyecto.

El objetivo es que cualquier persona pueda clonar el proyecto, ejecutarlo en su PC y automatizar tareas personales de forma segura y privada.

## Caracteristicas

- Interfaz web tipo chat en `http://127.0.0.1:3000`.
- Servidor local con Node.js y Express.
- Clasificador de intenciones hecho desde cero en Node.js.
- Motor conversacional propio para saludos, despedidas, ayuda y preguntas basicas.
- Memoria inteligente local con perfil de usuario.
- Favoritos y rutinas locales con ejecucion controlada.
- Agenda local con tareas unicas, diarias o semanales.
- Contexto explicable para consultar la accion anterior, sus permisos y su estado.
- Historial de conversaciones con busqueda local por contenido.
- Sugerencias contextuales que siempre se envian como mensajes normales.
- Busqueda de archivos por nombre, extension o categoria.
- Aprendizaje local desde la UI.
- Dataset editable, exportable y restaurable.
- Deteccion de texto sensible antes de guardar ejemplos.
- Modo debug para ver intencion, confidence y origen de respuesta.
- Sistema de permisos locales.
- Confirmacion para acciones riesgosas.
- Logs visibles y exportables.
- Sin APIs externas obligatorias.

## Uso rapido

```powershell
git clone https://github.com/milo636/IA-local.git
cd IA-local
npm install
npm start
```

Abrir:

[http://127.0.0.1:3000](http://127.0.0.1:3000/)

El servidor escucha solo en `127.0.0.1`.

## Interfaz

La interfaz esta pensada para uso local y diario:

- Chat principal con estados como `Atenea esta lista`, `Entrenando modelo...` y `Modelo actualizado`.
- Panel izquierdo con modo seguro, permisos y acciones disponibles.
- Panel derecho con IA local, comprension, contexto activo, conversacion, memoria, productividad, agenda, ejemplos aprendidos, comandos rapidos y logs.
- Panel de memoria con perfil, recuerdos editables, busqueda y exportacion.
- Modo debug para inspeccionar intencion, confidence y origen de respuesta.
- Boton para copiar respuestas del asistente.
- Toasts simples para exito, error y advertencias.
- Diseno oscuro responsive para desktop y mobile.

La barra lateral incluye un historial de conversaciones locales. Cada chat conserva sus propios mensajes, contexto corto, aclaraciones y confirmaciones pendientes. Se puede:

- crear una conversacion nueva
- cambiar de conversacion desde la barra lateral o el selector del encabezado
- renombrar conversaciones en linea
- borrar una conversacion con confirmacion explicita
- limpiar solamente el chat activo
- buscar texto dentro de todos los mensajes locales y saltar al resultado

Debajo del chat pueden aparecer sugerencias breves, por ejemplo para ver ayuda, filtrar una busqueda anterior o completar una aclaracion. Pulsarlas equivale a escribir ese texto en el chat: no ejecutan codigo directamente y cualquier accion sigue pasando por `safety.js`, `permissions.js` y las confirmaciones correspondientes. Atenea no sugiere `CONFIRMAR` ni acciones de alto riesgo.

Los chats existentes en el formato anterior de `data/memory.json` se migran automaticamente como la primera conversacion. Cambiar de chat no ejecuta acciones y una confirmacion pendiente nunca pasa a otra conversacion.

## Captura / placeholder de interfaz

```text
+----------------------+--------------------------------+----------------------+
| Modo seguro          | Chat                           | IA local             |
| Permisos             | Atenea esta lista              | Conversacion         |
| Acciones             | Mensajes + debug opcional      | Ejemplos / Logs      |
+----------------------+--------------------------------+----------------------+
```

Cuando haya capturas reales, se pueden guardar en `docs/screenshots/`.

## Instalacion

Requisitos:

- Windows 10/11
- Node.js 18 o superior
- Git recomendado

Instalar dependencias:

```powershell
npm install
```

Ejecutar:

```powershell
npm start
```

Probar:

```powershell
npm test
```

## Comandos disponibles

Escribi estos comandos en el chat:

```text
ayuda
abrir chrome
abrir bloc de notas
abrir explorador
crear carpeta llamada X en escritorio
listar archivos de descargas
buscar archivos que contengan X
buscar archivos pdf que contengan factura
buscar imagenes que contengan logo
crear nota llamada X con este texto: ...
mostrar estado del sistema
organizar descargas por tipo
guardar como favorito abrir chrome
mostrar favoritos
ejecutar favorito chrome
borrar favorito chrome
crear rutina llamada inicio con abrir chrome y abrir explorador
mostrar rutinas
ejecutar rutina inicio
borrar rutina inicio
```

`organizar descargas por tipo` mueve archivos dentro de Descargas y pide confirmacion:

```text
Esta accion necesita confirmacion. Escribi CONFIRMAR para continuar.
```

Las busquedas comparan nombres visibles en Escritorio, Descargas y Documentos. Pueden filtrar por extension o por las categorias `imagenes` y `documentos`, muestran la carpeta encontrada, limitan la salida a 100 resultados y nunca leen el contenido de los archivos.

## Productividad local

El panel `Productividad` permite guardar comandos frecuentes como favoritos y combinar hasta diez comandos permitidos en una rutina. Los datos viven en:

```text
data/favorites.json
data/routines.json
```

Guardar un favorito o una rutina no ejecuta acciones. Al ejecutar, cada comando se vuelve a validar mediante el agente, `safety.js` y `permissions.js`. Si una accion requiere confirmacion, la rutina se pausa, guarda localmente los pasos restantes y continua solamente despues de escribir `CONFIRMAR`.

Desde la interfaz se puede:

- crear un favorito manualmente o desde el ultimo comando del chat
- ejecutar y borrar favoritos
- crear rutinas con un comando por linea
- ejecutar y borrar rutinas
- exportar favoritos, rutinas o todos los datos locales en JSON

Las rutinas no aceptan shell, comandos arbitrarios ni acciones fuera de la allowlist.

## Agenda local

El panel `Agenda local` permite preparar un comando permitido para una fecha futura y repetirlo cada dia o cada semana. Los datos se guardan en:

```text
data/scheduledTasks.json
```

Crear, editar, pausar o borrar una tarea no ejecuta su comando. Desde la interfaz se puede:

- programar una tarea unica, diaria o semanal
- ver tareas pendientes, pausadas y completadas
- ejecutar manualmente mediante el agente seguro
- pausar, reanudar o borrar con confirmacion
- exportar la agenda en JSON local

La ejecucion automatica esta desactivada por defecto mediante `allowScheduledActions: false`. Si el usuario activa ese permiso, el temporizador solo admite acciones de lectura: ayuda, estado del sistema, listar Descargas y buscar archivos. Abrir aplicaciones, crear carpetas o notas y organizar archivos siempre queda en modo manual. Toda ejecucion vuelve a pasar por la allowlist, `safety.js` y `permissions.js`.

El temporizador funciona solamente mientras el servidor de Atenea esta abierto. Esta fase no instala servicios, tareas de Windows ni procesos persistentes ocultos.

## Contexto explicable

Atenea conserva un contexto estructurado separado para la ultima accion de cada conversacion. Este contexto no reemplaza la memoria de largo plazo y no guarda una copia adicional del texto privado. Permite preguntar:

```text
que hiciste recien
eso es seguro
que permiso usa esa accion
por que necesita confirmacion
mostrame el contexto activo
```

La respuesta se genera con metadatos allowlisted: tipo de accion, estado, permiso y necesidad de confirmacion. Nunca repite el comando original, entidades, rutas ni contenido de notas. Preguntar por el contexto no ejecuta ni repite acciones.

Si hay una confirmacion pendiente, una pregunta contextual la mantiene detenida. El panel `Contexto activo` permite olvidar la accion anterior sin borrar mensajes, recuerdos ni perfil. No se puede limpiar ese contexto mientras haya una confirmacion o aclaracion pendiente.

## Conversacion basica

Atenea puede responder sin modelos externos a frases como:

```text
hola
buenas
quien sos
que podes hacer
como funcionas
gracias
chau
ok
```

La conversacion no ejecuta acciones. Solo genera respuestas locales desde `data/conversations.json` y `data/conversationModel.json`.

## Memoria inteligente

Atenea puede guardar recuerdos locales para personalizar respuestas sin usar servicios externos. La memoria se divide en:

- Memoria corta: ultimos mensajes y contexto de la conversacion actual.
- Memoria larga: recuerdos guardados por el usuario y perfil local persistente.

Comandos de memoria:

```text
recorda que uso Chrome
recorda que mi carpeta principal es Descargas
mostrar recuerdos
que recordas de mi
buscar recuerdos navegador
olvida Chrome
cual es mi navegador favorito?
eso que te dije recien
la carpeta anterior
el archivo que buscamos
```

Los recuerdos se guardan en `data/userProfile.json`. No se suben a internet.

## Perfil de usuario

El perfil local puede guardar datos como:

```json
{
  "preferredBrowser": "Chrome",
  "preferredTheme": "Dark",
  "favoriteFolders": ["Descargas"],
  "customPreferences": {}
}
```

El perfil se actualiza desde recuerdos explicitos. Por ejemplo, si escribis `recorda que uso Chrome`, Atenea guarda el recuerdo y marca Chrome como navegador preferido.

La UI incluye un panel `Memoria` para:

- ver recuerdos guardados
- ver resumen del perfil
- agregar recuerdos
- editar recuerdos
- eliminar recuerdos
- buscar recuerdos
- exportar memoria

## Entrenamiento conversacional

El motor conversacional usa ejemplos locales para detectar intenciones como saludos, despedidas, agradecimientos, identidad, funciones, seguridad, ayuda y errores.

Desde la UI:

1. Activar `Modo debug`.
2. Enviar una frase.
3. Usar `Aprender respuesta`.
4. Elegir una intencion conversacional permitida.
5. Escribir la respuesta correcta.
6. Guardar y reentrenar localmente.

No se permiten intenciones arbitrarias desde la UI. Aprender una respuesta no ejecuta acciones.

## Entrenar Atenea

Entrenar modelos locales:

```powershell
npm run train
```

Este comando entrena:

- `data/localAIModel.json`
- `data/conversationModel.json`

Agregar ejemplo de comando por terminal:

```powershell
npm run train -- add open_app "abrir chrome por favor"
```

## Modo aprendizaje

Desde la UI:

1. Activar `Modo debug`.
2. Enviar un mensaje.
3. Revisar intencion y confidence.
4. Usar `Corregir intencion` para comandos.
5. Usar `Aprender respuesta` para conversacion.
6. Guardar el ejemplo localmente.

El aprendizaje actualiza archivos JSON locales y reentrena el modelo correspondiente.

## Modo debug

El modo debug muestra:

- intencion detectada
- confidence
- si se uso IA local
- modo `command` o `conversation`
- origen de respuesta conversacional: `base` o `learned`

El debug de comandos muestra la intencion principal y secundaria, confidence, margen entre ambas, palabras relevantes, entidades extraidas, contexto reutilizado y motivo del fallback. Tambien indica si Atenea necesita una aclaracion o confirmacion. Los valores sensibles se ocultan antes de mostrarlos.

## Comprension avanzada

Atenea combina ejemplos locales, similitud de palabras, bigramas, tolerancia a errores tipograficos y normalizacion de verbos frecuentes en espanol rioplatense. El clasificador compara varios ejemplos por intencion y usa un margen minimo entre las dos mejores opciones. Cuando el resultado tiene baja confianza o es ambiguo, responde con un fallback y no ejecuta acciones.

El extractor local identifica aplicaciones, nombres de carpetas y notas, texto de notas, terminos de busqueda, extensiones, limites y referencias a favoritos o rutinas. Si falta un dato obligatorio, Atenea lo pregunta y guarda una aclaracion pendiente. La respuesta del usuario vuelve a pasar por `safety.js`, `permissions.js` y la allowlist antes de cualquier accion.

El contexto corto permite continuaciones controladas como:

```text
buscar archivos que contengan factura
solamente los PDF
```

Tambien permite guardar el ultimo comando ejecutado como favorito. Una correccion posterior a una accion ya ejecutada nunca renombra ni modifica archivos automaticamente.

Para medir el modelo sin ejecutar acciones ni cambiar el dataset:

```bash
npm run evaluate
```

La interfaz incluye el panel **Comprension** con precision, aciertos, fallos, casos ambiguos, fecha de evaluacion y errores recientes. El conjunto de casos esta en `data/evaluationData.json` y el ultimo informe local en `data/evaluationResults.json`.

## Seguridad local

Atenea Local aplica estas reglas:

- Todo funciona localmente.
- No hay telemetria.
- No hay analytics.
- No hay tracking.
- No se suben archivos a internet.
- No se envian datos privados a servidores del proyecto.
- No hay pagos ni Stripe.
- No hay cuentas obligatorias.
- Las acciones disponibles usan allowlist.
- Las acciones riesgosas requieren confirmacion.
- La IA conversacional no ejecuta acciones.
- La memoria no ejecuta acciones.
- Guardar, editar, buscar o borrar recuerdos no toca archivos fuera de `data/userProfile.json`.
- Las acciones reales siguen pasando por `safety.js` y `permissions.js`.
- Los favoritos y rutinas no ejecutan nada al guardarse.
- Cada paso guardado se valida otra vez antes de ejecutarse.
- Una rutina se detiene si cambian los permisos o un paso deja de ser valido.
- Los permisos viven en `data/settings.json`.
- Los logs viven en `data/logs.json`.
- La memoria local vive en `data/memory.json`.
- El perfil y recuerdos largos viven en `data/userProfile.json`.

Permisos por defecto:

```json
{
  "safeMode": true,
  "allowOpenApps": true,
  "allowFileRead": true,
  "allowFileWrite": true,
  "allowDelete": false,
  "allowShellCommands": false,
  "allowNetwork": false
}
```

Antes de guardar ejemplos nuevos, Atenea busca:

- emails
- contrasenas
- tokens/API keys
- rutas personales
- numeros largos
- posibles claves privadas
- datos bancarios

Si detecta algo sensible, muestra una advertencia y permite cancelar.

Antes de guardar recuerdos nuevos, Atenea bloquea automaticamente datos sensibles. No guarda contrasenas, tokens, claves privadas, rutas personales, numeros largos ni datos bancarios como recuerdos.

## Arquitectura del proyecto

```text
IA-local/
  package.json
  README.md
  LICENSE
  SECURITY.md
  CONTRIBUTING.md
  server.js
  public/
    index.html
    styles.css
    app.js
  src/
    agent.js
    actions.js
    commandParser.js
    conversationAI.js
    contextExplainer.js
    entityExtractor.js
    evaluateLocalAI.js
    favorites.js
    fileManager.js
    localAI.js
    logger.js
    memory.js
    memoryEngine.js
    permissions.js
    routines.js
    safety.js
    scheduler.js
    sensitiveText.js
    trainLocalAI.js
  data/
    baseTrainingData.json
    conversations.json
    conversationModel.json
    evaluationData.json
    evaluationResults.json
    favorites.json
    localAIModel.json
    logs.json
    memory.json
    routines.json
    scheduledTasks.json
    settings.json
    trainingData.json
    userProfile.json
  tests/
```

## Endpoints locales

```text
GET    /api/health
GET    /api/state
POST   /api/chat
POST   /api/chat/clear
POST   /api/settings
GET    /api/logs/export

GET    /api/conversations
GET    /api/conversations/search?q=texto
POST   /api/conversations
POST   /api/conversations/:id/activate
PUT    /api/conversations/:id
DELETE /api/conversations/:id

GET    /api/memory
GET    /api/memory/search?q=texto
GET    /api/memory/export
POST   /api/memory
PUT    /api/memory/:id
DELETE /api/memory/:id

GET    /api/ai/intents
GET    /api/ai/examples
POST   /api/ai/learn
POST   /api/ai/train
POST   /api/ai/evaluate
PUT    /api/ai/examples/:id
DELETE /api/ai/examples/:id
POST   /api/ai/dataset/export
POST   /api/ai/dataset/restore-base

GET    /api/conversation/intents
POST   /api/conversation/learn
POST   /api/conversation/train

GET    /api/context
POST   /api/context/clear

GET    /api/favorites
POST   /api/favorites
DELETE /api/favorites/:id
POST   /api/favorites/:id/run
GET    /api/favorites/export

GET    /api/routines
POST   /api/routines
DELETE /api/routines/:id
POST   /api/routines/:id/run
GET    /api/routines/export

GET    /api/scheduled-tasks
POST   /api/scheduled-tasks
PUT    /api/scheduled-tasks/:id
DELETE /api/scheduled-tasks/:id
POST   /api/scheduled-tasks/:id/run
GET    /api/scheduled-tasks/export

GET    /api/export/all
```

## Capturas de pantalla

Capturas recomendadas para el repositorio:

- pantalla principal del chat
- panel de IA local
- panel de conversacion
- modo debug
- advertencia de texto sensible

Las capturas deben guardarse en una carpeta como `docs/screenshots/` cuando se agreguen.

## Contribuciones

Las contribuciones son bienvenidas. Ver `CONTRIBUTING.md`.

Reglas principales:

- No agregar APIs externas obligatorias.
- No agregar telemetria.
- No guardar secretos reales en datasets.
- No crear intenciones nuevas sin actualizar seguridad, permisos, tests y documentacion.
- Ejecutar `npm test` antes de proponer cambios.

## Roadmap

Fase 3.1 completada:

- Mejora visual completa de la UI.
- Entrenamiento conversacional ampliado.
- Estados de carga, toasts y copia de respuestas.

Fase 4 completada:

- Memoria corta y referencias simples de contexto.
- Memoria larga con recuerdos editables.
- Perfil local de usuario.
- Busqueda semantica simple por palabras.
- Exportacion de memoria.

Fase 5 completada:

- Favoritos locales para comandos frecuentes.
- Rutinas de acciones allowlisted con pausa por confirmacion.
- Panel de productividad responsive.
- Busqueda por nombre, extension y categoria.
- Exportacion local de favoritos, rutinas y paquete completo.
- Tests de almacenamiento, endpoints, safety y busqueda.

Fase 6 completada:

- Comprension avanzada con similitud por palabras y tolerancia a errores.
- Extraccion local de entidades y aclaraciones de datos faltantes.
- Contexto corto seguro para continuaciones.
- Evaluacion reproducible con metricas y matriz de confusion.
- Panel de comprension y debug ampliado.

Mejoras continuas completadas:

- Historial de conversaciones completamente local.
- Migracion compatible del chat anterior.
- Contexto, aclaraciones y confirmaciones aisladas por conversacion.
- Selector responsive, renombrado en linea y borrado confirmado.
- Busqueda de mensajes entre conversaciones con salto al resultado.
- Sugerencias contextuales explicables y sin ejecucion directa.
- Contexto activo sanitizado para explicar acciones, permisos y confirmaciones.
- Seguimientos conversacionales que no repiten la ejecucion anterior.

Fase 7 completada:

- Agenda local con tareas unicas, diarias y semanales.
- Ejecucion manual revalidada por safety y permisos.
- Autoejecucion opcional, apagada por defecto y limitada a lectura.
- Pausa, reanudacion, exportacion y borrado confirmado.
- Panel responsive y tests de seguridad/endpoints.

Fase 8:

- App de escritorio con Electron.

Fase 9:

- Comunidad de automatizaciones seguras con revision y firmas.

Futuro opcional:

- Conexion con modelos locales o APIs externas solo si el usuario configura su propia key.
- Automatizacion de mouse y teclado con permisos explicitos.

## Licencia

MIT. Ver `LICENSE`.

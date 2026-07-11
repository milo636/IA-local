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
- Panel derecho con IA local, conversacion, memoria, productividad, ejemplos aprendidos, comandos rapidos y logs.
- Panel de memoria con perfil, recuerdos editables, busqueda y exportacion.
- Modo debug para inspeccionar intencion, confidence y origen de respuesta.
- Boton para copiar respuestas del asistente.
- Toasts simples para exito, error y advertencias.
- Diseno oscuro responsive para desktop y mobile.

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
    favorites.js
    fileManager.js
    localAI.js
    logger.js
    memory.js
    memoryEngine.js
    permissions.js
    routines.js
    safety.js
    sensitiveText.js
    trainLocalAI.js
  data/
    baseTrainingData.json
    conversations.json
    conversationModel.json
    favorites.json
    localAIModel.json
    logs.json
    memory.json
    routines.json
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
PUT    /api/ai/examples/:id
DELETE /api/ai/examples/:id
POST   /api/ai/dataset/export
POST   /api/ai/dataset/restore-base

GET    /api/conversation/intents
POST   /api/conversation/learn
POST   /api/conversation/train

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

Fase 6:

- Tareas programadas con permisos y confirmaciones.

Fase 7:

- App de escritorio con Electron.

Fase 8:

- Comunidad de automatizaciones seguras con revision y firmas.

Futuro opcional:

- Conexion con modelos locales o APIs externas solo si el usuario configura su propia key.
- Automatizacion de mouse y teclado con permisos explicitos.

## Licencia

MIT. Ver `LICENSE`.

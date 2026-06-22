# SAW Local / Atenea Local

SAW Local es un asistente local para Windows que corre en tu propia computadora desde `localhost`. La primera version, Atenea Local, permite ejecutar comandos personales simples desde una interfaz web tipo chat, con modo seguro, permisos locales, confirmaciones y logs visibles.

Este proyecto es gratuito, sin fines de lucro y open source bajo licencia MIT.

## Principios

- No es un SaaS.
- No tiene pagos ni Stripe.
- No requiere cuentas de usuario.
- No incluye telemetria, analytics ni tracking.
- No sube archivos a internet.
- No envia datos privados a servidores del proyecto.
- Todo corre localmente en tu PC.
- Las acciones disponibles usan allowlist.
- Las acciones riesgosas requieren confirmacion.

## Stack

- Node.js
- Express
- HTML, CSS y JavaScript sin framework
- JSON local para memoria, configuracion y logs
- Windows como prioridad
- Preparado para evolucionar hacia Electron

## Instalacion

Requisitos:

- Windows 10/11
- Node.js 18 o superior
- Git opcional, pero recomendado

Clonar o descargar el proyecto:

```powershell
git clone https://github.com/tu-usuario/saw-local.git
cd saw-local/atenea-local
npm install
```

Si descargaste un ZIP, entra en la carpeta `atenea-local` y ejecuta:

```powershell
npm install
```

## Ejecutar

```powershell
npm start
```

Abrir en el navegador:

```text
http://127.0.0.1:3000
```

El servidor escucha solo en `127.0.0.1`, no en la red local.

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
crear nota llamada X con este texto: ...
mostrar estado del sistema
organizar descargas por tipo
```

`organizar descargas por tipo` mueve archivos dentro de Descargas y siempre pide confirmacion:

```text
Esta acción necesita confirmación. Escribí CONFIRMAR para continuar.
```

Para continuar:

```text
CONFIRMAR
```

## Permisos locales

La configuracion vive en `data/settings.json`:

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

En Fase 1, la interfaz permite alternar:

- modo seguro
- abrir aplicaciones
- leer archivos
- crear o mover archivos

Los permisos de borrado, shell y red quedan desactivados en la interfaz de Fase 1. Aunque los cambies manualmente en JSON, esta version no implementa comandos para borrar archivos, ejecutar shell arbitrario ni usar red.

## Seguridad

SAW Local aplica estas reglas en la Fase 1:

- Modo seguro activado por defecto.
- Allowlist de acciones implementadas.
- Blocklist de patrones peligrosos.
- Sin ejecucion de comandos shell arbitrarios.
- Sin borrado de archivos.
- Sin compras, emails o mensajes.
- Sin subida de archivos.
- No toca contrasenas, tokens, claves privadas ni `.env`.
- Las acciones quedan registradas en `data/logs.json`.
- La memoria de chat queda en `data/memory.json`.
- La configuracion queda en `data/settings.json`.

Las busquedas de archivos revisan nombres visibles en Escritorio, Descargas y Documentos. No leen el contenido de archivos.

## Logs

Los ultimos logs se ven en el panel lateral. Tambien podes exportarlos desde el boton `Exportar logs`.

Archivo local:

```text
data/logs.json
```

## Desarrollo

```powershell
npm install
npm run train
npm start
npm test
```

## IA local propia

La Fase 1 incluye un clasificador local simple hecho desde cero en Node.js. No usa ChatGPT, OpenAI, Claude, Gemini, Ollama, modelos preentrenados ni librerias pesadas de machine learning.

El proyecto acepta contribuciones para mejorar el dataset de entrenamiento. Ver `CONTRIBUTING.md` para agregar ejemplos nuevos de forma segura.

Archivos:

```text
src/localAI.js
src/sensitiveText.js
src/trainLocalAI.js
data/baseTrainingData.json
data/trainingData.json
data/localAIModel.json
```

Como funciona:

- Limpia el texto del usuario.
- Tokeniza palabras.
- Entrena pesos por palabra desde ejemplos locales.
- Compara el texto entrante contra ejemplos y perfiles de intencion.
- Devuelve una intencion y una confidence entre 0 y 1.
- Si la confidence es baja, responde que no entendio.

Entrenar:

```powershell
npm run train
```

Agregar un ejemplo nuevo y reentrenar:

```powershell
npm run train -- add open_app "abrí chrome por favor"
```

Tambien se puede ensenar desde la interfaz web:

1. Activar `Modo debug` en el chat.
2. Enviar un comando.
3. Revisar la intencion detectada y la confidence debajo de la respuesta.
4. Usar `Corregir intencion`.
5. Elegir una intencion permitida del selector.
6. Guardar el ejemplo. Atenea lo agrega a `data/trainingData.json` y reentrena `data/localAIModel.json`.

Fase 2.1 agrega control seguro del dataset desde la UI:

- deteccion de emails, contrasenas, tokens/API keys, rutas personales, numeros largos y posibles claves privadas
- advertencia con opcion de cancelar o guardar igualmente
- panel `Ejemplos aprendidos` para filtrar por intencion
- edicion y borrado de ejemplos sin ejecutar acciones locales
- backup automatico en `data/backups/` antes de modificar `trainingData.json`
- exportacion del dataset
- restauracion de `data/baseTrainingData.json`

El panel `IA local` muestra:

- estado del modelo
- cantidad de ejemplos
- cantidad de intenciones
- ultima fecha de entrenamiento
- boton `Reentrenar`

Endpoints locales de aprendizaje:

```text
GET  /api/ai/intents
GET  /api/ai/examples
POST /api/ai/learn
POST /api/ai/train
PUT  /api/ai/examples/:id
DELETE /api/ai/examples/:id
POST /api/ai/dataset/export
POST /api/ai/dataset/restore-base
```

Ejemplo de `POST /api/ai/learn`:

```json
{
  "text": "mostrame mis descargas",
  "intent": "list_downloads"
}
```

Intenciones disponibles:

```text
help
open_app
create_folder
list_downloads
search_files
create_note
system_status
organize_downloads
unknown
```

Importante: la IA local solo decide la intencion. No ejecuta acciones. Las acciones siguen pasando por `safety.js`, `permissions.js`, allowlist y confirmaciones.

Estructura principal:

```text
atenea-local/
  package.json
  README.md
  LICENSE
  .gitignore
  server.js
  public/
    index.html
    styles.css
    app.js
  src/
    agent.js
    actions.js
    safety.js
    memory.js
    fileManager.js
    commandParser.js
    localAI.js
    logger.js
    permissions.js
  data/
    memory.json
    settings.json
    logs.json
    baseTrainingData.json
    trainingData.json
    localAIModel.json
```

## Roadmap

Fase 2:

- Conexion opcional con IA real usando API key del usuario.
- Soporte para modelos locales tipo Ollama.

Fase 3:

- Automatizacion de mouse y teclado con permisos.

Fase 4:

- Tareas programadas.

Fase 5:

- App de escritorio con Electron.

Fase 6:

- Marketplace/comunidad de automatizaciones seguras.

## Riesgos pendientes

- Abrir aplicaciones depende de que Windows encuentre el ejecutable instalado.
- Organizar Descargas mueve archivos; por eso requiere confirmacion y no borra nada.
- La deteccion de archivos sensibles es defensiva, pero no perfecta.
- No hay autenticacion porque el servidor esta pensado para `127.0.0.1`; no lo expongas a internet.
- Todavia no hay aislamiento por usuario ni firma de automatizaciones.

## Licencia

MIT. Ver `LICENSE`.

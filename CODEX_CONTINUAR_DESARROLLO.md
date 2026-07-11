# Prompt para continuar Atenea Local en Codex

Copiar y pegar este archivo en Codex cuando quieras seguir desarrollando el proyecto.

## Contexto del proyecto

Estoy trabajando en Atenea Local, una IA/asistente local para Windows.

Repositorio local:

```text
C:\Users\Usuario\OneDrive\Documentos\IA Local\Trabajo\IA Local
```

Repositorio GitHub:

```text
https://github.com/milo636/IA-local
```

El proyecto debe seguir siendo:

- Gratis.
- Open source.
- Local-first.
- Sin SaaS.
- Sin pagos.
- Sin Stripe.
- Sin cuentas obligatorias.
- Sin telemetria.
- Sin analytics.
- Sin tracking.
- Sin subir archivos privados a servidores.
- Sin OpenAI, Claude, Gemini, Ollama ni APIs externas por defecto.
- Compatible con Windows como prioridad.
- Compatible a futuro con Electron.

Stack actual:

- Node.js
- Express
- HTML/CSS/JS
- JSON local para memoria, configuracion, logs y entrenamiento

## Estado actual

Atenea Local ya tiene:

- Servidor local Express.
- UI web tipo chat.
- Comandos locales basicos.
- Sistema de permisos.
- Confirmacion para acciones riesgosas.
- Logs visibles.
- Configuracion local.
- Clasificador de intenciones propio en Node.js.
- Dataset local de entrenamiento.
- Aprendizaje de intenciones desde la UI.
- Seguridad del dataset con backups.
- Motor conversacional local.
- Entrenamiento conversacional.
- Modo debug.
- Memoria inteligente.
- Perfil de usuario local.
- Panel de memoria en la UI.
- Tests automatizados.

## Reglas obligatorias

No romper seguridad.

La IA solo puede decidir intenciones o respuestas. Las acciones reales siempre deben pasar por:

- `src/safety.js`
- `src/permissions.js`
- confirmaciones cuando corresponda
- allowlist/blocklist
- logs

Nunca ejecutar acciones directamente desde:

- `src/localAI.js`
- `src/conversationAI.js`
- `src/memoryEngine.js`

No guardar informacion sensible:

- contrasenas
- tokens
- API keys
- claves privadas
- datos bancarios
- rutas personales sensibles
- numeros largos sospechosos

No exponer el servidor a internet. Debe seguir usando localhost.

## Objetivo de la proxima fase

Implementar una nueva fase de mejoras para Atenea Local agregando mas funciones utiles, manteniendo todo local y seguro.

Nombre sugerido:

```text
Fase 5: Automatizaciones locales seguras
```

## Funciones a agregar

### 1. Tareas favoritas

Permitir guardar comandos frecuentes como favoritos.

Ejemplos:

- "guardar como favorito abrir chrome"
- "guardar como favorito listar descargas"
- "mostrar favoritos"
- "ejecutar favorito chrome"
- "borrar favorito chrome"

Crear archivo:

```text
data/favorites.json
```

Crear modulo:

```text
src/favorites.js
```

La ejecucion de un favorito debe pasar por el agente normal, safety y permisos. Guardar un favorito no debe ejecutar nada.

### 2. Plantillas de automatizacion

Permitir crear plantillas simples de varias acciones permitidas.

Ejemplos:

- "crear rutina llamada inicio con abrir chrome y abrir explorador"
- "mostrar rutinas"
- "ejecutar rutina inicio"
- "borrar rutina inicio"

Crear archivo:

```text
data/routines.json
```

Crear modulo:

```text
src/routines.js
```

Reglas:

- Las rutinas solo pueden contener acciones ya permitidas.
- Cada accion riesgosa dentro de una rutina debe pedir confirmacion.
- Una rutina no puede ejecutar comandos arbitrarios.
- Una rutina no puede borrar archivos si `allowDelete` esta en false.
- Registrar todo en logs.

### 3. Mejoras en busqueda de archivos

Mejorar la funcion de buscar archivos para:

- Buscar por nombre parcial.
- Filtrar por extension.
- Limitar cantidad de resultados.
- Mostrar carpeta donde se encontro.
- No leer contenido de archivos sensibles.

Ejemplos:

- "buscar archivos que contengan factura"
- "buscar archivos pdf que contengan factura"
- "buscar imagenes que contengan logo"

### 4. Panel UI de productividad

Agregar en la interfaz un panel nuevo:

```text
Productividad
```

Debe mostrar:

- favoritos guardados
- rutinas guardadas
- boton para crear favorito desde el ultimo comando
- boton para ejecutar favorito
- boton para borrar favorito
- boton para exportar favoritos/rutinas

Debe ser responsive y mantener el estilo oscuro actual.

### 5. Exportacion local

Agregar botones para exportar:

- logs
- memoria
- dataset
- favoritos
- rutinas

La exportacion debe descargar JSON local desde el navegador. No subir nada a internet.

### 6. Tests

Agregar tests para:

- crear favorito
- borrar favorito
- listar favoritos
- guardar favorito sin ejecutar accion
- ejecutar favorito pasando por safety
- crear rutina
- borrar rutina
- ejecutar rutina pasando por safety
- bloquear rutina con accion no permitida
- busqueda de archivos con extension
- endpoints nuevos

## Endpoints sugeridos

Agregar endpoints locales:

```text
GET /api/favorites
POST /api/favorites
DELETE /api/favorites/:id
POST /api/favorites/:id/run

GET /api/routines
POST /api/routines
DELETE /api/routines/:id
POST /api/routines/:id/run

GET /api/export/all
```

Todos deben validar entrada, registrar logs y respetar seguridad.

## README

Actualizar `README.md` con:

- tareas favoritas
- rutinas
- panel productividad
- ejemplos de uso
- endpoints nuevos
- riesgos de seguridad
- roadmap actualizado

## Verificacion obligatoria

Antes de terminar:

```powershell
npm test
```

Tambien verificar:

```powershell
npm start
```

Abrir:

```text
http://127.0.0.1:3000
```

Probar desde la UI:

- crear favorito
- ejecutar favorito
- borrar favorito
- crear rutina
- ejecutar rutina
- revisar logs
- exportar datos

## Git

Al terminar:

```powershell
git status
git add .
git commit -m "Agregar automatizaciones locales seguras"
git push origin main
```

No commitear datos privados ni logs reales si contienen informacion personal.

## Respuesta final esperada

Al final, explicar:

- archivos creados
- archivos modificados
- funciones agregadas
- como ejecutarlo
- como probar desde la UI
- comandos de prueba
- tests ejecutados
- riesgos pendientes
- proximas mejoras recomendadas

# Contribuir a Atenea Local

Gracias por ayudar a mejorar Atenea Local. El objetivo del proyecto es mantener una IA local, gratuita, privada y entrenable por la comunidad.

## Como agregar ejemplos de entrenamiento

Los ejemplos viven en `data/trainingData.json`.

Cada intencion tiene una lista de frases. Para mejorar la IA:

1. Elegi una intencion existente.
2. Agrega frases reales que una persona podria escribir.
3. No agregues datos privados, tokens, contrasenas, nombres reales, rutas personales ni informacion sensible.
4. Ejecuta el entrenamiento local.
5. Ejecuta los tests.

```powershell
npm run train
npm test
```

## Como agregar respuestas conversacionales

La conversacion vive en `data/conversations.json`.

Para mejorarla:

1. Elegi una intencion conversacional existente.
2. Agrega frases de ejemplo realistas.
3. Agrega respuestas breves, claras y locales.
4. No agregues instrucciones que ejecuten acciones, salteen permisos o prometan capacidades que no existen.
5. Ejecuta entrenamiento y tests.

```powershell
npm run train
npm test
```

## Intenciones permitidas

- `help`
- `open_app`
- `create_folder`
- `list_downloads`
- `search_files`
- `create_note`
- `system_status`
- `organize_downloads`
- `unknown`

No agregues intenciones nuevas sin actualizar primero la seguridad, los permisos, los tests y la documentacion.

## Reglas de seguridad

- La IA solo clasifica intenciones.
- La IA no debe ejecutar acciones directamente.
- Toda accion debe pasar por `safety.js` y `permissions.js`.
- No se aceptan ejemplos que pidan borrar archivos, robar datos, leer secretos, enviar mensajes, hacer compras o subir archivos a internet.
- No se aceptan ejemplos con emails reales, tokens/API keys, rutas personales, numeros privados o claves privadas.
- No se aceptan respuestas conversacionales que pidan enviar datos, borrar archivos o ejecutar comandos reales.
- No se aceptan APIs externas obligatorias ni telemetria.

## Antes de abrir un pull request

Ejecuta:

```powershell
npm test
```

Si cambiaste `data/trainingData.json`, ejecuta tambien:

```powershell
npm run train
```

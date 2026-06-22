# Politica de seguridad

SAW Local es local-first: la Fase 1 no incluye cuentas, telemetria, analytics, pagos, envio de archivos ni servidor externo del proyecto.

La Fase 2.1 mantiene el aprendizaje local y agrega advertencias antes de guardar ejemplos que parezcan contener datos sensibles.

## Alcance

Se consideran reportes de seguridad:

- Ejecucion de comandos fuera de la allowlist.
- Borrado o modificacion no confirmada de archivos.
- Lectura de rutas sensibles como `.env`, `.ssh`, tokens, claves privadas o contrasenas.
- Cualquier envio de datos a red no solicitado por el usuario.
- Persistencia de logs o memoria con informacion sensible innecesaria.
- Guardado de ejemplos de entrenamiento con emails, contrasenas, tokens, rutas personales, numeros largos o claves privadas sin advertencia previa.
- Bypass del modo seguro o de permisos locales.

## Fuera de alcance en Fase 1

- Automatizaciones con mouse/teclado, porque todavia no existen.
- Integraciones con APIs de IA, porque todavia no existen.
- Modelos locales tipo Ollama, porque todavia no existen.
- Electron, porque todavia no existe.

## Reportar un problema

Abrir un issue publico en GitHub si el reporte no contiene datos privados. Si el reporte incluye datos sensibles, no pegarlos en el issue: describir el impacto y preparar un ejemplo minimo sin secretos.

## Principios de mitigacion

- Preferir deny-by-default.
- Mantener `safeMode` activo por defecto.
- Agregar acciones nuevas solo mediante allowlist.
- Pedir confirmacion para acciones que mueven, modifican o puedan exponer datos.
- Crear backup local de `data/trainingData.json` antes de modificar el dataset.
- Nunca implementar borrado, red o shell arbitrario sin permisos y confirmacion explicita.

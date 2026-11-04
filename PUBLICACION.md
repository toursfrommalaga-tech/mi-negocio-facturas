# Publicación verificada · 4 de noviembre de 2026

Aplicación: [Mi negocio · espacio personal](https://toursfrommalaga-tech.github.io/mi-negocio-facturas/).

Código: [toursfrommalaga-tech/mi-negocio-facturas](https://github.com/toursfrommalaga-tech/mi-negocio-facturas).

Se ha creado un repositorio independiente y público. Los repositorios anteriores se han conservado. La rama `main` contiene código y documentación; `gh-pages` contiene exclusivamente los archivos estáticos de `site/`. GitHub confirma Pages en estado `built`, con HTTPS obligatorio y origen `gh-pages` en la carpeta raíz. Commit estático publicado: `5576afb0a3cbbd7d687888986016779b0d746fc1`.

La edición de Pages funciona como espacio personal cifrado en el navegador. No se ha publicado una base de datos ni un servidor privado, ni migrado datos del negocio. Los identificadores de las hojas privadas, la cuenta personal del propietario y sus credenciales no se han incluido en el código publicado. Tampoco se han subido facturas, adjuntos, registros ni copias del usuario.

## Cómo empezar

1. Abre el enlace y pulsa **Probar con datos ficticios** para conocer las pantallas.
2. Pulsa **Bloquear** para salir de la demostración.
3. Crea tu espacio con el nombre del negocio y una contraseña larga, de al menos 14 caracteres.
4. Guarda una copia cifrada con **Guardar copia** después de incorporar datos importantes. Conserva la contraseña por separado: no existe recuperación.

El mismo enlace funciona desde ordenador y móvil, pero cada navegador mantiene registros independientes. No hay sincronización automática ni colaboración con empleados o gestoría en esta edición. Para compartir los mismos registros sigue haciendo falta terminar el servidor privado y su autenticación. Las copias pueden restaurarse con la contraseña en un navegador vacío; no se mezclan ni sobrescriben registros existentes.

## Pruebas de esta edición

- 16/16 comprobaciones superadas en alojamiento estático local.
- 16/16 comprobaciones repetidas y superadas contra la URL HTTPS publicada.
- Recorrido con navegador sin perfil personal y datos ficticios: demostración, conciliación completa y parcial, PDF, cifrado, recarga, contraseña incorrecta, dos pestañas simultáneas, adjuntos, exportación/restauración, copia manipulada, funciones no conectadas y diseño de 390 px.
- Los registros contables y contraseñas no se enviaron por HTTP en las pruebas observadas; solo hubo peticiones GET de archivos estáticos del sitio.
- Las pruebas de tamaño móvil no sustituyen una comprobación en Android físico. Tampoco constituyen una auditoría profesional de seguridad o cumplimiento.

Los resultados originales están en `verificacion/pruebas-pages.tap` y `verificacion/pruebas-pages-publicada.tap` dentro de la entrega local. Esas evidencias y copias ficticias no se han añadido al repositorio público.

## Emisión fiscal

Permanece bloqueada por dos razones: la función de emisión conforme aún no se ha desarrollado, integrado y verificado, y el encargo exige autorización expresa del titular antes de activarla. Los PDF son borradores; se pueden registrar facturas ya emitidas por otro sistema.

Falta definir y probar el sistema fiscal responsable de la emisión, registros y trazabilidad, declaración responsable de la versión y, para la modalidad VERI*FACTU que se pretenda utilizar, la integración correspondiente. La aplicabilidad fiscal concreta del negocio sigue pendiente de verificación. No se ha afirmado que este piloto cumpla íntegramente el RRSIF ni que esté certificado. [Consultar el Reglamento](https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840).

## Acceso a Chrome y GitHub

Se detectaron las pestañas de Chrome del usuario. Las operaciones de interacción siguieron devolviendo un error de la conexión del navegador; no se afirma haber completado la publicación desde su sesión de Chrome. La publicación se ejecutó mediante la conexión de GitHub ya autorizada y se verificó con un navegador de prueba independiente.

La primera comprobación restringida de GitHub no pudo validar la sesión por la restricción de red. Fuera de esa restricción se confirmó que la sesión existente era válida; no fue necesario cambiar credenciales ni pedir otra autenticación. Al activar Pages, GitHub respondió que ya estaba habilitado; la consulta posterior confirmó la rama correcta, HTTPS y compilación terminada. La herramienta de búsqueda web no pudo leer la URL publicada, pero el recorrido de navegador real sobre esa misma URL pasó las 16 pruebas.

## Próximo paso

Completar el servidor privado para la colaboración y la sincronización, manteniendo el proceso existente de recibidas en solo lectura. El OCR/IA, WhatsApp oficial, conexión bancaria y emisión fiscal siguen pendientes. Para comercializarlo como SaaS habrá que utilizar un alojamiento compatible con ese uso y un servidor adecuado; [GitHub Pages establece límites de uso comercial y transacciones sensibles](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

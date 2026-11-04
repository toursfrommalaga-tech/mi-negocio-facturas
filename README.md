# Mi negocio · facturas y conciliación

**[Abrir la herramienta publicada](https://toursfrommalaga-tech.github.io/mi-negocio-facturas/)**

Piloto personal para GitHub Pages, con el motor de gestión y una edición de servidor privado por separado. No incluye facturas, clientes, contraseñas, claves, identificadores de hojas privadas ni datos del negocio que encargó el desarrollo.

## Edición GitHub Pages

La carpeta `site/` es una aplicación estática completa. Funciona en HTTPS sin API: clientes, borradores con varias líneas, descuentos e IVA, PDF de borrador, documentos, registro manual de facturas, CSV, propuestas de conciliación, pagos completos/parciales/agrupados, pendientes, panel y consultas guiadas.

En **Emitidas → Preparar desde datos del cliente** se puede pegar texto o leer una foto/captura con OCR local. Se proponen nombre, identificación fiscal, dirección, población y contacto. Los campos inciertos quedan para revisión. Tras confirmar servicio e importes se guardan cliente y borrador en una sola operación de estado; se reutiliza un cliente con los mismos datos sin cambiar su ficha. En Ajustes se guardan o importan los datos del emisor para los nuevos PDF. El registro en Google y la numeración fiscal real requieren el despliegue privado y completar los requisitos pendientes.

En **Emitidas** puedes fotografiar o subir un albarán JPEG, PNG o WebP de hasta 4 MB y asociarlo al borrador. Debes revisar e introducir los conceptos: no hay lectura por IA. La fecha automática utiliza el día actual de Madrid al guardar; el contador continúa entre días dentro de cada serie y año. El historial permite descargar tanto el PDF del borrador como su documento de apoyo. La cámara de un Android físico todavía no se ha verificado.

En la primera visita puedes **Probar con datos ficticios** o **Crear espacio cifrado**. El espacio personal se guarda en IndexedDB, cifrado mediante AES-GCM de 256 bits con una clave no exportable derivada por PBKDF2-SHA256 (310.000 iteraciones, sal de 16 bytes y un IV aleatorio nuevo de 12 bytes por escritura). La contraseña no se envía a un servidor. Se utiliza Web Locks para serializar operaciones entre pestañas del mismo navegador y origen.

La política de contenido restringe conexiones al mismo alojamiento (`connect-src 'self'`) y bloquea el envío de formularios. El lector OCR descarga sus archivos y el idioma español desde este mismo sitio y procesa la imagen en un trabajador del navegador. No hay analítica, CDN, fuentes remotas, IA generativa externa ni API de facturas. GitHub sirve los archivos estáticos y puede registrar los accesos HTTP conforme a su servicio; eso no significa que los registros contables se suban a GitHub.

**Esta edición es personal y no tiene sincronización automática entre dispositivos ni cuentas de empleados o gestoría.** Abrir el mismo enlace en dos dispositivos no abre los mismos registros. Exporta copias cifradas; pueden restaurarse, junto con la contraseña, en un navegador sin un espacio previo. La restauración no combina datos ni sobrescribe el espacio existente. Conserva siempre las copias y la contraseña: no hay recuperación de contraseña.

La demostración usa datos ficticios en memoria y no modifica un espacio personal guardado. Al bloquear o recargar se pierde esa demostración. El espacio personal se bloquea después de 15 minutos de inactividad. El cifrado protege los datos almacenados, pero no sustituye una auditoría de seguridad: alguien con acceso a un navegador desbloqueado o que controle el código servido puede acceder a la información que se muestre. No se afirma conformidad fiscal, certificación de seguridad ni cumplimiento integral de protección de datos.

## Por qué no se emiten facturas fiscales

El piloto guarda borradores y sus PDF, y permite registrar facturas que ya se hayan emitido en otro sistema. La emisión fiscal está bloqueada en el motor incluso para el administrador.

El proyecto no ha integrado ni verificado todavía el sistema responsable de emitir conforme a los requisitos españoles aplicables. No dispone de declaración responsable de productor, generación fiscal de registros ni integración probada de remisión VERI*FACTU. Un PDF de borrador no sustituye esas funciones. El bloqueo se conserva hasta completar la verificación y recibir la autorización expresa del titular.

Fuentes oficiales consultadas: [RD 1007/2023](https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840), [Orden HAC/1177/2024](https://www.boe.es/buscar/doc.php?id=BOE-A-2024-22138) y [preguntas frecuentes de AEAT](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/sistemas-verifactu.html). La aplicabilidad concreta al negocio se debe verificar antes de activar emisión; no se presume que todos los casos fiscales sean iguales.

## Edición de servidor privado

`private-server/` contiene el servidor local con sesiones, permisos Administrador/Empleado/Gestoría, almacenamiento, registro de operaciones y lectura XLSX. Usa Node.js 22 y Python 3 para XLSX. Se inicia con `node private-server/server.cjs` y escucha solo en `127.0.0.1:8765`. La contraseña inicial se genera en `datos-privados/ACCESO_INICIAL.txt`; esa carpeta debe conservarse fuera de Git.

Este servidor no se ejecuta en GitHub Pages, no está publicado y no se conecta automáticamente al espacio cifrado del navegador. El despliegue privado en internet, la identidad de colaboradores y la migración controlada siguen siendo trabajo pendiente. Las automatizaciones previas de Google del usuario no se modifican desde este repositorio.

## Límites y funciones pendientes

- CSV de hasta 500 KB y 1000 movimientos. En el navegador, XLSX debe exportarse a CSV; el servidor local sí lee XLSX.
- Adjuntos PDF/JPEG/PNG/WebP de hasta 4 MB. Almacenamiento del piloto limitado por el navegador y por un tamaño de datos descifrados de unos 55 MB; se rechazan escrituras fuera de límite.
- Se leen fotos y capturas de datos de clientes con OCR local (Tesseract.js). La propuesta se revisa antes de guardar cliente y borrador. No hay extracción automática de conceptos/importes de facturas recibidas, IA generativa ni conexión de correo o WhatsApp Business.
- El asistente utiliza reglas sobre registros autorizados, sin IA generativa. Las posibles facturas ausentes son interpretaciones por revisar.
- No hay conexión bancaria, transferencias, asientos contables, declaraciones fiscales ni emisión fiscal real.
- No hay sincronización con Google, colaboración en nube ni recuperación de contraseña en Pages.
- Antes de convertirlo en producto comercial se necesita otro alojamiento y un servidor privado adecuado. [GitHub Pages tiene restricciones para negocios en línea, transacciones sensibles y SaaS comercial](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Pruebas

`tests/pages.test.cjs` prueba la aplicación en un navegador sin perfil personal, con datos ficticios: demostración, PDF, pagos, cifrado, persistencia, contraseña incorrecta, concurrencia entre pestañas, adjuntos, exportación/restauración, alteración de copias, funciones pendientes y diseño móvil. Necesita Playwright y un navegador Chromium. Para verificar la publicación, establece `PILOTO_TEST_URL` con la URL HTTPS; sin esa variable levanta un servidor estático local. La batería actual contiene 19 comprobaciones, incluidas lectura real de una captura con OCR, texto pegado, revisión y creación del borrador con datos del emisor. Se documenta por separado la validación del enlace HTTPS. La aplicación publicada no necesita paquetes npm.

El motor compartido y la edición local tienen pruebas independientes en la entrega original. No se debe presentar una prueba simulada o de navegador con tamaño móvil como una ejecución en Google o en un Android físico.

## Publicación

Publicar únicamente el contenido de `site/` en la rama `gh-pages` y seleccionar esa rama y la carpeta raíz como fuente de Pages. El código fuente permanece en `main`. No subir `datos-privados`, adjuntos personales, copias cifradas de usuarios, archivos `.env` ni credenciales. El enlace de Pages sirve la herramienta; no crea un almacenamiento compartido de facturas.

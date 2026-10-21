# GitHub Swap

Aplicación de escritorio para Windows que gestiona **varias cuentas de GitHub** desde una interfaz sencilla, sin pelearse con la terminal: claves SSH, identidades de Git y repositorios de cada cuenta.

## Funcionalidades

- **Varias cuentas** de GitHub, cada una con su clave SSH, su nombre y email de Git y su carpeta de proyectos.
- **Conexión automática:** la app crea la clave SSH, la sube a GitHub con un inicio de sesión y comprueba que funciona.
- Para cada cuenta: ver y clonar sus repositorios, crear proyectos nuevos, cambiar visibilidad, descripción, nombre, colaboradores e issues.
- **En mi ordenador:** detecta los repos de GitHub que ya tienes clonados y con qué cuenta trabaja cada uno, y avisa del trabajo pendiente (cambios sin subir).
- **Actualizaciones automáticas:** avisa cuando hay una versión nueva publicada y se actualiza con un botón.
- Instala sola **Git** y trae **GitHub CLI** incluido.

## Tecnologías

Electron, Node.js y JavaScript. Empaquetado con electron-builder (instalador NSIS para Windows).

## Desarrollo

```bash
npm install
npm start          # arranca la app con Electron
```

## Generar el instalador

```bash
npm run dist       # crea el .exe en release/ (NSIS, Windows)
```

## Estructura

```
main.js        # Proceso principal de Electron y las acciones (IPC)
preload.js     # Puente seguro entre la interfaz y el proceso principal
lib/           # Lógica: ssh, git, github, store, tools y updater
src/           # Interfaz (HTML, CSS y renderer)
scripts/       # Arranque en desarrollo y descarga de GitHub CLI
```

## Autor

Sergio Bernabé

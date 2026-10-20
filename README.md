# Infraestructura WebAR con MindAR + Three.js

Infraestructura base estática y modular para experiencias de Realidad Aumentada basada en imágenes (**Image Tracking WebAR**) directamente desde el navegador móvil, sin necesidad de instalar aplicaciones.

---

## 📁 Estructura del Proyecto

```text
/prueba-mindar (o /webar-test)
│
├── index.html               # Estructura HTML, Import Maps de Three.js y MindAR
├── README.md                # Documentación de ejecución, despliegue y arquitectura
│
├── css/
│   └── style.css            # Estilos responsivos, viewport móvil y control de capas
│
├── js/
│   └── app.js               # Lógica modular de Three.js, MindAR y ciclo de vida
│
├── targets/
│   └── target.mind          # Archivo binario compilado de reconocimiento de imagen
│
└── assets/
    ├── models/
    │   ├── puerta-3d.glb    # Parte 1: Puerta 3D con apertura animada y textos
    │   ├── palabras1.glb    # Parte 2: Primer modelo 3D de palabras animadas
    │   ├── palabras2.glb    # Parte 2: Segundo modelo 3D de palabras animadas
    │   └── palabras3.glb    # Parte 2: Tercer modelo 3D de palabras animadas
    ├── textures/            # Reservado para mapas de texturas e imágenes
    └── audio/               # Reservado para efectos sonoros o pistas de audio
```

---

## 🎯 Ubicación del Archivo Target (`.mind`)

El archivo compilado de reconocimiento de imagen debe ubicarse obligatoriamente en:

```text
/targets/target.mind
```

> **Nota:** La aplicación ya se encuentra configurada para leer `./targets/target.mind` con el anchor en el índice `0` (`addAnchor(0)`).

---

## 🚀 Cómo Ejecutar el Proyecto Localmente

Los navegadores bloquean el acceso a la cámara mediante el protocolo `file://`. Por este motivo, el proyecto debe servirse a través de un servidor web local:

### Opción Rápida en Windows: Archivo `.bat`
Podés hacer doble clic en `iniciar.bat` (o ejecutarlo en la consola).
- Presioná **`Y`** para iniciar el servidor y abrir automáticamente el navegador en `http://localhost:8000`.
- Mientras esté corriendo, presioná **`N`** para detener el servidor y cerrarlo.

---

### Opción 1: Con Python (Manual)
Abrí una terminal en la carpeta del proyecto y ejecutá:
```bash
# Python 3
python -m http.server 8000
```
Luego abrí en tu navegador:
```text
http://localhost:8000
```

### Opción 2: Con Node.js (`serve`)
```bash
npx serve .
```

### Opción 3: Con la extensión Live Server de VS Code
Hacé clic derecho sobre `index.html` y seleccioná **"Open with Live Server"**.

---

## 📱 Importante: Pruebas desde el Celular y Requisito de HTTPS

Por especificación estricta de seguridad web (**WebRTC / `getUserMedia`**):

1. **`localhost` en la computadora:** Permite acceder a la cámara sin HTTPS para pruebas en tu entorno de desarrollo.
2. **Acceso desde el celular en red local (`http://192.168.x.x:8000`):** Los navegadores móviles (**Chrome en Android y Safari en iOS**) **bloquean la cámara si el sitio no cuenta con HTTPS**.

### Cómo probarlo en el celular durante el desarrollo:

#### Alternativa A: Usar un túnel HTTPS temporal (La más rápida y cómoda)
Podés exponer tu servidor local mediante herramientas gratuitas como:
- **Cloudflare Quick Tunnels (sin registro):**
  ```bash
  npx cloudflared tunnel --url http://localhost:8000
  ```
- **ngrok:**
  ```bash
  npx ngrok http 8000
  ```
Ambas herramientas te proporcionan una URL pública con **`https://`** que podés abrir directamente en Chrome (Android) o Safari (iPhone).

#### Alternativa B: Habilitar el flag en Chrome para Android
Si ingresás por IP local (`http://192.168.1.X:8000`), podés ingresar en Chrome de tu teléfono a:
```text
chrome://flags/#unsafely-treat-insecure-origin-as-secure
```
Añadir `http://192.168.1.X:8000`, marcarlo como **Enabled** y reiniciar Chrome.

---

## 🌐 Publicación en Producción (100% Estático)

El proyecto es totalmente estático (HTML, CSS y JS puro). Puede desplegarse en cualquier servicio de hosting gratuito sin necesidad de backend:

### 1. GitHub Pages
1. Subí el repositorio a GitHub.
2. Andá a **Settings** > **Pages**.
3. En **Source**, seleccioná la rama `main` y la carpeta `/ (root)`.
4. Guardá. En pocos minutos tu experiencia estará publicada con HTTPS automático.

### 2. Netlify
1. Arrastrá la carpeta del proyecto directamente al panel de **Netlify Drop** (o conectá tu repositorio).
2. Dejá el comando de build vacío y el directorio de publicación como `./`.
3. Netlify asignará un certificado SSL/HTTPS de inmediato.

### 3. Cloudflare Pages
1. En el panel de Cloudflare, andá a **Workers & Pages** > **Create application** > **Pages**.
2. Conectá tu repositorio o subí los archivos estáticos.
3. No requiere Build Command. El Output Directory es la raíz `.`.

---

## 🛠️ Tecnologías y Versiones Utilizadas

- **Three.js:** `v0.160.0` (vía ES Modules y CDN jsDelivr).
- **MindAR Image Tracking:** `v1.2.5` (`mindar-image-three.prod.js`).
- **ES Module Shims:** `v1.10.0` (para garantizar soporte en versiones anteriores de Safari iOS).
- **JavaScript Moderno:** Módulos ES nativos (`import` / `export`), `async/await`.
- **CSS3:** Variables, viewport dinámico, safe-area-insets y animaciones de estado.

---

## 🔄 Flujo de Uso

1. El usuario abre la URL (con HTTPS en celular o `localhost` en PC).
2. Se muestra la **pantalla inicial** con la descripción, instrucción y el botón grande **"INICIAR EXPERIENCIA"** (la cámara permanece apagada).
3. Al pulsar el botón, el navegador solicita el permiso de cámara.
4. MindAR se inicializa y muestra el indicador **"Buscando imagen..."**.
5. Al enfocar la imagen de referencia, el indicador cambia a **"Imagen detectada"** y aparece un **cubo 3D** flotando y rotando suavemente sobre el target.
6. Si la imagen sale del cuadro, el cubo desaparece y el indicador vuelve a **"Buscando imagen..."**.
7. Al pulsar **"DETENER CÁMARA"**, se liberan los recursos de video y tracking, y se regresa a la pantalla inicial limpiamente.

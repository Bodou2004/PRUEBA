import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Configuración del modelo 3D
const MODEL_PATH = './assets/models/desplegable.glb';
const MODEL_SCALE = 1.0; // Escala calibrada: un poco más grande que el target para formato A3

// Estado global de la aplicación
let mindarThree = null;
let modelObject = null;
let mixer = null;
let openAction = null;
let poseAction = null;
let clock = new THREE.Clock();
let anchor = null;
let isARRunning = false;
let isStarting = false;

// Referencias a elementos del DOM
let welcomeScreen = null;
let arUI = null;
let btnStart = null;
let btnStop = null;
let statusIndicator = null;
let statusText = null;
let errorMessage = null;
let arContainer = null;

/**
 * Inicialización de la aplicación y precarga de recursos
 */
const init = () => {
  welcomeScreen = document.querySelector('#welcome-screen');
  arUI = document.querySelector('#ar-ui');
  btnStart = document.querySelector('#btn-start');
  btnStop = document.querySelector('#btn-stop');
  statusIndicator = document.querySelector('#status-indicator');
  statusText = document.querySelector('#status-text');
  errorMessage = document.querySelector('#error-message');
  arContainer = document.querySelector('#ar-container');

  btnStart.addEventListener('click', startAR);
  btnStop.addEventListener('click', stopAR);

  // Precargar el modelo 3D en segundo plano para arranque instantáneo
  loadModel().catch((err) => {
    console.error("Aviso: el modelo se intentará recargar al iniciar AR.", err);
  });
};

/**
 * Carga y configuración del modelo GLB con sus animaciones
 */
const loadModel = () => {
  return new Promise((resolve, reject) => {
    if (modelObject) {
      resolve(modelObject);
      return;
    }

    const loader = new GLTFLoader();
    loader.load(
      MODEL_PATH,
      (gltf) => {
        modelObject = gltf.scene;

        // Escala: un poco más grande que el target para representar el formato A3
        modelObject.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);

        // Rotación alrededor de Z: alinea la orientación con el target físico
        modelObject.rotation.z = Math.PI;

        // Posicionamiento: centrado en el target y ligeramente elevado (z: 0.05) para evitar solapamiento
        modelObject.position.set(0, 1.0 * MODEL_SCALE, 0.05);

        // Configuración del reproductor de animaciones (AnimationMixer)
        mixer = new THREE.AnimationMixer(modelObject);

        // Animación de apertura inicial ("INICIO")
        const openClip = THREE.AnimationClip.findByName(gltf.animations, 'INICIO') || gltf.animations[0];
        if (openClip) {
          openAction = mixer.clipAction(openClip);
          openAction.setLoop(THREE.LoopOnce);
          openAction.clampWhenFinished = true;
        }

        // Animación / pose en la que se queda el desplegable ("POSE-NORMAL")
        const poseClip = THREE.AnimationClip.findByName(gltf.animations, 'POSE-NORMAL');
        if (poseClip) {
          poseAction = mixer.clipAction(poseClip);
          poseAction.setLoop(THREE.LoopOnce);
          poseAction.clampWhenFinished = true;
        }

        // Al finalizar la animación de apertura, asegurar el mantenimiento de la pose
        mixer.addEventListener('finished', (e) => {
          if (e.action === openAction && poseAction) {
            poseAction.reset().play();
          }
        });

        resolve(modelObject);
      },
      undefined,
      (error) => {
        reject(error);
      }
    );
  });
};

/**
 * Configuración de iluminación para la escena Three.js
 */
const createScene = (scene) => {
  // Luz ambiental para visibilidad uniforme de las texturas
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambientLight);

  // Luz direccional principal para resaltar el volumen del papel y pliegues
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(1.5, 2.0, 3.0);
  scene.add(directionalLight);

  // Luz de relleno suave desde el lado opuesto
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
  fillLight.position.set(-1.5, -1.0, 2.0);
  scene.add(fillLight);
};

/**
 * Muestra el estado del tracking de imagen en el indicador visual
 */
const showStatus = (text) => {
  if (statusText) {
    statusText.textContent = text;
  }
  if (statusIndicator) {
    if (text === "Imagen detectada") {
      statusIndicator.classList.add("detected");
      statusIndicator.classList.remove("searching");
    } else {
      statusIndicator.classList.add("searching");
      statusIndicator.classList.remove("detected");
    }
  }
};

/**
 * Muestra un mensaje amigable al usuario en la pantalla inicial
 */
const showError = (message) => {
  if (errorMessage) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
  }
};

/**
 * Oculta el mensaje de error de la pantalla inicial
 */
const hideError = () => {
  if (errorMessage) {
    errorMessage.textContent = '';
    errorMessage.classList.add('hidden');
  }
};

/**
 * Clasifica y presenta los posibles errores de permisos, dispositivos o archivos
 */
const handleError = (error) => {
  console.error("Detalle del error en WebAR:", error);

  let userMessage = "Ocurrió un error al iniciar la experiencia de Realidad Aumentada.";
  const errorName = String(error?.name || '');
  const errorMsg = String(error?.message || error || '').toLowerCase();

  if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError' || errorMsg.includes('permission denied')) {
    userMessage = "No se pudo acceder a la cámara. Permití el acceso desde la configuración del navegador e intentá nuevamente.";
  } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError' || errorMsg.includes('not found')) {
    userMessage = "No se detectó ninguna cámara disponible en tu dispositivo.";
  } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
    userMessage = "La cámara está siendo utilizada por otra aplicación o pestaña del navegador.";
  } else if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    userMessage = "El acceso a la cámara requiere una conexión segura (HTTPS). Verificá que el sitio se ejecute bajo HTTPS.";
  } else if (errorMsg.includes('desplegable') || errorMsg.includes('.glb')) {
    userMessage = "No se pudo cargar el modelo 3D ('./assets/models/desplegable.glb'). Verificá que el archivo exista.";
  } else if (errorMsg.includes('target') || errorMsg.includes('fetch') || errorMsg.includes('404')) {
    userMessage = "No se pudo cargar el archivo de target ('./targets/target.mind'). Verificá que el archivo exista en la ruta indicada.";
  }

  showError(userMessage);
};

/**
 * Configuración de la instancia de MindARThree, anchor y eventos de detección
 */
const setupAR = () => {
  mindarThree = new MindARThree({
    container: arContainer,
    imageTargetSrc: './targets/target.mind',
    uiLoading: 'no',
    uiScanning: 'no',
    uiError: 'no'
  });

  createScene(mindarThree.scene);

  anchor = mindarThree.addAnchor(0);

  if (modelObject) {
    anchor.group.add(modelObject);
  }

  anchor.onTargetFound = () => {
    console.log("Target encontrado");
    showStatus("Imagen detectada");

    // Reproducir la animación de apertura del desplegable
    if (openAction) {
      if (poseAction) poseAction.stop();
      openAction.reset().play();
    }
  };

  anchor.onTargetLost = () => {
    console.log("Target perdido");
    showStatus("Buscando imagen...");
  };
};

/**
 * Inicia la sesión de Realidad Aumentada
 */
const startAR = async () => {
  if (isARRunning || isStarting) return;

  isStarting = true;
  hideError();
  btnStart.disabled = true;
  btnStart.textContent = "INICIANDO...";

  try {
    // Asegurar que el modelo esté cargado antes de arrancar
    if (!modelObject) {
      await loadModel();
    }

    if (!mindarThree) {
      setupAR();
    } else if (modelObject && !anchor.group.children.includes(modelObject)) {
      anchor.group.add(modelObject);
    }

    await mindarThree.start();

    const { renderer, scene, camera } = mindarThree;
    clock.start();

    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta();
      if (mixer) {
        mixer.update(delta);
      }
      renderer.render(scene, camera);
    });

    isARRunning = true;
    isStarting = false;

    welcomeScreen.classList.add('hidden');
    arUI.classList.remove('hidden');
    showStatus("Buscando imagen...");

    console.log("AR iniciado");
  } catch (error) {
    isStarting = false;
    btnStart.disabled = false;
    btnStart.textContent = "INICIAR EXPERIENCIA";

    try {
      if (mindarThree) {
        mindarThree.renderer?.setAnimationLoop(null);
        mindarThree.stop();
      }
    } catch (_) {}
    mindarThree = null;
    arContainer.innerHTML = '';

    handleError(error);
  }
};

/**
 * Detiene la cámara y el motor de tracking, regresando a la pantalla inicial
 */
const stopAR = () => {
  if (!isARRunning && !isStarting) return;

  try {
    if (mindarThree) {
      mindarThree.renderer.setAnimationLoop(null);
      mindarThree.stop();
      mindarThree.renderer.clear();
    }
    if (mixer) {
      mixer.stopAllAction();
    }
  } catch (error) {
    console.error("Error al detener AR:", error);
  } finally {
    isARRunning = false;
    isStarting = false;

    if (anchor && anchor.group) {
      anchor.group.visible = false;
    }

    arUI.classList.add('hidden');
    welcomeScreen.classList.remove('hidden');
    btnStart.disabled = false;
    btnStart.textContent = "INICIAR EXPERIENCIA";

    console.log("AR detenido");
  }
};

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

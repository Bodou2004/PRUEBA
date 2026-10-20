import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==========================================================================
// Configuración de Modelos y Escalas
// ==========================================================================
const PUERTA_PATH = './assets/models/puerta-3d.glb';
const PALABRAS1_PATH = './assets/models/palabras1.glb';
const PALABRAS2_PATH = './assets/models/palabras2.glb';
const PALABRAS3_PATH = './assets/models/palabras3.glb';

// Escala para la puerta 3D
const PUERTA_SCALE = 0.35;

// Escala estándar calibrada para lectura óptima de textos en pantalla de celular
const TEXT_SCALE = 0.04;

// ==========================================================================
// Estado Global de la Aplicación
// ==========================================================================
let mindarThree = null;
let anchor = null;
let clock = new THREE.Clock();
let isARRunning = false;
let isStarting = false;

// Datos de los 4 modelos cargados { scene, mixer, actions }
let puertaData = null;
let palabras1Data = null;
let palabras2Data = null;
let palabras3Data = null;

// Control de mixers activos y flujo de secuencia
const activeMixers = new Set();
let sequenceStarted = false;
let currentSequenceToken = 0;

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

  // Precargar todos los modelos 3D en segundo plano para arranque fluido
  loadAllModels().catch((err) => {
    console.warn("Aviso en precarga de modelos:", err);
  });
};

/**
 * Prepara los materiales de un modelo para soportar transiciones suaves de opacidad
 */
const prepareTransparency = (rootObject) => {
  rootObject.traverse((child) => {
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material = child.material.map((m) => {
          const mat = m.clone();
          mat.transparent = true;
          mat.depthWrite = true;
          return mat;
        });
      } else {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.depthWrite = true;
      }
    }
  });
};

/**
 * Modifica la opacidad de todos los materiales de un objeto
 */
const setModelOpacity = (rootObject, opacity) => {
  rootObject.traverse((child) => {
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => { m.opacity = opacity; });
      } else {
        child.material.opacity = opacity;
      }
    }
  });
};

/**
 * Transición suave de desvanecimiento (Fade Out)
 */
const fadeOutModel = (rootObject, durationMs = 800, token) => {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    const tick = () => {
      if (token !== currentSequenceToken) {
        reject(new Error('SequenceCancelled'));
        return;
      }
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1.0);
      setModelOpacity(rootObject, 1.0 - progress);

      if (progress < 1.0) {
        requestAnimationFrame(tick);
      } else {
        rootObject.visible = false;
        resolve();
      }
    };
    tick();
  });
};

/**
 * Transición suave de aparición (Fade In)
 */
const fadeInModel = (rootObject, durationMs = 400, token) => {
  return new Promise((resolve, reject) => {
    rootObject.visible = true;
    setModelOpacity(rootObject, 0);
    const startTime = performance.now();
    const tick = () => {
      if (token !== currentSequenceToken) {
        reject(new Error('SequenceCancelled'));
        return;
      }
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1.0);
      setModelOpacity(rootObject, progress);

      if (progress < 1.0) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };
    tick();
  });
};

/**
 * Pausa asíncrona cancelable por token de secuencia
 */
const sleep = (ms, token) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (token === currentSequenceToken) resolve();
      else reject(new Error('SequenceCancelled'));
    }, ms);
  });
};

/**
 * Carga individual de un archivo GLB con configuración de mixer y animaciones
 */
const loadGLB = (path, scale, position, rotation = [0, 0, 0]) => {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    const url = `${path}?t=${Date.now()}`;

    loader.load(
      url,
      (gltf) => {
        const scene = gltf.scene;
        scene.scale.set(scale, scale, scale);
        scene.position.set(...position);
        scene.rotation.set(...rotation);

        prepareTransparency(scene);

        const mixer = new THREE.AnimationMixer(scene);
        const actions = [];

        if (gltf.animations && gltf.animations.length > 0) {
          gltf.animations.forEach((clip) => {
            const action = mixer.clipAction(clip);
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
            actions.push(action);
          });
        }

        resolve({ scene, mixer, actions });
      },
      undefined,
      (error) => {
        console.error(`Error al cargar modelo en ${path}:`, error);
        reject(error);
      }
    );
  });
};

/**
 * Carga todos los modelos de la experiencia (Parte 1 y Parte 2)
 */
const loadAllModels = async () => {
  if (puertaData && palabras1Data && palabras2Data && palabras3Data) {
    return;
  }

  // Posición calibrada para la puerta (centrada verticalmente sobre el target)
  const puertaPos = [0, -1.669 * PUERTA_SCALE, 0.1];
  // Posición para las palabras (flotando centradas sobre el desplegable)
  const textPos = [0, 0, 0.1];

  const [pData, w1Data, w2Data, w3Data] = await Promise.all([
    loadGLB(PUERTA_PATH, PUERTA_SCALE, puertaPos),
    loadGLB(PALABRAS1_PATH, TEXT_SCALE, textPos),
    loadGLB(PALABRAS2_PATH, TEXT_SCALE, textPos),
    loadGLB(PALABRAS3_PATH, TEXT_SCALE, textPos)
  ]);

  puertaData = pData;
  palabras1Data = w1Data;
  palabras2Data = w2Data;
  palabras3Data = w3Data;

  // Por defecto, ocultar las palabras hasta que inicie la Parte 2
  palabras1Data.scene.visible = false;
  palabras2Data.scene.visible = false;
  palabras3Data.scene.visible = false;

  console.log("Todos los modelos 3D (Parte 1 y Parte 2) fueron cargados exitosamente.");
};

/**
 * Configuración de iluminación para la escena Three.js
 */
const createScene = (scene) => {
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
  directionalLight.position.set(1.5, 2.0, 3.0);
  scene.add(directionalLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.7);
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
    if (text.includes("detectada") || text.includes("Parte")) {
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
  } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError' || (errorMsg.includes('not found') && !errorMsg.includes('target'))) {
    userMessage = "No se detectó ninguna cámara disponible en tu dispositivo.";
  } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
    userMessage = "La cámara está siendo utilizada por otra aplicación o pestaña del navegador.";
  } else if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    userMessage = "El acceso a la cámara requiere una conexión segura (HTTPS). Verificá que el sitio se ejecute bajo HTTPS.";
  } else if (errorMsg.includes('glb') || errorMsg.includes('puerta') || errorMsg.includes('palabra')) {
    userMessage = "No se pudieron cargar los modelos 3D en assets/models/. Verificá que los archivos existan.";
  } else if (errorMsg.includes('target') || errorMsg.includes('fetch') || errorMsg.includes('404') || errorMsg.includes('msgpack') || errorMsg.includes('compiler') || errorMsg.includes('unexpected') || errorMsg.includes('extra byte')) {
    userMessage = "No se pudo cargar o procesar el archivo de target (.mind). Verificá que exista en /targets/targets.mind o /targets/target.mind.";
  }

  showError(userMessage);
};

/**
 * Resuelve y valida automáticamente la ruta existente del archivo .mind
 */
const resolveTargetSrc = async () => {
  const candidatePaths = [
    './targets/targets.mind',
    './targets/target.mind',
    './targets.mind',
    './target.mind'
  ];

  for (const path of candidatePaths) {
    try {
      const resp = await fetch(path, { method: 'HEAD' });
      if (resp.ok) return path;
    } catch (_) {}
  }

  for (const path of candidatePaths) {
    try {
      const resp = await fetch(path);
      if (resp.ok && resp.status === 200) {
        const type = resp.headers.get('content-type') || '';
        if (!type.includes('text/html')) return path;
      }
    } catch (_) {}
  }

  return './targets/targets.mind';
};

/**
 * Orquesta la secuencia completa en 2 partes
 */
const startExperienceSequence = async () => {
  sequenceStarted = true;
  const token = ++currentSequenceToken;

  try {
    // ----------------------------------------------------
    // PARTE 1: Experiencia de la Puerta 3D
    // ----------------------------------------------------
    console.log("Iniciando Parte 1: Puerta 3D");
    showStatus("Parte 1: Puerta 3D");

    // Asegurar que las palabras de la parte 2 estén ocultas
    palabras1Data.scene.visible = false;
    palabras2Data.scene.visible = false;
    palabras3Data.scene.visible = false;

    // Mostrar puerta con opacidad total
    puertaData.scene.visible = true;
    setModelOpacity(puertaData.scene, 1.0);

    // Disparar las 4 animaciones de la puerta
    puertaData.actions.forEach((a) => a.reset().play());
    activeMixers.add(puertaData.mixer);

    // Duración de la animación de la puerta (~5.1s) + tiempo de lectura
    await sleep(5500, token);

    // Fade Out de la Puerta 3D (0.8s)
    console.log("Fade Out: Puerta 3D");
    await fadeOutModel(puertaData.scene, 800, token);
    activeMixers.delete(puertaData.mixer);

    // Breve pausa antes de la Parte 2
    await sleep(300, token);

    // ----------------------------------------------------
    // PARTE 2: Secuencia de Palabras 3D
    // ----------------------------------------------------
    console.log("Iniciando Parte 2: Palabras 1");
    showStatus("Parte 2: Palabras");

    // --- PALABRAS 1 ---
    activeMixers.add(palabras1Data.mixer);
    palabras1Data.actions.forEach((a) => a.reset().play());
    await fadeInModel(palabras1Data.scene, 400, token);

    // Esperar fin de animación de palabras1 (~8.3s)
    await sleep(8300, token);

    // "Espera un toquesin" para lectura (1.0s)
    await sleep(1000, token);

    // Fade out de palabras1
    await fadeOutModel(palabras1Data.scene, 600, token);
    activeMixers.delete(palabras1Data.mixer);

    // Pausa intermedia ("un toquesin") antes de palabras2
    await sleep(600, token);

    // --- PALABRAS 2 ---
    console.log("Iniciando Palabras 2");
    activeMixers.add(palabras2Data.mixer);
    palabras2Data.actions.forEach((a) => a.reset().play());
    await fadeInModel(palabras2Data.scene, 400, token);

    // Esperar fin de animación de palabras2 (~8.8s)
    await sleep(8800, token);

    // "Espera un toquesin" para lectura (1.0s)
    await sleep(1000, token);

    // Fade out de palabras2
    await fadeOutModel(palabras2Data.scene, 600, token);
    activeMixers.delete(palabras2Data.mixer);

    // Pausa intermedia antes de palabras3
    await sleep(600, token);

    // --- PALABRAS 3 ---
    console.log("Iniciando Palabras 3");
    activeMixers.add(palabras3Data.mixer);
    palabras3Data.actions.forEach((a) => a.reset().play());
    await fadeInModel(palabras3Data.scene, 400, token);

    // Esperar fin de animación de palabras3 (~8.8s)
    await sleep(8800, token);

    console.log("Experiencia WebAR concluida exitosamente");
    showStatus("Experiencia completada");
  } catch (err) {
    if (err.message !== 'SequenceCancelled') {
      console.error("Error durante la secuencia:", err);
    }
  }
};

/**
 * Configuración de la instancia de MindARThree, anchor y eventos de detección
 */
const setupAR = (targetSrc) => {
  mindarThree = new MindARThree({
    container: arContainer,
    imageTargetSrc: targetSrc,
    uiLoading: 'no',
    uiScanning: 'no',
    uiError: 'no'
  });

  createScene(mindarThree.scene);

  anchor = mindarThree.addAnchor(0);

  // Adjuntar todos los modelos al grupo del anchor
  if (puertaData) anchor.group.add(puertaData.scene);
  if (palabras1Data) anchor.group.add(palabras1Data.scene);
  if (palabras2Data) anchor.group.add(palabras2Data.scene);
  if (palabras3Data) anchor.group.add(palabras3Data.scene);

  anchor.onTargetFound = () => {
    console.log("Target encontrado");
    showStatus("Imagen detectada");

    // Iniciar la secuencia de la experiencia si no estaba corriendo
    if (!sequenceStarted) {
      startExperienceSequence();
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
    // Asegurar que todos los modelos estén cargados
    await loadAllModels();

    // Resolver la ruta válida del archivo .mind y verificar que exista
    const targetSrc = await resolveTargetSrc();
    const targetCheck = await fetch(targetSrc);
    if (!targetCheck.ok || targetCheck.status !== 200) {
      throw new Error(`TargetNotFound: No se pudo cargar el archivo target desde ${targetSrc}`);
    }

    if (!mindarThree) {
      setupAR(targetSrc);
    }

    await mindarThree.start();

    const { renderer, scene, camera } = mindarThree;
    clock.start();

    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta();
      // Actualizar todos los mixers activos en la fase correspondiente
      activeMixers.forEach((m) => m.update(delta));
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
 * Detiene la cámara y el motor de tracking, reseteando la secuencia a la pantalla inicial
 */
const stopAR = () => {
  if (!isARRunning && !isStarting) return;

  // Cancelar secuencia asíncrona activa
  currentSequenceToken++;
  sequenceStarted = false;

  try {
    if (mindarThree) {
      mindarThree.renderer?.setAnimationLoop(null);
      mindarThree.stop();
      mindarThree.renderer?.clear();
    }

    // Detener todas las animaciones y vaciar mixers activos
    activeMixers.forEach((m) => m.stopAllAction());
    activeMixers.clear();

    // Ocultar y resetear opacidad de los modelos
    if (puertaData) {
      puertaData.actions.forEach((a) => a.stop());
      puertaData.scene.visible = false;
      setModelOpacity(puertaData.scene, 1.0);
    }
    if (palabras1Data) {
      palabras1Data.actions.forEach((a) => a.stop());
      palabras1Data.scene.visible = false;
      setModelOpacity(palabras1Data.scene, 1.0);
    }
    if (palabras2Data) {
      palabras2Data.actions.forEach((a) => a.stop());
      palabras2Data.scene.visible = false;
      setModelOpacity(palabras2Data.scene, 1.0);
    }
    if (palabras3Data) {
      palabras3Data.actions.forEach((a) => a.stop());
      palabras3Data.scene.visible = false;
      setModelOpacity(palabras3Data.scene, 1.0);
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

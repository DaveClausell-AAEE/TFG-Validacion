document.addEventListener('DOMContentLoaded', () => {

  // =================================================================
  // CONFIGURACIÓN DEL EXPERIMENTO
  // =================================================================
  const BIG_FIVE_URL_TEMPLATE = "https://docs.google.com/forms/d/e/1FAIpQLSc0H2d-J869fIpIKPRzOKgrj3QDbtbi9nnWStT36d5HLdJcsQ/viewform?usp=pp_url&entry.1885163690=ID_A_REEMPLAZAR";
  const STROOP_DURATION_SECONDS = 60;
  const RELAXATION_DURATION_MINUTES = 5;

  // --- VARIABLES DE ESTADO Y DATOS (CON SESSIONSTORAGE) ---
  const dataHandler = {
    set: function(target, property, value) {
      target[property] = value;
      sessionStorage.setItem('tfg_data', JSON.stringify(target));
      return true;
    }
  };
  let initialData = JSON.parse(sessionStorage.getItem('tfg_data')) || {
      volume: 0.5,
      assignedGroup: 'Control'
  };
  let userResponses = new Proxy(initialData, dataHandler);
  
  let currentMeasurementPhase = 'baseline';
  let stroopState = {
    phase: null, trials: [], currentIndex: 0, trialStartTime: null,
    errorCount: 0, results: [], timerId: null, timeLeft: STROOP_DURATION_SECONDS,
    isPractice: false
  };
  let tmtState = {
    part: null, currentNumber: 1, currentLetter: 'A',
    trialStartTime: null, errors: [], results: { PartA: { time: 0, errors: [] }, PartB: { time: 0, errors: [] } }
  };
  let baselineTimer = null;


  // =================================================================
  // --- LÓGICA TEMPORAL PARA VALIDACIÓN: DESHABILITAR WEBSOCKET ---
  // Las siguientes líneas simulan el envío de eventos y muestran los resultados en la consola.
  
  // const WEBSOCKET_URI = "ws://localhost:3000"; 
  // const ws = new WebSocket(WEBSOCKET_URI);      
  
  // ws.onopen = function() { console.log("Conectado al servidor WebSocket."); }; 
  // ws.onmessage = function(event) { /* ... */ }; 
  
  function sendEvent(event, data = {}) {
    // Esta función simula el envío y garantiza que los resultados se impriman al finalizar.
    const logData = { event, ...data };
    console.log(`[EVENTO SIMULADO] Tipo: ${event}`);
    
    if (event === 'FIN_STROOP') {
        console.log('=== RESULTADOS STROOP PARA VALIDACIÓN (COPIAR Y ENVIAR) ===');
        console.log(JSON.stringify(data.all_data.results, null, 2)); 
        console.log('===========================================================');
    } else if (event === 'FIN_TMT') {
        console.log('=== RESULTADOS TMT PARA VALIDACIÓN (COPIAR Y ENVIAR) ===');
        console.log(`Parte A: ${JSON.stringify(data.all_data.tmtResults.PartA, null, 2)}`);
        console.log(`Parte B: ${JSON.stringify(data.all_data.tmtResults.PartB, null, 2)}`);
        console.log('===========================================================');
    }
  }
  // -----------------------------------------------------------------


  // =================================================================
  // FUNCIONES DE INTERFAZ GENERALES
  // =================================================================
  function showScreen(id) {
    document.querySelectorAll('#main-container > div').forEach(screen => {
      screen.classList.add('hidden');
    });
    document.getElementById(id).classList.remove('hidden');
  }

  // =================================================================
  // LÓGICA DE STROOP
  // =================================================================
  const stroopWord = document.getElementById('stroop-word');
  const stroopTimer = document.getElementById('stroop-timer');

  const COLORS = ['ROJO', 'AZUL', 'VERDE', 'AMARILLO'];
  const COLOR_MAP = {
    'ROJO': 'red',
    'AZUL': 'blue',
    'VERDE': 'green',
    'AMARILLO': 'yellow'
  };

  function generateStroopTrial(isPractice) {
    let word, color, isCongruent;

    if (isPractice) {
      // 50% congruente, 50% incongruente para práctica
      isCongruent = Math.random() < 0.5;
    } else {
      // Menos congruente en fase experimental (aprox 25%) para inducir más interferencia
      isCongruent = Math.random() < 0.25;
    }

    // Elegir palabra aleatoria
    word = COLORS[Math.floor(Math.random() * COLORS.length)];

    if (isCongruent) {
      // Si es congruente, el color debe coincidir con la palabra
      color = COLOR_MAP[word];
    } else {
      // Si es incongruente, el color debe ser diferente a la palabra
      let possibleColors = COLORS.filter(c => c !== word);
      let colorWord = possibleColors[Math.floor(Math.random() * possibleColors.length)];
      color = COLOR_MAP[colorWord];
    }

    return {
      word: word,
      color: color,
      correctResponse: COLOR_MAP[word] // La respuesta correcta es siempre el color de la TINTA
    };
  }

  function startStroop(isPractice) {
    stroopState.isPractice = isPractice;
    stroopState.phase = isPractice ? 'practice' : 'experimental';
    stroopState.trials = [];
    stroopState.currentIndex = 0;
    stroopState.errorCount = 0;
    stroopState.results = [];
    stroopState.timeLeft = STROOP_DURATION_SECONDS;

    // Generamos las pruebas. Más que las que se necesitan, para que no se acaben
    for (let i = 0; i < STROOP_DURATION_SECONDS * 2; i++) {
      stroopState.trials.push(generateStroopTrial(isPractice));
    }

    updateStroopTimer();
    nextStroopTrial();

    if (!isPractice) {
      stroopState.timerId = setInterval(() => {
        stroopState.timeLeft--;
        updateStroopTimer();
        if (stroopState.timeLeft <= 0) {
          clearInterval(stroopState.timerId);
          endStroopTask();
        }
      }, 1000);
    }
  }

  function nextStroopTrial() {
    if (stroopState.currentIndex >= stroopState.trials.length) {
      // Si se acaban los trials antes del tiempo, generamos más
      stroopState.trials.push(generateStroopTrial(stroopState.isPractice));
    }
    const trial = stroopState.trials[stroopState.currentIndex];
    stroopWord.textContent = trial.word;
    stroopWord.style.color = trial.color;
    stroopState.trialStartTime = performance.now();
  }

  function handleStroopResponse(responseColor) {
    if (stroopState.phase === 'finished') return;

    const trial = stroopState.trials[stroopState.currentIndex];
    const reactionTime = performance.now() - stroopState.trialStartTime;
    const isCorrect = (responseColor === trial.correctResponse);

    const result = {
      index: stroopState.currentIndex,
      word: trial.word,
      stimulusColor: trial.color,
      responseColor: responseColor,
      correct: isCorrect,
      correctAnswer: trial.correctResponse,
      reactionTime: reactionTime,
      isCongruent: trial.word.toLowerCase() === trial.correctResponse
    };

    if (stroopState.isPractice) {
      if (!isCorrect) {
        document.getElementById('stroop-task-screen').classList.add('shake-error');
        setTimeout(() => document.getElementById('stroop-task-screen').classList.remove('shake-error'), 500);
      }
      // En práctica, simplemente vamos al siguiente hasta que el usuario decida seguir
    } else {
      // En experimental, se guarda el resultado y se cuenta el error
      stroopState.results.push(result);
      if (!isCorrect) {
        stroopState.errorCount++;
      }
    }

    stroopState.currentIndex++;
    nextStroopTrial();
  }

  function updateStroopTimer() {
    if (stroopState.isPractice) {
      stroopTimer.textContent = 'Modo Práctica';
    } else {
      stroopTimer.textContent = `Tiempo restante: ${stroopState.timeLeft}s`;
    }
  }

  function endStroopTask() {
    stroopState.phase = 'finished';
    clearInterval(stroopState.timerId);

    // Guardar resultados del Stroop
    userResponses.results = stroopState.results;

    if (stroopState.isPractice) {
      showScreen('stroop-transition-screen');
      sendEvent('FIN_STROOP_PRACTICA');
    } else {
      // Mover el flujo de la app
      showScreen('tmt-intro-screen');
      sendEvent('FIN_STROOP_EXPERIMENTAL');
    }
  }

  // --- Manejo de la Interfaz Stroop ---
  document.querySelectorAll('.stroop-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const color = e.target.getAttribute('data-color');
      handleStroopResponse(color);
    });
  });

  // Botón para pasar de la práctica al experimental
  document.getElementById('start-stroop-experimental-button').addEventListener('click', () => {
    startStroop(false);
    showScreen('stroop-task-screen');
    sendEvent('INICIO_STROOP_EXPERIMENTAL');
  });

  // =================================================================
  // LÓGICA DE TMT (Trail Making Test)
  // =================================================================
  const tmtContainer = document.getElementById('tmt-canvas-container');
  let tmtCanvas = document.getElementById('tmt-canvas');
  let tmtCtx = tmtCanvas ? tmtCanvas.getContext('2d') : null;
  const tmtInstruction = document.getElementById('tmt-instruction');
  const TMT_NODE_RADIUS = 25;
  const TMT_NODE_DISTANCE = 150; // Distancia para la generación (adaptable)

  let tmtNodes = [];
  let tmtSequence = [];
  let tmtCurrentTargetIndex = 0;
  let tmtTrialStarted = false;

  // Mapa de nodos para las partes A y B
  const tmtMap = {
    PartA: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
    PartB: [1, 'A', 2, 'B', 3, 'C', 4, 'D', 5, 'E', 6, 'F', 7, 'G', 8, 'H', 9, 'I', 10, 'J', 11, 'K', 12, 'L', 13]
  };

  // Función para generar posiciones aleatorias
  function generateNodes(sequence) {
    tmtNodes = [];
    const minX = TMT_NODE_RADIUS * 2;
    const maxX = tmtCanvas.width - TMT_NODE_RADIUS * 2;
    const minY = TMT_NODE_RADIUS * 2;
    const maxY = tmtCanvas.height - TMT_NODE_RADIUS * 2;

    for (let i = 0; i < sequence.length; i++) {
      let node;
      let safe = false;
      let attempts = 0;

      while (!safe && attempts < 100) {
        attempts++;
        node = {
          value: sequence[i],
          x: Math.random() * (maxX - minX) + minX,
          y: Math.random() * (maxY - minY) + minY
        };

        // Verificar que no se superpongan y que estén a una distancia mínima
        safe = tmtNodes.every(existingNode => {
          const distance = Math.sqrt(
            Math.pow(node.x - existingNode.x, 2) + Math.pow(node.y - existingNode.y, 2)
          );
          return distance > TMT_NODE_DISTANCE;
        });

        if (safe) {
          tmtNodes.push(node);
        }
      }
      if (!safe) {
          // Fallback: Si no encuentra una posición segura, simplemente la añade
          tmtNodes.push(node);
          console.warn("Fallo en la generación segura de nodos TMT.");
      }
    }
    return tmtNodes;
  }

  function drawTMT() {
    tmtCtx.clearRect(0, 0, tmtCanvas.width, tmtCanvas.height);

    // Dibujar líneas de conexión ya realizadas
    tmtCtx.strokeStyle = 'gray';
    tmtCtx.lineWidth = 3;
    tmtCtx.beginPath();
    for (let i = 0; i < tmtCurrentTargetIndex; i++) {
      const startNode = tmtNodes.find(n => n.value === tmtSequence[i]);
      const endNode = tmtNodes.find(n => n.value === tmtSequence[i + 1]);
      if (startNode && endNode) {
        tmtCtx.moveTo(startNode.x, startNode.y);
        tmtCtx.lineTo(endNode.x, endNode.y);
      }
    }
    tmtCtx.stroke();

    // Dibujar nodos
    tmtNodes.forEach((node, index) => {
      const isTarget = tmtCurrentTargetIndex < tmtSequence.length && node.value === tmtSequence[tmtCurrentTargetIndex];
      const isCompleted = tmtSequence.indexOf(node.value) < tmtCurrentTargetIndex;
      const isFirst = index === 0 && tmtState.part === 'practice'; // Solo resaltar el primero en la práctica

      tmtCtx.beginPath();
      tmtCtx.arc(node.x, node.y, TMT_NODE_RADIUS, 0, 2 * Math.PI);
      tmtCtx.fillStyle = isTarget ? '#c9302c' : (isCompleted ? '#a0bdf5' : 'white'); // Rojo para el objetivo, azul claro para completado
      tmtCtx.fill();
      tmtCtx.strokeStyle = isTarget ? '#a0bdf5' : '#1c1e21';
      tmtCtx.lineWidth = 3;
      tmtCtx.stroke();

      // Texto del nodo
      tmtCtx.fillStyle = isTarget ? 'white' : 'black';
      tmtCtx.font = 'bold 18px Arial';
      tmtCtx.textAlign = 'center';
      tmtCtx.textBaseline = 'middle';
      tmtCtx.fillText(String(node.value), node.x, node.y);
    });
  }

  function handleTMTClick(e) {
    if (!tmtTrialStarted) return;
    const rect = tmtCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const targetNode = tmtNodes.find(node => {
      const distance = Math.sqrt(Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2));
      return distance < TMT_NODE_RADIUS;
    });

    if (targetNode) {
      const expectedValue = tmtSequence[tmtCurrentTargetIndex];
      const actualValue = targetNode.value;

      if (actualValue === expectedValue) {
        // Acierto: pasar al siguiente
        tmtCurrentTargetIndex++;
        if (tmtCurrentTargetIndex >= tmtSequence.length) {
          endTMTPart();
        } else {
          drawTMT();
        }
      } else {
        // Error: Registrar el error
        const timeElapsed = performance.now() - tmtState.trialStartTime;

        tmtState.results[tmtState.part].errors.push({
          time: timeElapsed,
          clicked: actualValue,
          expected: expectedValue,
          targetIndex: tmtCurrentTargetIndex
        });

        // Feedback visual del error
        document.getElementById('tmt-task-screen').classList.add('shake-error');
        setTimeout(() => document.getElementById('tmt-task-screen').classList.remove('shake-error'), 500);

        // En la práctica, corregir (hacer que el objetivo siga siendo el correcto)
        // En la experimental, el protocolo estándar es ignorar la click y esperar el correcto
        // Aquí no movemos tmtCurrentTargetIndex
      }
    }
  }

  function endTMTPart() {
    tmtTrialStarted = false;
    const timeElapsed = (performance.now() - tmtState.trialStartTime) / 1000; // a segundos
    tmtState.results[tmtState.part].time = timeElapsed;

    sendEvent(`FIN_TMT_${tmtState.part}`, { time: timeElapsed, errors: tmtState.results[tmtState.part].errors });

    if (tmtState.part === 'PartA_Practice') {
      showScreen('tmt-transition-b-screen');
    } else if (tmtState.part === 'PartA') {
      // Iniciar parte B
      tmtState.part = 'PartB';
      tmtInstruction.textContent = 'Parte B: Conecta alternando números y letras (1-A-2-B-...). Haz clic en el círculo START para comenzar.';
      setupTMT(tmtMap.PartB);
      showScreen('tmt-task-screen');
    } else if (tmtState.part === 'PartB') {
      // TMT terminado
      endTMTTask();
    }
  }

  function setupTMT(sequence) {
    tmtSequence = sequence;
    tmtNodes = generateNodes(sequence);
    tmtCurrentTargetIndex = 0;
    tmtTrialStarted = false;
    drawTMT(); // Dibujar antes de empezar
  }

  function startTMTPart() {
    tmtCurrentTargetIndex = 0;
    tmtTrialStarted = true;
    tmtState.trialStartTime = performance.now();
    drawTMT();
    sendEvent(`INICIO_TMT_${tmtState.part}`);
  }

  // --- Lógica de la Práctica ---
  // Solo con los primeros 8 elementos (1-2-3-4-5-6-7-8)
  const tmtPracticeMapA = [1, 2, 3, 4, 5, 6, 7, 8];
  const tmtPracticeMapB = [1, 'A', 2, 'B', 3, 'C', 4, 'D'];


  // --- Eventos de Interfaz TMT ---
  tmtCanvas.addEventListener('click', handleTMTClick);

  document.getElementById('start-tmt-practice-a').addEventListener('click', () => {
    // Es práctica, pero la llamamos PartA_Practice para la lógica interna
    tmtState.part = 'PartA_Practice';
    tmtInstruction.textContent = 'Práctica A: Conecta los círculos en orden ascendente (1, 2, 3, ...). Haz clic en el círculo START para comenzar.';
    setupTMT(tmtPracticeMapA);
    showScreen('tmt-task-screen');
    // Para la práctica, el inicio es manual para evitar que el usuario se apure
    document.getElementById('tmt-canvas').addEventListener('click', function handler(e) {
      // En la práctica, el primer click es el inicio. Buscamos el nodo '1'
      const rect = tmtCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const startNode = tmtNodes.find(node => {
        const distance = Math.sqrt(Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2));
        return distance < TMT_NODE_RADIUS && node.value === 1;
      });

      if (startNode) {
        startTMTPart();
        // Una vez iniciado, removemos este listener
        document.getElementById('tmt-canvas').removeEventListener('click', handler);
      }
    });

  });

  document.getElementById('start-tmt-part-a').addEventListener('click', () => {
    // Iniciar Parte A Experimental
    tmtState.part = 'PartA';
    tmtInstruction.textContent = 'Parte A: Conecta los círculos en orden ascendente (1, 2, 3, ...). Haz clic en el círculo START para comenzar.';
    setupTMT(tmtMap.PartA);
    showScreen('tmt-task-screen');
    // Inicio automático al presionar un nodo (para el TMT experimental)
    document.getElementById('tmt-canvas').addEventListener('click', function handler(e) {
      const rect = tmtCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const startNode = tmtNodes.find(node => {
        const distance = Math.sqrt(Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2));
        return distance < TMT_NODE_RADIUS && node.value === 1;
      });

      if (startNode) {
        startTMTPart();
        document.getElementById('tmt-canvas').removeEventListener('click', handler);
      }
    });
  });

  document.getElementById('start-tmt-part-b').addEventListener('click', () => {
    // Iniciar Parte B Experimental
    tmtState.part = 'PartB';
    tmtInstruction.textContent = 'Parte B: Conecta alternando números y letras (1-A-2-B-...). Haz clic en el círculo START para comenzar.';
    setupTmt(tmtMap.PartB);
    showScreen('tmt-task-screen');
    document.getElementById('tmt-canvas').addEventListener('click', function handler(e) {
      const rect = tmtCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const startNode = tmtNodes.find(node => {
        const distance = Math.sqrt(Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2));
        return distance < TMT_NODE_RADIUS && node.value === 1;
      });

      if (startNode) {
        startTMTPart();
        document.getElementById('tmt-canvas').removeEventListener('click', handler);
      }
    });
  });


  // =================================================================
  // LÓGICA FINAL DEL EXPERIMENTO (Modificado para la validación)
  // =================================================================
  function endTMTTask() {
    userResponses.tmtResults = tmtState.results; // Guardar resultados del TMT
    
    // El evento FIN_TMT disparará el console.log con los resultados
    sendEvent('FIN_TMT', { tmtResults: tmtState.results, all_data: userResponses }); 

    // --- FLUJO TEMPORAL: Finalizar el experimento aquí para la validación ---
    showScreen('goodbye-screen');
  }

  
  // =================================================================
  // INICIO DE LA APLICACIÓN (Modificado para la validación)
  // =================================================================

  // Asegurar que el canvas tenga el tamaño correcto antes de empezar
  if (tmtCanvas && tmtContainer) {
    tmtCanvas.width = tmtContainer.offsetWidth;
    tmtCanvas.height = tmtContainer.offsetHeight;
  }
  
  // --- INICIO PARA VALIDACIÓN: IR DIRECTO A STROOP PRÁCTICA ---
  // Comentar la línea original: showScreen('welcome-screen');
  startStroop(true); // 'true' inicia la fase de práctica
  showScreen('stroop-task-screen');
  sendEvent('INICIO_VALIDACION_TESTS');
  
});
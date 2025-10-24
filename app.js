// =================================================================
// FUNCIONES DE INTERFAZ GENERALES (MOVIMIENTO CRÍTICO AL ÁMBITO GLOBAL)
// Soluciona el error 'showScreen is not defined' en la consola y la pantalla en blanco.
// =================================================================
function showScreen(id) {
    document.querySelectorAll('#main-container > div').forEach(screen => {
        screen.classList.add('hidden');
    });
    // Verifica si el elemento existe antes de intentar mostrarlo
    const screenElement = document.getElementById(id);
    if (screenElement) {
        screenElement.classList.remove('hidden');
    } else {
        console.error(`Error: Pantalla con ID '${id}' no encontrada.`);
    }
}
// =================================================================


document.addEventListener('DOMContentLoaded', () => {

  // =================================================================
  // !!! CORRECCIÓN CRÍTICA DE FLUJO: ELIMINAR ESTADO PERSISTENTE !!!
  // Esto asegura que el test SIEMPRE comience desde el principio (Stroop Práctica).
  sessionStorage.clear(); 
  // =================================================================
  
  // =================================================================
  // CONFIGURACIÓN MÍNIMA
  // =================================================================
  const STROOP_DURATION_SECONDS = 60;

  // --- VARIABLES DE ESTADO Y DATOS (mantenemos la estructura proxy) ---
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
  
  let stroopState = {
    phase: null, trials: [], currentIndex: 0, trialStartTime: null,
    errorCount: 0, results: [], timerId: null, timeLeft: STROOP_DURATION_SECONDS,
    isPractice: false
  };
  let tmtState = {
    part: null, currentNumber: 1, currentLetter: 'A',
    trialStartTime: null, errors: [], results: { PartA: { time: 0, errors: [] }, PartB: { time: 0, errors: [] } }
  };


  // =================================================================
  // --- FUNCIÓN DE LOGGING (REEMPLAZO DE WEBSOCKET) ---
  function sendEvent(event, data = {}) {
    console.log(`[EVENTO DE VALIDACIÓN] Tipo: ${event}`);
    
    if (event === 'FIN_STROOP') {
        console.log('=== RESULTADOS STROOP PARA VALIDACIÓN (COPIAR Y ENVIAR) ===');
        const simpleResults = data.all_data.results.map(r => ({
            idx: r.index,
            isCorrect: r.correct,
            RT_ms: Math.round(r.reactionTime),
            isCongruent: r.isCongruent,
            word: r.word,
            stimColor: r.stimColor,
        }));

        console.log(JSON.stringify(simpleResults, null, 2)); 
        console.log(`Métricas Resumen Stroop: Total de Trials = ${simpleResults.length}, Errores = ${simpleResults.filter(r => !r.isCorrect).length}`);
        console.log('===========================================================');

    } else if (event === 'FIN_TMT') {
        console.log('=== RESULTADOS TMT PARA VALIDACIÓN (COPIAR Y ENVIAR) ===');
        const partA = data.all_data.tmtResults.PartA;
        const partB = data.all_data.tmtResults.PartB;
        
        console.log('--- Parte A (Números) ---');
        console.log(`Tiempo Total: ${partA.time.toFixed(2)} segundos`);
        console.log(`Errores: ${partA.errors.length}`);

        console.log('\n--- Parte B (Alternado) ---');
        console.log(`Tiempo Total: ${partB.time.toFixed(2)} segundos`);
        console.log(`Errores: ${partB.errors.length}`);
        
        console.log('===========================================================');
    }
  }
  // -----------------------------------------------------------------


  // =================================================================
  // LÓGICA DE STROOP
  // =================================================================
  const stroopWord = document.getElementById('stroop-word');
  const stroopTimer = document.getElementById('stroop-timer');

  const COLORS = ['ROJO', 'AZUL', 'VERDE', 'AMARILLO'];
  const COLOR_MAP = {
    'ROJO': 'red', 'AZUL': 'blue', 'VERDE': 'green', 'AMARILLO': 'yellow'
  };

  function generateStroopTrial(isPractice) {
    let word, color, isCongruent;
    isCongruent = isPractice ? (Math.random() < 0.5) : (Math.random() < 0.25);
    word = COLORS[Math.floor(Math.random() * COLORS.length)];

    if (isCongruent) {
      color = COLOR_MAP[word];
    } else {
      let possibleColors = COLORS.filter(c => c !== word);
      let colorWord = possibleColors[Math.floor(Math.random() * possibleColors.length)];
      color = COLOR_MAP[colorWord];
    }
    return {
      word: word, color: color, correctResponse: COLOR_MAP[word]
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
    } else {
      stroopState.results.push(result);
      if (!isCorrect) {
        stroopState.errorCount++;
      }
    }

    stroopState.currentIndex++;
    nextStroopTrial();
  }

  function updateStroopTimer() {
    stroopTimer.textContent = stroopState.isPractice ? 'Modo Práctica' : `Tiempo restante: ${stroopState.timeLeft}s`;
  }

  function endStroopTask() {
    stroopState.phase = 'finished';
    clearInterval(stroopState.timerId);

    userResponses.results = stroopState.results;

    if (stroopState.isPractice) {
      showScreen('stroop-transition-screen');
      sendEvent('FIN_STROOP_PRACTICA');
    } else {
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

  document.getElementById('start-stroop-experimental-button').addEventListener('click', () => {
    startStroop(false);
    showScreen('stroop-task-screen');
    sendEvent('INICIO_STROOP_EXPERIMENTAL');
  });


  // =================================================================
  // LÓGICA DE TMT
  // =================================================================
  const tmtContainer = document.getElementById('tmt-canvas-container');
  let tmtCanvas = document.getElementById('tmt-canvas');
  let tmtCtx = tmtCanvas ? tmtCanvas.getContext('2d') : null;
  const tmtInstruction = document.getElementById('tmt-instruction');
  const TMT_NODE_RADIUS = 25;
  const TMT_NODE_DISTANCE = 150; 

  let tmtNodes = [];
  let tmtSequence = [];
  let tmtCurrentTargetIndex = 0;
  let tmtTrialStarted = false;

  const tmtMap = {
    PartA: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
    PartB: [1, 'A', 2, 'B', 3, 'C', 4, 'D', 5, 'E', 6, 'F', 7, 'G', 8, 'H', 9, 'I', 10, 'J', 11, 'K', 12, 'L', 13]
  };
  const tmtPracticeMapA = [1, 2, 3, 4, 5, 6, 7, 8];

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

        safe = tmtNodes.every(existingNode => {
          const distance = Math.sqrt(
            Math.pow(node.x - existingNode.x, 2) + Math.pow(node.y - existingNode.y, 2)
          );
          return distance > TMT_NODE_DISTANCE;
        });

        if (safe) { tmtNodes.push(node); }
      }
      if (!safe) { tmtNodes.push(node); } // Fallback
    }
    return tmtNodes;
  }

  function drawTMT() {
    if (!tmtCtx) return; // Asegura que el contexto esté inicializado
    tmtCtx.clearRect(0, 0, tmtCanvas.width, tmtCanvas.height);

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

    tmtNodes.forEach((node, index) => {
      const isTarget = tmtCurrentTargetIndex < tmtSequence.length && node.value === tmtSequence[tmtCurrentTargetIndex];
      const isCompleted = tmtSequence.indexOf(node.value) < tmtCurrentTargetIndex;

      tmtCtx.beginPath();
      tmtCtx.arc(node.x, node.y, TMT_NODE_RADIUS, 0, 2 * Math.PI);
      tmtCtx.fillStyle = isTarget ? '#c9302c' : (isCompleted ? '#a0bdf5' : 'white');
      tmtCtx.fill();
      tmtCtx.strokeStyle = isTarget ? '#a0bdf5' : '#1c1e21';
      tmtCtx.lineWidth = 3;
      tmtCtx.stroke();

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
        tmtCurrentTargetIndex++;
        if (tmtCurrentTargetIndex >= tmtSequence.length) {
          endTMTPart();
        } else {
          drawTMT();
        }
      } else {
        const timeElapsed = (performance.now() - tmtState.trialStartTime) / 1000;
        tmtState.results[tmtState.part.includes('Practice') ? 'PartA' : tmtState.part].errors.push({
          time: timeElapsed.toFixed(2), clicked: actualValue, expected: expectedValue, targetIndex: tmtCurrentTargetIndex
        });

        document.getElementById('tmt-task-screen').classList.add('shake-error');
        setTimeout(() => document.getElementById('tmt-task-screen').classList.remove('shake-error'), 500);
      }
    }
  }

  function endTMTPart() {
    tmtTrialStarted = false;
    const timeElapsed = (performance.now() - tmtState.trialStartTime) / 1000;
    
    const partKey = tmtState.part.includes('Practice') ? 'PartA' : tmtState.part;
    
    if (!tmtState.part.includes('Practice')) {
        tmtState.results[partKey].time = timeElapsed;
        sendEvent(`FIN_TMT_${tmtState.part}`, { time: timeElapsed.toFixed(2), errors: tmtState.results[partKey].errors });
    }

    if (tmtState.part === 'PartA_Practice') {
      showScreen('tmt-transition-b-screen');
    } else if (tmtState.part === 'PartA') {
      tmtState.part = 'PartB';
      document.getElementById('tmt-intro-instruction').textContent = 'Parte B: Conecta alternando números y letras (1-A-2-B-...). Haz clic en el botón para comenzar.';
      showScreen('tmt-transition-final-screen'); // Usamos esta para la transición a la B
    } else if (tmtState.part === 'PartB') {
      endTMTTask();
    }
  }

  function setupTMT(sequence) {
    tmtSequence = sequence;
    tmtNodes = generateNodes(sequence);
    tmtCurrentTargetIndex = 0;
    tmtTrialStarted = false;
    drawTMT();
  }

  function startTMTPart() {
    tmtCurrentTargetIndex = 0;
    tmtTrialStarted = true;
    tmtState.trialStartTime = performance.now();
    drawTMT();
    sendEvent(`INICIO_TMT_${tmtState.part}`);
  }

  // --- Eventos de Interfaz TMT ---
  if (tmtCanvas) {
    tmtCanvas.addEventListener('click', handleTMTClick);
  }

  function setupTMTStartListener(startValue) {
      const canvasElement = document.getElementById('tmt-canvas');
      if (!canvasElement) return;

      canvasElement.addEventListener('click', function handler(e) {
          const rect = canvasElement.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const startNode = tmtNodes.find(node => {
              const distance = Math.sqrt(Math.pow(x - node.x, 2) + Math.pow(y - node.y, 2));
              return distance < TMT_NODE_RADIUS && node.value === startValue;
          });

          if (startNode) {
              startTMTPart();
              canvasElement.removeEventListener('click', handler);
          }
      });
  }

  // Se asume que estos botones existen en index.html
  document.getElementById('start-tmt-practice-a')?.addEventListener('click', () => {
    tmtState.part = 'PartA_Practice';
    tmtInstruction.textContent = 'Práctica A: Conecta los círculos en orden ascendente (1, 2, 3, ...). Comienza haciendo clic en el círculo START (1).';
    setupTMT(tmtPracticeMapA);
    showScreen('tmt-task-screen');
    setupTMTStartListener(1);
  });

  document.getElementById('start-tmt-part-a')?.addEventListener('click', () => {
    tmtState.part = 'PartA';
    tmtInstruction.textContent = 'Parte A: Conecta los círculos en orden ascendente (1, 2, 3, ...). Comienza haciendo clic en el círculo START (1).';
    setupTMT(tmtMap.PartA);
    showScreen('tmt-task-screen');
    setupTMTStartListener(1);
  });

  document.getElementById('start-tmt-part-b')?.addEventListener('click', () => {
    tmtState.part = 'PartB';
    tmtInstruction.textContent = 'Parte B: Conecta alternando números y letras (1-A-2-B-...). Comienza haciendo clic en el círculo START (1).';
    setupTMT(tmtMap.PartB);
    showScreen('tmt-task-screen');
    setupTMTStartListener(1);
  });


  // =================================================================
  // LÓGICA FINAL
  // =================================================================
  function endTMTTask() {
    userResponses.tmtResults = tmtState.results;
    
    sendEvent('FIN_TMT', { tmtResults: tmtState.results, all_data: userResponses }); 

    // Flujo final de validación: Despedida simple
    showScreen('goodbye-screen'); 
  }

  
  // =================================================================
  // INICIO DE LA APLICACIÓN (Flujo Directo a Stroop)
  // =================================================================

  if (tmtCanvas && tmtContainer) {
    tmtCanvas.width = tmtContainer.offsetWidth;
    tmtCanvas.height = tmtContainer.offsetHeight;
  }
  
  // 1. Inicia la lógica del Stroop de práctica
  startStroop(true);
  // 2. Muestra la pantalla de la tarea directamente
  showScreen('stroop-task-screen');
  sendEvent('INICIO_VALIDACION_TESTS');
  
});

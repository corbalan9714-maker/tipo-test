function ordenNatural(a, b) {
  return a.localeCompare(b, "es", {
    numeric: true,
    sensitivity: "base"
  });
}

// === Mostrar opciones corregidas: a), b), c), d) con colores ===
function renderizarOpcionesCorregidas(p) {
  let html = "";

  p.opciones.forEach((op, idx) => {
    let estilo = "opacity:0.6;";

    // Correcta
    if (idx === p.correcta) {
      estilo = "font-weight:600; color:green;";
    }

    // Elegida incorrecta
    if (
      p.respuestaUsuario !== undefined &&
      idx === p.respuestaUsuario &&
      idx !== p.correcta
    ) {
      estilo = "font-weight:600; color:red;";
    }

    html += `
      <div style="${estilo}">
        ${String.fromCharCode(97 + idx)}) ${op}
      </div>
    `;
  });

  return html;
}

const STORAGE_KEY = "bancoPreguntas";

// ===== HISTORIAL DE TESTS =====

function obtenerHistorialTests() {
  return JSON.parse(localStorage.getItem("historialTests") || "[]");
}

// ===== FILTRO DE HISTORIAL POR TEMA =====
function filtrarHistorialPorTema(tema) {
  const historial = obtenerHistorialTests();

  if (!tema || tema === "todos") {
    return historial;
  }

  return historial.filter(test => {
    if (!Array.isArray(test.temas)) return false;
    return test.temas.some(t => t.tema === tema);
  });
}

function renderizarHistorial(temaSeleccionado) {
  const cont = document.getElementById("historialLista");
  if (!cont) return;

  const historial = filtrarHistorialPorTema(temaSeleccionado);

  cont.innerHTML = "";

  if (historial.length === 0) {
    cont.innerHTML = "<p>No hay tests registrados.</p>";
    return;
  }

  historial
    .slice()
    .reverse()
    .forEach((test, i) => {
      const div = document.createElement("div");
      div.style.marginBottom = "8px";
      div.style.padding = "8px";
      div.style.border = "1px solid #ddd";
      div.style.borderRadius = "6px";

      const fecha = new Date(test.fecha).toLocaleString();

      div.innerHTML = `
        <strong>${fecha}</strong><br>
        Aciertos: ${test.aciertos} | Fallos: ${test.fallos} | Blanco: ${test.enBlanco}<br>
        <strong>Nota: ${test.nota}</strong>
      `;

      cont.appendChild(div);
    });
}

// Conectar selector de tema del historial
window.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("filtroTemaHistorial");
  if (!select) return;

  // Rellenar selector con temas ordenados
  select.innerHTML = "";

  const temas = Object.keys(banco || {})
    .filter(t => t !== "__falladas__")
    .sort(ordenNatural);

  const optTodos = document.createElement("option");
  optTodos.value = "todos";
  optTodos.textContent = "Todos los temas";
  select.appendChild(optTodos);

  temas.forEach(tema => {
    const opt = document.createElement("option");
    opt.value = tema;
    opt.textContent = tema;
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    renderizarHistorial(select.value);
  });

  // Carga inicial
  renderizarHistorial("todos");
});

function cargarBancoLocal() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
}

function guardarBancoLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(banco));
}

let banco = {};
let preguntasTest = [];
let preguntasAcertadas = [];
let preguntasFalladas = [];
let preguntasMarcadas = [];
let ultimaConfiguracionTest = null;
let fallosSesionAntes = 0;
let fallosSesionDespues = 0;

let cronometroInterval = null;
let segundosTest = 0;
let modoSimulacro = false;
let segundosRestantes = 0;

let preguntasEnBlanco = [];
let testEnCurso = false;


document.addEventListener("DOMContentLoaded", async () => {
  try {
    if (window.cargarDesdeFirebase) {
      banco = await window.cargarDesdeFirebase();
      console.log("Banco cargado desde Firebase (test)");

      // Asegurar que todas las preguntas tengan subtema
      Object.keys(banco).forEach(tema => {
        if (!Array.isArray(banco[tema])) return;
        banco[tema].forEach(p => {
          if (!p.subtema) {
            p.subtema = "General";
          }
        });
      });

      // Guardar copia local para modo offline
      localStorage.setItem(STORAGE_KEY, JSON.stringify(banco));
    } else {
      banco = cargarBancoLocal();
      console.log("Banco cargado desde localStorage");
    }
  } catch (e) {
    console.log("Sin conexión, usando copia local");
    banco = cargarBancoLocal();
  }

  initTest();

  // Reanudar test si hay progreso guardado
  try {
    const progreso = JSON.parse(localStorage.getItem("progresoTest") || "null");
    if (progreso && progreso.configuracion) {
      const continuar = confirm("Hay un test sin terminar. ¿Quieres reanudarlo?");
      if (continuar) {
        ultimaConfiguracionTest = progreso.configuracion;

        // Reaplicar número de preguntas
        const inputNum = document.getElementById("numPreguntas");
        if (inputNum && ultimaConfiguracionTest.num) {
          inputNum.value = ultimaConfiguracionTest.num;
        }

        // Reaplicar selección de temas
        if (Array.isArray(ultimaConfiguracionTest.temas)) {
          ultimaConfiguracionTest.temas.forEach(sel => {
            if (!sel) return;

            if (sel.subtema) {
              const valor = sel.tema + "||" + sel.subtema;
              const cb = document.querySelector(
                `#temasCheckboxes input[data-tipo="subtema"][value="${valor}"]`
              );
              if (cb) cb.checked = true;
            } else {
              const cb = document.querySelector(
                `#temasCheckboxes input[data-tipo="tema"][value="${sel.tema}"]`
              );
              if (cb) cb.checked = true;
            }
          });
        }

        iniciarTestReal();

        // Restaurar respuestas guardadas
        if (Array.isArray(progreso.respuestas)) {
          const zonaTest = document.getElementById("zonaTest");
          const bloques = zonaTest.querySelectorAll("div");

          progreso.respuestas.forEach((r, i) => {
            const div = bloques[i];
            if (!div) return;

            // Restaurar radio seleccionado
            if (r.respuesta !== null && r.respuesta !== undefined) {
              const radio = div.querySelector(
                `input[type="radio"][value="${r.respuesta}"]`
              );
              if (radio) radio.checked = true;
            }

            // Restaurar estado de "marcar pregunta"
            const check = div.querySelector(".marcar-pregunta");
            if (check) check.checked = !!r.marcada;
          });
        }
      } else {
        localStorage.removeItem("progresoTest");
      }
    }
  } catch (e) {
    console.warn("Error al intentar reanudar test:", e);
    localStorage.removeItem("progresoTest");
  }
});

// 🔄 Sincronización directa con el editor (misma página)
window.addEventListener("message", (e) => {
  if (e.data && e.data.type === "BANCO_ACTUALIZADO") {
    // banco ya se sincroniza desde Firebase, solo repintar
    pintarCheckboxesTemas();
  }
});

// 🔄 Sincronización automática con el editor
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) {
    // banco ya se sincroniza desde Firebase, solo repintar
    pintarCheckboxesTemas();
  }
});

function initTest() {
  asegurarTemaFalladas();

  // Reconstruir el tema de preguntas falladas desde los datos reales
  banco["__falladas__"] = [];
  Object.keys(banco).forEach(tema => {
    if (tema === "__falladas__") return;
    banco[tema].forEach(p => {
      const fallos = Number(p.fallada) || 0;
      if (fallos > 0) {
        banco["__falladas__"].push(p);
      }
    });
  });

  guardarBancoLocal();

  cargarTemas();

  // 🔒 Asegurar visibilidad de temas al cargar
  const contTemas = document.getElementById("temasCheckboxes");
  if (contTemas) {
    contTemas.style.display = "block";
  }

  const toggleSim = document.getElementById("simulacroToggle");
  const configSim = document.getElementById("simulacroConfig");
  const repasoInt = document.getElementById("modoRepasoInteligente");
  const repasoSimple = document.getElementById("modoRepasoSimple");
  const soloNuevas = document.getElementById("soloNuevasToggle");

  function desactivarOtrosModos(activo) {
    const modos = [toggleSim, repasoInt, repasoSimple, soloNuevas];
    modos.forEach(m => {
      if (m && m !== activo) {
        m.checked = false;
      }
    });

    // Ajustes visuales específicos
    if (configSim) {
      configSim.style.display = toggleSim && toggleSim.checked ? "block" : "none";
    }

    const repasoOpc = document.getElementById("repasoOpciones");
    if (repasoOpc) {
      repasoOpc.style.display = repasoInt && repasoInt.checked ? "block" : "none";
    }

    modoSimulacro = toggleSim && toggleSim.checked;
  }

  if (toggleSim) {
    toggleSim.addEventListener("change", () => {
      if (toggleSim.checked) {
        desactivarOtrosModos(toggleSim);
      } else if (configSim) {
        configSim.style.display = "none";
        modoSimulacro = false;
      }
    });
  }

  if (repasoInt) {
    repasoInt.addEventListener("change", () => {
      if (repasoInt.checked) {
        desactivarOtrosModos(repasoInt);
      } else {
        const repasoOpc = document.getElementById("repasoOpciones");
        if (repasoOpc) repasoOpc.style.display = "none";
      }
    });
  }

  if (repasoSimple) {
    repasoSimple.addEventListener("change", () => {
      if (repasoSimple.checked) {
        desactivarOtrosModos(repasoSimple);
      }
    });
  }

  if (soloNuevas) {
    soloNuevas.addEventListener("change", () => {
      if (soloNuevas.checked) {
        desactivarOtrosModos(soloNuevas);
      }
    });
  }

  // 🔄 Botón: resetear preguntas más falladas
  const btnResetFalladas = document.getElementById("resetFallosBtn");
  if (btnResetFalladas) {
    btnResetFalladas.addEventListener("click", () => {
      resetearSoloFalladas();
    });
  }

  // 🔄 Reset por tema: rellenar selector (siempre después de cargar el banco)
  const resetTemaSelect = document.getElementById("selectorTemaReset");
  if (resetTemaSelect) {
    resetTemaSelect.innerHTML = '<option value="">Selecciona un tema</option>';

    Object.keys(banco).forEach(tema => {
      if (tema === "__falladas__") return;

      const preguntas = banco[tema];
      if (!Array.isArray(preguntas)) return;

      const opt = document.createElement("option");
      opt.value = tema;
      opt.textContent = `${tema} (${preguntas.length})`;
      resetTemaSelect.appendChild(opt);
    });
  }

  // 🔄 Botón: resetear fallos por tema
  const resetTemaBtn = document.getElementById("resetTemaBtn");
  if (resetTemaBtn) {
    resetTemaBtn.addEventListener("click", resetearFallosPorTema);
  }

  // Estado inicial del botón Empezar Test
  actualizarEstadoBotonEmpezar();
}
function crearBloquePregunta(p, i) {
  const div = document.createElement("div");
  div.style.marginBottom = "15px";

  div.innerHTML = `
    <strong>${i + 1}. ${p.pregunta}</strong>
    <label style="margin-left:10px; font-size:12px;">
      <input type="checkbox" class="marcar-pregunta" data-index="${i}">
      🔖 Marcar
    </label>
    <br>
    ${p.opciones.map((op, idx) => `
      <label>
        <input type="radio" name="p${i}" value="${idx}" onchange="autoGuardarProgreso()">
        ${String.fromCharCode(97 + idx)}) ${op}
      </label><br>
    `).join("")}
  `;
  return div;
}

function cargarTemas() {
  pintarCheckboxesTemas();
}

function pintarCheckboxesTemas() {
  const contenedor = document.getElementById("temasCheckboxes");
  if (!contenedor) return;

  contenedor.innerHTML = "";

  let temasOrdenados = Object.keys(banco)
    .filter(t => t !== "__falladas__")
    .sort(ordenNatural);

  // Añadir el tema especial al final si existe
  if (banco["__falladas__"]) {
    temasOrdenados.push("__falladas__");
  }

  temasOrdenados.forEach(tema => {
    let nombreVisible = tema;
    let contador = 0;
    let nuevas = 0;

    if (tema === "__falladas__") {
      nombreVisible = "📌 Preguntas más falladas";
      contador = banco["__falladas__"].filter(p => (p.fallada || 0) > 0).length;
    } else {
      contador = banco[tema].length;
      nuevas = banco[tema].filter(p => (p.fallada || 0) === 0).length;
    }

    const bloqueTema = document.createElement("div");
    bloqueTema.style.marginBottom = "6px";

    const label = document.createElement("label");
    label.style.fontWeight = "600";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = tema;
    checkbox.dataset.tipo = "tema";
    checkbox.addEventListener("change", () => {
      // Marcar o desmarcar todos los subtemas del mismo bloque
      const subChecks = bloqueTema.querySelectorAll('input[data-tipo="subtema"]');
      subChecks.forEach(sc => {
        sc.checked = checkbox.checked;
      });

      actualizarEstadoBotonEmpezar();
    });

    label.appendChild(checkbox);

    const texto = ` ${nombreVisible} (${contador})`;
    label.appendChild(document.createTextNode(texto));

    bloqueTema.appendChild(label);

    // === Subtemas colapsables ===
    if (tema !== "__falladas__" && Array.isArray(banco[tema])) {
      let subtemas = [...new Set(banco[tema].map(p => p.subtema || "General"))];

      // "General" siempre primero, el resto orden natural
      subtemas = subtemas.sort((a, b) => {
        if (a === "General") return -1;
        if (b === "General") return 1;
        return ordenNatural(a, b);
      });

      if (subtemas.length > 0) {
        // Botón de colapsar/expandir
        const toggleBtn = document.createElement("button");
        toggleBtn.textContent = "▸";
        toggleBtn.style.marginLeft = "6px";
        toggleBtn.style.fontSize = "12px";
        toggleBtn.style.padding = "2px 6px";
        toggleBtn.style.cursor = "pointer";

        label.appendChild(toggleBtn);

        const contSub = document.createElement("div");
        contSub.style.marginLeft = "18px";
        contSub.style.marginTop = "4px";
        contSub.style.display = "none"; // colapsado por defecto

        toggleBtn.onclick = () => {
          const abierto = contSub.style.display === "block";
          contSub.style.display = abierto ? "none" : "block";
          toggleBtn.textContent = abierto ? "▸" : "▾";
        };

        subtemas.forEach(sub => {
          const subLabel = document.createElement("label");
          subLabel.style.display = "block";
          subLabel.style.fontWeight = "400";

          const subCb = document.createElement("input");
          subCb.type = "checkbox";
          subCb.value = tema + "||" + sub;
          subCb.dataset.tipo = "subtema";
          subCb.addEventListener("change", () => {
            const subChecks = contSub.querySelectorAll('input[data-tipo="subtema"]');
            const algunoMarcado = Array.from(subChecks).some(sc => sc.checked);
            checkbox.checked = algunoMarcado;

            actualizarEstadoBotonEmpezar();
          });

          subLabel.appendChild(subCb);
          subLabel.appendChild(document.createTextNode(" " + sub));

          contSub.appendChild(subLabel);
        });

        bloqueTema.appendChild(contSub);
      }
    }

    contenedor.appendChild(bloqueTema);
  });
  actualizarEstadoBotonEmpezar();
}


// ====== NUEVAS FUNCIONES DE NAVEGACIÓN DE PANTALLA ======
function mostrarPantallaInicial() {
  const pantalla = document.getElementById("pantallaSeleccion");
  const pantallaTemas = document.getElementById("pantallaTemas");
  const zonaTest = document.getElementById("zonaTest");
  const resumen = document.getElementById("resumenTest");

  if (pantalla) {
    pantalla.style.display = "flex";
    pantalla.classList.add("inicio");
  }
  if (pantallaTemas) pantallaTemas.style.display = "none";
  if (zonaTest) zonaTest.style.display = "none";
  if (resumen) resumen.style.display = "none";

  ocultarCronometro();
}

function mostrarPantallaTemas() {
  const pantallaSeleccion = document.getElementById("pantallaSeleccion");
  const contTemas = document.getElementById("pantallaTemas");

  if (pantallaSeleccion) {
    pantallaSeleccion.style.display = "none";
    pantallaSeleccion.classList.remove("inicio");
  }

  if (contTemas) {
    contTemas.style.display = "flex";
    contTemas.classList.add("inicio");
  }
}

function mostrarPantallaHistorial() {
  const pantalla = document.getElementById("pantallaSeleccion");
  const pantallaTemas = document.getElementById("pantallaTemas");
  const zonaTest = document.getElementById("zonaTest");
  const resumen = document.getElementById("resumenTest");
  const historial = document.getElementById("pantallaHistorial");

  if (pantalla) pantalla.style.display = "none";
  if (pantallaTemas) pantallaTemas.style.display = "none";
  if (zonaTest) zonaTest.style.display = "none";
  if (resumen) resumen.style.display = "none";
  if (historial) historial.style.display = "block";

  if (typeof renderizarHistorial === "function") {
    const select = document.getElementById("filtroTemaHistorial");
    renderizarHistorial(select ? select.value : "todos");
  }
}

function iniciarTest() {
  // Primera pantalla → segunda pantalla (temas)
  const numInput = document.getElementById("numPreguntas");
  const num = parseInt(numInput?.value);

  if (!modoSimulacro && (isNaN(num) || num <= 0)) {
    alert("Selecciona un número de preguntas válido");
    return;
  }

  // Guardar configuración básica
  ultimaConfiguracionTest = {
    num: num,
    modoSimulacro: modoSimulacro
  };

  // Mostrar pantalla de temas
  mostrarPantallaTemas();
}

function iniciarTestReal() {
  const pantallaTemas = document.getElementById("pantallaTemas");
  if (pantallaTemas) pantallaTemas.style.display = "none";
  testEnCurso = true;
  // Limpieza defensiva de texto residual / debug
  document.querySelectorAll(".debug, .texto-debug").forEach(e => e.remove());

  // Quitar centrado de la pantalla inicial al empezar el test
  // (eliminado: no insertar texto fuera de zonaTest/resumenTest)
  const pantallaSeleccion = document.getElementById("pantallaSeleccion");
  if (pantallaSeleccion) {
    pantallaSeleccion.classList.remove("inicio");
  }
  const temasSeleccionados = obtenerTemasSeleccionados();

  // 🚨 Si no hay temas, NO tocar la interfaz
  if (temasSeleccionados.length === 0) {
    alert("Selecciona al menos un tema");
    mostrarPantallaInicial();
    return;
  }

  // === RESET VISUAL ANTES DE EMPEZAR TEST ===
  const resumen = document.getElementById("resumenTest");
  if (resumen) resumen.style.display = "none";

  const secciones = [
    "seccionFalladas",
    "seccionAcertadas",
    "seccionBlanco",
    "seccionMarcadas"
  ];

  secciones.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = "";
      el.style.display = "none";
    }
  });

  const resumenNumerico = document.getElementById("resumenNumerico");
  if (resumenNumerico) resumenNumerico.textContent = "";

  const progresoSesion = document.getElementById("progresoSesion");
  if (progresoSesion) progresoSesion.textContent = "";

  const tiempoFinal = document.getElementById("tiempoFinalTest");
  if (tiempoFinal) tiempoFinal.textContent = "";

  // === CAMBIO DE PANTALLA: SELECCIÓN → TEST ===
  const pantallaSeleccionCambio = document.getElementById("pantallaSeleccion");
  const zonaTestCambio = document.getElementById("zonaTest");

  if (pantallaSeleccionCambio) {
    pantallaSeleccionCambio.classList.remove("inicio");
    pantallaSeleccionCambio.style.display = "none";
  }

  if (zonaTestCambio) {
    zonaTestCambio.style.display = "block";
    zonaTestCambio.classList.remove("fade-out");
    zonaTestCambio.classList.add("fade-in");
  }

  // No recargar desde local: mantener banco sincronizado con Firebase
  // banco ya viene de Firebase en el arranque

  const zonaTest = document.getElementById("zonaTest");
  const corregirBtn = document.getElementById("corregirBtn");

  ultimaConfiguracionTest = {
    temas: temasSeleccionados.slice(),
    num: parseInt(document.getElementById("numPreguntas").value) || null
  };

  if (temasSeleccionados.includes("__falladas__")) {
    asegurarTemaFalladas();

    const falladas = banco["__falladas__"].filter(p => (p.fallada || 0) > 0);

    if (falladas.length === 0) {
      alert("No hay preguntas falladas todavía");
      return;
    }

    let pool = [];

    // Construimos pool ponderado
    falladas.forEach(p => {
      const peso = Math.max(1, p.fallada || 0);
      for (let i = 0; i < peso; i++) {
        pool.push(p);
      }
    });

    // Mezclar
    pool.sort(() => Math.random() - 0.5);

    // Seleccionar SIN repetir preguntas
    let num = parseInt(document.getElementById("numPreguntas").value);
    if (isNaN(num) || num <= 0) {
      num = falladas.length;
    }

    preguntasTest = [];
    for (let p of pool) {
      if (!preguntasTest.includes(p)) {
        preguntasTest.push(p);
      }
      if (preguntasTest.length === num) break;
    }

    // CAMBIO 2A: Capturar fallos antes del test (modo __falladas__)
    fallosSesionAntes = 0;
    preguntasTest.forEach(p => {
      fallosSesionAntes += p.fallada || 0;
    });

    zonaTest.innerHTML = "";
    zonaTest.style.display = "block";
    preguntasTest.forEach((p, i) => {
      zonaTest.appendChild(crearBloquePregunta(p, i));
    });

    if (corregirBtn) {
      corregirBtn.style.display = "block";
    }
    // Iniciar el cronómetro justo antes de salir (falladas)
    iniciarCronometro();
    return;
  }


  zonaTest.innerHTML = "";
  zonaTest.style.display = "block";

  if (corregirBtn) {
    corregirBtn.style.display = "block";
  }

  let poolPreguntas = [];
  let num = parseInt(document.getElementById("numPreguntas").value);

  const repasoSimpleActivo = document.getElementById("modoRepasoSimple")?.checked;

  // Si el modo repaso simple está activo, forzar desactivación de los otros modos
  let repasoActivo = document.getElementById("modoRepasoInteligente")?.checked;
  let soloNuevasActivo = document.getElementById("soloNuevasToggle")?.checked;

  if (repasoSimpleActivo) {
    repasoActivo = false;
    soloNuevasActivo = false;
  }

  // Construir pool base SOLO con los temas y subtemas seleccionados
  temasSeleccionados.forEach(sel => {
    const tema = sel.tema;
    const subtema = sel.subtema;

    const preguntasTema = banco[tema];
    if (!Array.isArray(preguntasTema)) return;

    if (!subtema) {
      // Tema completo
      preguntasTema.forEach(p => {
        poolPreguntas.push(p);
      });
    } else {
      // Solo subtema específico
      preguntasTema.forEach(p => {
        const sub = p.subtema || "General";
        if (sub === subtema) {
          poolPreguntas.push(p);
        }
      });
    }
  });

  // Eliminar preguntas duplicadas por id o texto
  const mapaUnico = new Map();
  poolPreguntas.forEach(p => {
    const clave = p.id || p.pregunta;
    if (!mapaUnico.has(clave)) {
      mapaUnico.set(clave, p);
    }
  });
  poolPreguntas = Array.from(mapaUnico.values());

  // Seguridad: si no hay preguntas tras el filtro, salir
  if (poolPreguntas.length === 0) {
    alert("No hay preguntas en los temas seleccionados");
    mostrarPantallaInicial();
    return;
  }

  // Filtro: solo preguntas nuevas (sin fallos)
  if (soloNuevasActivo) {
    poolPreguntas = poolPreguntas.filter(p => (p.fallada || 0) === 0);

    // Si no quedan preguntas tras el filtro, volver a la pantalla inicial
    if (poolPreguntas.length === 0) {
      alert("No hay preguntas nuevas en los temas seleccionados");
      mostrarPantallaInicial();
      return;
    }
  }

  // --- Modo repaso simple ---
  if (repasoSimpleActivo) {
    if (isNaN(num) || num <= 0) {
      num = poolPreguntas.length;
    }

    if (poolPreguntas.length === 0) {
      alert("No hay preguntas en los temas seleccionados");
      return;
    }

    preguntasTest = poolPreguntas
      .sort(() => Math.random() - 0.5)
      .slice(0, num);
  } else if (repasoActivo) {
    let falladas = [];
    let nuevas = [];

    // Solo falladas y nuevas de los temas y subtemas seleccionados
    temasSeleccionados.forEach(sel => {
      const tema = sel.tema;
      const subtema = sel.subtema;

      const preguntasTema = banco[tema];
      if (!Array.isArray(preguntasTema)) return;

      preguntasTema.forEach(p => {
        const sub = p.subtema || "General";

        // Si hay subtema seleccionado, filtrar
        if (subtema && sub !== subtema) return;

        if ((p.fallada || 0) > 0) {
          falladas.push(p);
        } else {
          nuevas.push(p);
        }
      });
    });

    if (isNaN(num) || num <= 0) {
      num = falladas.length + nuevas.length;
    }

    // 70% falladas, 30% nuevas
    const numFalladas = Math.round(num * 0.7);
    const numNuevas = num - numFalladas;

    const seleccionFalladas = seleccionarPreguntasPonderadas(falladas, numFalladas);
    const seleccionNuevas = seleccionarPreguntasPonderadas(nuevas, numNuevas);

    preguntasTest = [...seleccionFalladas, ...seleccionNuevas]
      .sort(() => Math.random() - 0.5);

  } else {
    if (isNaN(num) || num <= 0) {
      num = poolPreguntas.length;
    }

    if (poolPreguntas.length === 0) {
      alert("No hay preguntas en los temas seleccionados");
      return;
    }

    if (modoSimulacro) {
      const tipoOpciones = document.getElementById("tipoOpcionesSimulacro")?.value;

      let poolSimulacro = poolPreguntas;

      // Filtrar por número de opciones si está definido
      if (tipoOpciones === "3") {
        poolSimulacro = poolPreguntas.filter(p => p.opciones.length === 3);
      } else if (tipoOpciones === "4") {
        poolSimulacro = poolPreguntas.filter(p => p.opciones.length === 4);
      }

      if (poolSimulacro.length === 0) {
        alert("No hay preguntas con ese tipo de respuestas en los temas seleccionados");
        mostrarPantallaInicial();
        return;
      }

      // Usar el número general de preguntas
      const total = (isNaN(num) || num <= 0)
        ? poolSimulacro.length
        : num;

      preguntasTest = poolSimulacro
        .sort(() => Math.random() - 0.5)
        .slice(0, total);
    } else {
      preguntasTest = seleccionarPreguntasPonderadas(
        poolPreguntas,
        num
      );
    }
  }

  // CAMBIO 2B: Capturar fallos antes del test (modo normal)
  fallosSesionAntes = 0;
  preguntasTest.forEach(p => {
    fallosSesionAntes += p.fallada || 0;
  });

  if (!preguntasTest || preguntasTest.length === 0) {
    alert("No hay preguntas que coincidan con esa configuración.");
    mostrarPantallaInicial();
    return;
  }

  preguntasTest.forEach((p, i) => {
    zonaTest.appendChild(crearBloquePregunta(p, i));
  });

  if (corregirBtn) {
    corregirBtn.style.display = "block";
  }
  // Iniciar el cronómetro justo después de pintar preguntas (modo normal)
  iniciarCronometro();
}

function corregirTest() {
  testEnCurso = false;
  const zonaTest = document.getElementById("zonaTest");
  const corregirBtn = document.getElementById("corregirBtn");

  preguntasAcertadas = [];
  preguntasFalladas = [];
  preguntasMarcadas = [];
  preguntasEnBlanco = [];
  const bloquesPreguntas = Array.from(
    zonaTest.querySelectorAll("div")
  ).filter(div =>
    div.querySelectorAll("input[type=radio]").length > 0
  );

  bloquesPreguntas.forEach((div, i) => {
    const p = preguntasTest[i];
    const marcada = div.querySelector("input[type=radio]:checked");

    // Guardar las marcadas para revisar
    const marcadaParaRevisar = div.querySelector(".marcar-pregunta")?.checked;
    if (marcadaParaRevisar) {
      preguntasMarcadas.push({
        pregunta: p.pregunta,
        correcta: p.opciones[p.correcta],
        feedback: p.feedback || ""
      });
    }

    if (!marcada) {
      p.respuestaUsuario = null;
      preguntasEnBlanco.push({
        pregunta: p.pregunta,
        correcta: p.opciones[p.correcta],
        feedback: p.feedback || ""
      });
      return; // ← CLAVE: no se evalúa como fallada ni acertada
      // Confirmado: el return impide que se pinte fondo rojo, se llame a actualizarPreguntaFallada o se agregue a preguntasFalladas.
    }

    const respuestaUsuario = marcada ? parseInt(marcada.value) : null;
    p.respuestaUsuario = respuestaUsuario;

    const resultado = {
      pregunta: p.pregunta,
      correcta: p.opciones[p.correcta],
      marcada: respuestaUsuario !== null ? p.opciones[respuestaUsuario] : "Sin responder",
      feedback: p.feedback || ""
    };

    if (respuestaUsuario === null) {
      // No se cuenta como fallada ni acertada
      // No actualizarPreguntaFallada ni estilos de fondo
    } else if (respuestaUsuario !== p.correcta) {
      div.style.background = "#ffe6e6";
      preguntasFalladas.push(resultado);
      actualizarPreguntaFallada(p, false);
    } else {
      div.style.background = "#e6ffe6";
      preguntasAcertadas.push(resultado);
      actualizarPreguntaFallada(p, true);
    }

    if (p.feedback) {
      const btn = document.createElement("button");
      btn.textContent = "Ver explicación";
      btn.style.marginTop = "6px";
      btn.style.fontSize = "12px";
      btn.style.cursor = "pointer";

      const fb = document.createElement("div");
      fb.style.marginTop = "5px";
      fb.style.whiteSpace = "pre-line";
      fb.style.display = "none";
      fb.innerHTML = `<em>Explicación:</em>\n${p.feedback}`;

      btn.onclick = () => {
        fb.style.display = fb.style.display === "none" ? "block" : "none";
      };

      div.appendChild(btn);
      div.appendChild(fb);
    }
  });

  // Guardado local solo como copia de seguridad
  guardarBancoLocal();
  if (corregirBtn) {
    corregirBtn.style.display = "none";
  }
  zonaTest.style.display = "none";
  detenerCronometro();
  mostrarTiempoFinal();

  const pantallaSeleccion = document.getElementById("pantallaSeleccion");
  if (pantallaSeleccion) pantallaSeleccion.style.display = "none";

  // CAMBIO 3: Capturar fallos después de corregir
  fallosSesionDespues = 0;
  preguntasTest.forEach(p => {
    fallosSesionDespues += p.fallada || 0;
  });

  // CAMBIO 3: limpieza visual para evitar radios fantasma
  zonaTest.innerHTML = "";

  // Reconstruir tema de falladas tras corregir
  banco["__falladas__"] = [];
  Object.keys(banco).forEach(tema => {
    if (tema === "__falladas__") return;
    banco[tema].forEach(p => {
      const fallos = Number(p.fallada) || 0;
      if (fallos > 0) {
        banco["__falladas__"].push(p);
      }
    });
  });

  // Actualizar contadores visibles
  if (typeof pintarCheckboxesTemas === "function") {
    pintarCheckboxesTemas();
  }

  mostrarResumen();

  // Guardar historial del test
  try {
    const aciertos = preguntasAcertadas.length;
    const fallos = preguntasFalladas.length;
    const enBlanco = preguntasEnBlanco.length;
    const total = preguntasTest.length || 1;

    // Calcular nota rápida (misma lógica básica)
    let penalizacion = 0;
    const tipo = preguntasTest[0]?.opciones?.length || 4;
    if (tipo === 4) penalizacion = fallos * 0.25;
    else if (tipo === 3) penalizacion = fallos * (1 / 3);

    let neta = aciertos - penalizacion;
    if (neta < 0) neta = 0;
    let nota = (neta / total) * 10;
    nota = Math.max(0, Math.min(10, nota));

    let historial = JSON.parse(localStorage.getItem("historialTests") || "[]");
    historial.push({
      fecha: new Date().toISOString(),
      aciertos,
      fallos,
      enBlanco,
      nota: Number(nota.toFixed(3)),
      temas: (ultimaConfiguracionTest && ultimaConfiguracionTest.temas) || []
    });
    localStorage.setItem("historialTests", JSON.stringify(historial));
    // Refrescar historial en pantalla si existe el contenedor
    if (typeof renderizarHistorial === "function") {
      renderizarHistorial("todos");
    }
  } catch (e) {
    console.warn("No se pudo guardar historial:", e);
  }
}

function obtenerTemasSeleccionados() {
  const checks = Array.from(
    document.querySelectorAll("#temasCheckboxes input:checked")
  );

  const resultado = [];

  checks.forEach(el => {
    const tipo = el.dataset.tipo;
    const valor = el.value;

    if (tipo === "tema") {
      resultado.push({ tema: valor, subtema: null });
    } else if (tipo === "subtema") {
      const [tema, subtema] = valor.split("||");
      resultado.push({ tema, subtema });
    }
  });

  return resultado;
}

function seleccionarTodos() {
  document
    .querySelectorAll("#temasCheckboxes input[type='checkbox']")
    .forEach(cb => cb.checked = true);
  actualizarEstadoBotonEmpezar();
}

function limpiarSeleccion() {
  document
    .querySelectorAll("#temasCheckboxes input[type='checkbox']")
    .forEach(cb => cb.checked = false);
  actualizarEstadoBotonEmpezar();
}


function mostrarResumen() {
  actualizarProgresoSesion();

  const resumen = document.getElementById("resumenTest");
  const resumenNumerico = document.getElementById("resumenNumerico");
  const seccionFalladas = document.getElementById("seccionFalladas");
  const seccionAcertadas = document.getElementById("seccionAcertadas");
  const seccionBlanco = document.getElementById("seccionBlanco");
  const seccionMarcadas = document.getElementById("seccionMarcadas");

  resumen.style.display = "block";

  seccionFalladas.innerHTML = "";
  seccionAcertadas.innerHTML = "";
  seccionBlanco.innerHTML = "";
  seccionMarcadas.innerHTML = "";

  let aciertos = 0;
  let fallos = 0;
  let blancos = 0;
  let totalPreguntas = preguntasTest.length;
  let tipoRespuestas = 4; // por defecto

  preguntasTest.forEach((p, idx) => {
    const div = document.createElement("div");
    div.style.marginBottom = "12px";

    div.innerHTML = `
      <strong>${idx + 1}. ${p.pregunta}</strong>
      <div style="margin-top:6px;">
        ${renderizarOpcionesCorregidas(p)}
      </div>
      ${p.feedback ? `
        <button class="toggle-feedback" data-i="${idx}" style="margin-top:6px; font-size:12px; cursor:pointer;">
          Ver explicación
        </button>
        <div class="feedback-${idx}" style="margin-top:6px; display:none; white-space:pre-line;">
          <em>${p.feedback}</em>
        </div>
      ` : ""}
    `;

    // Clasificación
    if (p.respuestaUsuario === null || p.respuestaUsuario === undefined) {
      blancos++;
      seccionBlanco.appendChild(div);
    } else if (p.respuestaUsuario === p.correcta) {
      aciertos++;
      seccionAcertadas.appendChild(div);
    } else {
      fallos++;
      seccionFalladas.appendChild(div);
    }

    // Marcadas para revisar
    const marcada = preguntasMarcadas.find(m => m.pregunta === p.pregunta);
    if (marcada) {
      seccionMarcadas.appendChild(div.cloneNode(true));
    }
  });

  // Detectar tipo de respuestas (3 o 4)
  if (preguntasTest.length > 0) {
    tipoRespuestas = preguntasTest[0].opciones.length;
  }

  // Calcular penalización
  let penalizacion = 0;
  if (tipoRespuestas === 4) {
    penalizacion = fallos * 0.25; // cada 4 mal = -1
  } else if (tipoRespuestas === 3) {
    penalizacion = fallos * (1/3); // cada 3 mal = -1
  }

  // Puntuación bruta
  let puntuacionNeta = aciertos - penalizacion;
  if (puntuacionNeta < 0) puntuacionNeta = 0;

  // Escala de 0 a 10
  let nota = 0;
  if (totalPreguntas > 0) {
    nota = (puntuacionNeta / totalPreguntas) * 10;
  }

  // Limitar a 3 decimales
  nota = Math.max(0, Math.min(10, nota));
  const notaTexto = nota.toFixed(3);

  resumenNumerico.innerHTML = `
    Aciertos: ${aciertos} | Fallos: ${fallos} | En blanco: ${blancos}
    <br>
    <strong style="color:${nota < 5 ? 'red' : 'var(--accent-success)'};">
      Nota final: ${notaTexto} / 10
    </strong>
  `;

  // Mostrar GIF de pleno de aciertos
  const gif = document.getElementById("gifPerfecto");
  const img = document.getElementById("gifPerfectoImg");
  if (gif && img) {
    if (fallos === 0 && blancos === 0 && aciertos > 0) {
      gif.style.display = "block";
    } else {
      gif.style.display = "none";
    }
  }

  // Sonido de felicitación en pleno de aciertos
  const audio = document.getElementById("audioFelicitacion");
  if (audio) {
    if (fallos === 0 && blancos === 0 && aciertos > 0) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  }

  // Activar botones de feedback
  resumen.querySelectorAll(".toggle-feedback").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = btn.dataset.i;
      const fb = resumen.querySelector(".feedback-" + i);
      if (fb) {
        fb.style.display = fb.style.display === "none" ? "block" : "none";
      }
    });
  });
}

function toggleSeccion(tipo) {
  const map = {
    falladas: "seccionFalladas",
    acertadas: "seccionAcertadas",
    marcadas: "seccionMarcadas",
    blanco: "seccionBlanco"
  };

  const el = document.getElementById(map[tipo]);
  if (!el) return;

  el.style.display = el.style.display === "none" ? "block" : "none";
}

function asegurarTemaFalladas() {
  if (!banco["__falladas__"]) {
    banco["__falladas__"] = [];
  }
}

function actualizarPreguntaFallada(pregunta, acertada) {
  const actual = Number(pregunta.fallada) || 0;
  let nuevo = actual;

  // Solo aumentar cuando se falla. Nunca reducir automáticamente.
  if (!acertada) {
    nuevo = actual + 1;
  }

  pregunta.fallada = nuevo;

  // Sincronizar en Firebase
  if (pregunta.id && window.actualizarFallada) {
    window.actualizarFallada(pregunta.id, nuevo);
  }
}

function seleccionarPreguntasPonderadas(preguntas, num) {
  // Eliminar duplicados reales antes de ponderar
  const mapaUnico = new Map();
  preguntas.forEach(p => {
    const clave = p.id || p.pregunta;
    if (!mapaUnico.has(clave)) {
      mapaUnico.set(clave, p);
    }
  });

  const preguntasUnicas = Array.from(mapaUnico.values());

  // Crear pool ponderado
  let pool = [];
  preguntasUnicas.forEach(p => {
    const peso = 1 + (p.fallada || 0);
    for (let i = 0; i < peso; i++) {
      pool.push(p);
    }
  });

  // Mezclar
  pool.sort(() => Math.random() - 0.5);

  // Seleccionar sin repetir
  const seleccionadas = [];
  const usadas = new Set();

  for (let p of pool) {
    const clave = p.id || p.pregunta;
    if (!usadas.has(clave)) {
      seleccionadas.push(p);
      usadas.add(clave);
    }
    if (seleccionadas.length === num) break;
  }

  return seleccionadas;
}

/* ===== CAPA E1: RESET DE ESTADÍSTICAS ===== */

// Resetear TODAS las estadísticas de fallos
function resetearEstadisticas() {
  if (!confirm("¿Seguro que quieres resetear TODAS las estadísticas de fallos?")) {
    return;
  }

  // Resetear contadores de todas las preguntas falladas
  if (banco["__falladas__"]) {
    banco["__falladas__"].forEach(p => {
      p.fallada = 0;
    });
  }

  guardarBancoLocal();
  alert("Estadísticas reseteadas correctamente");

  // Refrescar contadores visibles si existen
  if (typeof pintarCheckboxesTemas === "function") {
    pintarCheckboxesTemas();
  }
}

// Resetear SOLO el tema de preguntas más falladas
function resetearSoloFalladas() {
  if (!confirm("¿Seguro que quieres resetear solo las preguntas más falladas?")) {
    return;
  }

  // Poner a 0 el contador en todas las preguntas reales
  Object.keys(banco).forEach(tema => {
    if (tema === "__falladas__") return;

    banco[tema].forEach(p => {
      if ((p.fallada || 0) > 0) {
        p.fallada = 0;

        // Sincronizar con Firebase
        if (p.id && window.actualizarFallada) {
          window.actualizarFallada(p.id, 0);
        }
      }
    });
  });

  // Reconstruir el tema de falladas vacío
  banco["__falladas__"] = [];

  guardarBancoLocal();
  alert("Preguntas más falladas reseteadas");

  if (typeof pintarCheckboxesTemas === "function") {
    pintarCheckboxesTemas();
  }
}

// 🔄 Resetear fallos por tema (NUEVA)
function resetearFallosPorTema() {
  let tema = null;

  // Prioridad: selector específico si existe
  const select = document.getElementById("selectorTemaReset");
  if (select && select.value) {
    tema = select.value;
  } else {
    // Si no hay selector, usar el tema marcado en los checkboxes
    const seleccionados = obtenerTemasSeleccionados();
    if (seleccionados.length === 1) {
      tema = seleccionados[0];
    }
  }

  if (!tema) {
    alert("Selecciona un solo tema para restablecer sus estadísticas.");
    return;
  }

  if (!banco[tema]) {
    alert("Tema no válido.");
    return;
  }

  if (!banco[tema]) {
    alert("Tema no válido.");
    return;
  }

  if (!confirm(`¿Restablecer estadísticas del tema "${tema}"?`)) {
    return;
  }

  // Resetear fallos de las preguntas del tema
  banco[tema].forEach(p => {
    if ((p.fallada || 0) > 0) {
      p.fallada = 0;

      // Sincronizar con Firebase
      if (p.id && window.actualizarFallada) {
        window.actualizarFallada(p.id, 0);
      }
    }
  });

  // Limpiar del banco de falladas las de ese tema
  if (banco["__falladas__"]) {
    banco["__falladas__"] = banco["__falladas__"].filter(p => {
      return !banco[tema].some(tp => tp.pregunta === p.pregunta);
    });
  }

  // Reconstruir tema de falladas tras el reset
  banco["__falladas__"] = [];
  Object.keys(banco).forEach(t => {
    if (t === "__falladas__") return;
    banco[t].forEach(p => {
      const fallos = Number(p.fallada) || 0;
      if (fallos > 0) {
        banco["__falladas__"].push(p);
      }
    });
  });

  guardarBancoLocal();

  alert(`Estadísticas del tema "${tema}" restablecidas.`);

  // Refrescar contadores
  if (typeof pintarCheckboxesTemas === "function") {
    pintarCheckboxesTemas();
  }
}

// Alias para botones del HTML
function restablecerFalladas() {
  resetearEstadisticas();
}

function restablecerTema() {
  resetearFallosPorTema();
}


/* ===== CAPA G1: REPETIR TEST ===== */

function repetirTest() {
  if (!ultimaConfiguracionTest) return;

  // Limpiar selección actual
  document
    .querySelectorAll("#temasCheckboxes input[type='checkbox']")
    .forEach(cb => cb.checked = false);

  // Reaplicar selección de temas y subtemas
  if (Array.isArray(ultimaConfiguracionTest.temas)) {
    ultimaConfiguracionTest.temas.forEach(sel => {
      if (!sel) return;

      if (sel.subtema) {
        const valor = sel.tema + "||" + sel.subtema;
        const cb = document.querySelector(
          `#temasCheckboxes input[data-tipo="subtema"][value="${valor}"]`
        );
        if (cb) cb.checked = true;
      } else {
        const cb = document.querySelector(
          `#temasCheckboxes input[data-tipo="tema"][value="${sel.tema}"]`
        );
        if (cb) cb.checked = true;
      }
    });
  }

  // Reaplicar número de preguntas
  const inputNum = document.getElementById("numPreguntas");
  if (inputNum && ultimaConfiguracionTest.num) {
    inputNum.value = ultimaConfiguracionTest.num;
  }

  ocultarResumen();
  ocultarCronometro();

  // Lanzar directamente el test real
  iniciarTestReal();
}

function ocultarResumen() {
  const resumen = document.getElementById("resumenTest");
  if (resumen) resumen.style.display = "none";
}

/* ===== CAPA G2: VOLVER A SELECCIÓN ===== */

function volverASeleccion() {
  const zonaTest = document.getElementById("zonaTest");
  const resumen = document.getElementById("resumenTest");
  const corregirBtn = document.getElementById("corregirBtn");

  // Detectar si hay un test en curso sin corregir
  const testActivo = zonaTest && zonaTest.style.display === "block";

  if (testActivo && preguntasTest.length > 0 && corregirBtn && corregirBtn.style.display === "block") {
    const salir = confirm("Hay un test en curso. ¿Quieres salir y guardar el progreso?");
    if (!salir) return;

    // Guardar respuestas actuales
    const respuestas = [];
    const bloques = zonaTest.querySelectorAll("div");

    bloques.forEach((div, i) => {
      const radio = div.querySelector("input[type=radio]:checked");
      const marcada = div.querySelector(".marcar-pregunta")?.checked || false;

      respuestas.push({
        respuesta: radio ? parseInt(radio.value) : null,
        marcada: marcada
      });
    });

    // Guardar progreso completo
    localStorage.setItem(
      "progresoTest",
      JSON.stringify({
        configuracion: ultimaConfiguracionTest,
        respuestas: respuestas,
        timestamp: Date.now()
      })
    );
  }

  if (zonaTest) {
    zonaTest.classList.remove("fade-in");
    zonaTest.style.display = "none";
  }

  if (resumen) resumen.style.display = "none";
  if (corregirBtn) corregirBtn.style.display = "none";

  // Restaurar pantalla inicial centrada
  mostrarPantallaInicial();

  ocultarCronometro();

  if (typeof cargarTemas === "function") {
    cargarTemas();
  }
  testEnCurso = false;
}
// CAMBIO 4: Mostrar el progreso en el resumen de sesión
function actualizarProgresoSesion() {
  const cont = document.getElementById("progresoSesion");
  if (!cont) return;

  const mejora = fallosSesionAntes - fallosSesionDespues;

  cont.textContent =
    mejora > 0
      ? `Fallos en esta sesión: ${fallosSesionAntes} → ${fallosSesionDespues} (↓ ${mejora})`
      : `Fallos en esta sesión: ${fallosSesionAntes} → ${fallosSesionDespues}`;
}

/* ===== CAPA H1: CRONÓMETRO ===== */

function iniciarCronometro() {
  detenerCronometro();

  const cont = document.getElementById("cronometro");
  if (cont) cont.style.display = "block";

  if (modoSimulacro) {
    const minutos = parseInt(document.getElementById("tiempoSimulacro")?.value);
    segundosRestantes = (isNaN(minutos) || minutos <= 0 ? 60 : minutos) * 60;
    segundosTest = 0;

    actualizarVistaCronometro();

    cronometroInterval = setInterval(() => {
      segundosRestantes--;
      segundosTest++;

      actualizarVistaCronometro();

      if (segundosRestantes <= 0) {
        detenerCronometro();
        corregirTest();
      }
    }, 1000);

  } else {
    segundosTest = 0;
    actualizarVistaCronometro();

    cronometroInterval = setInterval(() => {
      segundosTest++;
      actualizarVistaCronometro();
    }, 1000);
  }
}

function detenerCronometro() {
  if (cronometroInterval) {
    clearInterval(cronometroInterval);
    cronometroInterval = null;
  }
}

function actualizarVistaCronometro() {
  const span = document.getElementById("tiempoTest");
  if (!span) return;

  const total = modoSimulacro ? segundosRestantes : segundosTest;
  const min = String(Math.max(0, Math.floor(total / 60))).padStart(2, "0");
  const sec = String(Math.max(0, total % 60)).padStart(2, "0");

  span.textContent = `${min}:${sec}`;
}

function ocultarCronometro() {
  detenerCronometro();
  const cont = document.getElementById("cronometro");
  if (cont) cont.style.display = "none";
}

/* ===== TIEMPO FINAL EN RESUMEN ===== */

function mostrarTiempoFinal() {
  const p = document.getElementById("tiempoFinalTest");
  if (!p) return;

  const min = String(Math.floor(segundosTest / 60)).padStart(2, "0");
  const sec = String(segundosTest % 60).padStart(2, "0");

  p.textContent = `⏱️ Tiempo empleado: ${min}:${sec}`;
}

// Controlar el estado del botón Empezar Test según selección de temas
function actualizarEstadoBotonEmpezar() {
  const btn = document.getElementById("btnEmpezarTest");
  if (!btn) return;

  // Comprobar si hay algún modo activo
  const simulacro = document.getElementById("simulacroToggle")?.checked;
  const repasoInt = document.getElementById("modoRepasoInteligente")?.checked;
  const repasoSimple = document.getElementById("modoRepasoSimple")?.checked;
  const soloNuevas = document.getElementById("soloNuevasToggle")?.checked;

  const hayModoActivo = simulacro || repasoInt || repasoSimple || soloNuevas;

  btn.disabled = !hayModoActivo;
  btn.classList.toggle("btn-disabled", !hayModoActivo);

  if (!hayModoActivo) {
    btn.style.pointerEvents = "none";
  } else {
    btn.style.pointerEvents = "auto";
  }

  const tooltip = document.getElementById("tooltipEmpezar");
  if (tooltip) {
    tooltip.textContent = "Selecciona un modo para comenzar";
    tooltip.style.display = hayModoActivo ? "none" : "block";
  }
}

// ===== AUTOGUARDADO PERIÓDICO DEL PROGRESO =====
function autoGuardarProgreso() {
  const zonaTest = document.getElementById("zonaTest");
  if (!zonaTest || !preguntasTest || preguntasTest.length === 0) return;

  const bloques = zonaTest.querySelectorAll("div");
  const respuestas = [];

  bloques.forEach((div, i) => {
    const radio = div.querySelector("input[type=radio]:checked");
    const marcada = div.querySelector(".marcar-pregunta")?.checked || false;

    respuestas.push({
      respuesta: radio ? parseInt(radio.value) : null,
      marcada: marcada
    });
  });

  localStorage.setItem(
    "progresoTest",
    JSON.stringify({
      configuracion: ultimaConfiguracionTest,
      respuestas: respuestas,
      timestamp: Date.now()
    })
  );
  // Sincronización remota si está disponible
  if (window.guardarProgresoRemoto) {
    window.guardarProgresoRemoto({
      configuracion: ultimaConfiguracionTest,
      respuestas: respuestas,
      timestamp: Date.now()
    });
  }
}

// ===== PROTECCIÓN CONTRA ABANDONO DEL TEST =====
window.addEventListener("beforeunload", function (e) {
  if (testEnCurso) {
    e.preventDefault();
    e.returnValue = "";
  }
});

window.mostrarPantallaInicial = mostrarPantallaInicial;
window.mostrarPantallaTemas = mostrarPantallaTemas;
window.mostrarPantallaHistorial = mostrarPantallaHistorial;
window.iniciarTest = iniciarTest;
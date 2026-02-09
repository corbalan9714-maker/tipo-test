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

function cargarBanco() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
}

function guardarBanco() {
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


document.addEventListener("DOMContentLoaded", initTest);

// 🔄 Sincronización directa con el editor (misma página)
window.addEventListener("message", (e) => {
  if (e.data && e.data.type === "BANCO_ACTUALIZADO") {
    banco = cargarBanco();
    pintarCheckboxesTemas();
  }
});

// 🔄 Sincronización automática con el editor
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) {
    banco = cargarBanco();
    pintarCheckboxesTemas();
  }
});

async function initTest() {
  // Cargar banco desde Firebase si está disponible
  if (window.cargarDesdeFirebase) {
    banco = await window.cargarDesdeFirebase();
    console.log("Banco cargado desde Firebase al iniciar test");
  } else {
    banco = cargarBanco();
  }

  // Reconstruir tema de falladas desde los datos de Firebase
  asegurarTemaFalladas();
  banco["__falladas__"] = [];

  Object.keys(banco).forEach(tema => {
    if (tema === "__falladas__") return;

    banco[tema].forEach(p => {
      const fallos = p.fallada || p.fallos || 0;
      if (fallos > 0) {
        banco["__falladas__"].push({
          pregunta: p.pregunta,
          opciones: p.opciones,
          correcta: p.correcta,
          feedback: p.feedback || "",
          fallos: fallos,
          id: p.id
        });
      }
    });
  });

  // No guardar en localStorage para no sobrescribir datos de Firebase

  cargarTemas();

  // 🔒 Asegurar visibilidad de temas al cargar
  const contTemas = document.getElementById("temasCheckboxes");
  if (contTemas) {
    contTemas.style.display = "block";
  }

  const toggleSim = document.getElementById("simulacroToggle");
  const configSim = document.getElementById("simulacroConfig");

  if (toggleSim && configSim) {
    toggleSim.addEventListener("change", () => {
      modoSimulacro = toggleSim.checked;
      configSim.style.display = modoSimulacro ? "block" : "none";
    });
  }

  // 🔄 Botón: resetear preguntas más falladas
  const btnResetFalladas = document.getElementById("resetFallosBtn");
  if (btnResetFalladas) {
    btnResetFalladas.addEventListener("click", () => {
      resetearSoloFalladas();
    });
  }

  // 🔄 Reset por tema: rellenar selector
  const resetTemaSelect = document.getElementById("resetTemaSelect");
  if (resetTemaSelect) {
    resetTemaSelect.innerHTML = '<option value="">— Selecciona un tema —</option>';

    Object.keys(banco).forEach(tema => {
      if (tema === "__falladas__") return;

      const opt = document.createElement("option");
      opt.value = tema;
      opt.textContent = tema;
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
        <input type="radio" name="p${i}" value="${idx}">
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

  Object.keys(banco).forEach(tema => {
    let nombreVisible = tema;
    let contador = 0;

    if (tema === "__falladas__") {
      nombreVisible = "📌 Preguntas más falladas";
      contador = banco["__falladas__"].filter(p => p.fallos > 0).length;
    } else {
      contador = banco[tema].length;
    }

    const label = document.createElement("label");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = tema;
    checkbox.addEventListener("change", actualizarEstadoBotonEmpezar);

    label.appendChild(checkbox);
    label.appendChild(
      document.createTextNode(` ${nombreVisible} (${contador})`)
    );

    contenedor.appendChild(label);
    contenedor.appendChild(document.createElement("br"));
  });
  actualizarEstadoBotonEmpezar();
}

async function iniciarTest() {
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

    const zonaTest = document.getElementById("zonaTest");
    if (zonaTest) {
      zonaTest.innerHTML = "";
      zonaTest.style.display = "none";
    }

    const pantallaSeleccion = document.getElementById("pantallaSeleccion");
    if (pantallaSeleccion) pantallaSeleccion.style.display = "block";

    ocultarCronometro();
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

  // Cargar banco desde Firebase antes de iniciar el test
  if (window.cargarDesdeFirebase) {
    banco = await window.cargarDesdeFirebase();
  } else {
    banco = cargarBanco();
  }

  const zonaTest = document.getElementById("zonaTest");
  const corregirBtn = document.getElementById("corregirBtn");

  ultimaConfiguracionTest = {
    temas: temasSeleccionados.slice(),
    num: parseInt(document.getElementById("numPreguntas").value) || null
  };

  if (
    temasSeleccionados.length === 1 &&
    temasSeleccionados.includes("__falladas__")
  ) {
    asegurarTemaFalladas();

    const falladas = banco["__falladas__"].filter(p => p.fallos > 0);

    if (falladas.length === 0) {
      alert("No hay preguntas falladas todavía");
      return;
    }

    let pool = [];

    // Construimos pool ponderado
    falladas.forEach(p => {
      const peso = Math.max(1, p.fallos);
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
      fallosSesionAntes += p.fallos || 0;
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

  temasSeleccionados.forEach(t => {
    if (banco[t]) {
      poolPreguntas = poolPreguntas.concat(banco[t]);
    }
  });

  // Eliminar duplicados combinando por id (Firebase) o por contenido completo de la pregunta
  const mapaUnicas = new Map();
  poolPreguntas.forEach(p => {
    let clave;
    if (p.id) {
      clave = p.id;
    } else {
      // Clave basada en todo el contenido para no eliminar preguntas distintas con el mismo enunciado
      clave = JSON.stringify({
        pregunta: p.pregunta,
        opciones: p.opciones,
        correcta: p.correcta
      });
    }

    if (!mapaUnicas.has(clave)) {
      mapaUnicas.set(clave, p);
    }
  });
  poolPreguntas = Array.from(mapaUnicas.values());
  if (isNaN(num) || num <= 0) {
    num = poolPreguntas.length;
  }

  if (poolPreguntas.length === 0) {
    alert("No hay preguntas en los temas seleccionados");
    return;
  }

  if (modoSimulacro) {
    preguntasTest = poolPreguntas
      .sort(() => Math.random() - 0.5)
      .slice(0, num);
  } else {
    preguntasTest = seleccionarPreguntasPonderadas(
      poolPreguntas,
      num
    );
  }
  // CAMBIO 2B: Capturar fallos antes del test (modo normal)
  fallosSesionAntes = 0;
  preguntasTest.forEach(p => {
    fallosSesionAntes += p.fallos || 0;
  });

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
      const fb = document.createElement("div");
      fb.style.marginTop = "5px";
      fb.innerHTML = `<em>Explicación:</em> ${p.feedback}`;
      div.appendChild(fb);
    }
  });

  guardarBanco();
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
    fallosSesionDespues += p.fallos || 0;
  });

  // CAMBIO 3: limpieza visual para evitar radios fantasma
  zonaTest.innerHTML = "";

  mostrarResumen();
}

function obtenerTemasSeleccionados() {
  return Array.from(
    document.querySelectorAll("#temasCheckboxes input:checked")
  ).map(el => el.value);
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

  preguntasTest.forEach((p, idx) => {
    const div = document.createElement("div");
    div.style.marginBottom = "12px";

    div.innerHTML = `
      <strong>${idx + 1}. ${p.pregunta}</strong>
      <div style="margin-top:6px;">
        ${renderizarOpcionesCorregidas(p)}
      </div>
      ${p.feedback ? `<div style="margin-top:6px;"><em>${p.feedback}</em></div>` : ""}
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

  resumenNumerico.textContent =
    `Aciertos: ${aciertos} | Fallos: ${fallos} | En blanco: ${blancos}`;
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
  asegurarTemaFalladas();

  const lista = banco["__falladas__"];
  let existente = lista.find(p => p.pregunta === pregunta.pregunta);

  if (!existente) {
    existente = {
      pregunta: pregunta.pregunta,
      opciones: pregunta.opciones,
      correcta: pregunta.correcta,
      feedback: pregunta.feedback || "",
      fallos: 0
    };
    lista.push(existente);
  }

  if (acertada) {
    existente.fallos = Math.max(0, existente.fallos - 1);
  } else {
    existente.fallos += 1;
  }

  // Actualizar también el contador en la pregunta original
  if (typeof pregunta.fallos === "number") {
    pregunta.fallos = existente.fallos;
  } else {
    pregunta.fallos = existente.fallos;
  }

  // Mantener compatibilidad con el campo de Firebase
  pregunta.fallada = existente.fallos;

  // Sincronizar con Firebase si existe la función y la pregunta tiene id
  if (pregunta.id) {
    if (window.actualizarFallada) {
      console.log("Enviando fallos a Firebase:", pregunta.id, existente.fallos);
      window.actualizarFallada(pregunta.id, existente.fallos);
    } else {
      console.warn("actualizarFallada no está disponible en window");
    }
  } else {
    console.warn("Pregunta sin id, no se puede sincronizar con Firebase");
  }

  guardarBanco();
}

function seleccionarPreguntasPonderadas(preguntas, num) {
  let pool = [];

  preguntas.forEach(p => {
    const peso = 1 + (p.fallos || 0);
    for (let i = 0; i < peso; i++) {
      pool.push(p);
    }
  });

  // Mezclar
  pool.sort(() => Math.random() - 0.5);

  // Seleccionar sin duplicados
  const seleccionadas = [];
  for (let p of pool) {
    if (!seleccionadas.includes(p)) {
      seleccionadas.push(p);
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
      p.fallos = 0;
    });
  }

  guardarBanco();
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

  // Poner a cero los fallos en Firebase
  if (banco["__falladas__"] && window.actualizarFallada) {
    banco["__falladas__"].forEach(p => {
      if (p.id) {
        window.actualizarFallada(p.id, 0);
      }
    });
  }

  banco["__falladas__"] = [];
  guardarBanco();
  alert("Preguntas más falladas reseteadas");

  if (typeof pintarCheckboxesTemas === "function") {
    pintarCheckboxesTemas();
  }
}

// 🔄 Resetear fallos por tema (NUEVA)
function resetearFallosPorTema() {
  const select = document.getElementById("resetTemaSelect");
  if (!select || !select.value) {
    alert("Selecciona un tema primero.");
    return;
  }

  const tema = select.value;

  if (!banco[tema]) {
    alert("Tema no válido.");
    return;
  }

  if (!confirm(`¿Restablecer estadísticas del tema "${tema}"?`)) {
    return;
  }

  // Resetear fallos de las preguntas del tema y sincronizar con Firebase
  banco[tema].forEach(p => {
    if (typeof p.fallos === "number") {
      p.fallos = 0;
    }

    // Sincronizar con Firebase
    if (p.id && window.actualizarFallada) {
      window.actualizarFallada(p.id, 0);
    }
  });

  // Limpiar del banco de falladas las de ese tema
  if (banco["__falladas__"]) {
    banco["__falladas__"] = banco["__falladas__"].filter(p => {
      return !banco[tema].some(tp => tp.pregunta === p.pregunta);
    });
  }

  guardarBanco();

  alert(`Estadísticas del tema "${tema}" restablecidas.`);

  // Refrescar contadores
  if (typeof pintarCheckboxesTemas === "function") {
    pintarCheckboxesTemas();
  }
}


/* ===== CAPA G1: REPETIR TEST ===== */

function repetirTest() {
  if (!ultimaConfiguracionTest) return;

  // Reaplicar selección de temas
  document
    .querySelectorAll("#temasCheckboxes input[type='checkbox']")
    .forEach(cb => {
      cb.checked = ultimaConfiguracionTest.temas.includes(cb.value);
    });

  // Reaplicar número de preguntas
  const inputNum = document.getElementById("numPreguntas");
  if (inputNum && ultimaConfiguracionTest.num) {
    inputNum.value = ultimaConfiguracionTest.num;
  }

  // Ocultar resumen
  ocultarResumen();

  ocultarCronometro();

  // Lanzar nuevo test
  iniciarTest();
}

function ocultarResumen() {
  const resumen = document.getElementById("resumenTest");
  if (resumen) resumen.style.display = "none";
}

/* ===== CAPA G2: VOLVER A SELECCIÓN ===== */

function volverASeleccion() {
  const pantallaSeleccion = document.getElementById("pantallaSeleccion");
  const zonaTest = document.getElementById("zonaTest");
  const resumen = document.getElementById("resumenTest");

  if (zonaTest) {
    zonaTest.classList.remove("fade-in");
    zonaTest.style.display = "none";
  }

  if (resumen) resumen.style.display = "none";

  if (pantallaSeleccion) {
    // Limpiar cualquier estado visual previo
    pantallaSeleccion.classList.remove("fade-in");
    pantallaSeleccion.classList.remove("fade-out");

    // Restaurar pantalla inicial correctamente centrada
    pantallaSeleccion.style.display = "flex";
    pantallaSeleccion.classList.add("inicio");
  }

  ocultarCronometro();

  const corregirBtn = document.getElementById("corregirBtn");
  if (corregirBtn) corregirBtn.style.display = "none";

  if (typeof cargarTemas === "function") {
    cargarTemas();
  }

  const contTemas = document.getElementById("temasCheckboxes");
  if (contTemas) contTemas.style.display = "block";
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

  const temasSeleccionados = obtenerTemasSeleccionados();
  const habilitado = temasSeleccionados.length > 0;

  btn.disabled = !habilitado;
  btn.classList.toggle("btn-disabled", !habilitado);

  if (!habilitado) {
    btn.style.pointerEvents = "none";
  } else {
    btn.style.pointerEvents = "auto";
  }
  const tooltip = document.getElementById("tooltipEmpezar");
  if (tooltip) {
    tooltip.style.display = habilitado ? "none" : "block";
  }
}
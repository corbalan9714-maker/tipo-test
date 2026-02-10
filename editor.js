/* ====== CARGA DEL BANCO ====== */
const STORAGE_KEY = "bancoPreguntas";

function cargarBanco() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
}

function guardarBanco() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(banco));
}

let banco = cargarBanco();
let editando = null;

/* ====== INICIALIZACIÓN ====== */
document.addEventListener("DOMContentLoaded", initEditor);

function initEditor() {
  // Cargar banco con soporte offline
  if (window.cargarDesdeFirebase) {
    window.cargarDesdeFirebase()
      .then(bancoFirebase => {
        banco = bancoFirebase;
        // Guardar copia local para modo offline
        localStorage.setItem(STORAGE_KEY, JSON.stringify(banco));
      })
      .catch(() => {
        console.log("Sin conexión, usando copia local (editor)");
        banco = cargarBanco();
      })
      .finally(() => {
        limpiarTemasVacios();
        actualizarOpciones();
        cargarTemasVista();
        cargarTemasExistentes();
        cargarSelectEliminar();
        cargarSelectRenombrar();
      });
  } else {
    banco = cargarBanco();
    limpiarTemasVacios();
    actualizarOpciones();
    cargarTemasVista();
    cargarTemasExistentes();
    cargarSelectEliminar();
    cargarSelectRenombrar();
  }
  prepararValidacionFormulario();
  validarFormulario();
  prepararValidacionBorrado();
  validarBorradoTema();
  document.getElementById("temaExistente")?.addEventListener("change", controlarInputTema);

  // ===== EXPORTAR / IMPORTAR BANCO =====
  const btnExportar = document.getElementById("btnExportarBanco");
  const btnImportar = document.getElementById("btnImportarBanco");
  const inputImportar = document.getElementById("inputImportarBanco");

  // EXPORTAR
  if (btnExportar) {
    btnExportar.onclick = async () => {
      try {
        const banco = await window.cargarDesdeFirebase();
        const dataStr = JSON.stringify(banco, null, 2);

        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "banco-preguntas.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);
      } catch (err) {
        console.error(err);
        alert("Error al exportar el banco");
      }
    };
  }

  // IMPORTAR
  if (btnImportar && inputImportar) {
    btnImportar.onclick = () => inputImportar.click();

    inputImportar.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const text = await file.text();
      const bancoImportado = JSON.parse(text);

      if (!confirm("Esto añadirá las preguntas al banco actual. ¿Continuar?")) {
        return;
      }

      for (const tema in bancoImportado) {
        for (const pregunta of bancoImportado[tema]) {
          await window.guardarEnFirebase({
            tema: tema,
            pregunta: pregunta.pregunta,
            opciones: pregunta.opciones,
            correcta: pregunta.correcta,
            feedback: pregunta.feedback || "",
            fecha: Date.now()
          });
        }
      }

      alert("Banco importado correctamente.");
      location.reload();
    };
  }
}

/* ====== CREAR / EDITAR PREGUNTA ====== */
function guardarPregunta() {
  const tema = document.getElementById("tema").value.trim();
  if (!tema) {
    alert("El tema no puede estar vacío");
    return;
  }
  const pregunta = document.getElementById("pregunta").value.trim();
  const feedback = document.getElementById("feedback").value.trim();

  const opciones = Array.from(
    document.querySelectorAll(".opcion textarea")
  ).map(o => o.value.trim());

  const marcada = document.querySelector('input[name="correcta"]:checked');

  if (!tema || !pregunta || opciones.some(o => o === "") || !marcada) {
    alert("Rellena todos los campos y marca la respuesta correcta");
    return;
  }

  const correcta = Number(marcada.value);

  // MODO EDICIÓN
  if (editando) {
    const { tema: temaOriginal, index } = editando;
    const original = banco[temaOriginal][index];

    const actualizada = {
      pregunta,
      opciones,
      correcta,
      fallada: original.fallada || 0,
      feedback,
      id: original.id
    };

    banco[temaOriginal][index] = actualizada;

    // Sincronizar con Firebase si tiene id
    if (actualizada.id && window.actualizarPreguntaFirebase) {
      window.actualizarPreguntaFirebase(actualizada.id, {
        tema: temaOriginal,
        pregunta,
        opciones,
        correcta,
        feedback
      });
    }

    editando = null;
  } else {
    if (!banco[tema]) banco[tema] = [];
    banco[tema].push({
      pregunta,
      opciones,
      correcta,
      fallada: 0,
      feedback
    });
  }

  guardarBanco();
if (window.guardarEnFirebase) {
  window.guardarEnFirebase({
    tema,
    pregunta,
    opciones,
    correcta,
    feedback,
    fecha: Date.now()
  });
}
  // 🔄 Avisar al test que el banco ha cambiado
  if (window.parent) {
    window.parent.postMessage({ type: "BANCO_ACTUALIZADO" }, "*");
  }

  limpiarFormulario();
  cargarTemasVista();
  cargarTemasExistentes();
  cargarSelectEliminar();
}

/* ====== VISTA AVANZADA ====== */
function cargarTemasVista() {
  const select = document.getElementById("temaVista");
  if (!select) return;

  select.innerHTML = "";
  Object.keys(banco).forEach(tema => {
    const opt = document.createElement("option");
    opt.value = tema;
    opt.textContent = tema;
    select.appendChild(opt);
  });

  select.onchange = mostrarPreguntas;
  mostrarPreguntas();
}

function mostrarPreguntas() {
  const select = document.getElementById("temaVista");
  const contenedor = document.getElementById("listaPreguntas");
  if (!select || !contenedor) return;

  const tema = select.value;
  contenedor.innerHTML = "";
  if (!tema || !banco[tema]) return;

  banco[tema].forEach((p, i) => {
    const div = document.createElement("div");
    div.style.border = "1px solid #ccc";
    div.style.padding = "8px";
    div.style.margin = "8px 0";

    div.innerHTML = `
      <strong>${i + 1}. ${p.pregunta}</strong><br>
      <ul>
        ${p.opciones.map((op, idx) =>
          `<li ${idx === p.correcta ? 'style="font-weight:bold"' : ''}>${op}</li>`
        ).join("")}
      </ul>
      ${p.feedback ? `<div style="margin-top:6px; white-space:pre-line;"><em>Feedback:</em>\n${p.feedback}</div>` : ""}
      <button onclick="cargarParaEditar('${tema}', ${i})">Editar</button>
      <button onclick="borrarPregunta('${tema}', ${i})">Borrar</button>
    `;
    contenedor.appendChild(div);
  });
}

function cargarParaEditar(tema, index) {
  const p = banco[tema][index];
  editando = { tema, index };

  document.getElementById("tema").value = tema;
  document.getElementById("pregunta").value = p.pregunta;
  document.getElementById("feedback").value = p.feedback || "";

  const numOpciones = p.opciones.length;
  document.getElementById("numOpciones").value = String(numOpciones);
  actualizarOpciones();

  document.querySelectorAll(".opcion textarea").forEach((o, i) => {
    o.value = p.opciones[i];
    o.style.height = "auto";
    o.style.height = o.scrollHeight + "px";
  });

  document.querySelectorAll('input[name="correcta"]').forEach(r => {
    r.checked = Number(r.value) === p.correcta;
  });
}

function borrarPregunta(tema, index) {
  if (!confirm("¿Seguro que quieres borrar esta pregunta?")) return;

  const pregunta = banco[tema][index];

  // Borrar en Firebase si tiene id
  if (pregunta && pregunta.id && window.eliminarPreguntaFirebase) {
    window.eliminarPreguntaFirebase(pregunta.id);
  }

  banco[tema].splice(index, 1);
  if (banco[tema].length === 0) delete banco[tema];

  guardarBanco();
  limpiarTemasVacios();
  cargarTemasVista();
  cargarTemasExistentes();
}

/* ====== RESPUESTAS DINÁMICAS (3 o 4) ====== */
function actualizarOpciones() {
  const select = document.getElementById("numOpciones");
  const contenedor = document.getElementById("opcionesContainer");
  if (!select || !contenedor) return;

  const num = Number(select.value);
  contenedor.innerHTML = "";

  const letras = ["a)", "b)", "c)", "d)", "e)"];

  for (let i = 0; i < num; i++) {
    const wrapper = document.createElement("div");
    wrapper.className = "opcion";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "correcta";
    radio.value = i;

    const letra = document.createElement("span");
    letra.className = "letra";
    letra.textContent = letras[i];

    const texto = document.createElement("textarea");
    texto.dataset.index = i;
    texto.className = "texto-opcion";
    texto.rows = 1;

    texto.addEventListener("input", () => {
      // Auto-crecimiento vertical
      texto.style.height = "auto";
      texto.style.height = texto.scrollHeight + "px";
    });

    wrapper.appendChild(radio);
    wrapper.appendChild(letra);
    wrapper.appendChild(texto);
    contenedor.appendChild(wrapper);
  }
}

/* ====== UTIL ====== */
function limpiarFormulario() {
  document.getElementById("pregunta").value = "";
  document.getElementById("feedback").value = "";
  document.querySelectorAll(".opcion textarea").forEach(o => {
    o.value = "";
    o.style.height = "auto";
  });
  document.querySelectorAll('input[name="correcta"]').forEach(r => r.checked = false);
}

function limpiarTemasVacios() {
  Object.keys(banco).forEach(tema => {
    if (!tema || !Array.isArray(banco[tema]) || banco[tema].length === 0) {
      delete banco[tema];
    }
  });
  guardarBanco();
}

function cargarTemasExistentes() {
  const select = document.getElementById("temaExistente");
  if (!select) return;

  select.innerHTML = "<option value=''>-- seleccionar --</option>";

  Object.keys(banco).forEach(tema => {
    const opt = document.createElement("option");
    opt.value = tema;
    opt.textContent = tema;
    select.appendChild(opt);
  });

  controlarInputTema();
}

// ====== BORRAR TEMA COMPLETO ======
function borrarTemaComun(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const tema = select.value;
  if (!tema) {
    alert("Selecciona un tema primero");
    return;
  }

  if (tema === "__falladas__") {
    alert("Este tema no se puede borrar");
    return;
  }

  if (!confirm(`¿Seguro que quieres borrar el tema "${tema}" y todas sus preguntas?`)) {
    return;
  }

  const preguntas = banco[tema] || [];

  preguntas.forEach(p => {
    if (p.id && window.eliminarPreguntaFirebase) {
      window.eliminarPreguntaFirebase(p.id);
    }
  });

  delete banco[tema];
  guardarBanco();

  limpiarFormulario();
  limpiarTemasVacios();
  cargarTemasVista();
  cargarTemasExistentes();
  cargarSelectEliminar();

  alert(`Tema "${tema}" eliminado correctamente`);
}

function borrarTemaSeleccionado() {
  borrarTemaComun("temaExistente");
}

function borrarTemaDesdeGestion() {
  borrarTemaComun("temaEliminar");
}


// ====== GESTIÓN DE TEMAS: Selector y borrado desde sección independiente ======
function cargarSelectEliminar() {
  const select = document.getElementById("temaEliminar");
  if (!select) return;

  select.innerHTML = "<option value=''>-- seleccionar --</option>";

  Object.keys(banco).forEach(tema => {
    if (tema === "__falladas__") return;

    const opt = document.createElement("option");
    opt.value = tema;
    opt.textContent = tema;
    select.appendChild(opt);
  });
} 

// ====== VALIDACIÓN DE FORMULARIO (activar/desactivar botón) ======
function prepararValidacionFormulario() {
  const campos = [
    document.getElementById("tema"),
    document.getElementById("pregunta"),
    document.getElementById("feedback")
  ];

  campos.forEach(campo => {
    if (campo) {
      campo.addEventListener("input", validarFormulario);
    }
  });

  document.addEventListener("input", e => {
    if (e.target.matches(".opcion textarea")) {
      validarFormulario();
    }
  });

  document.addEventListener("change", e => {
    if (e.target.name === "correcta") {
      validarFormulario();
    }
  });
}

function validarFormulario() {
  const boton = document.querySelector("button[onclick='guardarPregunta()']");
  if (!boton) return;

  const tema = document.getElementById("tema")?.value.trim();
  const pregunta = document.getElementById("pregunta")?.value.trim();
  const opciones = Array.from(
    document.querySelectorAll(".opcion textarea")
  ).map(o => o.value.trim());
  const marcada = document.querySelector('input[name="correcta"]:checked');

  const valido =
    tema &&
    pregunta &&
    opciones.length > 0 &&
    !opciones.some(o => o === "") &&
    marcada;

  boton.disabled = !valido;
  boton.style.opacity = valido ? "1" : "0.5";
  boton.style.cursor = valido ? "pointer" : "not-allowed";
}

// ====== VALIDACIÓN BORRADO DE TEMA ======
function prepararValidacionBorrado() {
  const selects = [
    document.getElementById("temaExistente"),
    document.getElementById("temaEliminar")
  ];

  selects.forEach(select => {
    if (select) {
      select.addEventListener("change", validarBorradoTema);
    }
  });
}

function validarBorradoTema() {
  const selectExistente = document.getElementById("temaExistente");
  const selectEliminar = document.getElementById("temaEliminar");

  const botones = [
    document.querySelector("button[onclick='borrarTemaSeleccionado()']"),
    document.querySelector("button[onclick='borrarTemaDesdeGestion()']")
  ];

  const temaSeleccionado =
    (selectExistente && selectExistente.value) ||
    (selectEliminar && selectEliminar.value);

  botones.forEach(boton => {
    if (!boton) return;
    const activo = Boolean(temaSeleccionado);
    boton.disabled = !activo;
    boton.style.opacity = activo ? "1" : "0.5";
    boton.style.cursor = activo ? "pointer" : "not-allowed";
  });
}

function controlarInputTema() {
  const select = document.getElementById("temaExistente");
  const input = document.getElementById("tema");

  if (!select || !input) return;

  if (select.value) {
    input.value = select.value;
    input.disabled = true;
    input.placeholder = "Usando tema existente";
  } else {
    input.disabled = false;
    input.value = "";
    input.placeholder = "Nuevo tema";
  }
}



window.controlarInputTema = controlarInputTema;


function renombrarTema() {
  const select = document.getElementById("temaRenombrar");
  const input = document.getElementById("nuevoNombreTema");

  if (!select || !input) return;

  const temaViejo = select.value;
  const temaNuevo = input.value.trim();

  if (!temaViejo) {
    alert("Selecciona un tema");
    return;
  }

  if (!temaNuevo) {
    alert("Escribe un nuevo nombre");
    return;
  }

  if (temaViejo === temaNuevo) {
    alert("El nombre es el mismo");
    return;
  }

  if (banco[temaNuevo]) {
    alert("Ya existe un tema con ese nombre");
    return;
  }

  // Renombrar en banco local
  const preguntas = banco[temaViejo] || [];
  banco[temaNuevo] = preguntas;
  delete banco[temaViejo];

  // Actualizar en Firebase
  if (window.actualizarTemaFirebase) {
    preguntas.forEach(p => {
      if (p.id) {
        window.actualizarTemaFirebase(p.id, temaNuevo);
      }
    });
  }

  guardarBanco();
  cargarTemasVista();
  cargarTemasExistentes();
  cargarSelectEliminar();
  cargarSelectRenombrar();

  input.value = "";
  alert(`Tema renombrado a "${temaNuevo}"`);
}

function cargarSelectRenombrar() {
  const select = document.getElementById("temaRenombrar");
  if (!select) return;

  select.innerHTML = "<option value=''>-- seleccionar --</option>";

  Object.keys(banco).forEach(tema => {
    if (tema === "__falladas__") return;

    const opt = document.createElement("option");
    opt.value = tema;
    opt.textContent = tema;
    select.appendChild(opt);
  });
}
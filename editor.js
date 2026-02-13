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
let textoBusqueda = "";
let contadorResultados = 0;

function ordenarNatural(lista) {
  return lista.sort((a, b) =>
    a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base"
    })
  );
}

function normalizarTexto(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ====== RESALTAR TEXTO BUSCADO ======
function resaltarTexto(textoOriginal, terminoBusqueda) {
  if (!terminoBusqueda) return textoOriginal || "";

  let texto = textoOriginal || "";

  const palabras = normalizarTexto(terminoBusqueda)
    .split(" ")
    .filter(Boolean);

  palabras.forEach(palabra => {
    const regex = new RegExp(palabra, "gi");

    texto = texto.replace(regex, match => `<mark>${match}</mark>`);
  });

  return texto;
}

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
        cargarTemasRenombrarSubtema();
        validarRenombradoSubtema();
        // === NUEVO BLOQUE AGREGADO ===
        const temaVista = document.getElementById("temaVista");
        const subtemaVista = document.getElementById("subtemaVista");

        if (temaVista) {
          temaVista.addEventListener("change", () => {
            cargarSubtemasVista();
            mostrarPreguntas();
          });
        }

        if (subtemaVista) {
          subtemaVista.addEventListener("change", mostrarPreguntas);
        }
      });
  } else {
    banco = cargarBanco();
    limpiarTemasVacios();
    actualizarOpciones();
    cargarTemasVista();
    cargarTemasExistentes();
    cargarSelectEliminar();
    cargarSelectRenombrar();
    cargarTemasRenombrarSubtema();
    validarRenombradoSubtema();
    // === NUEVO BLOQUE AGREGADO ===
    const temaVista = document.getElementById("temaVista");
    const subtemaVista = document.getElementById("subtemaVista");

    if (temaVista) {
      temaVista.addEventListener("change", () => {
        cargarSubtemasVista();
        mostrarPreguntas();
      });
    }

    if (subtemaVista) {
      subtemaVista.addEventListener("change", mostrarPreguntas);
    }
  }
  prepararValidacionFormulario();
  const buscador = document.getElementById("buscadorPreguntas");
  if (buscador) {
    buscador.addEventListener("input", (e) => {
      textoBusqueda = normalizarTexto(e.target.value);
      mostrarPreguntas();
    });
  }
  validarFormulario();
  prepararValidacionBorrado();
  validarBorradoTema();
  document.getElementById("temaExistente")?.addEventListener("change", controlarInputTema);
  document.getElementById("temaExistente")?.addEventListener("change", cargarSubtemasPorTema);

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
  const subtemaInput = document.getElementById("subtemaPregunta")?.value.trim();
  const subtemaSelect = document.getElementById("subtemaExistente");
  let subtema = "General";

  if (subtemaInput) {
    subtema = subtemaInput;
  } else if (subtemaSelect && subtemaSelect.value) {
    subtema = subtemaSelect.value;
  }
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
      subtema: original.subtema || subtema,
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
      feedback,
      subtema
    });
  }

  guardarBanco();
  if (window.crearBackupAutomatico) window.crearBackupAutomatico(banco);
  if (window.guardarEnFirebase) {
    window.guardarEnFirebase({
      tema,
      subtema,
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
  ordenarNatural(Object.keys(banco).filter(t => t !== "__falladas__"))
    .forEach(tema => {
      const opt = document.createElement("option");
      opt.value = tema;
      opt.textContent = tema;
      select.appendChild(opt);
    });

  select.onchange = () => {
    cargarSubtemasVista();
    mostrarPreguntas();
  };
  cargarSubtemasVista();
  mostrarPreguntas();
}

function mostrarPreguntas() {
  const select = document.getElementById("temaVista");
  const contenedor = document.getElementById("listaPreguntas");
  if (!select || !contenedor) return;

  const tema = select.value;
  const selectSubtema = document.getElementById("subtemaVista");
  const subtemaSeleccionado = selectSubtema ? selectSubtema.value : "";
  contenedor.innerHTML = "";
  contadorResultados = 0;
  if (!tema || !banco[tema]) return;

  banco[tema].forEach((p, i) => {
    if (subtemaSeleccionado && (p.subtema || "General") !== subtemaSeleccionado) {
      return;
    }
    let coincide = false;

    if (textoBusqueda) {
      const preguntaNorm = normalizarTexto(p.pregunta);
      const feedbackNorm = normalizarTexto(p.feedback || "");
      const opcionesNorm = (p.opciones || []).map(o => normalizarTexto(o));

      const palabrasBusqueda = textoBusqueda.split(" ").filter(Boolean);
      function contieneTodasLasPalabras(texto) {
        return palabrasBusqueda.every(p => texto.includes(p));
      }

      coincide =
        contieneTodasLasPalabras(preguntaNorm) ||
        contieneTodasLasPalabras(feedbackNorm) ||
        opcionesNorm.some(o => contieneTodasLasPalabras(o));

      if (!coincide) {
        return;
      }

      contadorResultados++;
    }
    const div = document.createElement("div");
    div.style.border = "1px solid #ccc";
    div.style.padding = "8px";
    div.style.margin = "8px 0";

    div.innerHTML = `
      <div style="font-size:12px; opacity:0.7; margin-bottom:4px;">
        ${tema} → ${p.subtema || "General"}
      </div>
      <strong>${i + 1}. ${resaltarTexto(p.pregunta, textoBusqueda)}</strong><br>
      <ul>
        ${p.opciones.map((op, idx) =>
          `<li ${idx === p.correcta ? 'style="font-weight:bold"' : ''}>${resaltarTexto(op, textoBusqueda)}</li>`
        ).join("")}
      </ul>
      ${p.feedback ? `<div style="margin-top:6px; white-space:pre-line;"><em>Feedback:</em>\n${resaltarTexto(p.feedback, textoBusqueda)}</div>` : ""}
      <button onclick="cargarParaEditar('${tema}', ${i})">Editar</button>
      <button class="btn-borrar" onclick="borrarPregunta('${tema}', ${i})">Borrar</button>
    `;
    contenedor.appendChild(div);
  });

  const contador = document.getElementById("contadorResultados");
  if (contador) {
    if (!textoBusqueda) {
      contador.textContent = "";
    } else {
      contador.textContent =
        contadorResultados +
        " resultado" +
        (contadorResultados === 1 ? "" : "s") +
        " encontrados";
    }
  }
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
  if (window.crearBackupAutomatico) window.crearBackupAutomatico(banco);
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

  ordenarNatural(Object.keys(banco).filter(t => t !== "__falladas__")).forEach(tema => {
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
  if (window.crearBackupAutomatico) window.crearBackupAutomatico(banco);

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

  ordenarNatural(Object.keys(banco)).forEach(tema => {
    if (tema === "__falladas__") return;

    const opt = document.createElement("option");
    opt.value = tema;
    opt.textContent = tema;
    select.appendChild(opt);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const temaEliminar = document.getElementById("temaEliminar");
  if (temaEliminar) {
    temaEliminar.addEventListener("change", cargarSubtemasEliminar);
  }
});

function cargarSubtemasEliminar() {
  const temaSelect = document.getElementById("temaEliminar");
  const subtemaSelect = document.getElementById("subtemaEliminar");
  if (!temaSelect || !subtemaSelect) return;

  const tema = temaSelect.value;
  subtemaSelect.innerHTML = "<option value=''>-- seleccionar subtema --</option>";

  if (!tema || !banco[tema]) return;

  const subtemas = new Set();
  banco[tema].forEach(p => {
    subtemas.add(p.subtema || "General");
  });

  Array.from(subtemas)
    .sort((a, b) => {
      if (a.toLowerCase() === "general") return -1;
      if (b.toLowerCase() === "general") return 1;
      return a.localeCompare(b, "es", { sensitivity: "base" });
    })
    .forEach(st => {
      const opt = document.createElement("option");
      opt.value = st;
      opt.textContent = st;
      subtemaSelect.appendChild(opt);
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
  if (window.crearBackupAutomatico) window.crearBackupAutomatico(banco);
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

  ordenarNatural(Object.keys(banco)).forEach(tema => {
    if (tema === "__falladas__") return;

    const opt = document.createElement("option");
    opt.value = tema;
    opt.textContent = tema;
    select.appendChild(opt);
  });
}

function cargarTemasRenombrarSubtema() {
  const select = document.getElementById("temaRenombrarSubtema");
  if (!select) return;

  select.innerHTML = "<option value=''>-- seleccionar tema --</option>";

  ordenarNatural(Object.keys(banco)).forEach(tema => {
    if (tema === "__falladas__") return;

    const opt = document.createElement("option");
    opt.value = tema;
    opt.textContent = tema;
    select.appendChild(opt);
  });
}
// ====== RENOMBRAR SUBTEMA: Cargar subtemas según tema seleccionado ======
document.addEventListener("DOMContentLoaded", () => {
  const temaSelect = document.getElementById("temaRenombrarSubtema");
  if (temaSelect) {
    temaSelect.addEventListener("change", cargarSubtemasRenombrar);
  }
});

function cargarSubtemasRenombrar() {
  const temaSelect = document.getElementById("temaRenombrarSubtema");
  const subtemaSelect = document.getElementById("subtemaRenombrar");

  if (!temaSelect || !subtemaSelect) return;

  const tema = temaSelect.value;
  subtemaSelect.innerHTML = "<option value=''>-- seleccionar subtema --</option>";

  if (!tema || !banco[tema]) return;

  const subtemas = new Set();
  banco[tema].forEach(p => {
    subtemas.add(p.subtema || "General");
  });

  Array.from(subtemas)
    .sort((a, b) => {
      if (a.toLowerCase() === "general") return -1;
      if (b.toLowerCase() === "general") return 1;
      return a.localeCompare(b, "es", { sensitivity: "base" });
    })
    .forEach(st => {
      const opt = document.createElement("option");
      opt.value = st;
      opt.textContent = st;
      subtemaSelect.appendChild(opt);
    });
  // Activar o desactivar botón de renombrar según selección
  const botonRenombrar = document.querySelector("button[onclick='renombrarSubtema()']");
  if (botonRenombrar) {
    const activo = Boolean(subtemaSelect.value);
    botonRenombrar.disabled = !activo;
    botonRenombrar.style.opacity = activo ? "1" : "0.5";
    botonRenombrar.style.cursor = activo ? "pointer" : "not-allowed";
  }
}

// Activar botón de renombrar subtema al cambiar selección
document.addEventListener("DOMContentLoaded", () => {
  const subtemaSelect = document.getElementById("subtemaRenombrar");
  subtemaSelect && subtemaSelect.addEventListener("change", validarRenombradoSubtema);
  const inputNuevo = document.getElementById("nuevoNombreSubtema");
  if (inputNuevo) {
    inputNuevo.addEventListener("input", validarRenombradoSubtema);
  }
});

function renombrarSubtema() {
  const temaSelect = document.getElementById("temaRenombrarSubtema");
  const subtemaSelect = document.getElementById("subtemaRenombrar");
  const inputNuevo = document.getElementById("nuevoNombreSubtema");

  if (!temaSelect || !subtemaSelect || !inputNuevo) return;

  const tema = temaSelect.value;
  const subtemaViejo = subtemaSelect.value;
  const subtemaNuevo = inputNuevo.value.trim();

  if (!tema) {
    alert("Selecciona un tema");
    return;
  }

  if (!subtemaViejo) {
    alert("Selecciona un subtema");
    return;
  }

  if (!subtemaNuevo) {
    alert("Escribe el nuevo nombre del subtema");
    return;
  }

  if (!banco[tema]) return;

  // Renombrar subtema en banco local
  banco[tema].forEach(p => {
    const st = p.subtema || "General";
    if (st === subtemaViejo) {
      p.subtema = subtemaNuevo;

      // Sincronizar con Firebase si tiene id
      if (p.id && window.actualizarPreguntaFirebase) {
        window.actualizarPreguntaFirebase(p.id, {
          tema: tema,
          subtema: subtemaNuevo,
          pregunta: p.pregunta,
          opciones: p.opciones,
          correcta: p.correcta,
          feedback: p.feedback || ""
        });
      }
    }
  });

  guardarBanco();
  if (window.crearBackupAutomatico) window.crearBackupAutomatico(banco);

  cargarSubtemasRenombrar();
  cargarSubtemasVista();
  mostrarPreguntas();

  inputNuevo.value = "";
  alert(`Subtema renombrado a "${subtemaNuevo}"`);
}

function validarRenombradoSubtema() {
  const temaSelect = document.getElementById("temaRenombrarSubtema");
  const subtemaSelect = document.getElementById("subtemaRenombrar");
  const inputNuevo = document.getElementById("nuevoNombreSubtema");
  const boton = document.querySelector("button[onclick='renombrarSubtema()']");

  if (!temaSelect || !subtemaSelect || !inputNuevo || !boton) return;

  const tema = temaSelect.value;
  const subtema = subtemaSelect.value;
  const nuevo = inputNuevo.value.trim();

  const valido =
    tema &&
    subtema &&
    nuevo &&
    nuevo !== subtema;

  boton.disabled = !valido;
  boton.style.opacity = valido ? "1" : "0.5";
  boton.style.cursor = valido ? "pointer" : "not-allowed";
}
// ====== SUBTEMAS POR TEMA ======
function cargarSubtemasPorTema() {
  const selectTema = document.getElementById("temaExistente");
  const selectSubtema = document.getElementById("subtemaExistente");

  if (!selectTema || !selectSubtema) return;

  const tema = selectTema.value;
  selectSubtema.innerHTML = "<option value=''>-- seleccionar subtema --</option>";

  if (!tema || !banco[tema]) return;

  const subtemas = new Set();
  banco[tema].forEach(p => {
    if (p.subtema) subtemas.add(p.subtema);
  });

  Array.from(subtemas)
    .sort((a, b) => {
      if (a.toLowerCase() === "general") return -1;
      if (b.toLowerCase() === "general") return 1;
      return a.localeCompare(b, "es", { sensitivity: "base" });
    })
    .forEach(st => {
      const opt = document.createElement("option");
      opt.value = st;
      opt.textContent = st;
      selectSubtema.appendChild(opt);
    });
}
 
// ====== CANCELAR EDICIÓN ======
document.addEventListener("DOMContentLoaded", () => {
  const btnCancelar = document.getElementById("btnCancelarEdicion");
  if (!btnCancelar) return;

  btnCancelar.addEventListener("click", () => {
    editando = null;
    limpiarFormulario();
  });
});
// ====== SUBTEMAS EN VISTA AVANZADA ======
function cargarSubtemasVista() {
  const selectTema = document.getElementById("temaVista");
  const selectSubtema = document.getElementById("subtemaVista");

  if (!selectTema || !selectSubtema) return;

  const tema = selectTema.value;
  selectSubtema.innerHTML = "<option value=''>Todos los subtemas</option>";

  if (!tema || !banco[tema]) return;

  const subtemas = new Set();
  banco[tema].forEach(p => {
    subtemas.add(p.subtema || "General");
  });

  Array.from(subtemas)
    .sort((a, b) => {
      if (a.toLowerCase() === "general") return -1;
      if (b.toLowerCase() === "general") return 1;
      return a.localeCompare(b, "es", { sensitivity: "base" });
    })
    .forEach(st => {
      const opt = document.createElement("option");
      opt.value = st;
      opt.textContent = st;
      selectSubtema.appendChild(opt);
    });

  selectSubtema.onchange = mostrarPreguntas;
}
// ====== MOVER PREGUNTA ENTRE TEMAS / SUBTEMAS ======
function cargarTemasMover() {
  const selectTema = document.getElementById("temaMover");
  const selectNuevoTema = document.getElementById("nuevoTemaMover");
  if (!selectTema || !selectNuevoTema) return;

  selectTema.innerHTML = "<option value=''>-- seleccionar tema --</option>";
  selectNuevoTema.innerHTML = "<option value=''>-- seleccionar tema destino --</option>";

  ordenarNatural(Object.keys(banco)).forEach(tema => {
    if (tema === "__falladas__") return;

    const opt1 = document.createElement("option");
    opt1.value = tema;
    opt1.textContent = tema;
    selectTema.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = tema;
    opt2.textContent = tema;
    selectNuevoTema.appendChild(opt2);
  });
}

function cargarSubtemasMover() {
  const tema = document.getElementById("temaMover")?.value;
  const selectSubtema = document.getElementById("subtemaMover");
  if (!selectSubtema) return;

  selectSubtema.innerHTML = "<option value=''>Selecciona subtema</option>";
  if (!tema || !banco[tema]) return;

  const subtemas = new Set();
  banco[tema].forEach(p => subtemas.add(p.subtema || "General"));

  Array.from(subtemas)
    .sort((a, b) => {
      if (a.toLowerCase() === "general") return -1;
      if (b.toLowerCase() === "general") return 1;
      return a.localeCompare(b, "es", { sensitivity: "base" });
    })
    .forEach(st => {
      const opt = document.createElement("option");
      opt.value = st;
      opt.textContent = st;
      selectSubtema.appendChild(opt);
    });
}

function cargarPreguntasMover() {
  const tema = document.getElementById("temaMover")?.value;
  const subtema = document.getElementById("subtemaMover")?.value;
  const selectPregunta = document.getElementById("preguntaMover");

  if (!selectPregunta) return;
  selectPregunta.innerHTML = "<option value=''>-- seleccionar pregunta --</option>";

  if (!tema || !banco[tema]) return;

  banco[tema].forEach((p, i) => {
    const st = p.subtema || "General";
    if (subtema && st !== subtema) return;

    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = p.pregunta.slice(0, 80);
    selectPregunta.appendChild(opt);
  });
}

function cargarSubtemasDestinoMover() {
  const tema = document.getElementById("nuevoTemaMover")?.value;
  const selectSubtema = document.getElementById("nuevoSubtemaMover");
  if (!selectSubtema) return;

  selectSubtema.innerHTML = "<option value=''>Selecciona subtema destino</option>";

  if (!tema || !banco[tema]) return;

  const subtemas = new Set();
  banco[tema].forEach(p => {
    subtemas.add(p.subtema || "General");
  });

  // Asegurar que "General" siempre esté primero y sin duplicados
  const listaSubtemas = Array.from(subtemas);
  if (!listaSubtemas.includes("General")) {
    listaSubtemas.unshift("General");
  }

  listaSubtemas
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
    .forEach(st => {
      const opt = document.createElement("option");
      opt.value = st;
      opt.textContent = st;
      selectSubtema.appendChild(opt);
    });
}

async function moverPregunta() {
  const temaOrigen = document.getElementById("temaMover")?.value;
  const index = document.getElementById("preguntaMover")?.value;
  const temaDestino = document.getElementById("nuevoTemaMover")?.value;
  const subtemaDestino = document.getElementById("nuevoSubtemaMover")?.value || "General";

  if (!temaOrigen || index === "" || !temaDestino) {
    alert("Selecciona origen y destino");
    return;
  }

  const pregunta = banco[temaOrigen][index];
  if (!pregunta) return;

  // Quitar del origen
  banco[temaOrigen].splice(index, 1);
  if (banco[temaOrigen].length === 0) delete banco[temaOrigen];

  // Preparar destino
  if (!banco[temaDestino]) banco[temaDestino] = [];

  pregunta.subtema = subtemaDestino;
  banco[temaDestino].push(pregunta);

  // Sincronizar en Firebase
  if (pregunta.id && window.actualizarPreguntaFirebase) {
    await window.actualizarPreguntaFirebase(pregunta.id, {
      tema: temaDestino,
      subtema: subtemaDestino,
      pregunta: pregunta.pregunta,
      opciones: pregunta.opciones,
      correcta: pregunta.correcta,
      feedback: pregunta.feedback || ""
    });
  }

  guardarBanco();
  if (window.crearBackupAutomatico) window.crearBackupAutomatico(banco);

  cargarTemasVista();
  cargarTemasExistentes();
  cargarSelectEliminar();
  cargarSelectRenombrar();

  alert("Pregunta movida correctamente");
}

// Inicializar selects de mover pregunta
document.addEventListener("DOMContentLoaded", () => {
  cargarTemasMover();

  const temaMover = document.getElementById("temaMover");
  const subtemaMover = document.getElementById("subtemaMover");
  const nuevoTemaMover = document.getElementById("nuevoTemaMover");

  temaMover && temaMover.addEventListener("change", () => {
    cargarSubtemasMover();
    cargarPreguntasMover();
  });

  subtemaMover && subtemaMover.addEventListener("change", cargarPreguntasMover);
  nuevoTemaMover && nuevoTemaMover.addEventListener("change", cargarSubtemasDestinoMover);
});
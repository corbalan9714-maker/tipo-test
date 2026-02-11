// ===== NAVEGACIÓN EDITOR / TEST (ESTADO ESTABLE) =====

// Referencias DOM
const btnEditor = document.getElementById("btnEditor");
const btnTest = document.getElementById("btnTest");

const iframeEditor = document.getElementById("iframeEditor");
const iframeTest = document.getElementById("iframeTest");

// Mostrar Editor
function mostrarEditor() {
  if (iframeEditor) iframeEditor.style.display = "block";
  if (iframeTest) iframeTest.style.display = "none";

  if (btnEditor) btnEditor.classList.add("activo");
  if (btnTest) btnTest.classList.remove("activo");
}

// Mostrar Test
function mostrarTest() {
  if (iframeEditor) iframeEditor.style.display = "none";
  if (iframeTest) iframeTest.style.display = "block";

  if (btnTest) btnTest.classList.add("activo");
  if (btnEditor) btnEditor.classList.remove("activo");
}

// Estado inicial
mostrarEditor();

// Eventos
if (btnEditor) {
  btnEditor.addEventListener("click", mostrarEditor);
}

if (btnTest) {
  btnTest.addEventListener("click", mostrarTest);
}
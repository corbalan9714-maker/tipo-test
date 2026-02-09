import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBQw64gv58J684nbD1QIAqkrIPkbVg_8DU",
  authDomain: "tipo-test-a5e4d.firebaseapp.com",
  projectId: "tipo-test-a5e4d",
  storageBucket: "tipo-test-a5e4d.firebasestorage.app",
  messagingSenderId: "560675730879",
  appId: "1:560675730879:web:cff0323110fe52620a1d0a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function guardarEnFirebase(pregunta) {
  try {
    await addDoc(collection(db, "preguntas"), pregunta);
    console.log("Pregunta guardada en Firebase");
  } catch (err) {
    console.error("Error al guardar en Firebase", err);
  }
}
window.guardarEnFirebase = guardarEnFirebase;

export async function cargarDesdeFirebase() {
  const snapshot = await getDocs(collection(db, "preguntas"));
  const banco = {};

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const id = docSnap.id;

    if (!banco[data.tema]) banco[data.tema] = [];

    banco[data.tema].push({
      id,
      pregunta: data.pregunta,
      opciones: data.opciones,
      correcta: data.correcta,
      // las estadísticas ya no son globales
      fallada: 0,
      feedback: data.feedback || ""
    });
  });

  return banco;
}

export async function actualizarFallada(id, nuevoValor) {
  // Redirige al sistema por usuario
  if (window.actualizarFalladaUsuario) {
    await window.actualizarFalladaUsuario(id, nuevoValor);
  }
}

window.cargarDesdeFirebase = cargarDesdeFirebase;
window.actualizarFallada = actualizarFallada;

export async function eliminarPreguntaFirebase(id) {
  try {
    const ref = doc(db, "preguntas", id);
    await deleteDoc(ref);
    console.log("Pregunta eliminada en Firebase:", id);
  } catch (err) {
    console.error("Error al eliminar en Firebase", err);
  }
}

window.eliminarPreguntaFirebase = eliminarPreguntaFirebase;

// ------------------------------
// ESTADÍSTICAS POR USUARIO
// ------------------------------

// Guardar fallos por usuario
window.actualizarFalladaUsuario = async function (preguntaId, valor) {
  const user = window.currentUser;
  if (!user) return;

  const ref = doc(db, "estadisticas", user.uid, "preguntas", preguntaId);
  await setDoc(ref, { fallada: valor }, { merge: true });
};

// Cargar estadísticas del usuario
window.cargarEstadisticasUsuario = async function () {
  const user = window.currentUser;
  if (!user) return {};

  const stats = {};
  const snapshot = await getDocs(
    collection(db, "estadisticas", user.uid, "preguntas")
  );

  snapshot.forEach(docSnap => {
    stats[docSnap.id] = docSnap.data().fallada || 0;
  });

  return stats;
};
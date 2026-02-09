import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
      feedback: data.feedback || ""
    });
  });

  return banco;
}

window.cargarDesdeFirebase = cargarDesdeFirebase;

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

// ===============================
// ESTADÍSTICAS POR USUARIO
// ===============================

const auth = getAuth(app);

// Guardar fallo por usuario
window.guardarFalloUsuario = async function (preguntaId) {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.warn("No hay usuario activo");
      return;
    }

    const ref = doc(db, "estadisticas", user.uid, "preguntas", preguntaId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const actual = snap.data().fallos || 0;
      await updateDoc(ref, { fallos: actual + 1 });
    } else {
      await setDoc(ref, { fallos: 1 });
    }

    console.log("Fallo guardado en Firebase:", user.uid, preguntaId);
  } catch (e) {
    console.error("Error guardando fallo usuario:", e);
  }
};
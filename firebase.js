import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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
const auth = getAuth(app);

// Exponer Firebase al entorno global
if (typeof window !== "undefined") {
  window.db = db;
  window.auth = auth;
  window.collection = collection;
  window.getDocs = getDocs;
  window.doc = doc;
  window.getDoc = getDoc;
  window.updateDoc = updateDoc;
  window.deleteDoc = deleteDoc;
  window.addDoc = addDoc;
  window.setDoc = setDoc;
}

setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("Persistencia de sesión activada");
  })
  .catch((error) => {
    console.error("Error en persistencia:", error);
  });

let usuarioActual = null;

onAuthStateChanged(auth, (user) => {
  usuarioActual = user;
});

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
      fallada: data.fallada || 0,
      feedback: data.feedback || "",
      subtema: data.subtema || "General"
    });
  });

  return banco;
}

export async function actualizarFallada(id, nuevoValor) {
  try {
    console.log("Actualizando fallos en Firebase", id, nuevoValor);
    const ref = doc(db, "preguntas", id);

    const snap = await getDoc(ref);

    // Si el documento no existe, no hacemos nada
    if (!snap.exists()) {
      console.warn("Documento no existe, se ignora:", id);
      return;
    }

    // Si existe, actualizamos normalmente
    await updateDoc(ref, { fallada: nuevoValor });
    console.log("Fallada actualizada en Firebase");
  } catch (err) {
    console.error("Error al actualizar fallada", err);
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

export async function actualizarPreguntaFirebase(id, datos) {
  try {
    if (!id) {
      console.warn("ID inválido para actualización:", id);
      return;
    }

    const ref = doc(db, "preguntas", id);
    await updateDoc(ref, datos);
    console.log("Pregunta actualizada en Firebase:", id);
  } catch (err) {
    console.error("Error al actualizar pregunta en Firebase", err);
  }
}

window.actualizarPreguntaFirebase = actualizarPreguntaFirebase;

export async function crearBackupAutomatico(banco) {
  try {
    const fecha = new Date();

    // Crear nuevo backup
    await addDoc(collection(db, "backups"), {
      fecha: fecha.toISOString(),
      banco: banco
    });

    // Obtener todos los backups ordenados por fecha
    const q = query(collection(db, "backups"), orderBy("fecha", "asc"));
    const snapshot = await getDocs(q);

    // Si hay más de 50, borrar los más antiguos
    if (snapshot.size > 50) {
      const exceso = snapshot.size - 50;
      let contador = 0;

      for (const docSnap of snapshot.docs) {
        if (contador >= exceso) break;
        await deleteDoc(doc(db, "backups", docSnap.id));
        contador++;
      }

      console.log("Backups antiguos eliminados:", exceso);
    }

    console.log("Backup automático creado");
  } catch (err) {
    console.error("Error creando backup", err);
  }
}

window.crearBackupAutomatico = crearBackupAutomatico;

// ===== PROGRESO DE TEST SINCRONIZADO =====

import { setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

window.guardarProgresoRemoto = async function (progreso) {
  try {
    if (!usuarioActual) return;

    const ref = doc(db, "progresos", usuarioActual.uid);
    await setDoc(ref, progreso);
    console.log("Progreso guardado en Firebase");
  } catch (err) {
    console.error("Error guardando progreso remoto", err);
  }
};

window.cargarProgresoRemoto = async function () {
  try {
    if (!usuarioActual) return null;

    const ref = doc(db, "progresos", usuarioActual.uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      console.log("Progreso remoto cargado");
      return snap.data();
    }

    return null;
  } catch (err) {
    console.error("Error cargando progreso remoto", err);
    return null;
  }
};
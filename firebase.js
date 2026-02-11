import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBQw64gv58J684nbD1QIAqkrIPkbVg_8DU",
  authDomain: "tipo-test-a5e4d.firebaseapp.com",
  projectId: "tipo-test-a5e4d",
  storageBucket: "tipo-test-a5e4d.firebasestorage.app",
  messagingSenderId: "560675730879",
  appId: "1:560675730879:web:cff0323110fe52620a1d0a"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Control de acceso por lista blanca
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Error en login", err);
    }
    return;
  }

  try {
    const email = user.email;
    const ref = doc(db, "usuarios", email);
    const snap = await getDoc(ref);

    if (!snap.exists() || snap.data().autorizado !== true) {
      alert("No tienes acceso a esta aplicación.");
      await signOut(auth);
    } else {
      console.log("Usuario autorizado:", email);
    }
  } catch (err) {
    console.error("Error comprobando autorización", err);
  }
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
  try {
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
        feedback: data.feedback || ""
      });
    });

    // Guardar copia local
    localStorage.setItem("bancoOffline", JSON.stringify(banco));
    console.log("Banco cargado desde Firebase y guardado offline");

    return banco;

  } catch (err) {
    console.warn("Sin conexión. Usando banco offline.");

    const bancoLocal = localStorage.getItem("bancoOffline");

    if (bancoLocal) {
      return JSON.parse(bancoLocal);
    } else {
      console.error("No hay banco offline disponible");
      return {};
    }
  }
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

export { auth };

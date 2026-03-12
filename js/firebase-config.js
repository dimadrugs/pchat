/* ================================================
   PCHAT — Firebase Configuration
   ================================================
   ЗАМЕНИТЕ значения ниже на свои из Firebase Console:
   https://console.firebase.google.com → Project Settings → General → Your apps
*/
const firebaseConfig = {
    apiKey: "AIzaSyAMCU6CIFycVrDNAXtxJuYhqO6sVjf4_E4",
    authDomain: "pchat-cf54e.firebaseapp.com",
    projectId: "pchat-cf54e",
    storageBucket: "pchat-cf54e.firebasestorage.app",
    messagingSenderId: "406902706097",
    appId: "1:406902706097:web:28f11bab3ec7508fd8f790"
	measurementId: "G-TG6WW9FHGS"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();
const storage = firebase.storage();

db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

console.log('%c🔒 PCHAT Firebase OK', 'color:#667eea;font-weight:bold');
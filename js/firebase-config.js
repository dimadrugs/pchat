const firebaseConfig = {
    apiKey: "AIzaSyAMCU6CIFycVrDNAXtxJuYhqO6sVjf4_E4",
    authDomain: "pchat-cf54e.firebaseapp.com",
    projectId: "pchat-cf54e",
    storageBucket: "pchat-cf54e.firebasestorage.app",
    messagingSenderId: "406902706097",
    appId: "1:406902706097:web:28f11bab3ec7508fd8f790"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
// const storage = firebase.storage();

// Персистентность для офлайн работы
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
    if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence: multiple tabs open');
    } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence: not supported');
    }
});

console.log('%c PCHAT Firebase OK', 'color:#22d3ae;font-weight:bold');

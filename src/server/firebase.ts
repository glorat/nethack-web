import { initializeApp } from "firebase/app";

// Not a secret: a web app's Firebase config is public, and security rules decide what it may do.
export const app = initializeApp({
  apiKey: "AIzaSyBwQKEX0nHFghDaYRhTK8QilSvWZbtNCRA",
  authDomain: "nethack-web-server.firebaseapp.com",
  projectId: "nethack-web-server",
  storageBucket: "nethack-web-server.firebasestorage.app",
  messagingSenderId: "1055631746678",
  appId: "1:1055631746678:web:ad062b1b08d70120a06157",
});

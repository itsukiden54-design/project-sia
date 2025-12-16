/*
  firebase-init.js

  Simple initializer that expects the Firebase SDKs (compat) to be loaded
  and `window.__FIREBASE_CONFIG__` to be present (from firebase-config.js).

  It initializes the Firebase app and attaches helpers to the window for
  quick usage in your existing pages (no bundler required).
*/

(function () {
  if (typeof window === 'undefined') return;

  if (!window.firebase) {
    console.warn('Firebase SDK not detected. Include Firebase CDN scripts before firebase-init.js');
    return;
  }

  if (!window.__FIREBASE_CONFIG__) {
    console.error('No firebase config found. Create/edit firebase-config.js');
    return;
  }

  try {
    const app = firebase.initializeApp(window.__FIREBASE_CONFIG__);
    window._firebaseApp = app;
    window._firebaseAuth = firebase.auth();
    window._firebaseDB = firebase.database();

    // Helper: sign in with email/password. Returns a Promise.
    window.siasystemSignIn = function (email, password) {
      return window._firebaseAuth.signInWithEmailAndPassword(email, password);
    };

    // Helper: create user with email/password. Returns a Promise.
    window.siasystemCreateUser = function (email, password) {
      return window._firebaseAuth.createUserWithEmailAndPassword(email, password);
    };

    // Helper: sign out
    window.siasystemSignOut = function () {
      return window._firebaseAuth.signOut();
    };

    // Simple `onAuthStateChanged` hook you can attach to for redirects
    window.siasystemOnAuth = function (cb) {
      return window._firebaseAuth.onAuthStateChanged(cb);
    };

    console.log('Firebase initialized (firebase-init.js)');
  } catch (e) {
    console.error('Error initializing Firebase:', e);
  }

})();

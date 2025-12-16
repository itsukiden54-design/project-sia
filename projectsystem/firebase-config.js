/*
  firebase-config.js

  Purpose: provide a minimal, editable firebase config object for the static site.
  - Edit the `apiKey`, `appId`, `messagingSenderId` and/or `databaseURL` values.
  - If you supply only `databaseURL`, this file will try to infer `projectId`,
    `authDomain` and `storageBucket` automatically.

  Usage (in HTML):
  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>
  <script src="firebase-config.js"></script>
  <script src="firebase-init.js"></script>

  Replace the placeholder values with values from your Firebase console (Project settings -> General -> Your apps -> Firebase SDK snippet).
*/

(function () {
  // Minimum placeholder DB URL — replace with your actual DB URL
  const DEFAULT_DB_URL = "https://YOUR_PROJECT_ID.firebaseio.com";

  function inferConfigFromDatabaseURL(dbUrl) {
    try {
      const u = new URL(dbUrl);
      const host = u.host; // e.g. project-id.firebaseio.com or project-id-default-rtdb.firebaseio.com or project-id.firebasedatabase.app
      const projectId = host.split('.')[0];
      return {
        databaseURL: dbUrl,
        projectId: projectId,
        authDomain: projectId + ".firebaseapp.com",
        storageBucket: projectId + ".appspot.com"
      };
    } catch (e) {
      return { databaseURL: dbUrl };
    }
  }

  // If you have the full config object from Firebase console, paste it here.
  // Otherwise set at least `databaseURL` and this script will try to infer the rest.
  window.__FIREBASE_CONFIG__ = window.__FIREBASE_CONFIG__ || {
    apiKey: "AIzaSyCXMVNhO02SzTjIANemKa03aTwn7n0qN-M",
    authDomain: "c4s-food-solution.firebaseapp.com",
    databaseURL: "https://c4s-food-solution-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "c4s-food-solution",
    storageBucket: "c4s-food-solution.firebasestorage.app",
    messagingSenderId: "810323252056",
    appId: "1:810323252056:web:44506ae07f0ef43f2e4b2d",
    measurementId: "G-QH851MYKYT"
  };

  // Try to infer values from databaseURL if projectId missing / empty
  if ((!window.__FIREBASE_CONFIG__.projectId || window.__FIREBASE_CONFIG__.projectId === "") && window.__FIREBASE_CONFIG__.databaseURL) {
    const inferred = inferConfigFromDatabaseURL(window.__FIREBASE_CONFIG__.databaseURL);
    window.__FIREBASE_CONFIG__ = Object.assign({}, inferred, window.__FIREBASE_CONFIG__);
  }

})();

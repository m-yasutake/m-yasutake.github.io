// =============================================================
// Firebase Configuration
// =============================================================
// This key is a client-side key intentionally public.
// Security is enforced by Firestore security rules.
//
// Authorized domains are set in Firebase Console:
//   Authentication > Settings > Authorized domains
// Add: m-yasutake.github.io (and localhost for testing)

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDERy4BshhKZzdlS0uqv67BHSeqn53JxXM",
  authDomain: "roots-eddf5.firebaseapp.com",
  projectId: "roots-eddf5",
  storageBucket: "roots-eddf5.firebasestorage.app",
  messagingSenderId: "6298459601",
  appId: "1:6298459601:web:cf83b471ae8de492b814f0"
};

// Admin emails are stored in Firestore at:
//   Collection: config  →  Document: admins  →  Field: emails (array of strings)
// To add or remove admins, update that document in the Firebase Console — no code changes needed.
//
// Usage: window.getAdminEmails(db) returns a Promise<string[]> (cached per page load).
let _adminEmailsPromise = null;
window.getAdminEmails = function (db) {
  if (!_adminEmailsPromise) {
    _adminEmailsPromise = db.collection('config').doc('admins')
      .get()
      .then(function (doc) { return doc.exists ? (doc.data().emails || []) : []; })
      .catch(function () { return []; });
  }
  return _adminEmailsPromise;
};

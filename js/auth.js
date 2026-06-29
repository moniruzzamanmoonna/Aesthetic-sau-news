/**
 * auth.js — Aesthetic SAU News
 * Role-based authentication — fixed version
 */

(function (global) {
  'use strict';

  const ROLES = {
    super_admin : { level: 5, label: 'Super Admin',  color: '#c0341a' },
    admin       : { level: 4, label: 'Admin',        color: '#1a5fa0' },
    editor      : { level: 3, label: 'Editor',       color: '#1a7a3a' },
    journalist  : { level: 2, label: 'Journalist',   color: '#6a3a9a' },
    moderator   : { level: 1, label: 'Moderator',    color: '#e0b400' },
  };

  const PERMISSIONS = {
    'articles.create'    : ['super_admin','admin','editor','journalist'],
    'articles.edit.own'  : ['super_admin','admin','editor','journalist'],
    'articles.edit.any'  : ['super_admin','admin','editor'],
    'articles.delete'    : ['super_admin','admin'],
    'articles.publish'   : ['super_admin','admin','editor'],
    'comments.moderate'  : ['super_admin','admin','editor','moderator'],
    'comments.delete'    : ['super_admin','admin','moderator'],
    'users.view'         : ['super_admin','admin'],
    'users.manage'       : ['super_admin','admin'],
    'users.role.assign'  : ['super_admin'],
    'config.edit'        : ['super_admin','admin'],
    'analytics.view'     : ['super_admin','admin','editor'],
    'panel.dashboard'    : ['super_admin','admin','editor','journalist','moderator'],
    'panel.articles'     : ['super_admin','admin','editor','journalist'],
    'panel.new_article'  : ['super_admin','admin','editor','journalist'],
    'panel.comments'     : ['super_admin','admin','editor','moderator'],
    'panel.users'        : ['super_admin','admin'],
    'panel.settings'     : ['super_admin','admin'],
    'panel.analytics'    : ['super_admin','admin','editor'],
  };

  // FIX: use a sentinel so we can distinguish "not yet resolved" from "signed out"
  let _resolved      = false;
  let _currentUser   = null;
  let _userProfile   = null;
  let _authListeners = [];

  function can(permission, role) {
    const r = role || (_userProfile && _userProfile.role);
    if (!r) return false;
    return Array.isArray(PERMISSIONS[permission]) && PERMISSIONS[permission].includes(r);
  }

  function roleInfo(role) {
    return ROLES[role] || { level: 0, label: 'Unknown', color: '#9a9183' };
  }

  function isAtLeast(targetRole, role) {
    const r = role || (_userProfile && _userProfile.role);
    if (!r || !ROLES[r] || !ROLES[targetRole]) return false;
    return ROLES[r].level >= ROLES[targetRole].level;
  }

  async function ensureUserProfile(firebaseUser) {
    const db  = SAU.firebase.db;
    const ref = db.collection('users').doc(firebaseUser.uid);

    let snap;
    try {
      snap = await ref.get();
    } catch(e) {
      // Firestore rules may block read before profile exists — treat as new user
      console.warn('[auth] Could not read profile, creating new one:', e.message);
      snap = { exists: false };
    }

    if (!snap.exists) {
      const superAdminEmail = 'moniruzzamanmoonna@gmail.com';
      const profile = {
        uid        : firebaseUser.uid,
        email      : firebaseUser.email,
        displayName: firebaseUser.displayName || '',
        photoURL   : firebaseUser.photoURL    || '',
        role       : firebaseUser.email === superAdminEmail ? 'super_admin' : 'journalist',
        createdAt  : firebase.firestore.FieldValue.serverTimestamp(),
        lastLogin  : firebase.firestore.FieldValue.serverTimestamp(),
        active     : true,
      };
      try { await ref.set(profile); } catch(e) { console.error('[auth] Could not create profile:', e); }
      return profile;
    }

    // Update last login silently
    try {
      await ref.update({
        lastLogin   : firebase.firestore.FieldValue.serverTimestamp(),
        displayName : firebaseUser.displayName || snap.data().displayName || '',
        photoURL    : firebaseUser.photoURL    || snap.data().photoURL    || '',
      });
    } catch(e) { /* non-fatal */ }

    return { uid: firebaseUser.uid, ...snap.data() };
  }

  // FIX: guard against double-init (firebase.js duplicate init warning)
  if (!global.SAU) global.SAU = {};
  if (!global.SAU._authInitialized) {
    global.SAU._authInitialized = true;

    SAU.firebase.auth.onAuthStateChanged(async (user) => {
      if (user) {
        _currentUser = user;
        try {
          _userProfile = await ensureUserProfile(user);
        } catch (e) {
          console.error('[auth] profile error:', e);
          _userProfile = null;
        }
      } else {
        _currentUser = null;
        _userProfile = null;
      }
      _resolved = true;
      _authListeners.forEach(fn => { try { fn(_currentUser, _userProfile); } catch(e) {} });
    });
  }

  global.SAU.auth = {
    onAuthStateChanged(fn) {
      _authListeners.push(fn);
      // FIX: only fire immediately if auth has already resolved
      if (_resolved) {
        try { fn(_currentUser, _userProfile); } catch(e) {}
      }
    },

    get currentUser()     { return _currentUser; },
    get userProfile()     { return _userProfile; },
    get isAuthenticated() { return !!_currentUser && !!_userProfile; },
    get role()            { return _userProfile?.role || null; },

    can, isAtLeast, roleInfo, ROLES, PERMISSIONS,

    signIn : () => SAU.firebase.signInWithGoogle(),
    signOut: () => SAU.firebase.signOut(),

    requireAuth(allowedRoles, redirectUrl = '/') {
      return new Promise((resolve) => {
        const unsub = SAU.firebase.auth.onAuthStateChanged(async (user) => {
          unsub();
          if (!user) { window.location.href = redirectUrl; return resolve(false); }
          try {
            const db   = SAU.firebase.db;
            const snap = await db.collection('users').doc(user.uid).get();
            const profile = snap.exists ? { uid: user.uid, ...snap.data() } : null;
            if (!profile || !profile.active) {
              await SAU.firebase.signOut();
              window.location.href = redirectUrl;
              return resolve(false);
            }
            if (allowedRoles?.length && !allowedRoles.includes(profile.role)) {
              window.location.href = '/unauthorized.html';
              return resolve(false);
            }
            _currentUser = user;
            _userProfile = profile;
            resolve(true);
          } catch (e) {
            window.location.href = redirectUrl;
            resolve(false);
          }
        });
      });
    },

    async assignRole(targetUid, newRole) {
      if (!can('users.role.assign')) throw new Error('Permission denied');
      if (!ROLES[newRole]) throw new Error('Unknown role: ' + newRole);
      await SAU.firebase.db.collection('users').doc(targetUid).update({
        role      : newRole,
        updatedAt : firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy : _currentUser.uid,
      });
    },

    async listUsers() {
      if (!can('users.view')) throw new Error('Permission denied');
      const snap = await SAU.firebase.db.collection('users').orderBy('createdAt','desc').get();
      return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    },
  };

})(window);

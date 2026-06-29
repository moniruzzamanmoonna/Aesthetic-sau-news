/**
 * auth.js — Aesthetic SAU News (v3 — timing fixed)
 */
(function (global) {
  'use strict';

  const ROLES = {
    super_admin : { level: 5, label: 'Super Admin', color: '#c0341a' },
    admin       : { level: 4, label: 'Admin',       color: '#1a5fa0' },
    editor      : { level: 3, label: 'Editor',      color: '#1a7a3a' },
    journalist  : { level: 2, label: 'Journalist',  color: '#6a3a9a' },
    moderator   : { level: 1, label: 'Moderator',   color: '#e0b400' },
  };

  const PERMISSIONS = {
    'articles.create'   : ['super_admin','admin','editor','journalist'],
    'articles.edit.own' : ['super_admin','admin','editor','journalist'],
    'articles.edit.any' : ['super_admin','admin','editor'],
    'articles.delete'   : ['super_admin','admin'],
    'articles.publish'  : ['super_admin','admin','editor'],
    'comments.moderate' : ['super_admin','admin','editor','moderator'],
    'comments.delete'   : ['super_admin','admin','moderator'],
    'users.view'        : ['super_admin','admin'],
    'users.manage'      : ['super_admin','admin'],
    'users.role.assign' : ['super_admin'],
    'config.edit'       : ['super_admin','admin'],
    'analytics.view'    : ['super_admin','admin','editor'],
    'panel.dashboard'   : ['super_admin','admin','editor','journalist','moderator'],
    'panel.articles'    : ['super_admin','admin','editor','journalist'],
    'panel.new_article' : ['super_admin','admin','editor','journalist'],
    'panel.comments'    : ['super_admin','admin','editor','moderator'],
    'panel.users'       : ['super_admin','admin'],
    'panel.settings'    : ['super_admin','admin'],
    'panel.analytics'   : ['super_admin','admin','editor'],
  };

  const SUPER_ADMIN_EMAIL = 'moniruzzamanmoonna@gmail.com';

  let _currentUser = null;
  let _userProfile = null;
  let _ready       = false;          // true after FIRST onAuthStateChanged fires
  let _listeners   = [];

  function can(permission, role) {
    const r = role || (_userProfile && _userProfile.role);
    if (!r) return false;
    return Array.isArray(PERMISSIONS[permission]) && PERMISSIONS[permission].includes(r);
  }
  function roleInfo(role) { return ROLES[role] || { level:0, label:'Unknown', color:'#9a9183' }; }
  function isAtLeast(target, role) {
    const r = role || (_userProfile && _userProfile.role);
    return !!(r && ROLES[r] && ROLES[target] && ROLES[r].level >= ROLES[target].level);
  }

  function _notify() {
    _listeners.forEach(fn => { try { fn(_currentUser, _userProfile); } catch(e){} });
  }

  async function _loadOrCreateProfile(fbUser) {
    const db  = SAU.firebase.db;
    const ref = db.collection('users').doc(fbUser.uid);
    let snap;
    try { snap = await ref.get(); } catch(e) { snap = { exists: false }; }

    if (!snap.exists) {
      const profile = {
        uid        : fbUser.uid,
        email      : fbUser.email,
        displayName: fbUser.displayName || '',
        photoURL   : fbUser.photoURL    || '',
        role       : fbUser.email === SUPER_ADMIN_EMAIL ? 'super_admin' : 'journalist',
        active     : true,
        createdAt  : firebase.firestore.FieldValue.serverTimestamp(),
        lastLogin  : firebase.firestore.FieldValue.serverTimestamp(),
      };
      try { await ref.set(profile); } catch(e) { console.warn('[auth] create profile failed:', e.message); }
      return profile;
    }

    // Update last login quietly
    try {
      await ref.update({
        lastLogin   : firebase.firestore.FieldValue.serverTimestamp(),
        displayName : fbUser.displayName || snap.data().displayName || '',
        photoURL    : fbUser.photoURL    || snap.data().photoURL    || '',
      });
    } catch(e) { /* non-fatal */ }

    return { uid: fbUser.uid, ...snap.data() };
  }

  // ── Single Firebase auth listener ─────────────────────────────
  // KEY FIX: we attach ONCE here. admin.html must NOT attach its own
  // firebase.auth().onAuthStateChanged — it uses SAU.auth.onAuthStateChanged instead.
  SAU.firebase.auth.onAuthStateChanged(async (fbUser) => {
    if (fbUser) {
      _currentUser = fbUser;
      try {
        _userProfile = await _loadOrCreateProfile(fbUser);
      } catch(e) {
        console.error('[auth] profile load error:', e);
        _userProfile = null;
      }
    } else {
      _currentUser = null;
      _userProfile = null;
    }
    _ready = true;
    _notify();
  });

  // ── Public API ────────────────────────────────────────────────
  global.SAU.auth = {
    // Register callback — fires immediately if auth already resolved
    onAuthStateChanged(fn) {
      _listeners.push(fn);
      if (_ready) { try { fn(_currentUser, _userProfile); } catch(e){} }
    },

    get currentUser()     { return _currentUser; },
    get userProfile()     { return _userProfile; },
    get isAuthenticated() { return !!_currentUser && !!_userProfile; },
    get role()            { return _userProfile ? _userProfile.role : null; },
    get ready()           { return _ready; },

    can, isAtLeast, roleInfo, ROLES, PERMISSIONS,

    signIn()  { return SAU.firebase.signInWithGoogle(); },
    signOut() { return SAU.firebase.signOut(); },

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

  console.log('[SAU] auth.js loaded ✓');
})(window);

/**
 * auth.js — Aesthetic SAU News
 * Role-based authentication system with Firestore-backed permissions.
 *
 * ROLES (highest → lowest):
 *   super_admin  → full access, manage all users & roles
 *   admin        → manage articles, users (except super_admin)
 *   editor       → publish / unpublish articles, edit any article
 *   journalist   → create & edit own articles (draft only; editor publishes)
 *   moderator    → approve / reject comments, cannot edit articles
 */

(function (global) {
  'use strict';

  /* ── Role hierarchy ───────────────────────────────────────── */
  const ROLES = {
    super_admin : { level: 5, label: 'Super Admin',  color: '#c0341a' },
    admin       : { level: 4, label: 'Admin',        color: '#1a5fa0' },
    editor      : { level: 3, label: 'Editor',       color: '#1a7a3a' },
    journalist  : { level: 2, label: 'Journalist',   color: '#6a3a9a' },
    moderator   : { level: 1, label: 'Moderator',    color: '#e0b400' },
  };

  /* ── Permissions matrix ───────────────────────────────────── */
  const PERMISSIONS = {
    // Articles
    'articles.create'          : ['super_admin','admin','editor','journalist'],
    'articles.edit.own'        : ['super_admin','admin','editor','journalist'],
    'articles.edit.any'        : ['super_admin','admin','editor'],
    'articles.delete'          : ['super_admin','admin'],
    'articles.publish'         : ['super_admin','admin','editor'],

    // Comments / moderation
    'comments.moderate'        : ['super_admin','admin','editor','moderator'],
    'comments.delete'          : ['super_admin','admin','moderator'],

    // Users
    'users.view'               : ['super_admin','admin'],
    'users.manage'             : ['super_admin','admin'],
    'users.role.assign'        : ['super_admin'],

    // Site config / analytics
    'config.edit'              : ['super_admin','admin'],
    'analytics.view'           : ['super_admin','admin','editor'],

    // Dashboard panels (controls sidebar visibility)
    'panel.dashboard'          : ['super_admin','admin','editor','journalist','moderator'],
    'panel.articles'           : ['super_admin','admin','editor','journalist'],
    'panel.new_article'        : ['super_admin','admin','editor','journalist'],
    'panel.comments'           : ['super_admin','admin','editor','moderator'],
    'panel.users'              : ['super_admin','admin'],
    'panel.settings'           : ['super_admin','admin'],
    'panel.analytics'          : ['super_admin','admin','editor'],
  };

  /* ── State ────────────────────────────────────────────────── */
  let _currentUser   = null;   // Firebase user object
  let _userProfile   = null;   // Firestore document data
  let _authListeners = [];     // Callbacks for auth state changes

  /* ── Helpers ─────────────────────────────────────────────── */
  function can(permission, role) {
    const r = role || (_userProfile && _userProfile.role);
    if (!r) return false;
    const allowed = PERMISSIONS[permission];
    return Array.isArray(allowed) && allowed.includes(r);
  }

  function roleInfo(role) {
    return ROLES[role] || { level: 0, label: 'Unknown', color: '#9a9183' };
  }

  function isAtLeast(targetRole, role) {
    const r = role || (_userProfile && _userProfile.role);
    if (!r || !ROLES[r] || !ROLES[targetRole]) return false;
    return ROLES[r].level >= ROLES[targetRole].level;
  }

  /* ── Firestore profile ────────────────────────────────────── */
  async function fetchUserProfile(uid) {
    const db = SAU.firebase.db;
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) return null;
    return { uid, ...snap.data() };
  }

  async function ensureUserProfile(firebaseUser) {
    const db = SAU.firebase.db;
    const ref = db.collection('users').doc(firebaseUser.uid);
    const snap = await ref.get();

    if (!snap.exists) {
      // First-ever login — check if this email should be super_admin
      const superAdminEmail = 'moniruzzamanmoonna@gmail.com';
      const isOwner = firebaseUser.email === superAdminEmail;

      const profile = {
        uid        : firebaseUser.uid,
        email      : firebaseUser.email,
        displayName: firebaseUser.displayName || '',
        photoURL   : firebaseUser.photoURL    || '',
        role       : isOwner ? 'super_admin' : 'journalist', // default new users to journalist
        createdAt  : firebase.firestore.FieldValue.serverTimestamp(),
        lastLogin  : firebase.firestore.FieldValue.serverTimestamp(),
        active     : true,
      };
      await ref.set(profile);
      return profile;
    }

    // Update login timestamp & sync display info
    await ref.update({
      lastLogin   : firebase.firestore.FieldValue.serverTimestamp(),
      displayName : firebaseUser.displayName || snap.data().displayName || '',
      photoURL    : firebaseUser.photoURL    || snap.data().photoURL    || '',
    });
    return { uid: firebaseUser.uid, ...snap.data() };
  }

  /* ── Auth state listener ──────────────────────────────────── */
  SAU.firebase.auth.onAuthStateChanged(async (user) => {
    if (user) {
      _currentUser = user;
      try {
        _userProfile = await ensureUserProfile(user);
      } catch (e) {
        console.error('[auth] Could not load user profile:', e);
        _userProfile = null;
      }
    } else {
      _currentUser  = null;
      _userProfile  = null;
    }
    _authListeners.forEach(fn => {
      try { fn(_currentUser, _userProfile); } catch(e) {}
    });
  });

  /* ── Public API ───────────────────────────────────────────── */
  global.SAU.auth = {
    /** Register a callback fired on every auth state change */
    onAuthStateChanged(fn) {
      _authListeners.push(fn);
      // Fire immediately if already resolved
      if (_currentUser !== undefined) {
        try { fn(_currentUser, _userProfile); } catch(e) {}
      }
    },

    /** Current Firebase user */
    get currentUser() { return _currentUser; },

    /** Current Firestore profile (includes .role) */
    get userProfile() { return _userProfile; },

    /** True if signed in AND has an active profile */
    get isAuthenticated() { return !!_currentUser && !!_userProfile; },

    /** Current role string */
    get role() { return _userProfile?.role || null; },

    /** Check a permission */
    can,

    /** Check if current user's role is at least `targetRole` */
    isAtLeast,

    /** Get role metadata (label, color, level) */
    roleInfo,

    /** All roles map */
    ROLES,

    /** All permissions map */
    PERMISSIONS,

    /** Sign in */
    signIn : () => SAU.firebase.signInWithGoogle(),

    /** Sign out */
    signOut: () => SAU.firebase.signOut(),

    /**
     * requireAuth(allowedRoles?, redirectUrl?)
     * Call this at page load to guard a page.
     * Returns true if access granted, false (and redirects) if not.
     */
    requireAuth(allowedRoles, redirectUrl = '/') {
      return new Promise((resolve) => {
        // Wait until Firebase resolves auth (fires once)
        const unsubscribe = SAU.firebase.auth.onAuthStateChanged(async (user) => {
          unsubscribe();
          if (!user) {
            window.location.href = redirectUrl;
            return resolve(false);
          }
          try {
            const profile = await fetchUserProfile(user.uid);
            if (!profile || !profile.active) {
              await SAU.firebase.signOut();
              window.location.href = redirectUrl;
              return resolve(false);
            }
            if (allowedRoles && allowedRoles.length > 0) {
              if (!allowedRoles.includes(profile.role)) {
                window.location.href = '/unauthorized.html';
                return resolve(false);
              }
            }
            _currentUser = user;
            _userProfile = profile;
            resolve(true);
          } catch (e) {
            console.error('[auth] requireAuth error:', e);
            window.location.href = redirectUrl;
            resolve(false);
          }
        });
      });
    },

    /**
     * Admin helper: assign a role to a user by uid.
     * Only super_admin can call this (enforced by Firestore rules too).
     */
    async assignRole(targetUid, newRole) {
      if (!can('users.role.assign')) throw new Error('Permission denied');
      if (!ROLES[newRole]) throw new Error('Unknown role: ' + newRole);
      const db = SAU.firebase.db;
      await db.collection('users').doc(targetUid).update({
        role      : newRole,
        updatedAt : firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy : _currentUser.uid,
      });
    },

    /**
     * Fetch all user profiles (admin only).
     */
    async listUsers() {
      if (!can('users.view')) throw new Error('Permission denied');
      const db   = SAU.firebase.db;
      const snap = await db.collection('users').orderBy('createdAt','desc').get();
      return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    },
  };

})(window);

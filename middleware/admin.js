// ============================================================
// Role-based access control middleware
// ============================================================

// Only allow admin role
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Tidak terautentikasi' });
  }
  // Super admin can do anything
  if (req.user.role === 'superadmin') return next();
  // Admin has full access
  if (req.user.role === 'admin') return next();

  return res.status(403).json({
    error: 'Akses ditolak. Hanya admin yang dapat melakukan aksi ini.',
    code: 'ADMIN_REQUIRED'
  });
}

// Only allow admin or ustadz role
function requireAdminOrUstadz(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Tidak terautentikasi' });
  }
  if (req.user.role === 'superadmin') return next();
  if (req.user.role === 'admin' || req.user.role === 'ustadz') return next();

  return res.status(403).json({
    error: 'Akses ditolak. Hanya admin atau ustadz yang dapat melakukan aksi ini.',
    code: 'ADMIN_USTADZ_REQUIRED'
  });
}

// Only allow super admin
function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Tidak terautentikasi' });
  }
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      error: 'Akses ditolak. Hanya super admin yang dapat mengakses fitur ini.',
      code: 'SUPER_ADMIN_REQUIRED'
    });
  }
  next();
}

module.exports = { requireAdmin, requireAdminOrUstadz, requireSuperAdmin };

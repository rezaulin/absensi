const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'epesantren-default-secret-change-me';

// ============================================================
// Authenticate: Verify JWT token
// ============================================================
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token tidak ditemukan', code: 'NO_TOKEN' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token telah expired, silakan login ulang', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Token tidak valid', code: 'INVALID_TOKEN' });
  }
}

// ============================================================
// AuthenticateTenant: JWT + tenant isolation
// Super admin can bypass tenant check
// ============================================================
function authenticateTenant(req, res, next) {
  authenticate(req, res, () => {
    // Super admin can access any tenant
    if (req.user.role === 'superadmin') {
      // Load tenant if slug present but don't enforce
      const { loadTenant } = require('./tenant');
      if (req.tenantSlug) {
        return loadTenant(req, res, next);
      }
      return next();
    }

    // Load tenant first
    const { loadTenant } = require('./tenant');
    loadTenant(req, res, () => {
      // Ensure user belongs to this tenant
      if (req.sekolah_id && req.user.sekolah_id !== req.sekolah_id) {
        return res.status(403).json({
          error: 'Akses ditolak. Anda tidak memiliki akses ke pesantren ini.',
          code: 'TENANT_MISMATCH'
        });
      }
      next();
    });
  });
}

module.exports = { authenticate, authenticateTenant };

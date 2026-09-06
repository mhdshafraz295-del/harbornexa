const { verifyToken } = require('../utils/jwt');
const db = require('../config/db');

const requireAuth = async (req, res, next) => {
  try {
    // Read JWT strictly from httpOnly cookie
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please sign in.',
      });
    }

    // Verify JWT payload
    const decoded = verifyToken(token);
    const adminId = decoded?.adminId || decoded?.id;

    if (!decoded || !adminId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid session or token expired.',
      });
    }

    // Query active admin user
    const [rows] = await db.query(
      'SELECT id, name, email, role, status, last_login_at FROM admins WHERE id = ?',
      [adminId]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Admin account not found.',
      });
    }

    const admin = rows[0];

    // Check account status
    if (admin.status !== 'ACTIVE') {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive. Please contact support.',
      });
    }

    // Attach admin to request object
    req.admin = admin;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Authentication failed.',
    });
  }
};

module.exports = {
  requireAuth,
};

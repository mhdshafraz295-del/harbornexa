const { verifyToken } = require('../utils/jwt');
const prisma = require('../config/prismaClient');

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

    // Query active admin user using Prisma
    const admin = await prisma.admins.findUnique({
      where: { id: Number(adminId) },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        last_login_at: true,
      },
    });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Admin account not found.',
      });
    }

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

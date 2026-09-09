let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch (e) {
  bcrypt = require('bcryptjs');
}
const prisma = require('../config/prismaClient');
const env = require('../config/env');
const { generateToken } = require('../utils/jwt');
const { logAudit } = require('../services/auditService');

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  const ipAddress = req.ip || req.connection?.remoteAddress || null;
  const userAgent = req.get('user-agent') || null;

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      await logAudit({
        action: 'LOGIN_FAILED',
        ipAddress,
        userAgent,
        metadata: { reason: 'Missing email or password' },
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Query admin user by email using Prisma
    const admin = await prisma.admins.findUnique({
      where: { email },
    });

    if (!admin) {
      await logAudit({
        action: 'LOGIN_FAILED',
        ipAddress,
        userAgent,
        metadata: { emailAttempted: email, reason: 'Email not found' },
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Check account status
    if (admin.status !== 'ACTIVE') {
      await logAudit({
        adminId: admin.id,
        action: 'LOGIN_FAILED',
        ipAddress,
        userAgent,
        metadata: { reason: 'Account inactive' },
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Verify password with bcrypt
    const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
    if (!isPasswordValid) {
      await logAudit({
        adminId: admin.id,
        action: 'LOGIN_FAILED',
        ipAddress,
        userAgent,
        metadata: { reason: 'Invalid password' },
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Minimal Payload: adminId and role ONLY
    const token = generateToken({
      adminId: admin.id,
      role: admin.role,
    });

    // Update last_login_at timestamp using Prisma
    const now = new Date();
    await prisma.admins.update({
      where: { id: admin.id },
      data: { last_login_at: now },
    });

    // Log success in audit_logs
    await logAudit({
      adminId: admin.id,
      action: 'ADMIN_LOGIN',
      ipAddress,
      userAgent,
      metadata: { loginTime: now.toISOString() },
    });

    // Set secure httpOnly session cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours matching JWT_EXPIRES_IN=8h
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        last_login_at: now,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
  return res.status(200).json({
    success: true,
    admin: req.admin,
  });
};

/**
 * POST /api/auth/logout
 */
const logout = async (req, res, next) => {
  const ipAddress = req.ip || req.connection?.remoteAddress || null;
  const userAgent = req.get('user-agent') || null;

  try {
    if (req.admin) {
      await logAudit({
        adminId: req.admin.id,
        action: 'ADMIN_LOGOUT',
        ipAddress,
        userAgent,
      });
    }

    res.clearCookie('token', {
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: 'lax',
    });

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  getMe,
  logout,
};

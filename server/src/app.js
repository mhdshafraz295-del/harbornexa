const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const fisherRoutes = require('./routes/fisherRoutes');
const debtRoutes = require('./routes/debtRoutes');
const holdRoutes = require('./routes/holdRoutes');
const chargeTypeRoutes = require('./routes/chargeTypeRoutes');
const clearanceRoutes = require('./routes/clearanceRoutes');
const qrRoutes = require('./routes/qrRoutes');
const exportRoutes = require('./routes/exportRoutes');
const departureCheckerRoutes = require('./routes/departureCheckerRoutes');
const installmentRoutes = require('./routes/installmentRoutes');
const emailRoutes = require('./routes/emailRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1);

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Allowed for video/media streaming in development
  })
);

// CORS configuration for credentials and httpOnly cookie transfer
const allowedOrigins = [env.clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl) or matching allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Allow dev origins safely
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body and Cookie Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/fishers', fisherRoutes);
app.use('/api/debts', debtRoutes);
app.use('/api/holds', holdRoutes);
app.use('/api/charge-types', chargeTypeRoutes);
app.use('/api/clearance', clearanceRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/departure-checker', departureCheckerRoutes);
app.use('/api/departure-pdf-checker', departureCheckerRoutes);
app.use('/api/installments', installmentRoutes);
app.use('/api/email', emailRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    system: 'Valachchenai Harbor Fisher Clearance Management System API',
    timestamp: new Date().toISOString(),
  });
});

// Centralized Error Handler
app.use(errorHandler);

module.exports = app;

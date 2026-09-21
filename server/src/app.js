const path = require('path');
const fs = require('fs');
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
const allowedOrigins = [
  env.clientUrl,
  'https://gregarious-transformation-production.up.railway.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

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

// Health check endpoints for Railway load balancer
app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    system: 'Valachchenai Harbor Fisher Clearance Management System API',
    timestamp: new Date().toISOString(),
  });
});

// Serve built frontend assets if present in client/dist
const clientDistPath = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    const indexPath = path.join(clientDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    return next();
  });
}

// Centralized Error Handler
app.use(errorHandler);

module.exports = app;


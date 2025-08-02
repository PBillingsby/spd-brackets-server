import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import txnRoutes from './routes/index';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') 
    : true, // Allow all origins in development
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/transactions', txnRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'March Madness API Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      transactions: '/api/transactions' // Fixed: was showing 'presale'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
});

// IMPORTANT: Bind to all network interfaces so mobile app can reach it
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📱 Local: http://localhost:${PORT}`);
  console.log(`📱 Network: http://192.168.1.XXX:${PORT} (replace XXX with your IP)`);
  console.log(`💰 Health check: http://localhost:${PORT}/health`);
  console.log(`💰 Transactions API: http://localhost:${PORT}/api/transactions`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
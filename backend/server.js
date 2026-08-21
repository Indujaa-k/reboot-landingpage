const path = require('path');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const authRoutes = require('./route/authRoutes');
const userRoutes = require('./route/userRoutes');
const paymentRoutes = require("./route/paymentRoutes");
const registrationRoutes = require("./route/registrationRoutes");

connectDB();

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:5500",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/registrations", registrationRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

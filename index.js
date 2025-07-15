const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const app = express();

// Load env vars from .env
dotenv.config();

const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Sample Routes
app.get('/', (req, res) => {
  res.send('Lifenix Medicine Multi-Vendor Server Running...');
});
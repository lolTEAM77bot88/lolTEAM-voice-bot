require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
  try {
    require('./bot');
    console.log('Bot started');
  } catch (e) {
    console.error('Bot failed to start:', e && e.stack ? e.stack : e);
  }
});
           

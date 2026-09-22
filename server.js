const express = require('express');
const identityRoutes = require('./routes/identity');

const app = express();
app.use(express.json());

app.use('/', identityRoutes);

// Dev-only token-issuing helper — never mount this in production
if (process.env.NODE_ENV !== 'production') {
  app.use('/', require('./routes/dev'));
  app.use('/', require('./routes/mock-receivers'));
}

// Fallback for anything not in the PRD's REST list
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Student Identity service (Step 1 stub) listening on port ${PORT}`);
});

module.exports = app;

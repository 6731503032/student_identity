const express = require('express');
const identityRoutes = require('./routes/identity');

const app = express();
app.use(require('./middleware/cors')); // let other teams' frontends call us
app.use(express.json({ limit: '300kb' })); // room for a small profile photo
app.use(express.static(require('path').join(__dirname, 'public'))); // frontend

app.use('/', require('./routes/auth')); // sign-up / sign-in
app.use('/', require('./routes/portal')); // dashboard, courses, admin, public verify
app.use('/', identityRoutes);

// Dev-only token-issuing helper — never mount this in production
if (process.env.NODE_ENV !== 'production') {
  app.use('/', require('./routes/dev'));
  app.use('/', require('./routes/mock-receivers'));
}
// Health check — pinged by an uptime monitor so Render's free tier doesn't sleep
app.get('/health', (req, res) => res.send('ok'));

// Fallback for anything not in the PRD's REST list
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

// Only listen when run directly (npm start); tests import `app` without a port.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Student Identity service listening on port ${PORT}`);
  });
}

module.exports = app;

const express = require('express');
const router = express.Router();

/**
 * DEV-ONLY MOCK RECEIVERS for Notification Hub and Data & Analytics.
 * Stand-ins until those teams have real webhook endpoints ready to test against.
 * TODO: once real endpoints exist, set NOTIFICATION_HUB_URL / DATA_ANALYTICS_URL
 * env vars to point at them, and delete this file / stop mounting it.
 */

router.post('/mock/notification-hub', (req, res) => {
  console.log('[mock:notification-hub] received', JSON.stringify(req.body));
  res.status(200).json({ received: true, receiver: 'notification-hub' });
});

router.post('/mock/data-analytics', (req, res) => {
  console.log('[mock:data-analytics] received', JSON.stringify(req.body));
  res.status(200).json({ received: true, receiver: 'data-analytics' });
});

module.exports = router;

const express = require('express');
const router = express.Router();
// User data is served exclusively through authenticated Auth profile routes.
// Do not load legacy controllers: they trust URL/body user IDs and allow delivery.
router.use('/notifications', (_req, res) => res.status(410).json({
  error: 'Estas rutas fueron retiradas. Utiliza /api/auth/profile con tu sesión.',
  code: 'LEGACY_NOTIFICATIONS_RETIRED'
}));

module.exports = router;

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAnnouncementAdminAuthorization } = require('../services/auth-service/dist/admin/announcementAuthorization');

test('announcement admin authorization continues to the route for an active admin', async () => {
  const middleware = createAnnouncementAdminAuthorization(async () => ({ id: 7, rol: 'admin', activo: true }));
  const req = { user: { id: 7 } };
  const res = { locals: {} };
  let nextCalls = 0;

  await middleware(req, res, () => { nextCalls += 1; });

  assert.equal(nextCalls, 1);
  assert.equal(res.locals.adminId, 7);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.ML_GATEWAY_SECRET = 'isolated-gateway-analysis-secret-only';
const { validateAndSanitizeClassifyRequest } = require('../api-gateway/dist/routes/ml.routes');

function mockReqRes(body = {}, user = { id: 42, rol: 'usuario' }, headers = {}) {
  const req = {
    body,
    user,
    headers: { ...headers }
  };
  let responseStatus = 200;
  let responseData = null;
  const res = {
    status(s) {
      responseStatus = s;
      return this;
    },
    json(d) {
      responseData = d;
      return this;
    }
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  return { req, res, next, getResult: () => ({ status: responseStatus, data: responseData, nextCalled }) };
}

test('gateway classify validation rejects empty or missing text/url', () => {
  const { req, res, next, getResult } = mockReqRes({});
  validateAndSanitizeClassifyRequest(req, res, next);
  const r = getResult();
  assert.equal(r.status, 400);
  assert.equal(r.nextCalled, false);
  assert.match(r.data.message, /Debe proporcionar/i);
});

test('gateway classify validation enforces text bounds (10 to 50000 chars)', () => {
  // Demasiado corto
  const shortCase = mockReqRes({ text: 'corto' });
  validateAndSanitizeClassifyRequest(shortCase.req, shortCase.res, shortCase.next);
  assert.equal(shortCase.getResult().status, 400);
  assert.match(shortCase.getResult().data.message, /al menos 10 caracteres/i);

  // Demasiado largo
  const longText = 'a'.repeat(50001);
  const longCase = mockReqRes({ text: longText });
  validateAndSanitizeClassifyRequest(longCase.req, longCase.res, longCase.next);
  assert.equal(longCase.getResult().status, 400);
  assert.match(longCase.getResult().data.message, /50,000 caracteres/i);

  // Válido
  const validCase = mockReqRes({ text: 'Noticia válida con más de diez caracteres' });
  validateAndSanitizeClassifyRequest(validCase.req, validCase.res, validCase.next);
  assert.equal(validCase.getResult().nextCalled, true);
});

test('gateway classify validation enforces URL format and bounds', () => {
  // Protocolo no permitido
  const badProtocol = mockReqRes({ url: 'javascript:alert(1)' });
  validateAndSanitizeClassifyRequest(badProtocol.req, badProtocol.res, badProtocol.next);
  assert.equal(badProtocol.getResult().status, 400);
  assert.match(badProtocol.getResult().data.message, /http:\/\/ o https:\/\//i);

  // URL demasiado larga
  const longUrl = 'https://example.com/' + 'a'.repeat(2040);
  const longCase = mockReqRes({ url: longUrl });
  validateAndSanitizeClassifyRequest(longCase.req, longCase.res, longCase.next);
  assert.equal(longCase.getResult().status, 400);
  assert.match(longCase.getResult().data.message, /2048 caracteres/i);

  // URL válida
  const validCase = mockReqRes({ url: 'https://salud.gob.mx/noticia-oficial' });
  validateAndSanitizeClassifyRequest(validCase.req, validCase.res, validCase.next);
  assert.equal(validCase.getResult().nextCalled, true);
});

test('gateway sanitizes usuario_id and prevents identity spoofing', () => {
  // Usuario autenticado como ID 42 intenta ser suplantado con ID 999 en el cuerpo
  const { req, res, next, getResult } = mockReqRes(
    { text: 'Contenido verificado legítimo de salud', usuario_id: 999 },
    { id: 42, rol: 'usuario', email: 'user@example.invalid' }
  );

  validateAndSanitizeClassifyRequest(req, res, next);
  assert.equal(getResult().nextCalled, true);

  // El usuario_id en el cuerpo debe ser sobrescrito obligatoriamente por la sesión
  assert.equal(req.body.usuario_id, 42);
});

test('gateway rejects an unauthenticated classify request', () => {
  const { req, res, next, getResult } = mockReqRes(
    { text: 'Contenido anónimo verificado', usuario_id: 999 },
    null
  );

  validateAndSanitizeClassifyRequest(req, res, next);
  assert.equal(getResult().nextCalled, false);
  assert.equal(getResult().status, 401);
});

test('gateway rejects ambiguous inputs and arrays', () => {
  for (const body of [[], {text:'Synthetic text input', url:'https://example.invalid/news'}]) {
    const m = mockReqRes(body);
    validateAndSanitizeClassifyRequest(m.req, m.res, m.next);
    assert.equal(m.getResult().status, 400);
    assert.equal(m.getResult().nextCalled, false);
  }
});

test('proxy derives internal headers from authenticated context, never inbound headers', async () => {
  const axios = require('../api-gateway/node_modules/axios/dist/node/axios.cjs');
  const {createServiceProxy} = require('../api-gateway/dist/routes/proxy');
  let forwarded;
  const old = axios.defaults.adapter;
  axios.defaults.adapter = async config => { forwarded = config; return {status:200, data:{ok:true}, headers:{}, config}; };
  try {
    const m = mockReqRes({text:'Synthetic text input'}, {id:42, rol:'usuario'}, {
      'x-user-id':'999', 'x-user-role':'admin', 'x-gateway-secret':'attacker', 'x-request-deadline':'999999999999'
    });
    Object.assign(m.req, {path:'/classify/predict', method:'POST', query:{}});
    await createServiceProxy('ml', 'http://unused.invalid')(m.req, m.res, error => {throw error;});
    assert.equal(forwarded.headers.get('X-User-Id'), '42');
    assert.equal(forwarded.headers.get('X-User-Role'), 'usuario');
    assert.equal(forwarded.headers.get('X-Gateway-Secret'), process.env.ML_GATEWAY_SECRET);
    assert(Number(forwarded.headers.get('X-Request-Deadline')) <= Date.now()/1000 + 30);
  } finally { axios.defaults.adapter = old; }
});

test('proxy returns controlled 504 and never disables its timeout on invalid configuration', async () => {
  const axios = require('../api-gateway/node_modules/axios/dist/node/axios.cjs');
  const {createServiceProxy} = require('../api-gateway/dist/routes/proxy');
  const oldAdapter = axios.defaults.adapter;
  const oldTimeout = process.env.PROXY_TIMEOUT_MS;
  try {
    for (const value of ['0', '-1', 'NaN', '999999']) {
      process.env.PROXY_TIMEOUT_MS = value;
      axios.defaults.adapter = async config => {
        assert(config.timeout > 0 && config.timeout <= 30000);
        throw new axios.AxiosError('Synthetic timeout', 'ECONNABORTED', config);
      };
      const m = mockReqRes({text:'Synthetic text input'});
      Object.assign(m.req, {path:'/classify/predict', method:'POST', query:{}});
      let error;
      await createServiceProxy('ml', 'http://unused.invalid')(m.req, m.res, e => {error=e;});
      assert.equal(error.status, 504);
    }
  } finally {
    axios.defaults.adapter = oldAdapter;
    if (oldTimeout === undefined) delete process.env.PROXY_TIMEOUT_MS;
    else process.env.PROXY_TIMEOUT_MS = oldTimeout;
  }
});

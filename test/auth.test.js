const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const fs = require("node:fs");
const path = require("node:path");
const { authenticate, requireRole, adminOnly } = require("../middleware/auth");

const secret = process.env.JWT_SECRET || "your_secret_key_here";

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test("authenticate accepts a valid bearer token and exposes its role", () => {
  const token = jwt.sign({ id: 1, role: "salesman" }, secret);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = response();
  let called = false;

  authenticate(req, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(req.user.role, "salesman");
});

test("authenticate rejects missing and invalid tokens", () => {
  for (const authorization of [undefined, "Bearer invalid-token"]) {
    const req = { headers: { authorization } };
    const res = response();
    authenticate(req, res, () => assert.fail("next must not be called"));
    assert.equal(res.statusCode, 401);
  }
});

test("admin-only role check rejects salesmen", () => {
  const req = { user: { id: 2, role: "salesman" } };
  const res = response();

  requireRole("admin")(req, res, () => assert.fail("next must not be called"));

  assert.equal(res.statusCode, 403);
});

test("admin-only role check allows admins", () => {
  const req = { user: { id: 3, role: "admin" } };
  const res = response();
  let called = false;

  requireRole("admin")(req, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test("a valid salesman token is stopped before an admin-only order status handler", () => {
  const token = jwt.sign({ id: 7, role: "salesman" }, secret);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = response();
  let statusHandlerCalled = false;

  adminOnly[0](req, res, () => {
    adminOnly[1](req, res, () => {
      statusHandlerCalled = true;
    });
  });

  assert.equal(res.statusCode, 403);
  assert.equal(statusHandlerCalled, false);
});

test("a valid admin token reaches an admin-only order status handler", () => {
  const token = jwt.sign({ id: 3, role: "admin" }, secret);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = response();
  let statusHandlerCalled = false;

  adminOnly[0](req, res, () => {
    adminOnly[1](req, res, () => {
      statusHandlerCalled = true;
    });
  });

  assert.equal(res.statusCode, 200);
  assert.equal(statusHandlerCalled, true);
});

test("missing authentication is stopped before an admin-only delete handler", () => {
  const req = { headers: {} };
  const res = response();
  let deleteHandlerCalled = false;

  adminOnly[0](req, res, () => {
    adminOnly[1](req, res, () => {
      deleteHandlerCalled = true;
    });
  });

  assert.equal(res.statusCode, 401);
  assert.equal(deleteHandlerCalled, false);
});

test("all order status and delete routes require admin authorization", () => {
  const routeExpectations = {
    "orderRoutes.js": [
      /router\.put\("\/:id\/status", \.\.\.adminOnly,/,
      /router\.put\("\/:id\/payment", \.\.\.adminOnly,/,
      /router\.put\("\/:id\/status-payment", \.\.\.adminOnly,/,
      /router\.delete\("\/:id", \.\.\.adminOnly,/,
    ],
    "customerorderRoutes.js": [
      /router\.put\("\/:id\/status", \.\.\.adminOnly,/,
      /router\.put\("\/:id\/status-payment", \.\.\.adminOnly,/,
    ],
    "salesmanorderRoutes.js": [
      /router\.put\("\/:id\/status-payment", \.\.\.adminOnly,/,
      /router\.delete\("\/:id", \.\.\.adminOnly,/,
    ],
  };

  for (const [file, expectations] of Object.entries(routeExpectations)) {
    const source = fs.readFileSync(path.join(__dirname, "..", "routes", file), "utf8");
    for (const expectation of expectations) assert.match(source, expectation, file);
  }
});

test("salesman order reads authenticate and enforce JWT ownership", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "routes", "salesmanorderRoutes.js"), "utf8");
  const listRoute = source.slice(
    source.indexOf("// GET ALL SALESMAN ORDERS"),
    source.indexOf("// GET SINGLE SALESMAN ORDER")
  );

  assert.match(source, /router\.get\("\/", authenticate, requireRole\("salesman", "admin"\)/);
  assert.match(source, /router\.get\("\/:id", authenticate, requireRole\("salesman", "admin"\)/);
  assert.match(source, /params\.push\(req\.user\.id\)/);
  assert.match(source, /AND o\.salesman_id = \?/);
  assert.doesNotMatch(listRoute, /salesman_id.*req\.query/);
});

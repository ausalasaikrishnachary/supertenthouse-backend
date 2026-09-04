const test = require("node:test");
const assert = require("node:assert/strict");
const { createOrderStatusNotification } = require("../services/salesmanNotificationService");

test("creates one notification for the salesman assigned to a changed order", async () => {
  const calls = [];
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return [{ insertId: 42 }];
    },
  };

  const id = await createOrderStatusNotification(
    connection,
    { id: 9, order_number: "SALE-009", salesman_id: 7, order_source: "salesman" },
    "pending",
    "approved",
    { id: 1, role: "admin" }
  );

  assert.equal(id, 42);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO salesman_notifications/);
  assert.deepEqual(calls[0].params.slice(0, 6), [7, 9, "salesman", "SALE-009", "pending", "approved"]);
});

test("does not notify when status is unchanged or the order is unassigned", async () => {
  const connection = { query: async () => assert.fail("notification must not be inserted") };

  assert.equal(await createOrderStatusNotification(
    connection,
    { id: 1, order_number: "SALE-001", salesman_id: 2 },
    "pending",
    "pending",
    { id: 1, role: "admin" }
  ), null);

  assert.equal(await createOrderStatusNotification(
    connection,
    { id: 1, order_number: "SALE-001", salesman_id: null },
    "pending",
    "approved",
    { id: 1, role: "admin" }
  ), null);
});

test("salesman notification endpoints scope reads and writes to the authenticated user", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "..", "routes", "salesmanNotificationRoutes.js"), "utf8");

  assert.match(source, /router\.use\(authenticate, requireRole\("salesman"\)\)/);
  assert.match(source, /WHERE salesman_id = \?/);
  assert.match(source, /WHERE id = \? AND salesman_id = \?/);
  assert.doesNotMatch(source, /req\.params\.salesmanId|req\.body\.salesman_id/);
});

test("status update locks the order and commits notification with the status change", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "..", "routes", "salesmanorderRoutes.js"), "utf8");

  assert.match(source, /START TRANSACTION/);
  assert.match(source, /SELECT id, order_number, salesman_id, status FROM salesman_orders WHERE id = \? FOR UPDATE/);
  assert.match(source, /createOrderStatusNotification/);
  assert.match(source, /COMMIT/);
  assert.match(source, /ROLLBACK/);
});

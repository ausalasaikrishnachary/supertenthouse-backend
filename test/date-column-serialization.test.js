const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

/**
 * A `DATE` column is a calendar day. The driver hands it back as a JavaScript Date
 * built at local midnight, and `JSON.stringify` then writes it in UTC, so the stored
 * day 2026-10-03 reaches the client as "2026-10-02T18:30:00.000Z" — the day before.
 * A client that takes the first ten characters then shows a customer the wrong
 * delivery day. That is a silent, one-day, wrong-date bug on the one date they are
 * actually waiting for, and it is invisible until somebody checks the wire.
 *
 * `dateStrings: ["DATE"]` stops the conversion at the driver. This test loads the
 * real `db.js` with a stubbed `mysql2` and inspects the options it passes, so the
 * guard fails if the setting is dropped, renamed, or widened by accident.
 */
function loadConnectionOptions() {
  const originalLoad = Module._load;
  let captured = null;
  Module._load = function (request, ...rest) {
    if (request === "mysql2") {
      return {
        createConnection: (options) => {
          captured = options;
          return { connect: () => {}, promise: () => ({ query: async () => [[], []] }) };
        },
      };
    }
    return originalLoad.call(this, request, ...rest);
  };
  try {
    const dbPath = require.resolve("../db");
    delete require.cache[dbPath];
    require("../db");
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../db")];
  }
  return captured;
}

test("the connection returns DATE columns as plain YYYY-MM-DD text", () => {
  const options = loadConnectionOptions();
  assert.ok(options, "db.js should create a mysql2 connection");

  assert.ok(
    Array.isArray(options.dateStrings),
    "db.js must pass dateStrings, or every DATE column is silently shifted a day",
  );
  assert.deepEqual(
    options.dateStrings,
    ["DATE"],
    "dateStrings must list exactly DATE. Listing DATE and DATETIME together would " +
      "turn order timestamps into bare days and lose the time of day from every " +
      "created_at the panels display.",
  );
});

test("timestamps are left as instants, not flattened to days", () => {
  const options = loadConnectionOptions();
  // Spelled out separately from the assertion above because the two failure modes
  // are opposite: dropping the option shifts days, widening it destroys times.
  for (const type of ["DATETIME", "TIMESTAMP", "TIMESTAMPTZ"]) {
    assert.ok(
      !options.dateStrings.includes(type),
      `${type} columns must stay JavaScript Dates; the app formats a time of day from them`,
    );
  }
});

test("the save response reports the validated day, not whatever the driver returned", async () => {
  const { setDeliveryDate } = require("../services/deliveryDate");

  // A driver configured without dateStrings answers a read with a local-midnight
  // Date. The route must not forward that: it puts the validated day it just wrote
  // on the row instead, so this write path is correct on its own and does not
  // depend on the connection setting above staying in place.
  const driverDate = new Date(2026, 9, 3);
  const connection = {
    query: async (sql) => {
      if (/^\s*UPDATE/i.test(sql)) return [{ affectedRows: 1 }];
      return [[{ id: 6, order_number: "ADM-0006", delivery_date: driverDate }]];
    },
  };

  const saved = await setDeliveryDate(connection, {
    table: "admin_orders",
    id: 6,
    value: "2026-10-03",
  });

  assert.equal(typeof saved.delivery_date, "string", "the response must be a plain day");
  assert.equal(saved.delivery_date, "2026-10-03");
  assert.notEqual(saved.delivery_date, driverDate);
  assert.equal(saved.order_number, "ADM-0006", "the rest of the row still comes through");
});

// ─────────────────────────────────────────────────────────────────────────────
// A deployed server that was missing the connection setting above sent
// "2026-09-29T00:00:00.000Z" for a stored day. Every client rejects that, so the
// promised day read as unset while sitting correct in the database the whole time.
// ─────────────────────────────────────────────────────────────────────────────

test("a driver's local-midnight Date becomes the day that is stored, in any timezone", () => {
  const { deliveryDayForResponse } = require("../services/deliveryDate");
  const original = process.env.TZ;
  try {
    for (const zone of ["UTC", "Asia/Kolkata", "America/New_York", "Pacific/Kiritimati"]) {
      process.env.TZ = zone;
      // Built from parts, exactly as the driver builds it: midnight wherever the
      // server happens to be.
      assert.equal(deliveryDayForResponse(new Date(2026, 9, 3)), "2026-10-03", zone);
      assert.equal(deliveryDayForResponse(new Date(2026, 0, 1)), "2026-01-01", zone);
      assert.equal(deliveryDayForResponse(new Date(2026, 11, 31)), "2026-12-31", zone);
    }
  } finally {
    process.env.TZ = original;
  }
});

test("the day already arrives correctly when the connection setting is in place", () => {
  const { deliveryDayForResponse } = require("../services/deliveryDate");
  assert.equal(deliveryDayForResponse("2026-10-03"), "2026-10-03");
  assert.equal(deliveryDayForResponse("  2026-10-03  "), "2026-10-03");
});

test("a value that is not a day reads as unset rather than as a neighbouring day", () => {
  const { deliveryDayForResponse } = require("../services/deliveryDate");
  for (const value of [
    null,
    undefined,
    "",
    "   ",
    // The exact shape a server without the setting emitted. Taking the first ten
    // characters would work by luck on a UTC server and show the wrong day on any
    // other, so it is refused instead.
    "2026-10-02T18:30:00.000Z",
    "2026-10-03T00:00:00.000Z",
    "2026-02-31",
    "not a date",
    new Date("nonsense"),
  ]) {
    assert.equal(deliveryDayForResponse(value), null, JSON.stringify(String(value)));
  }
});

test("presentOrder changes only the delivery date and leaves the row otherwise intact", () => {
  const { presentOrder, presentOrders } = require("../services/deliveryDate");

  const createdAt = new Date("2026-09-28T05:26:49.000Z");
  const row = {
    id: 6,
    order_number: "ADM-0006",
    grand_total: "1500.00",
    payment_status: "unpaid",
    created_at: createdAt,
    delivery_date: new Date(2026, 9, 3),
  };

  const out = presentOrder(row);
  assert.equal(out.delivery_date, "2026-10-03");
  // Money, status and the timestamp pass through untouched, because converting the
  // whole row would be the dangerous thing to do here.
  assert.equal(out.grand_total, "1500.00");
  assert.equal(out.payment_status, "unpaid");
  assert.equal(out.created_at, createdAt);
  assert.equal(out.order_number, "ADM-0006");
  assert.equal(row.delivery_date instanceof Date, true, "the source row must not be mutated");

  // A row with no delivery date column is returned as-is.
  const bare = { id: 1, order_number: "X" };
  assert.equal(presentOrder(bare), bare);
  assert.equal(presentOrder(null), null);

  const list = presentOrders([row, { id: 7, delivery_date: null }]);
  assert.equal(list[0].delivery_date, "2026-10-03");
  assert.equal(list[1].delivery_date, null);
  assert.equal(presentOrders(null), null, "a missing list is not turned into one");
});

test("every order read path runs rows through the same guarantee", () => {
  // If a query is added later and skips this, the day silently reads as unset
  // again — the exact production failure. Asserted against the route source.
  const fs = require("node:fs");
  for (const file of ["orderRoutes", "customerorderRoutes", "salesmanorderRoutes"]) {
    const source = fs.readFileSync(require.resolve(`../routes/${file}.js`), "utf8");
    assert.ok(
      /presentOrders?\s*\(/.test(source),
      `${file} must pass order rows through presentOrder/presentOrders, so a delivery ` +
        "date is emitted as a bare YYYY-MM-DD day",
    );
  }
});

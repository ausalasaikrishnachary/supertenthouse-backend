// config/db.js
const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "e-com-tenthouse (1)",
  // database: "e-com-tenthouse",
  // port:4306
  port: 3306,
  // A DATE column is a calendar day, not an instant, so it has to reach the client
  // as the plain text it is stored as.
  //
  // Without this, the driver hands back a JavaScript Date built at *local* midnight,
  // and JSON.stringify then renders it in UTC. In this timezone that turns the stored
  // day 2026-10-03 into "2026-10-02T18:30:00.000Z" — the day before. A client that
  // then takes the first ten characters shows a customer the wrong delivery day,
  // which is the one date they are actually waiting for. Returning the bare
  // "YYYY-MM-DD" removes the conversion, and with it the whole class of bug, for
  // every query including ones written later.
  //
  // Only DATE is listed. DATETIME and TIMESTAMP columns stay JavaScript Dates, so
  // the order/created timestamps the rest of the app formats are untouched.
  dateStrings: ["DATE"],
});

db.connect((err) => {
  if (err) console.log(err);
  else console.log("MySQL Connected ✅");
});

module.exports = db;
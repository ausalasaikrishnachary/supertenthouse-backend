// config/db.js
const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "e-com-tenthouse",
  // port:4306
  port: 3306,
});

db.connect((err) => {
  if (err) console.log(err);
  else console.log("MySQL Connected ✅");
});

module.exports = db;
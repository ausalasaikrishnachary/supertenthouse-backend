// scripts/generate-hash.js
const bcrypt = require('bcryptjs');

const password = 'salesman123'; // Change this to your desired password
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(password, salt);

console.log('Password:', password);
console.log('Hash:', hash);
console.log('\nCopy this hash and update the salesman record:');
console.log(hash);
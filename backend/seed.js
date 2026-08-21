// Run with: npm run seed
// Creates a default admin (username: admin / password: admin123) and a few sample users.
require('dotenv').config();
const connectDB = require('./config/db');
const Admin = require('./model/adminModel');
const User = require('./model/userModel');

const seed = async () => {
  await connectDB();

  const existingAdmin = await Admin.findOne({ username: 'admin' });
  if (!existingAdmin) {
    await Admin.create({ username: 'admin', password: 'admin123' });
    console.log('Default admin created -> username: admin / password: admin123');
  } else {
    console.log('Admin already exists, skipping.');
  }


  process.exit(0);
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

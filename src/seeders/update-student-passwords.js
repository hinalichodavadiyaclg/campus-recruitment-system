import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../models/user.model.js';
import { hashPassword } from '../utils/password.js';

async function updateStudentPasswords() {
  await connectDatabase();
  console.log('Connected to MongoDB. Updating student passwords...');

  const passwordHash = await hashPassword('Student@123456');

  const result = await User.updateMany(
    { userType: 'STUDENT' },
    {
      $set: {
        passwordHash,
        accountStatus: 'ACTIVE',
        failedLoginAttempts: 0
      },
      $unset: {
        lockedUntil: 1
      }
    }
  );

  console.log(`Successfully updated ${result.modifiedCount} student account(s) to default password 'Student@123456'.`);
  await disconnectDatabase();
}

updateStudentPasswords().catch(async (err) => {
  console.error('Failed to update student passwords:', err);
  await disconnectDatabase();
  process.exit(1);
});

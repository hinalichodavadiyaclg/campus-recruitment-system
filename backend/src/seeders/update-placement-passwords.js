import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../models/user.model.js';
import { hashPassword } from '../utils/password.js';
import { ROLE_IDS } from '../utils/access-constants.js';

async function updatePlacementPasswords() {
  await connectDatabase();
  console.log('Connected to MongoDB. Updating placement passwords...');

  const defaultPassword = process.env.DEFAULT_PLACEMENT_PASSWORD || 'Placement@123456';
  const passwordHash = await hashPassword(defaultPassword);

  const result = await User.updateMany(
    { userType: 'PLACEMENT', roleId: { $ne: ROLE_IDS.SUPER_ADMIN } },
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

  console.log(`Successfully updated ${result.modifiedCount} placement account(s) to default password '${defaultPassword}'.`);
  await disconnectDatabase();
}

updatePlacementPasswords().catch(async (err) => {
  console.error('Failed to update placement passwords:', err);
  await disconnectDatabase();
  process.exit(1);
});

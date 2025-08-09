import 'dotenv/config';
import { connectToDatabase } from '../lib/database';
import { UserService } from '../lib/services/userService';

async function createAdminUser() {
  try {
    // Connect to database
    await connectToDatabase();
    console.log('✅ Connected to database');

    const userService = new UserService();

    // Check if admin user already exists
    const existingAdmin = await userService.findUserByEmail('admin@cardadder.com');
    if (existingAdmin) {
      console.log('⚠️ Admin user already exists');
      return;
    }

    // Create admin user
    const adminUser = await userService.createUser({
      username: 'admin',
      email: 'admin@cardadder.com',
      password: 'admin123456',
      role: 'admin'
    });

    console.log('✅ Admin user created successfully:', {
      id: adminUser._id,
      username: adminUser.username,
      email: adminUser.email,
      role: adminUser.role
    });

  } catch (error) {
    console.error('❌ Failed to create admin user:', error);
  } finally {
    process.exit(0);
  }
}

createAdminUser(); 
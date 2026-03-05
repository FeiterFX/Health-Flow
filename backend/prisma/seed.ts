import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // Create default admin account
    const hash = await bcrypt.hash('admin123', 10);
    await prisma.user.upsert({
        where: { email: 'admin@debsbooking.co.za' },
        update: {},
        create: {
            email: 'admin@debsbooking.co.za',
            passwordHash: hash,
            name: 'Dr. Roelof Retief'
        }
    });
    console.log('✅ Admin user created: admin@debsbooking.co.za / admin123');

    // Create default settings
    await prisma.setting.upsert({
        where: { id: 1 },
        update: {},
        create: {
            id: 1,
            bufferMinutes: 10,
            workdayStart: '08:00',
            workdayEnd: '17:00',
            practiceName: 'Dr. Roelof Retief'
        }
    });
    console.log('✅ Default settings created');

    console.log('\n🎉 Seed complete! Change the admin password in Settings after first login.');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());

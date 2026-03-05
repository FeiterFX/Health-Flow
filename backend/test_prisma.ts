import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function test() {
    const appts = await prisma.appointment.findMany({ where: { status: 'SCHEDULED' } });
    console.log(appts);
}
test().finally(() => prisma.$disconnect());

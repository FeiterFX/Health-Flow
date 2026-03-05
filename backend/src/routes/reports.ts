import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// GET appointment history (optionally filter by patientId)
router.get('/appointments', async (req: AuthRequest, res: Response) => {
    const { patientId } = req.query;
    const where: any = {};
    if (patientId) where.patientId = Number(patientId);
    const appts = await prisma.appointment.findMany({
        where,
        include: { patient: true },
        orderBy: { startTime: 'desc' }
    });
    return res.json(appts);
});

// GET CSV export
router.get('/appointments/export', async (req: AuthRequest, res: Response) => {
    const appts = await prisma.appointment.findMany({
        include: { patient: true },
        orderBy: { startTime: 'desc' }
    });

    const rows = [
        ['Date', 'Time', 'Patient', 'Phone', 'Status', 'Notes'],
        ...appts.map((a) => [
            a.startTime.toLocaleDateString('en-ZA'),
            a.startTime.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
            a.patient.name,
            a.patient.phone,
            a.status,
            a.notes || ''
        ])
    ];

    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="appointments.csv"');
    return res.send(csv);
});

export default router;

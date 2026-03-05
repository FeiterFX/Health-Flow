import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { buildMessage } from '../services/whatsapp';

const router = Router();
router.use(authMiddleware);

// GET all appointments
router.get('/', async (req: AuthRequest, res: Response) => {
    const appts = await prisma.appointment.findMany({
        where: { userId: req.userId },
        include: { patient: true },
        orderBy: { startTime: 'asc' }
    });
    return res.json(appts);
});

// GET single appointment
router.get('/:id', async (req: AuthRequest, res: Response) => {
    const appt = await prisma.appointment.findFirst({
        where: { id: Number(req.params.id), userId: req.userId },
        include: { patient: true, messageLogs: true }
    });
    if (!appt) return res.status(404).json({ error: 'Not found' });
    return res.json(appt);
});

// POST create appointment
router.post('/', async (req: AuthRequest, res: Response) => {
    const { patientId, startTime, notes, customMsg } = req.body;
    if (!patientId || !startTime) return res.status(400).json({ error: 'patientId and startTime required' });

    const start = new Date(startTime);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // +60 min

    // Double-booking check
    const conflict = await prisma.appointment.findFirst({
        where: {
            userId: req.userId,
            status: 'SCHEDULED',
            AND: [
                { startTime: { lt: end } },
                { endTime: { gt: start } }
            ]
        },
        include: { patient: true }
    });

    if (conflict) {
        const timeStr = conflict.startTime.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
        return res.status(409).json({
            error: `Time unavailable. This slot conflicts with an existing appointment for ${conflict.patient.name} at ${timeStr}.`
        });
    }

    try {
        const appt = await prisma.appointment.create({
            data: { patientId: Number(patientId), userId: req.userId!, startTime: start, endTime: end, notes, customMsg },
            include: { patient: true }
        });

        const settings = await prisma.setting.findFirst();
        const practiceName = settings?.practiceName || 'Dr. Roelof Retief';
        const msgText = buildMessage(appt.patient, appt, 'CONFIRMATION', practiceName);

        return res.status(201).json({ ...appt, patient: appt.patient, _whatsappText: msgText });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// PUT update appointment
router.put('/:id', async (req: AuthRequest, res: Response) => {
    const { startTime, notes, customMsg, status } = req.body;
    try {
        const existing = await prisma.appointment.findFirst({ where: { id: Number(req.params.id), userId: req.userId }, include: { patient: true } });
        if (!existing) return res.status(404).json({ error: 'Not found' });

        const data: any = { notes, customMsg, status };
        if (startTime) {
            const start = new Date(startTime);
            const end = new Date(start.getTime() + 60 * 60 * 1000);

            if (status !== 'CANCELLED') {
                const conflict = await prisma.appointment.findFirst({
                    where: {
                        userId: req.userId,
                        status: 'SCHEDULED',
                        id: { not: Number(req.params.id) },
                        AND: [
                            { startTime: { lt: end } },
                            { endTime: { gt: start } }
                        ]
                    },
                    include: { patient: true }
                });

                if (conflict) {
                    const timeStr = conflict.startTime.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
                    return res.status(409).json({
                        error: `Time unavailable. This slot conflicts with an existing appointment for ${conflict.patient.name} at ${timeStr}.`
                    });
                }
            }

            data.startTime = start;
            data.endTime = end;
        }

        const appt = await prisma.appointment.update({
            where: { id: Number(req.params.id) },
            data,
            include: { patient: true }
        });

        const settings = await prisma.setting.findFirst();
        const practiceName = settings?.practiceName || 'Dr. Roelof Retief';

        let msgText = '';
        if (startTime && status !== 'CANCELLED') {
            msgText = buildMessage(appt.patient, appt, 'CHANGE', practiceName);
        } else if (status === 'CANCELLED') {
            msgText = buildMessage(appt.patient, appt, 'CANCELLATION', practiceName);
        }

        // Return the updated appointment + message text 
        return res.json({ ...appt, _whatsappText: msgText });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// DELETE appointment
router.delete('/:id', async (req: AuthRequest, res: Response) => {
    const check = await prisma.appointment.findFirst({ where: { id: Number(req.params.id), userId: req.userId } });
    if (!check) return res.status(404).json({ error: 'Not found' });
    await prisma.appointment.update({ where: { id: Number(req.params.id) }, data: { status: 'CANCELLED' } });
    return res.json({ success: true });
});

// POST build specific message (For reminder buttons on frontend)
router.post('/:id/build-message', async (req: AuthRequest, res: Response) => {
    const appt = await prisma.appointment.findFirst({ where: { id: Number(req.params.id), userId: req.userId }, include: { patient: true } });
    if (!appt) return res.status(404).json({ error: 'Not found' });

    const { type } = req.body; // 'REMINDER', 'CONFIRMATION', etc.
    const settings = await prisma.setting.findFirst();
    const practiceName = settings?.practiceName || 'Dr. Roelof Retief';

    const msgText = buildMessage(appt.patient, appt, type || 'CONFIRMATION', practiceName);
    return res.json({ text: msgText });
});

export default router;

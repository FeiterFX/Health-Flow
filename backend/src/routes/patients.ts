import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// GET all patients
router.get('/', async (req: AuthRequest, res: Response) => {
    const patients = await prisma.patient.findMany({ where: { userId: req.userId }, orderBy: { name: 'asc' } });
    return res.json(patients);
});

// GET single patient
router.get('/:id', async (req: AuthRequest, res: Response) => {
    const patient = await prisma.patient.findFirst({ where: { id: Number(req.params.id), userId: req.userId }, include: { appointments: { orderBy: { startTime: 'desc' } } } });
    if (!patient) return res.status(404).json({ error: 'Not found' });
    return res.json(patient);
});

// POST create patient
router.post('/', async (req: AuthRequest, res: Response) => {
    const { name, phone, email, notes, consentWhatsApp } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });
    try {
        const patient = await prisma.patient.create({ data: { name, phone, email, notes, consentWhatsApp: consentWhatsApp || false, userId: req.userId! } });
        return res.status(201).json(patient);
    } catch (err: any) {
        if (err.code === 'P2002') return res.status(400).json({ error: 'Phone number already in use' });
        return res.status(500).json({ error: 'Server error' });
    }
});

// PUT update patient
router.put('/:id', async (req: AuthRequest, res: Response) => {
    const { name, phone, email, notes, consentWhatsApp, optedOut } = req.body;
    try {
        const check = await prisma.patient.findFirst({ where: { id: Number(req.params.id), userId: req.userId } });
        if (!check) return res.status(404).json({ error: 'Not found' });
        const patient = await prisma.patient.update({
            where: { id: Number(req.params.id) },
            data: { name, phone, email, notes, consentWhatsApp, optedOut }
        });
        return res.json(patient);
    } catch {
        return res.status(500).json({ error: 'Server error' });
    }
});

// DELETE patient
router.delete('/:id', async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    try {
        const check = await prisma.patient.findFirst({ where: { id, userId: req.userId } });
        if (!check) return res.status(404).json({ error: 'Not found' });
        await prisma.$transaction([
            prisma.messageLog.deleteMany({ where: { patientId: id } }),
            prisma.appointment.deleteMany({ where: { patientId: id } }),
            prisma.patient.delete({ where: { id } })
        ]);
        return res.json({ success: true });
    } catch (err) {
        console.error('Error deleting patient:', err);
        return res.status(500).json({ error: 'Could not delete patient.' });
    }
});

export default router;

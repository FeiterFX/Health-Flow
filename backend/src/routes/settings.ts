import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res: Response) => {
    try {
        const settings = await prisma.setting.upsert({
            where: { userId: req.userId! },
            update: {},
            create: { userId: req.userId! }
        });
        return res.json(settings);
    } catch (err) {
        console.error("Error upserting settings:", err);
        return res.status(500).json({ error: 'Server error' });
    }
});

router.put('/', async (req: AuthRequest, res: Response) => {
    const { bufferMinutes, workdayStart, workdayEnd, practiceName, practicePhone } = req.body;
    try {
        const updated = await prisma.setting.upsert({
            where: { userId: req.userId! },
            update: { bufferMinutes, workdayStart, workdayEnd, practiceName, practicePhone },
            create: { bufferMinutes, workdayStart, workdayEnd, practiceName, practicePhone, userId: req.userId! }
        });
        return res.json(updated);
    } catch (err) {
        return res.status(500).json({ error: 'Server error' });
    }
});

export default router;

import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: AuthRequest, res: Response) => {
    const logs = await prisma.messageLog.findMany({
        where: { userId: req.userId },
        include: { patient: true, appointment: true },
        orderBy: { sentAt: 'desc' },
        take: 200
    });
    return res.json(logs);
});

export default router;

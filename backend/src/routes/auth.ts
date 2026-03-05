import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET || 'debs-secret',
            { expiresIn: '7d' }
        );
        return res.json({ token, name: user.name, email: user.email });
    } catch (err) {
        return res.status(500).json({ error: 'Server error' });
    }
});

router.post('/register', async (req: Request, res: Response) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
        return res.status(400).json({ error: 'Name, email, and password required' });
    }
    try {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(400).json({ error: 'User already exists' });

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { email, passwordHash, name }
        });

        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET || 'debs-secret',
            { expiresIn: '7d' }
        );
        return res.json({ token, name: user.name, email: user.email });
    } catch (err) {
        return res.status(500).json({ error: 'Server error creating user' });
    }
});

export default router;

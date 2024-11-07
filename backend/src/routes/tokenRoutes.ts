import { Router } from 'express';
import { createToken } from '../controllers/tokenController';
import { authenticateToken } from '../utils/jwt';

const router = Router();

router.post('/create', authenticateToken, createToken);

export default router;

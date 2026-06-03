import { Router } from 'express';
import * as authController from '../controllers/auth.controller';

const router = Router();

router.post('/register', authController.register);
router.post('/register/admin', authController.registerAdmin);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/users', authController.getMembers);
router.get('/users/:id', authController.getUserById);

export default router;

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import * as taskController from '../controllers/task.controller';

const router = Router();

router.use(requireAuth);

router.post('/', taskController.createTask);
router.get('/', taskController.getTasksByProject);
router.get('/:id', taskController.getTaskById);
router.patch('/:id', taskController.updateTask);
router.patch('/:id/status', taskController.updateTaskStatus);
router.delete('/:id', taskController.deleteTask);

export default router;

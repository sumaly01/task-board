import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import * as projectController from '../controllers/project.controller';

const router = Router();

router.use(requireAuth);

router.post('/', projectController.createProject);
router.get('/', projectController.getProjects);
router.get('/:id', projectController.getProjectById);

export default router;

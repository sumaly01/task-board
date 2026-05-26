import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { getMembers } from '../controllers/members.controller';

const router = Router();

// requireAuth verifies the x-user-id header from the gateway (or Bearer token for direct testing).
// The ADMIN role check is enforced at the gateway level — by the time this route is reached,
// the caller is guaranteed to be ADMIN. requireAuth here is for defence-in-depth.
router.use(requireAuth);

router.get('/', getMembers);

export default router;

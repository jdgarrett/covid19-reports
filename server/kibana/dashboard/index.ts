import { Router } from 'express';
import controller from './read-only-rest.controller';

const router = Router() as any;

router.get(
  '/',
  controller.logout,
  controller.login,
);

router.get(
  '/embed',
  controller.embed,
);

export default router;

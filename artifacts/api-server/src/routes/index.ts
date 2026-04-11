import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profilesRouter from "./profiles";
import vehiclesRouter from "./vehicles";
import runsRouter from "./runs";
import toursRouter from "./tours";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profilesRouter);
router.use(vehiclesRouter);
router.use(runsRouter);
router.use(toursRouter);
router.use(dashboardRouter);

export default router;

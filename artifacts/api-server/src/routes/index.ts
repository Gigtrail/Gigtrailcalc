import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profilesRouter from "./profiles";
import vehiclesRouter from "./vehicles";
import runsRouter from "./runs";
import venuesRouter from "./venues";
import toursRouter from "./tours";
import dashboardRouter from "./dashboard";
import stripeRouter from "./stripe";
import meRouter from "./me";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meRouter);
router.use(adminRouter);
router.use(stripeRouter);
router.use(profilesRouter);
router.use(vehiclesRouter);
router.use(runsRouter);
router.use(venuesRouter);
router.use(toursRouter);
router.use(dashboardRouter);

export default router;

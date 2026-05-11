import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import cartRouter from "./cart";
import shippingRouter from "./shipping";
import ordersRouter from "./orders";
import blogRouter from "./blog";
import adminRouter from "./admin";
import storageRouter from "./storage";
import seoRouter from "./seo";
import discountsRouter from "./discounts";
import reviewsRouter from "./reviews";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(cartRouter);
router.use(shippingRouter);
router.use(ordersRouter);
router.use(blogRouter);
router.use(discountsRouter);
router.use(reviewsRouter);
router.use(adminRouter);
router.use(storageRouter);
router.use(seoRouter);

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import cartRouter from "./cart";
import shippingRouter from "./shipping";
import geoRouter from "./geo";
import ordersRouter from "./orders";
import blogRouter from "./blog";
import adminRouter from "./admin";
import storageRouter from "./storage";
import imageProxyRouter from "./imageProxy";
import seoRouter from "./seo";
import discountsRouter from "./discounts";
import reviewsRouter from "./reviews";
import newsletterRouter from "./newsletter";
import contactRouter from "./contact";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(cartRouter);
router.use(shippingRouter);
router.use(geoRouter);
router.use(ordersRouter);
router.use(blogRouter);
router.use(discountsRouter);
router.use(reviewsRouter);
router.use(adminRouter);
router.use(storageRouter);
router.use(imageProxyRouter);
router.use(seoRouter);
router.use(newsletterRouter);
router.use(contactRouter);

export default router;

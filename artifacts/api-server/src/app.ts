import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";
import {
  requestIdMiddleware,
  sentryUserMiddleware,
} from "./middlewares/requestId";
import router from "./routes";
import seoRouter from "./routes/seo";
import webhooksRouter from "./routes/webhooks";
import { logger } from "./lib/logger";
import { initSentry, isSentryEnabled, Sentry } from "./lib/sentry";

initSentry();

const app: Express = express();

app.use(requestIdMiddleware());

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req as unknown as { id?: string }).id ?? "",
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Clerk Frontend API proxy must be mounted BEFORE express.json
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Stripe webhook must use raw body — mount BEFORE express.json
app.use("/api", webhooksRouter);

app.use(cors({ credentials: true, origin: true, exposedHeaders: ["X-Request-Id"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(clerkMiddleware());
app.use(sentryUserMiddleware());

app.use("/api", router);

// SEO endpoints also exposed at site root for crawlers
app.use(seoRouter);

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  req.log.error({ err }, "Unhandled request error");
  if (isSentryEnabled()) {
    Sentry.captureException(err, {
      tags: { request_id: (req as unknown as { id?: string }).id ?? "" },
    });
  }
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);

if (isSentryEnabled()) {
  process.on("unhandledRejection", (reason) => {
    Sentry.captureException(reason);
    logger.error({ reason }, "Unhandled promise rejection");
  });
  process.on("uncaughtException", (err) => {
    Sentry.captureException(err);
    logger.error({ err }, "Uncaught exception");
  });
}

export default app;

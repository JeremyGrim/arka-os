import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { createContainer } from "./container";
import { createRoutes } from "./http/routes";
import { createWebSocketGateway } from "./server/websocket";

const PORT = Number(process.env.ARKA_SOCLE_PORT ?? 9090);
const BASE_DIR = process.env.ARKA_SOCLE_BASE ?? path.resolve(process.cwd());

(async () => {
  const container = createContainer(BASE_DIR);
  await container.init();

  const app = express();

  const allowedOrigins = process.env.ARKA_SOCLE_ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean);
  app.use(
    cors({
      origin: allowedOrigins?.length ? allowedOrigins : undefined,
      credentials: true,
    }),
  );

  const apiKey = process.env.ARKA_SOCLE_API_KEY;
  if (apiKey) {
    app.use((req, res, next) => {
      if (req.headers["x-api-key"] !== apiKey) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      next();
    });
  }

  app.use(bodyParser.json({ limit: "10mb" }));

  app.use(createRoutes(container, { allowedOrigins }));

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message });
  });

  const server = app.listen(PORT, "127.0.0.1", () => {
    console.log(`ARKA SOCLE running on http://127.0.0.1:${PORT}`);
  });

  container.notificationScheduler.start();

  const wsGateway = createWebSocketGateway(server, container.notificationEvents, {
    WebSocketServerClass: undefined,
    WebSocketClass: undefined,
    allowedOrigins,
    apiKey,
  });
  wsGateway.initialize();

  const shutdown = async () => {
    container.notificationScheduler.stop();
    wsGateway.dispose();
    server.close();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
})();

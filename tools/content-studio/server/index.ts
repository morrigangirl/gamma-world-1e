import express, { type NextFunction, type Request, type Response } from "express";
import packsRouter from "./routes/packs.js";
import mediaRouter from "./routes/media.js";
import buildRouter from "./routes/build.js";
import extractRouter from "./routes/extract.js";
import { assetsDir } from "./lib/paths.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

app.use("/api/packs", packsRouter);
app.use("/api/media", mediaRouter);
app.use("/api/build", buildRouter);
app.use("/api/extract", extractRouter);
app.use("/api-assets", express.static(assetsDir, { fallthrough: false }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? 500;
  if (!res.headersSent) res.status(status).json({ error: err.message });
  // eslint-disable-next-line no-console
  if (status >= 500) console.error(err);
});

const port = Number(process.env.STUDIO_PORT ?? 3737);
app.listen(port, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`[studio-api] listening on http://127.0.0.1:${port}`);
});

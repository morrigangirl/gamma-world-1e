import { Router, type Request, type Response } from "express";
import { streamScript } from "../lib/spawn-stream.js";

const router = Router();

const CONFIRM_TOKEN = "overwrite-packs";

router.post("/", async (req: Request, res: Response) => {
  const packs = Array.isArray(req.body?.packs) ? (req.body.packs as string[]) : [];
  const publish = req.body?.publish === true;
  const confirm = typeof req.body?.confirm === "string" ? (req.body.confirm as string) : "";
  const args: string[] = [...packs];
  if (publish) {
    if (confirm !== CONFIRM_TOKEN) {
      res.status(400).json({
        error: `refused: publish=true requires confirm="${CONFIRM_TOKEN}" in the request body.`
      });
      return;
    }
    args.push("--publish", "--confirm-overwrite");
  }
  await streamScript(res, "build.mjs", args);
});

router.post("/validate", async (_req: Request, res: Response) => {
  await streamScript(res, "validate.mjs");
});

export default router;

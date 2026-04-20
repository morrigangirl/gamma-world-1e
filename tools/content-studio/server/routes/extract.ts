import { Router, type Request, type Response } from "express";
import { streamScript } from "../lib/spawn-stream.js";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const packs = Array.isArray(req.body?.packs) ? (req.body.packs as string[]) : [];
  await streamScript(res, "extract.mjs", packs);
});

export default router;

import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { deleteStudioUpload, listMedia, saveUpload } from "../lib/media-store.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function handle(fn: (req: Request, res: Response) => unknown) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await fn(req, res);
      if (!res.headersSent && result !== undefined) res.json(result);
    } catch (err) {
      next(err);
    }
  };
}

router.get("/", handle((req) => listMedia((req.query.path as string | undefined) ?? "")));

router.post("/", upload.single("file"), handle((req, res) => {
  if (!req.file) throw Object.assign(new Error("no file uploaded"), { status: 400 });
  const entry = saveUpload(req.file.originalname, req.file.buffer);
  res.status(201).json(entry);
}));

router.delete("/*path", handle((req, res) => {
  const rel = Array.isArray(req.params.path) ? req.params.path.join("/") : String(req.params.path ?? "");
  deleteStudioUpload(rel);
  res.status(204).end();
}));

export default router;

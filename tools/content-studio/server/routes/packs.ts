import { Router, type Request, type Response, type NextFunction } from "express";
import {
  countDocs,
  createDoc,
  deleteDoc,
  listDocs,
  readDoc,
  writeDoc
} from "../lib/content-store.js";
import { addPack, listPackDescriptors } from "../lib/pack-meta.js";
import type { PackDescriptor } from "../../shared/types.js";

const router = Router();

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

router.get("/", handle(() => {
  const descriptors = listPackDescriptors();
  const out: PackDescriptor[] = descriptors.map((p) => ({ ...p, count: countDocs(p.name) }));
  return out;
}));

router.post("/", handle((req, res) => {
  const pack = addPack(req.body ?? {});
  res.status(201).json(pack);
}));

router.get("/:pack/docs", handle((req) => listDocs(req.params.pack)));

router.get("/:pack/docs/:id", handle((req) => {
  const { doc } = readDoc(req.params.pack, req.params.id);
  return doc;
}));

router.put("/:pack/docs/:id", handle((req) => writeDoc(req.params.pack, req.params.id, req.body)));

router.post("/:pack/docs", handle((req, res) => {
  const doc = createDoc(req.params.pack, req.body ?? {});
  res.status(201).json(doc);
}));

router.delete("/:pack/docs/:id", handle((req, res) => {
  deleteDoc(req.params.pack, req.params.id);
  res.status(204).end();
}));

export default router;

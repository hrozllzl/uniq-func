import { Router, type Request, type Response } from "express";

const router = Router();

router.get("/index", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    message: "api works",
  });
});

router.get("/healthz", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
  });
});

export default router;
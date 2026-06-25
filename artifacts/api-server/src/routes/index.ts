import { Router } from "express";

const router = Router();

router.get("/index", (req, res) => {
  res.json({
    ok: true,
    message: "api works",
  });
});

router.get("/healthz", (req, res) => {
  res.status(200).send("HEALTH OK");
});

export default router;
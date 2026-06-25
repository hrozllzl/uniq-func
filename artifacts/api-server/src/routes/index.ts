import { Router } from "express";

const router = Router();

router.get("/healthz", (req, res) => {
  res.status(200).send("HEALTH OK");
});

export default router;
import { Router } from "express";

const router = Router();

router.get("/index", (req, res) => {
  res.json({
    ok: true,
    message: "api works",
  });
});

export default router;
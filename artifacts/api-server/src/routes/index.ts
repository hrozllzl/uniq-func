import { Router } from "express";

const router = Router();

router.get("*", (req, res) => {
  res.json({
    receivedPath: req.path,
    message: "router works",
  });
});

export default router;
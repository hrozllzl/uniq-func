import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "express works"
  });
});

export default app;

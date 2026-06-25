import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "express works",
  });
});

app.get("/api/index", (req, res) => {
  res.json({
    ok: true,
    message: "api works",
  });
});

export default app;
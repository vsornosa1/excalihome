import "dotenv/config";
import express from "express";
import cors from "cors";
import diagramRoutes from "./routes/diagrams";
import versionRoutes from "./routes/versions";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/diagrams", diagramRoutes);
app.use("/api/diagrams", versionRoutes);

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Excalihome backend listening on port ${PORT}`);
  });
}

export default app;

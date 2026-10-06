import express from "express"
import cors from "cors"
import morgan from "morgan"

import leadRoutes from "./routes/leadRoutes.js"

const app = express()

app.use(cors())
app.use(express.json())
app.use(morgan("dev"))

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "lead-intelligence-api" })
})

app.use("/api/leads", leadRoutes)

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const statusCode = error?.statusCode ?? 500
  const message = error?.message ?? "Internal server error"

  res.status(statusCode).json({
    message,
    ...(process.env.NODE_ENV === "development" && { stack: error?.stack }),
  })
})

export default app

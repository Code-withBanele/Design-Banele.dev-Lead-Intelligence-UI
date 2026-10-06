import express from "express"

import cors from "cors"

import morgan from "morgan"

import aiRoutes from "./routes/aiRoutes.js"

import auditRoutes from "./routes/auditRoutes.js"

import digitalIntelligenceRoutes from "./routes/digitalIntelligenceRoutes.js"

import leadRoutes from "./routes/leadRoutes.js"

const app = express()

app.use(cors())

app.use(express.json())

app.use(morgan("dev"))

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "lead-intelligence-api" })
})

app.use("/api", auditRoutes)

app.use("/api", aiRoutes)

app.use("/api", digitalIntelligenceRoutes)

app.use("/api/leads", leadRoutes)

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${req.originalUrl}`,
    },
  })
})

app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const statusCode = error?.statusCode ?? 500

    const message = error?.message ?? "Internal server error"

    const code =
      error?.code ??
      (statusCode === 404 ? "LEAD_NOT_FOUND" : "INTERNAL_SERVER_ERROR")

    const response: {
      error: {
        code: string

        message: string

        details?: string
      }
    } = {
      error: {
        code,

        message,
      },
    }

    if (statusCode >= 500 && process.env.NODE_ENV !== "production") {
      response.error.details = "An unexpected server error occurred."
    }

    res.status(statusCode).json(response)
  },
)

export default app

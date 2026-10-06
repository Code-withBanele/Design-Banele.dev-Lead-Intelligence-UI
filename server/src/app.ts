import express from "express"

import cors from "cors"

import morgan from "morgan"

import aiRoutes from "./routes/aiRoutes.js"

import auditRoutes from "./routes/auditRoutes.js"

import analyticsRoutes from "./routes/analyticsRoutes.js"

import digitalIntelligenceRoutes from "./routes/digitalIntelligenceRoutes.js"

import discoveryRoutes from "./routes/discoveryRoutes.js"

import leadRoutes from "./routes/leadRoutes.js"

import systemRoutes from "./routes/systemRoutes.js"

const app = express()

app.use(cors())

app.use(express.json())

app.use(morgan("dev"))

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "lead-intelligence-api",
    status: "healthy",
    checkedAt: new Date().toISOString(),
  })
})

app.use("/api/system", systemRoutes)

app.use("/api/analytics", analyticsRoutes)

app.use("/api/discovery", discoveryRoutes)

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

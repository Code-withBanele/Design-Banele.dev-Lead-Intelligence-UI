import { Router } from "express"

import { getAnalyticsMetrics } from "../services/analyticsService.js"

const router = Router()

router.get("/", async (_req, res, next) => {
  try {
    res.json(await getAnalyticsMetrics())
  } catch (error) {
    next(error)
  }
})

export default router
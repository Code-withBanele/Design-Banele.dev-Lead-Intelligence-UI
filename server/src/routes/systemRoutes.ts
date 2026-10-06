import { Router } from "express"

import { getSystemHealthStatus } from "../services/systemHealthService.js"

const router = Router()

router.get("/health", async (_req, res, next) => {
  try {
    const health = await getSystemHealthStatus()
    res.json(health)
  } catch (error) {
    next(error)
  }
})

export default router

import { Router } from "express"

import {
  collectDigitalIntelligence,
  getLatestDigitalIntelligence,
} from "../services/digitalIntelligenceService.js"

const router = Router({ mergeParams: true })

router.get("/leads/:id/digital-intelligence", async (req, res, next) => {
  try {
    const result = await getLatestDigitalIntelligence(req.params.id)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

router.post("/leads/:id/digital-intelligence", async (req, res, next) => {
  try {
    const result = await collectDigitalIntelligence(req.params.id, req.body ?? {})
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
})

export default router

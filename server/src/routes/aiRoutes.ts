import { Router } from "express"

import { getLeadById } from "../services/leadService.js"
import {
  generateAiBusinessAnalysis,
  getLatestAiAnalysis,
} from "../services/aiAnalysisService.js"

const router = Router({ mergeParams: true })

router.get("/leads/:id/ai-analysis", async (req, res, next) => {
  try {
    await getLeadById(req.params.id)
    const analysis = await getLatestAiAnalysis(req.params.id)
    res.json(analysis)
  } catch (error) {
    next(error)
  }
})

router.post("/leads/:id/ai-analysis", async (req, res, next) => {
  try {
    await getLeadById(req.params.id)
    const analysis = await generateAiBusinessAnalysis(req.params.id)
    res.status(201).json(analysis)
  } catch (error) {
    next(error)
  }
})

export default router

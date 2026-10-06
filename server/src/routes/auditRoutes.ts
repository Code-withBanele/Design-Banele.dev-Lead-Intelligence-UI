import { Router } from "express"

import {
  calculateLeadOpportunityScore,
  getLatestLeadOpportunityScore,
} from "../services/opportunityScoreService.js"

import {
  getLatestLeadAudit,
  normalizeAuditFactors,
  upsertLeadAudit,
} from "../services/digitalAuditService.js"

import { getLeadById } from "../services/leadService.js"

const router = Router({ mergeParams: true })

router.get("/leads/:id/audit", async (req, res, next) => {
  try {
    await getLeadById(req.params.id)
    const audit = await getLatestLeadAudit(req.params.id)
    res.json(audit)
  } catch (error) {
    next(error)
  }
})

router.post("/leads/:id/audit", async (req, res, next) => {
  try {
    await getLeadById(req.params.id)
    const audit = await upsertLeadAudit(req.params.id, req.body)
    res.status(201).json(audit)
  } catch (error) {
    next(error)
  }
})

router.get("/leads/:id/opportunity-score", async (req, res, next) => {
  try {
    await getLeadById(req.params.id)
    const score = await getLatestLeadOpportunityScore(req.params.id)
    res.json(score)
  } catch (error) {
    next(error)
  }
})

router.post("/leads/:id/opportunity-score", async (req, res, next) => {
  try {
    await getLeadById(req.params.id)
    const result = await calculateLeadOpportunityScore(req.params.id, req.body)
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
})

export default router

import { Router } from "express"

import {
  createLeadWithBusiness,
  getLeadById,
  getLeads,
  updateLeadStatus,
} from "../services/leadService.js"

import {
  evaluateLeadQualification,
  getLatestLeadQualification,
} from "../services/leadQualificationService.js"

import { isLeadStatus } from "../utils/leadValidation.js"

const router = Router()

router.get("/", async (_req, res, next) => {
  try {
    const leads = await getLeads()

    res.json(leads)
  } catch (error) {
    next(error)
  }
})

router.get("/:id", async (req, res, next) => {
  try {
    const lead = await getLeadById(req.params.id)

    res.json(lead)
  } catch (error) {
    next(error)
  }
})

router.get("/:id/qualification", async (req, res, next) => {
  try {
    await getLeadById(req.params.id)
    const qualification = await getLatestLeadQualification(req.params.id)

    res.json(qualification)
  } catch (error) {
    next(error)
  }
})

router.post("/:id/qualification", async (req, res, next) => {
  try {
    await getLeadById(req.params.id)
    const qualification = await evaluateLeadQualification(req.params.id)

    res.status(201).json(qualification)
  } catch (error) {
    next(error)
  }
})

router.post("/", async (req, res, next) => {
  try {
    const { name, industry, location, status } = req.body ?? {}

    if (!name || typeof name !== "string") {
      res.status(400).json({ message: "Business name is required." })

      return
    }

    if (status && !isLeadStatus(status)) {
      res.status(400).json({ message: "Invalid lead status." })

      return
    }

    const lead = await createLeadWithBusiness({
      name,

      industry,

      location,

      status,
    })

    res.status(201).json(lead)
  } catch (error) {
    next(error)
  }
})

router.patch("/:id", async (req, res, next) => {
  try {
    const { status } = req.body ?? {}

    if (!isLeadStatus(status)) {
      res.status(400).json({
        error: {
          code: "INVALID_LEAD_STATUS",
          message: "A valid lead status is required.",
        },
      })

      return
    }

    const lead = await updateLeadStatus(req.params.id, status)

    res.json(lead)
  } catch (error) {
    next(error)
  }
})

export default router

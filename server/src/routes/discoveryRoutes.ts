import { Router } from "express"

import { getDiscoveryRun, runDiscovery } from "../services/discoveryService.js"
import { validateSafeUrl } from "../utils/safeHttp.js"

const router = Router()

router.post("/", async (req, res, next) => {
  try {
    const sourceUrl = req.body?.sourceUrl
    if (typeof sourceUrl !== "string" || !sourceUrl.trim()) {
      res.status(400).json({
        error: { code: "SOURCE_URL_REQUIRED", message: "A source URL is required." },
      })
      return
    }

    let validatedSourceUrl: string
    try {
      validatedSourceUrl = validateSafeUrl(sourceUrl)
    } catch (error) {
      res.status(400).json({
        error: {
          code: "INVALID_SOURCE_URL",
          message: error instanceof Error ? error.message : "The source URL is invalid.",
        },
      })
      return
    }

    const result = await runDiscovery(validatedSourceUrl)
    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
})

router.get("/:runId", async (req, res, next) => {
  try {
    res.json(await getDiscoveryRun(req.params.runId))
  } catch (error) {
    next(error)
  }
})

export default router
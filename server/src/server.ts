import app from "./app.js"

import { env } from "./config/env.js"
import { resumeLeadPipelines } from "./services/leadPipelineService.js"

app.listen(env.port, () => {
  console.log(`Lead API listening on http://localhost:${env.port}`)
  void resumeLeadPipelines()
    .then((count) => console.log(`Resumed ${count} lead pipelines`))
    .catch((error) => console.error("Unable to resume lead pipelines:", error))
})

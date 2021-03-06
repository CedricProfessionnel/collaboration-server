const { send } = require("micro")
const cors = require("micro-cors")()
const query = require("micro-query")
const hash = require("../utils/hash.js")
const error = require("../utils/error")
const getDB = require("../db")

module.exports = cors(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 200, "ok")
  const db = getDB()
  const sessionId = req.params.session_id

  let since
  try {
    since = parseInt(query(req).since)
  } catch (e) {
    return error(res, 400, `Invalid ?since=${query(req).since}`)
  }

  const sessionStmt = db.prepare(
    "SELECT * FROM latest_session_state WHERE short_id = ? LIMIT 1"
  )
  const session = sessionStmt.get(sessionId)

  if (!session) return error(res, 404, "Session Not Found")

  session.summary_object = JSON.parse(session.summary_object)

  const patchesStmt = db.prepare(`
    SELECT patch, user_name
    FROM session_state
    WHERE short_id = ? AND summary_version > ?
    ORDER BY created_at ASC`)
  const patches = patchesStmt.all(sessionId, since)

  const patch = patches.reduce(
    (acc, s) => acc.concat(JSON.parse(s.patch) || []),
    []
  )
  const changeLog = []
  for (const { patch, user_name } of patches) {
    const currentPatch = JSON.parse(patch)
    if (currentPatch.length === 0) continue

    const { op, path } = currentPatch[0]
    changeLog.push({
      userName: user_name,
      op,
      path,
    })
  }

  return send(res, 200, {
    patch,
    changeLog,
    latestVersion: session.summary_version,
    hashOfLatestState: hash(session.summary_object),
  })
})

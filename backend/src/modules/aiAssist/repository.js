// SQL only.
export async function summariseUsage(db) {
  const result = await db.query(
    `SELECT purpose,
            count(*)::int AS calls,
            count(*) FILTER (WHERE success)::int AS "successfulCalls",
            COALESCE(sum(input_tokens), 0)::bigint AS "inputTokens",
            COALESCE(sum(output_tokens), 0)::bigint AS "outputTokens",
            COALESCE(sum(cache_read_tokens), 0)::bigint AS "cacheReadTokens",
            COALESCE(round(avg(latency_ms) FILTER (WHERE success)), 0)::int AS "averageLatencyMs"
     FROM ai_usage_log
     GROUP BY purpose
     ORDER BY purpose`,
  )
  return result.rows
}

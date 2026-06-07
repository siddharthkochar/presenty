import express from 'express'
import cors from 'cors'
import { GoogleGenerativeAI, Tool } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

// Service-role client used for analytics SQL via RPC (bypasses RLS).
// autoRefreshToken/persistSession disabled so the service key is used for
// both apikey and Authorization headers — without this supabase-js sends
// an empty session token in Authorization, causing 401 from PostgREST.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ---------------------------------------------------------------------------
// SQL safety guard
// Only SELECT statements are allowed; no DML/DDL; no statement chaining.
// ---------------------------------------------------------------------------
function validateSelectOnly(sql: string): boolean {
  const normalized = sql.trim().toLowerCase()

  // Must start with SELECT
  if (!normalized.startsWith('select')) return false

  // No multiple statements (semicolons inside string literals are not a concern
  // for typical analytics queries, so a simple split is fine here)
  const statements = normalized.split(';').filter(s => s.trim().length > 0)
  if (statements.length > 1) return false

  // Must not contain write or schema-change keywords as whole words
  const forbidden = [
    'insert', 'update', 'delete', 'drop', 'create',
    'alter', 'truncate', 'grant', 'revoke',
  ]
  return !forbidden.some(kw => new RegExp(`\\b${kw}\\b`).test(normalized))
}

// ---------------------------------------------------------------------------
// Gemini tool declaration
// ---------------------------------------------------------------------------
const tools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'run_sql',
        description:
          'Execute a SELECT SQL query against the attendance database and return results. Only SELECT queries are allowed.',
        parameters: {
          type: 'object' as any,
          properties: {
            query: {
              type: 'string' as any,
              description: 'A valid PostgreSQL SELECT query against the public schema',
            },
          },
          required: ['query'],
        },
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// System prompt — gives Gemini the schema and salary formula
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a helpful analytics assistant for a staff attendance and salary management system.
You have access to a PostgreSQL database with the following tables:

Table: public.people
- id: uuid (primary key)
- name: text
- work_in_time: time (expected check-in time, format HH:MM:SS)
- salary_per_month: numeric (monthly salary)
- monthly_leave_balance: int (allowed paid leave days per month, lapses monthly)
- active: boolean

Table: public.attendance
- id: uuid
- person_id: uuid (references people.id)
- attend_date: date (YYYY-MM-DD)
- check_in_at: timestamptz
- is_late: boolean (true if checked in after work_in_time)

Salary formula:
- working_days = actual calendar days in the month (28-31)
- per_day = salary_per_month / working_days
- present = count of attendance records for that person+month
- absent = working_days - present
- unpaid_leave = max(0, absent - monthly_leave_balance)
- final_pay = salary_per_month - (unpaid_leave * per_day)

Use the run_sql tool to query data, then explain results clearly in natural language.
Always join attendance with people to show names.
When calculating salary in SQL, use EXTRACT(DAY FROM DATE_TRUNC('month', date_col) + INTERVAL '1 month' - INTERVAL '1 day') to get days in month.
Current date: Use now() in SQL for current date/time.`

// ---------------------------------------------------------------------------
// Execute SQL via Supabase RPC (requires run_analytics_query function in DB).
//
// Create the function once in your Supabase SQL editor:
//
//   create or replace function public.run_analytics_query(query text)
//   returns json language plpgsql security definer as $$
//   declare result json;
//   begin
//     execute 'select json_agg(t) from (' || query || ') t' into result;
//     return result;
//   end; $$;
// ---------------------------------------------------------------------------
async function executeSql(query: string): Promise<{ rows?: unknown; error?: string }> {
  const { data, error } = await supabaseAdmin.rpc('run_analytics_query', { query })
  if (error) {
    console.error('[executeSql] Supabase RPC error:', error)
    return { error: error.message }
  }
  return { rows: data }
}

// ---------------------------------------------------------------------------
// POST /analytics
// Body: { question: string }
// Returns: { answer: string }
// ---------------------------------------------------------------------------
async function runAnalyticsSession(question: string, modelName: string): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
    tools,
  })

  const chat = model.startChat()
  let response = await chat.sendMessage(question)

  while (response.response.functionCalls()?.length) {
    const calls = response.response.functionCalls()!
    const toolResults = []

    for (const call of calls) {
      if (call.name === 'run_sql') {
        const { query } = call.args as { query: string }
        if (!validateSelectOnly(query)) {
          toolResults.push({
            functionResponse: { name: call.name, response: { error: 'Only SELECT queries are allowed' } },
          })
          continue
        }
        const { rows, error } = await executeSql(query)
        toolResults.push({
          functionResponse: { name: call.name, response: error ? { error } : { rows } },
        })
      }
    }
    response = await chat.sendMessage(toolResults)
  }

  return response.response.text()
}

app.post('/analytics', async (req, res) => {
  try {
    const { question } = req.body as { question?: string }
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question is required' })
    }

    let answer: string
    try {
      answer = await runAnalyticsSession(question, 'gemini-3.5-flash')
    } catch (err: any) {
      if (err.status === 503 || err.status === 429) {
        console.warn('[analytics] gemini-3.5-flash unavailable, falling back to gemini-1.5-flash')
        answer = await runAnalyticsSession(question, 'gemini-1.5-flash')
      } else {
        throw err
      }
    }

    return res.json({ answer })
  } catch (err) {
    console.error('/analytics error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// GET /health — simple liveness check
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => res.json({ ok: true }))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`API server running on port ${PORT}`))

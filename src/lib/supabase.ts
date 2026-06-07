import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types matching the DB schema
export interface Person {
  id: string
  name: string
  photo_url: string | null
  face_descriptor: number[] | null  // 128-d array stored as float8[] in Postgres
  work_in_time: string  // "HH:MM:SS" format
  work_in_end: string    // "HH:MM:SS" format
  salary_per_month: number
  monthly_leave_balance: number
  active: boolean
  created_at: string
}

export interface Attendance {
  id: string
  person_id: string
  attend_date: string  // "YYYY-MM-DD"
  check_in_at: string  // ISO timestamp
  is_late: boolean
  created_at: string
}

export interface Settings {
  id: number
  capture_start: string    // "HH:MM:SS"
  capture_end: string      // "HH:MM:SS"
  capture_interval_sec: number
  match_threshold: number
  manual_entry: boolean
}

export interface LeaveCarryforward {
  id: string
  person_id: string
  year_month: string  // "YYYY-MM"
  carried_days: number
  created_at: string
}

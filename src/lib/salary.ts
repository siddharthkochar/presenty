export interface SalaryBreakdown {
  workingDays: number      // actual calendar days in the month
  daysElapsed: number      // days counted for absent calc (capped to today for current month)
  perDay: number           // salary_per_month / workingDays
  present: number          // count of attendance records
  absent: number           // max(0, daysElapsed - present)
  paidLeave: number        // min(absent, monthly_leave_balance)
  unpaidLeave: number      // max(0, absent - monthly_leave_balance)
  deduction: number        // unpaidLeave * perDay
  finalPay: number         // salary_per_month - deduction
  lateCount: number        // informational, not deducted
  carriedIn: number       // leave days carried in from previous month
  effectiveLeave: number  // monthlyLeaveBalance + carriedIn
}

// daysInMonth: actual calendar days (28-31)
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()  // month is 1-12
}

export function calculateSalary(
  salaryPerMonth: number,
  monthlyLeaveBalance: number,
  year: number,
  month: number,  // 1-12
  presentCount: number,
  lateCount: number,
  carriedIn: number = 0,
  daysElapsedOverride?: number  // for current month: days passed so far; absent won't include future days
): SalaryBreakdown {
  const workingDays = daysInMonth(year, month)
  // perDay always uses full calendar days so salary deductions are correct
  const perDay = salaryPerMonth / workingDays
  // daysElapsed caps absent calculation to days that have already passed
  const daysElapsed = daysElapsedOverride !== undefined
    ? Math.min(daysElapsedOverride, workingDays)
    : workingDays
  const present = presentCount
  const absent = Math.max(0, daysElapsed - present)
  const effectiveLeave = monthlyLeaveBalance + carriedIn
  const paidLeave = Math.min(absent, effectiveLeave)
  const unpaidLeave = Math.max(0, absent - paidLeave)
  const deduction = unpaidLeave * perDay
  const finalPay = salaryPerMonth - deduction
  return { workingDays, daysElapsed, perDay, present, absent, paidLeave, unpaidLeave, deduction, finalPay, lateCount, carriedIn, effectiveLeave }
}



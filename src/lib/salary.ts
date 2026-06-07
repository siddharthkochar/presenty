export interface SalaryBreakdown {
  workingDays: number      // actual calendar days in the month
  perDay: number           // salary_per_month / workingDays
  present: number          // count of attendance records
  absent: number           // max(0, workingDays - present)
  paidLeave: number        // min(absent, monthly_leave_balance)
  unpaidLeave: number      // max(0, absent - monthly_leave_balance)
  deduction: number        // unpaidLeave * perDay
  finalPay: number         // salary_per_month - deduction
  lateCount: number        // informational, not deducted
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
  lateCount: number
): SalaryBreakdown {
  const workingDays = daysInMonth(year, month)
  const perDay = salaryPerMonth / workingDays
  const present = presentCount
  const absent = Math.max(0, workingDays - present)
  const paidLeave = Math.min(absent, monthlyLeaveBalance)
  const unpaidLeave = Math.max(0, absent - paidLeave)
  const deduction = unpaidLeave * perDay
  const finalPay = salaryPerMonth - deduction
  return { workingDays, perDay, present, absent, paidLeave, unpaidLeave, deduction, finalPay, lateCount }
}

export default function ScoreShape({ gross, par }: { gross: number; par: number }) {
  const diff = gross - par
  // A score is data, so it is set in the body/data face.
  const f = "font-[family-name:var(--font-serif)] leading-none"

  if (diff <= -2) {
    return (
      <span className="relative inline-flex items-center justify-center w-8 h-8 rounded-full border border-accent">
        <span className="absolute inset-[2px] rounded-full border border-accent" />
        <span className={`relative ${f} text-sm font-semibold text-[#0A6B3C]`}>{gross}</span>
      </span>
    )
  }
  if (diff === -1) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-accent">
        <span className={`${f} text-lg text-[#0A6B3C]`}>{gross}</span>
      </span>
    )
  }
  if (diff === 0) {
    return <span className={`${f} text-lg text-ink`}>{gross}</span>
  }
  if (diff === 1) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[rgba(74,55,40,0.55)]">
        <span className={`${f} text-base text-[#4A3728]`}>{gross}</span>
      </span>
    )
  }
  return (
    <span className="relative inline-flex items-center justify-center w-7 h-7 rounded-md border border-[rgba(74,55,40,0.55)]">
      <span className="absolute inset-[2px] rounded-sm border border-[rgba(74,55,40,0.55)]" />
      <span className={`relative ${f} text-xs text-[#4A3728]`}>{gross}</span>
    </span>
  )
}

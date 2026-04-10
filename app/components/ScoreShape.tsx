export default function ScoreShape({ gross, par }: { gross: number; par: number }) {
  const diff = gross - par
  const f = "font-[family-name:var(--font-crimson)] leading-none"

  if (diff <= -2) {
    return (
      <span className="relative inline-flex items-center justify-center w-8 h-8 rounded-full border border-[#C9A84C]">
        <span className="absolute inset-[2px] rounded-full border border-[#C9A84C]" />
        <span className={`relative ${f} text-sm font-semibold text-[#7B5C1E]`}>{gross}</span>
      </span>
    )
  }
  if (diff === -1) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-[#C9A84C]">
        <span className={`${f} text-lg text-[#7B5C1E]`}>{gross}</span>
      </span>
    )
  }
  if (diff === 0) {
    return <span className={`${f} text-lg text-gray-700`}>{gross}</span>
  }
  if (diff === 1) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[#9B8860]">
        <span className={`${f} text-base text-[#5A4F3A]`}>{gross}</span>
      </span>
    )
  }
  return (
    <span className="relative inline-flex items-center justify-center w-7 h-7 rounded-md border border-[#9B8860]">
      <span className="absolute inset-[2px] rounded-sm border border-[#9B8860]" />
      <span className={`relative ${f} text-xs text-[#5A4F3A]`}>{gross}</span>
    </span>
  )
}

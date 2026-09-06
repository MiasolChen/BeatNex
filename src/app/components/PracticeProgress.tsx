import type { EngineSnapshot } from '../../audio/types'

export function barProgress(total: number, cycle: number, started: boolean, complete: boolean) {
  const done = complete ? total : Math.min(total, Math.max(0, cycle))
  const current = complete ? total : started ? Math.min(total, done + 1) : 0
  const start = Math.max(0, Math.min(total - 24, current - 12))
  return { done, current, start, end: Math.min(total, start + 24) }
}

export function PracticeProgress({ total, cycle, snapshot, complete, enabled, guide, round = 1, infinite = false }: {
  total: number; cycle: number; snapshot: EngineSnapshot; complete: boolean; enabled: boolean; guide: string; round?: number; infinite?: boolean
}) {
  const started = snapshot.status === 'playing' || snapshot.status === 'paused' || snapshot.elapsed > 0
  const { done, current, start, end } = barProgress(total, cycle, started, complete)
  const label = complete ? `已完成 ${total} / ${total} 小节` : started ? `${infinite ? `第 ${round} 轮 · ` : ''}第 ${current} / ${total} 小节` : `准备开始 · 共 ${total} 小节`
  return <article className="bn-card bn-practice-progress" hidden={!enabled} aria-label="小节进度">
    <div className="bn-progress-heading"><strong id="bn-bars">{label}</strong><span>{snapshot.status === 'paused' ? '已暂停' : total > 24 ? `刻度 ${start + 1}–${end}` : '小节进度'}</span></div>
    <div id="bn-progress" className="bn-bar-track" role="progressbar" aria-label="练习进度" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={label}>
      {Array.from({ length: end - start }, (_, offset) => { const index = start + offset; return <i key={index} className={index < done ? 'done' : index + 1 === current ? 'current' : ''} aria-hidden="true" /> })}
    </div>
    <p id="bn-guide">{guide}</p>
  </article>
}

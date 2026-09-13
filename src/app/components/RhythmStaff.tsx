import type {Challenge} from '../../core/challenge/challenge'

/** Single unpitched voice: all events sit on the middle line of a percussion staff. */
export function RhythmStaff({challenge, step, active}: {challenge: Challenge; step: number; active: boolean}) {
  let offset = 0
  const events = challenge.tokens.map(token => {const at=offset; offset+=token.length; return {...token, at}})
  return <div className="rc-staves" aria-label="五线谱节奏">
    {[0,1].map(bar => {
      const notes=events.filter(event=>Math.floor(event.at/16)===bar)
      const label=`第${bar+1}小节，4/4拍，打击乐节奏谱：${notes.map(n=>`${n.length===4?'四分':n.length===2?'八分':'十六分'}${n.hit?'音符':'休止符'}`).join('、')}`
      const x=(at:number)=>70+(at-bar*16)*19
      const groups: typeof notes[] = []
      for (const note of notes) {
        if (!note.hit || note.length>2) continue
        const group=groups[groups.length-1], previous=group?.[group.length-1]
        if (previous && previous.at+previous.length===note.at && Math.floor(previous.at/4)===Math.floor(note.at/4)) group.push(note)
        else groups.push([note])
      }
      return <div className="rc-staff-bar" key={bar}><span className="rc-staff-label">第 {bar+1} 小节</span><svg className="rc-staff" viewBox="0 22 390 74" role="img" aria-label={label}>
        <title>{label}</title>
        {[0,1,2,3,4].map(line=><line key={line} className="rc-staff-line" x1="8" x2="381" y1={44+line*10} y2={44+line*10}/>)}
        <path d="M8 44V84 M381 44V84" className="rc-staff-barline"/>
        <g aria-hidden="true" fill="currentColor"><rect x="18" y="53" width="3" height="22"/><rect x="24" y="53" width="3" height="22"/></g>
        <g className="rc-time-signature" aria-hidden="true"><text x="46" y="62">4</text><text x="46" y="81">4</text></g>
        {active&&step>=bar*16&&step<(bar+1)*16&&<rect className="rc-staff-playhead" x={x(step)-2} y="27" width="2" height="66"/>}
        {notes.map(note=>{
          const current=active&&step>=note.at&&step<note.at+note.length
          const group=groups.find(g=>g.some(n=>n.at===note.at))
          const beamed=!!group&&group.length>1
          return <g key={note.at} className="rc-music-symbol" transform={`translate(${x(note.at)} 0)`} data-kind={note.hit?'note':'rest'} data-duration={note.length} data-current={current}>
            {current&&<rect className="rc-symbol-highlight" x="-10" y="26" width={Math.max(20,note.length*19-2)} height="65" rx="4"/>}
            {note.hit?<>
              <ellipse cx="0" cy="64" rx="6" ry="4.2" transform="rotate(-20 0 64)" fill="currentColor"/>
              <path d="M5.5 63V29" fill="none" stroke="currentColor" strokeWidth="1.6"/>
              {!beamed&&note.length<4&&<path d="M5.5 29C7 37 22 38 13 54C17 40 6 41 5.5 38Z" fill="currentColor"/>}
              {!beamed&&note.length===1&&<path d="M5.5 37C7 45 21 46 13 61C17 48 6 49 5.5 46Z" fill="currentColor"/>}
            </>:note.length===4?
              <path d="M-3 43L5 52L0 59L6 68C-5 64-7 73 0 79C-12 75-10 64 0 64L-6 56L0 49Z" fill="currentColor"/>:
              <g fill="currentColor"><circle cx="-3" cy="55" r="3.5"/><path d="M-4 55Q2 61 7 52L1 77H-1L4 59Q-2 62-4 55Z"/>{note.length===1&&<><circle cx="-5" cy="64" r="3.5"/><path d="M-5 64Q0 70 5 61L2 70Q-3 71-5 64Z"/></>}</g>}
          </g>
        })}
        {groups.filter(group=>group.length>1).map(group=><g key={group[0].at} aria-hidden="true" fill="currentColor">
          <rect x={x(group[0].at)+5} y="28" width={x(group[group.length-1].at)-x(group[0].at)+1} height="3.5"/>
          {group.every(note=>note.length===1)&&<rect x={x(group[0].at)+5} y="34" width={x(group[group.length-1].at)-x(group[0].at)+1} height="3.5"/>}
        </g>)}
      </svg></div>
    })}
  </div>
}

import { DifficultySection } from './DifficultySection'
import { GridSection } from './GridSection'
import { SheetSection } from './SheetSection'
import { TitleSection } from './TitleSection'
import { WordsSection } from './WordsSection'

export function EditorPanel() {
  return (
    <div className="card overflow-hidden">
      <WordsSection delay={0} />
      <DifficultySection delay={60} />
      <GridSection delay={120} />
      <TitleSection delay={180} />
      <SheetSection delay={240} />
    </div>
  )
}

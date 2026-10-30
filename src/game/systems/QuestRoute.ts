import { OPENING_SCRIPTS, getExtraIntroScript, getFinalIntroScript, getRegionIntroScript } from '../data/storyScript';
import { EXTRA_STAGES_PER_REGION, EXTRA_STAGE_COUNT, FINAL_STAGE_INDEX, MAIN_STAGE_COUNT, STAGES_PER_REGION, ProgressionSystem } from './ProgressionSystem';
import type { SaveData } from './SaveSystem';
import type { StageKind } from './StaminaSystem';

/** One stage of the quest campaign: which of its three index spaces (main
 *  0..149, the final battle at 150, Extra 0..29) and where in it. */
export interface QuestStage {
  kind: StageKind;
  index: number;
}

/** A scene to start, with the data it takes. */
export interface SceneRoute {
  scene: 'Story' | 'Battle';
  data: object;
}

export function questStageName(stage: QuestStage): string {
  if (stage.kind === 'final') return ProgressionSystem.getFinalStage().name;
  return (stage.kind === 'extra' ? ProgressionSystem.getExtraStage(stage.index) : ProgressionSystem.getStage(stage.index)).name;
}

/** The stage that follows `stage` in play order - the one a 次のステージへ button
 *  goes to - or null at the end of the line (the last Extra stage; the final
 *  battle, which is followed by the ending instead). After main stage 150 comes
 *  the final battle. */
export function nextQuestStage(stage: QuestStage): QuestStage | null {
  if (stage.kind === 'final') return null;
  if (stage.kind === 'extra') return stage.index + 1 < EXTRA_STAGE_COUNT ? { kind: 'extra', index: stage.index + 1 } : null;
  return stage.index + 1 < MAIN_STAGE_COUNT ? { kind: 'main', index: stage.index + 1 } : { kind: 'final', index: FINAL_STAGE_INDEX };
}

/** Where entering `stage` leads: the story that goes before it when there is
 *  one still to read (a region's first stage, the final battle, the first stage
 *  of an Extra group - which plays its intro every time), otherwise straight
 *  into the battle. */
export function questRoute(save: SaveData, stage: QuestStage): SceneRoute {
  if (stage.kind === 'final') {
    const battle = { stageIndex: FINAL_STAGE_INDEX, mode: 'final' };
    if (save.storyFlags.finalIntro) return { scene: 'Battle', data: battle };
    const script = getFinalIntroScript();
    return { scene: 'Story', data: { id: script.id, lines: script.lines, next: { scene: 'Battle', data: battle }, markSeen: { kind: 'finalIntro' } } };
  }

  if (stage.kind === 'extra') {
    const battle = { stageIndex: stage.index, mode: 'extra' };
    if (stage.index % EXTRA_STAGES_PER_REGION !== 0) return { scene: 'Battle', data: battle };
    const regionIndex = Math.floor(stage.index / EXTRA_STAGES_PER_REGION);
    const script = getExtraIntroScript(regionIndex);
    return { scene: 'Story', data: { id: script.id, lines: script.lines, next: { scene: 'Battle', data: battle } } };
  }

  const battle = { stageIndex: stage.index };
  const regionIndex = Math.floor(stage.index / STAGES_PER_REGION);
  if (stage.index % STAGES_PER_REGION !== 0 || save.storyFlags.regionIntro[regionIndex]) return { scene: 'Battle', data: battle };
  const script = getRegionIntroScript(regionIndex);
  return {
    scene: 'Story',
    data: { id: script.id, lines: script.lines, next: { scene: 'Battle', data: battle }, markSeen: { kind: 'regionIntro', regionIndex } },
  };
}

/** The first launch: the opening story (three scripts in a row), then Home, where the
 *  tutorial takes over. Marks the opening as seen at the end of the last script. */
export function openingRoute(): SceneRoute {
  const [first, ...rest] = OPENING_SCRIPTS;
  let next: { scene: string; data?: object } = { scene: 'Home' };
  rest.reverse().forEach((script, i) => {
    next = { scene: 'Story', data: { id: script.id, lines: script.lines, next, ...(i === 0 ? { markSeen: { kind: 'opening' } } : {}) } };
  });
  return { scene: 'Story', data: { id: first.id, lines: first.lines, next } };
}

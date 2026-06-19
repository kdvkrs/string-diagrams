import type { PuzzleInfo } from '../model/interop';
import { BONUS_PUZZLE_ID, DEFAULT_PUZZLE_ID, OFFICIAL_FINAL_PUZZLE_ID } from './config';

export const puzzleIndex = (puzzles: PuzzleInfo[], puzzleId: string) => puzzles.findIndex((p) => p.id === puzzleId);

export const nextPuzzleId = (puzzles: PuzzleInfo[], activePuzzleId: string) => {
  const idx = puzzleIndex(puzzles, activePuzzleId);
  if (idx < 0 || puzzles.length === 0) return DEFAULT_PUZZLE_ID;
  return puzzles[(idx + 1) % puzzles.length].id;
};

export const puzzleIntroduced = (puzzles: PuzzleInfo[], activePuzzleId: string, puzzleId: string) => {
  const currentIdx = puzzleIndex(puzzles, activePuzzleId);
  const introducedIdx = puzzleIndex(puzzles, puzzleId);
  return currentIdx >= 0 && introducedIdx >= 0 && currentIdx >= introducedIdx;
};

export const hasMainNextPuzzle = (puzzles: PuzzleInfo[], activePuzzleId: string) => {
  const idx = puzzleIndex(puzzles, activePuzzleId);
  const finalIdx = puzzleIndex(puzzles, OFFICIAL_FINAL_PUZZLE_ID);
  return idx >= 0 && finalIdx >= 0 && idx < finalIdx;
};

export const isOfficialFinalPuzzle = (activePuzzleId: string) => activePuzzleId === OFFICIAL_FINAL_PUZZLE_ID;

export const isBonusPuzzle = (activePuzzleId: string) => activePuzzleId === BONUS_PUZZLE_ID;

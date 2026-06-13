import type { PuzzleInfo } from './model/interop';

export type Locale = 'en' | 'de';

type PuzzleCopy = {
  level: string;
  title: string;
  subtitle: string;
};

type AssistStepCopy = {
  kicker: string;
  title: string;
  body: string;
};

export type Translations = {
  locale: Locale;
  appTitle: string;
  rendererTitle: string;
  languageName: string;
  levelLabel: string;
  modeLabel: string;
  languageLabel: string;
  choosePuzzleLevel: string;
  chooseMode: string;
  chooseLanguage: string;
  reset: string;
  undo: string;
  redo: string;
  showHelp: string;
  diagramStage: string;
  tutorialDiagramStage: string;
  successTitle: string;
  successBodyHtml: string;
  playAgain: string;
  seeProof: string;
  nextLevel: string;
  nextLabel: (level: string) => string;
  congratulations: string;
  finalSuccessBody: string;
  replayFinalLevel: string;
  proofKicker: string;
  yourProof: string;
  proofExplainer: string;
  shareProof: string;
  howToPlay: string;
  makeDiagramsMatch: string;
  close: string;
  helpParagraphs: string[];
  tutorialCopy: string;
  move: string;
  checkedRule: string;
  welcomeTitle: string;
  welcomeBody: string;
  startDemo: string;
  resetDemoTitle: string;
  resetDemoBody: string;
  cancel: string;
  startOver: string;
  skip: string;
  next: string;
  gotIt: string;
  circleRealRewrite: string;
  moves: string;
  soFar: string;
  resetDemo: string;
  slideForMoreMoves: string;
  proofFor: (title: string) => string;
  noProofYet: string;
  proofShareText: string;
  shareSheetOpened: string;
  proofCopied: string;
  shareUnavailable: string;
  loadingTinyProof: string;
  tutorialDataIncomplete: string;
  tutorialSelectedGraphMissing: string;
  tutorialAborted: string;
  circleTangle: string;
  pickCheckedMove: string;
  watchRewrite: string;
  everyMoveChecked: string;
  tutorialCouldNotStart: string;
  selectedFirstTangle: (ruleName: string) => string;
  ruleNotApplicable: (ruleName: string) => string;
  layoutFailed: string;
  collapsingRegion: string;
  replayingRewrite: string;
  replayingIteration: (side: string, iteration: number) => string;
  rewriteReplayFinished: string;
  rewriteAnimationFailed: string;
  layoutSettling: string;
  selectSubDiagram: string;
  selectEitherSide: string;
  notApplicable: string;
  noRuleMatches: (side: string, count: number) => string;
  noRulesMatchFeedback: string;
  noRuleCandidates: (ruleName: string) => string;
  noRuleCandidatesFeedback: string;
  matchingRegionsForRule: (count: number, ruleName: string) => string;
  selectionSummary: (side: string, count: number) => string;
  rulePreviewLoading: string;
  layoutLoading: string;
  lassoPrompt: string;
  easyPrompt: string;
  expertPrompt: string;
  selectedPiecesPrompt: (count: number) => string;
  unavailable: string;
  applyRule: (ruleName: string) => string;
  findMatchingRegions: (ruleName: string) => string;
  copiedJson: string;
  renderer: {
    mode: string;
    singleDiagram: string;
    rewriteRule: string;
    showLabels: string;
    transparentBg: string;
    formula: string;
    render: string;
    rendering: string;
    preview: string;
    clickRender: string;
    copySvg: string;
    downloadSvg: string;
    errorSeeMessage: string;
  };
  assist: {
    level1: AssistStepCopy[];
    level1Easy: AssistStepCopy[];
    level3: AssistStepCopy[];
    level5: AssistStepCopy[];
  };
  puzzles: Record<string, PuzzleCopy>;
  graphSide: (side: string) => string;
  sceneMessage: (message: string) => string;
  reason: (reason: string) => string;
};

const plural = (count: number, singular: string, pluralText: string) => (count === 1 ? singular : pluralText);

const en: Translations = {
  locale: 'en',
  appTitle: 'String Diagrams - Web Next',
  rendererTitle: 'String Diagram Renderer',
  languageName: 'English',
  levelLabel: 'Level',
  modeLabel: 'Mode',
  languageLabel: 'Language',
  choosePuzzleLevel: 'Choose puzzle level',
  chooseMode: 'Choose interaction mode',
  chooseLanguage: 'Choose language',
  reset: 'Reset',
  undo: 'Undo',
  redo: 'Redo',
  showHelp: 'Show help',
  diagramStage: 'diagram stage',
  tutorialDiagramStage: 'tutorial diagram stage',
  successTitle: 'You untangled it!',
  successBodyHtml: 'Every move you made followed a rule.<br/>A computer just checked your reasoning.',
  playAgain: 'Play again',
  seeProof: 'See what you did',
  nextLevel: 'Next level',
  nextLabel: (level) => `Next: ${level}`,
  congratulations: 'Congratulations!',
  finalSuccessBody: 'You untangled all diagrams and wrote five machine-checked proofs.',
  replayFinalLevel: 'Replay final level',
  proofKicker: 'Rocq proof script',
  yourProof: 'Your proof',
  proofExplainer: 'Every transformation you made can be expressed as a step in the Rocq theorem prover.',
  shareProof: 'Share proof',
  howToPlay: 'How to play',
  makeDiagramsMatch: 'Make the diagrams match',
  close: 'Close',
  helpParagraphs: [
    'Your goal is to transform the diagrams on either side until both sides match.',
    'In Easy mode, choose a rule at the bottom first, then tap one of the highlighted regions where it applies.',
    'In Expert mode, circle a subdiagram first, then choose a rule that matches your selection.',
    'Every move is checked by the proof engine. When the diagrams match, you have made a proof.'
  ],
  tutorialCopy: 'Your goal is to transform the diagrams on either side until both sides match. Easy mode starts with a rule; Expert mode starts with a circled region.',
  move: 'Move',
  checkedRule: 'checked rule',
  welcomeTitle: 'Can you untangle the proof?',
  welcomeBody: 'Your goal in this puzzle is to get both diagrams to match.',
  startDemo: 'Start demo',
  resetDemoTitle: 'Are you sure you want to start over?',
  resetDemoBody: 'This will reset the demo to Level 1 and clear the current proof run.',
  cancel: 'Cancel',
  startOver: 'Start over',
  skip: 'Skip',
  next: 'Next',
  gotIt: 'Got it',
  circleRealRewrite: 'Circle a real rewrite',
  moves: 'moves',
  soFar: 'so far',
  resetDemo: 'Reset demo',
  slideForMoreMoves: 'slide for more moves',
  proofFor: (title) => `Your proof for ${title}`,
  noProofYet: 'No proof yet.',
  proofShareText: 'Machine-checked string diagram proof',
  shareSheetOpened: 'Opened the share sheet.',
  proofCopied: 'Copied proof to clipboard.',
  shareUnavailable: 'Sharing is unavailable here. Select the proof text to copy it.',
  loadingTinyProof: 'Loading a tiny proof...',
  tutorialDataIncomplete: 'Tutorial data is incomplete',
  tutorialSelectedGraphMissing: 'Tutorial selected graph is missing',
  tutorialAborted: 'tutorial aborted',
  circleTangle: 'Circle a tangle',
  pickCheckedMove: 'Pick a checked move',
  watchRewrite: 'Watch the real rewrite',
  everyMoveChecked: 'Every move was checked',
  tutorialCouldNotStart: 'Tutorial could not start.',
  selectedFirstTangle: (ruleName) => `Selected the first matching tangle. ${ruleName} is ready.`,
  ruleNotApplicable: (ruleName) => `Rule ${ruleName} not applicable.`,
  layoutFailed: 'Layout failed.',
  collapsingRegion: 'Collapsing the selected rewrite region...',
  replayingRewrite: 'Replaying checked rewrite...',
  replayingIteration: (side, iteration) => `Replaying ${side}: physics iteration ${iteration}`,
  rewriteReplayFinished: 'Rewrite replay finished.',
  rewriteAnimationFailed: 'Rewrite animation failed.',
  layoutSettling: 'Layout is still settling. Try the selection again in a moment.',
  selectSubDiagram: 'Select a sub-diagram',
  selectEitherSide: 'Select either side',
  notApplicable: 'not applicable',
  noRuleMatches: (side, count) => `No rule matches this ${side} selection (${count} ${plural(count, 'node', 'nodes')}).`,
  noRulesMatchFeedback: 'No rules match your selection. Try circling another tangle.',
  noRuleCandidates: (ruleName) => `No highlighted regions for ${ruleName}.`,
  noRuleCandidatesFeedback: 'That rule does not apply right now. Try another rule.',
  matchingRegionsForRule: (count, ruleName) => `${count} highlighted region${count === 1 ? '' : 's'} for ${ruleName}.`,
  selectionSummary: (side, count) => `Selection on ${side}: ${count} ${plural(count, 'node', 'nodes')}. Applicable rules highlighted.`,
  rulePreviewLoading: 'rewrite rule preview loading',
  layoutLoading: 'layout...',
  lassoPrompt: 'Lasso a tangle, then pick a move',
  easyPrompt: 'Pick a rule, then tap a highlighted region',
  expertPrompt: 'Circle a region, then pick a move',
  selectedPiecesPrompt: (count) => `${count} ${plural(count, 'piece', 'pieces')} selected. Pick a lit-up move.`,
  unavailable: 'Unavailable',
  applyRule: (ruleName) => `Apply ${ruleName}`,
  findMatchingRegions: (ruleName) => `Find highlighted regions for ${ruleName}`,
  copiedJson: 'Copied JSON if clipboard access is available.',
  renderer: {
    mode: 'Mode',
    singleDiagram: 'Single diagram',
    rewriteRule: 'Rewrite rule',
    showLabels: 'Show labels',
    transparentBg: 'Transparent bg',
    formula: 'Formula',
    render: 'Render',
    rendering: 'Rendering...',
    preview: 'Preview',
    clickRender: 'Click Render',
    copySvg: 'Copy SVG',
    downloadSvg: 'Download SVG',
    errorSeeMessage: 'Error - see message above'
  },
  assist: {
    level1: [
      {
        kicker: 'Step 1 of 4',
        title: 'Circle a tangle',
        body: 'Drag your finger around a small piece of the diagram on the left to select it.'
      },
      {
        kicker: 'Step 2 of 4',
        title: 'Pick a move that fits',
        body: 'When your selection matches a rule, that card lights up. Tap it to apply the move.'
      },
      {
        kicker: 'Step 3 of 4',
        title: 'That part transformed',
        body: 'The selected tangle was replaced by a simpler piece. That rewrite was checked.'
      },
      {
        kicker: 'Step 4 of 4',
        title: 'Match both sides',
        body: 'Keep making checked moves until the diagrams on both sides match.'
      }
    ],
    level1Easy: [
      {
        kicker: 'Step 1 of 4',
        title: 'Pick a rule first',
        body: 'Tap the Fork reassociation card. The app will show every place where that move fits.'
      },
      {
        kicker: 'Step 2 of 4',
        title: 'Choose a highlighted region',
        body: 'The glowing regions are valid moves. Tap one on the left side to apply the rule.'
      },
      {
        kicker: 'Step 3 of 4',
        title: 'Watch the rewrite',
        body: 'That region was replaced by an equivalent fork shape. The move was checked.'
      },
      {
        kicker: 'Step 4 of 4',
        title: 'Now you try',
        body: 'Use the same rule again to make the left diagram match the right one.'
      }
    ],
    level3: [
      {
        kicker: 'Hint',
        title: 'You can also transform the right side',
        body: 'In this level, you will have to manipulate both diagrams to get them to match.'
      }
    ],
    level5: [
      {
        kicker: 'Hint',
        title: 'More moves are available',
        body: 'The rule row scrolls sideways. In this level, slide the moves at the bottom to find the rule you need.'
      }
    ]
  },
  puzzles: {
    'clean-up-two-units': {
      level: 'Level 1',
      title: 'Level 1: Fork Reassociation',
      subtitle: "Use the same fork reassociation move twice. I'll guide the first one; you finish the second."
    },
    'composite-monad-left-unit': {
      level: 'Level 2',
      title: 'Level 2: Push Through Crossing',
      subtitle: 'Push a fork through one crossing, then do it again.'
    },
    'both-sides-meet': {
      level: 'Level 3',
      title: 'Level 3: Expose the Crossing',
      subtitle: 'First reassociate the fork, then push it through the crossing that appears.'
    },
    'composite-monad-associativity': {
      level: 'Level 4',
      title: 'Level 4: Untangle the Double Fork',
      subtitle: 'Forks move through crossings and then reassociate: the same local moves on a larger diagram.'
    },
    'three-monad-composition': {
      level: 'Level 5',
      title: 'Level 5: Three-Color Boss Level',
      subtitle: 'Same game, larger board: three colors of wires, more crossings, same local proof idea.'
    }
  },
  graphSide: (side) => (side === 'rhs' ? 'right side' : side === 'lhs' ? 'left side' : side),
  sceneMessage: (message) => message,
  reason: (reason) => reason
};

const de: Translations = {
  ...en,
  locale: 'de',
  appTitle: 'String-Diagramme - Web Next',
  rendererTitle: 'String-Diagramm-Renderer',
  languageName: 'Deutsch',
  levelLabel: 'Stufe',
  modeLabel: 'Modus',
  languageLabel: 'Sprache',
  choosePuzzleLevel: 'Puzzle-Stufe wählen',
  chooseMode: 'Interaktionsmodus wählen',
  chooseLanguage: 'Sprache wählen',
  reset: 'Zurücksetzen',
  undo: 'Rückgängig',
  redo: 'Wiederholen',
  showHelp: 'Hilfe anzeigen',
  diagramStage: 'Diagrammfläche',
  tutorialDiagramStage: 'Tutorial-Diagrammfläche',
  successTitle: 'Du hast es entwirrt!',
  successBodyHtml: 'Jeder deiner Züge folgte einer Regel.<br/>Ein Computer hat dein Argument gerade geprüft.',
  playAgain: 'Nochmal spielen',
  seeProof: 'Zeig den Beweis',
  nextLevel: 'Nächste Stufe',
  nextLabel: (level) => `Weiter: ${level}`,
  congratulations: 'Geschafft!',
  finalSuccessBody: 'Du hast alle Diagramme entwirrt und fünf maschinengeprüfte Beweise geschrieben.',
  replayFinalLevel: 'Letzte Stufe erneut spielen',
  proofKicker: 'Rocq-Beweisskript',
  yourProof: 'Dein Beweis',
  proofExplainer: 'Jede Umformung kann als Schritt im Rocq-Theorembeweiser ausgedrückt werden.',
  shareProof: 'Beweis teilen',
  howToPlay: 'So geht es',
  makeDiagramsMatch: 'Bring die Diagramme zur Deckung',
  close: 'Schließen',
  helpParagraphs: [
    'Dein Ziel ist es, die Diagramme auf beiden Seiten so umzuformen, dass sie übereinstimmen.',
    'Im einfachen Modus wählst du unten zuerst eine Regel und tippst dann auf eine der markierten passenden Stellen.',
    'Im Expertenmodus kreist du zuerst ein Teildiagramm ein und wählst dann eine passende Regel.',
    'Jeder Zug wird von der Beweis-Engine geprüft. Wenn die Diagramme übereinstimmen, hast du einen Beweis erstellt.'
  ],
  tutorialCopy: 'Dein Ziel ist es, die Diagramme auf beiden Seiten so umzuformen, dass sie übereinstimmen. Im einfachen Modus beginnst du mit einer Regel; im Expertenmodus mit einem eingekreisten Bereich.',
  move: 'Zug',
  checkedRule: 'geprüfte Regel',
  welcomeTitle: 'Kannst du den Beweis entwirren?',
  welcomeBody: 'Dein Ziel in diesem Puzzle ist es, beide Diagramme zur Deckung zu bringen.',
  startDemo: 'Demo starten',
  resetDemoTitle: 'Möchtest du wirklich von vorn beginnen?',
  resetDemoBody: 'Das setzt die Demo auf Stufe 1 zurück und löscht den aktuellen Beweislauf.',
  cancel: 'Abbrechen',
  startOver: 'Von vorn beginnen',
  skip: 'Überspringen',
  next: 'Weiter',
  gotIt: 'Verstanden',
  circleRealRewrite: 'Kreise eine echte Umschreibung ein',
  moves: 'Züge',
  soFar: 'bisher',
  resetDemo: 'Demo zurücksetzen',
  slideForMoreMoves: 'seitlich wischen für mehr Züge',
  proofFor: (title) => `Dein Beweis für ${title}`,
  noProofYet: 'Noch kein Beweis.',
  proofShareText: 'Maschinengeprüfter String-Diagramm-Beweis',
  shareSheetOpened: 'Teilen-Dialog geöffnet.',
  proofCopied: 'Beweis in die Zwischenablage kopiert.',
  shareUnavailable: 'Teilen ist hier nicht verfügbar. Markiere den Beweistext, um ihn zu kopieren.',
  loadingTinyProof: 'Ein kleiner Beweis wird geladen...',
  tutorialDataIncomplete: 'Tutorial-Daten sind unvollständig',
  tutorialSelectedGraphMissing: 'Das ausgewählte Tutorial-Diagramm fehlt',
  tutorialAborted: 'Tutorial abgebrochen',
  circleTangle: 'Kreise ein Knäuel ein',
  pickCheckedMove: 'Wähle einen geprüften Zug',
  watchRewrite: 'Schau dir die echte Umschreibung an',
  everyMoveChecked: 'Jeder Zug wurde geprüft',
  tutorialCouldNotStart: 'Tutorial konnte nicht gestartet werden.',
  selectedFirstTangle: (ruleName) => `Das erste passende Knäuel ist ausgewählt. ${ruleName} ist bereit.`,
  ruleNotApplicable: (ruleName) => `Regel ${ruleName} ist nicht anwendbar.`,
  layoutFailed: 'Layout fehlgeschlagen.',
  collapsingRegion: 'Der ausgewählte Umschreibebereich wird zusammengezogen...',
  replayingRewrite: 'Geprüfte Umschreibung wird abgespielt...',
  replayingIteration: (side, iteration) => `${side} wird neu angeordnet: Physik-Iteration ${iteration}`,
  rewriteReplayFinished: 'Umschreibung abgeschlossen.',
  rewriteAnimationFailed: 'Umschreibungsanimation fehlgeschlagen.',
  layoutSettling: 'Das Layout stabilisiert sich noch. Versuche die Auswahl gleich noch einmal.',
  selectSubDiagram: 'Wähle ein Teildiagramm',
  selectEitherSide: 'Wähle eine der beiden Seiten',
  notApplicable: 'nicht anwendbar',
  noRuleMatches: (side, count) => `Keine Regel passt zu dieser Auswahl auf der ${side} (${count} ${plural(count, 'Knoten', 'Knoten')}).`,
  noRulesMatchFeedback: 'Keine Regel passt zu deiner Auswahl. Kreise ein anderes Knäuel ein.',
  noRuleCandidates: (ruleName) => `Keine markierte Stelle für ${ruleName}.`,
  noRuleCandidatesFeedback: 'Diese Regel passt gerade nirgends. Versuche eine andere Regel.',
  matchingRegionsForRule: (count, ruleName) => `${count} markierte ${plural(count, 'Stelle', 'Stellen')} für ${ruleName}.`,
  selectionSummary: (side, count) => `Auswahl auf der ${side}: ${count} ${plural(count, 'Knoten', 'Knoten')}. Anwendbare Regeln sind hervorgehoben.`,
  rulePreviewLoading: 'Vorschau der Umschreiberegel wird geladen',
  layoutLoading: 'Layout...',
  lassoPrompt: 'Kreise ein Knäuel ein und wähle dann einen Zug',
  easyPrompt: 'Wähle eine Regel und tippe dann auf eine markierte Stelle',
  expertPrompt: 'Kreise einen Bereich ein und wähle dann einen Zug',
  selectedPiecesPrompt: (count) => `${count} ${plural(count, 'Teil', 'Teile')} ausgewählt. Wähle einen hervorgehobenen Zug.`,
  unavailable: 'Nicht verfügbar',
  applyRule: (ruleName) => `${ruleName} anwenden`,
  findMatchingRegions: (ruleName) => `Markierte Stellen für ${ruleName} suchen`,
  copiedJson: 'JSON kopiert, wenn Zwischenablagezugriff verfügbar ist.',
  renderer: {
    mode: 'Modus',
    singleDiagram: 'Einzelnes Diagramm',
    rewriteRule: 'Umschreiberegel',
    showLabels: 'Labels anzeigen',
    transparentBg: 'Transparenter Hintergrund',
    formula: 'Formel',
    render: 'Rendern',
    rendering: 'Rendert...',
    preview: 'Vorschau',
    clickRender: 'Rendern klicken',
    copySvg: 'SVG kopieren',
    downloadSvg: 'SVG herunterladen',
    errorSeeMessage: 'Fehler - siehe Meldung oben'
  },
  assist: {
    level1: [
      {
        kicker: 'Schritt 1 von 4',
        title: 'Kreise ein Knäuel ein',
        body: 'Ziehe mit dem Finger einen Kreis um ein kleines Stück des linken Diagramms, um es auszuwählen.'
      },
      {
        kicker: 'Schritt 2 von 4',
        title: 'Wähle einen passenden Zug',
        body: 'Wenn deine Auswahl zu einer Regel passt, leuchtet die Karte auf. Tippe darauf, um den Zug anzuwenden.'
      },
      {
        kicker: 'Schritt 3 von 4',
        title: 'Dieser Teil wurde umgeformt',
        body: 'Das ausgewählte Knäuel wurde durch ein einfacheres Stück ersetzt. Diese Umschreibung wurde geprüft.'
      },
      {
        kicker: 'Schritt 4 von 4',
        title: 'Bring beide Seiten zur Deckung',
        body: 'Mach weiter geprüfte Züge, bis die Diagramme auf beiden Seiten übereinstimmen.'
      }
    ],
    level1Easy: [
      {
        kicker: 'Schritt 1 von 4',
        title: 'Wähle zuerst eine Regel',
        body: 'Tippe auf die Karte „Gabel neu assoziieren“. Die App zeigt dir alle passenden Stellen.'
      },
      {
        kicker: 'Schritt 2 von 4',
        title: 'Wähle eine markierte Stelle',
        body: 'Die leuchtenden Bereiche sind gültige Züge. Tippe links auf einen Bereich, um die Regel anzuwenden.'
      },
      {
        kicker: 'Schritt 3 von 4',
        title: 'Schau dir die Umschreibung an',
        body: 'Dieser Bereich wurde durch eine äquivalente Gabelform ersetzt. Der Zug wurde geprüft.'
      },
      {
        kicker: 'Schritt 4 von 4',
        title: 'Jetzt bist du dran',
        body: 'Nutze dieselbe Regel noch einmal, damit das linke Diagramm zum rechten passt.'
      }
    ],
    level3: [
      {
        kicker: 'Hinweis',
        title: 'Du kannst auch die rechte Seite umformen',
        body: 'In dieser Stufe musst du beide Diagramme bearbeiten, damit sie übereinstimmen.'
      }
    ],
    level5: [
      {
        kicker: 'Hinweis',
        title: 'Es gibt mehr Züge',
        body: 'Die Regelzeile lässt sich seitlich scrollen. Wische in dieser Stufe unten durch die Züge, um die passende Regel zu finden.'
      }
    ]
  },
  puzzles: {
    'clean-up-two-units': {
      level: 'Stufe 1',
      title: 'Stufe 1: Gabel neu assoziieren',
      subtitle: 'Nutze denselben Gabel-Zug zweimal. Beim ersten führe ich dich; den zweiten machst du.'
    },
    'composite-monad-left-unit': {
      level: 'Stufe 2',
      title: 'Stufe 2: Durch die Kreuzung schieben',
      subtitle: 'Schiebe eine Gabel durch eine Kreuzung und mach dann denselben Zug noch einmal.'
    },
    'both-sides-meet': {
      level: 'Stufe 3',
      title: 'Stufe 3: Kreuzung freilegen',
      subtitle: 'Assoziiere zuerst die Gabel neu und schiebe sie dann durch die sichtbare Kreuzung.'
    },
    'composite-monad-associativity': {
      level: 'Stufe 4',
      title: 'Stufe 4: Die doppelte Gabel entwirren',
      subtitle: 'Gabeln wandern durch Kreuzungen und werden dann neu assoziiert: dieselben lokalen Züge in einem größeren Diagramm.'
    },
    'three-monad-composition': {
      level: 'Stufe 5',
      title: 'Stufe 5: Drei-Farben-Bosslevel',
      subtitle: 'Dasselbe Spiel auf einem größeren Feld: drei Drahtfarben, mehr Kreuzungen, dieselbe lokale Beweisidee.'
    }
  },
  graphSide: (side) => (side === 'rhs' ? 'rechten Seite' : side === 'lhs' ? 'linken Seite' : side),
  sceneMessage: (message) => {
    if (message === 'Demo loaded') return 'Demo geladen';
    if (message === 'You just made a proof. Every move was checked.') return 'Du hast gerade einen Beweis erstellt. Jeder Zug wurde geprüft.';
    const loaded = message.match(/^Level (\d+) loaded$/);
    if (loaded) return `Stufe ${loaded[1]} geladen`;
    const tutorial = message.match(/^Level (\d+) tutorial$/);
    if (tutorial) return `Tutorial für Stufe ${tutorial[1]}`;
    const applied = message.match(/^Applied (.+) on (lhs|rhs)\.$/);
    if (applied) return `${applied[1]} auf der ${de.graphSide(applied[2])} angewendet.`;
    const unknown = message.match(/^Unknown puzzle "(.+)"; loaded Level (\d+) instead\.$/);
    if (unknown) return `Unbekanntes Puzzle "${unknown[1]}"; stattdessen wurde Stufe ${unknown[2]} geladen.`;
    return message;
  },
  reason: (reason) => {
    if (reason === 'No selection') return 'Keine Auswahl';
    if (reason === 'Select a sub-diagram') return de.selectSubDiagram;
    if (reason === 'Select either side') return de.selectEitherSide;
    if (reason === 'No selected nodes') return 'Keine Knoten ausgewählt';
    if (reason === 'unknown rule') return 'Unbekannte Regel';
    if (reason === 'Unavailable') return de.unavailable;
    if (reason === 'Not applicable' || reason === 'not applicable') return de.notApplicable;
    return reason;
  }
};

export const translations: Record<Locale, Translations> = { en, de };

export const supportedLocales: Locale[] = ['en', 'de'];

const isLocale = (value: string | null | undefined): value is Locale =>
  value === 'en' || value === 'de';

export const getInitialLocale = (): Locale => {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('lang');
  if (isLocale(fromUrl)) return fromUrl;
  const fromStorage = window.localStorage.getItem('string-diagrams.locale');
  if (isLocale(fromStorage)) return fromStorage;
  const fromNavigator = navigator.languages.find((language) => language.toLowerCase().startsWith('de'));
  return fromNavigator ? 'de' : 'en';
};

export const storeLocale = (locale: Locale) => {
  window.localStorage.setItem('string-diagrams.locale', locale);
};

export const switchLocale = (locale: Locale) => {
  storeLocale(locale);
  const url = new URL(window.location.href);
  url.searchParams.set('lang', locale);
  window.location.assign(url);
};

export const localizePuzzle = (puzzle: PuzzleInfo, t: Translations): PuzzleInfo => {
  const copy = t.puzzles[puzzle.id];
  return copy ? { ...puzzle, ...copy } : puzzle;
};

export const localizePuzzles = (puzzles: PuzzleInfo[], t: Translations): PuzzleInfo[] =>
  puzzles.map((puzzle) => localizePuzzle(puzzle, t));

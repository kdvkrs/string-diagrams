# Prototype Vision

## One-Line Goal

A tablet-friendly string-diagram proof puzzle: visitors make visual rewrite
moves, and the demo reveals that those moves are checked proof steps.

## Scope

In scope:

- curated puzzle sequence;
- browser/tablet experience;
- local-LAN static deployment;
- OCaml-backed rewrite validation and equality checking;
- generated proof transcript for completed proofs;
- polished enough for an internal event and Open Campus.

Out of scope:

- replacing Damien Pous' upstream editor;
- arbitrary `.sd` editing in the browser;
- GTK parity;
- full theorem-proving interface;
- general puzzle-game platform.

## Audiences

Primary:

- Open Campus visitors;
- children and non-experts;
- people using old-ish iPads without prior explanation.

Secondary:

- internal mathematical audience;
- colleagues who may ask whether the visual moves are semantically honest.

## Core Message

Proof assistants check reasoning step by step.

In this demo, the reasoning steps are visual string-diagram rewrites.

## Demo Arc

Target length: 5-10 minutes.

### 0. Started Proof

- Tiny two-rewrite puzzle.
- Left-hand side only.
- Computer performs the first rewrite.
- Visitor performs the second rewrite.
- Purpose: teach the interaction loop immediately.

### 1. Unit Puzzle

- Left-unit or right-unit composite-monad example.
- Keep both variants available for testing if useful.
- Purpose: introduce simple local cleanup and unit nodes.

### 2. Both-Sides Puzzle

- Simple example where rewriting both sides is natural.
- Purpose: show that equality proofs can transform either side toward a common
  diagram.

### 3. Double Fork

- Current double-fork / composite-monad associativity example.
- Purpose: first clearly nontrivial visual proof.

### 4. Three Monads

- Three-monad composition example.
- Purpose: finale / scale demonstration.

## Interaction Contract

Visitors should be able to:

- select a local diagram region by touch;
- see applicable rewrite rules;
- apply a rule without keyboard shortcuts;
- undo/reset/retry without staff intervention;
- finish a puzzle and see success feedback;
- optionally reveal the generated proof transcript.

The default experience is puzzle mode, not an expert editor.

## Mathematical Credibility Bar

For the curated examples:

- accepted moves correspond to OCaml-validated rewrite steps;
- invalid or ambiguous selections are rejected;
- success means the two sides are equal according to the checker;
- displayed wire order should match the checked structure;
- visible wire crossings should not be accidental;
- proof reveal is generated from accepted moves.

The visual layer may be playful. It must not present arbitrary drawing as proof.

## Architecture Direction

OCaml owns:

- parsing curated examples;
- rewrite validation/application;
- equality checking;
- proof transcript generation.

JavaScript owns:

- Canvas rendering;
- layout and rewrite animation;
- touch interaction;
- selection UX;
- puzzle shell.

Deployment:

- static bundle;
- one local server;
- multiple independent tablet clients;
- no internet dependency during the event.

## Finish Line

Call this prototype done for the internal event and Open Campus when:

- the demo arc above is implemented;
- every level is solvable without keyboard input;
- intro level works without verbal setup;
- unit/fork examples render without misleading wire crossings;
- rewrite animation is smooth enough on 2017-era iPads;
- success detection is reliable;
- proof transcript reveal is credible enough to show colleagues;
- local-LAN serving works for several tablets at once.

## Non-Goals After Finish

Do not keep expanding scope unless there is a clear post-event reason.

Tempting follow-ups that are not required for this milestone:

- full puzzle authoring;
- arbitrary upstream example browser;
- polished game progression system;
- complete Rocq project export;
- research-grade graph layout engine.

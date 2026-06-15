# string-diagram outreach fork

This is an unofficial outreach prototype based on Damien Pous' `string-diagrams`.
It adapts graphical string-diagram rewriting into a tablet-friendly proof-puzzle
for Open Campus / science-fair-style demonstrations.

The aim is to let children and non-expert visitors manipulate diagrams by legal
moves and see the core proof-assistant idea: reasoning can be checked step by
step. This fork substantially rewrites the browser-facing frontend and
interaction model, while reusing or preserving the OCaml diagram/proof interop
path where possible.

This is not the official upstream project, not an endorsed replacement, and not
a general-purpose theorem-proving UI.

## Upstream attribution

This prototype is based on Damien Pous' `string-diagrams` project:

- Project page: https://perso.ens-lyon.fr/damien.pous/string-diagrams/
- Upstream repository: https://github.com/damien-pous/string-diagrams
- Paper: "String Diagrams for Monoidal Categories, in Rocq":
  https://arxiv.org/abs/2602.19806
- Companion Rocq library: https://github.com/damien-pous/categories/

The original project provides the string-diagram editor, mathematical ideas, and
Rocq/proof-oriented workflow. This fork has a narrower outreach goal and should
not be assumed to have the same scope, guarantees, or expert functionality as the
upstream research editor.

## Prototype demo

The current prototype direction is captured in
[`docs/prototype-vision.md`](docs/prototype-vision.md).

Build the web-next prototype:

```sh
make web-next-build
```

Serve the static bundle locally:

```sh
make web-next-serve
```

Open on tablets:

```text
http://<host-lan-ip>:8080/
```

For development with live reload:

```sh
make web-next-dev
```

Do not open `web-next/index.html` directly with a `file://` URL. That file is
the Vite source entrypoint and must be served by Vite. For a built prototype,
serve `web-next/dist` over HTTP as shown above.

## License

This fork follows upstream and is distributed under the GNU General Public
License v3.0. See `LICENSE`. Unless stated otherwise, new code added in this
fork is also licensed under GPLv3.

---

# Original upstream README

The following text is retained from the upstream project README for reference.

## string-diagram

tool & library to visualize, edit and perform graphical rewriting steps in string diagrams

homepage: https://perso.ens-lyon.fr/damien.pous/string-diagrams/
companion Rocq library: https://github.com/damien-pous/categories/

## build instructions

opam install dune cairo2-gtk otfm vg
make

+ brr & js_of_ocaml-ppx to compile the web applet
(comment the relevant lines in bin/dune if installing these optional dependencies is problematic)


## using the program

make run

enter your favorite goal in the text box,
or use Ctrl-O to open one of the .sd files in the toplevel directory


## syntax

the syntax is designed to be permissive, several tokens are mapped to the same behaviour.
for instance, both
- "*", "⊗" and "\otimes" denote the tensor product
- ".", "·" and "\cdot" denote its application to morphisms
- "=", "≡" ant "≡'" denote equality
- "~>" and "->" denote arrow
- composition can be written forward (";", "\;",  ";;") or backward ("°", "∘",  "∘∘")

see *.sd files for examples, and files lib/lexer.mll and lib/parser.mly for a complete description

when copy-pasting a Rocq goal, remove irrelevant hypotheses, including the declaration of the ambiant monoidal category and the object declarations.


## keys

1..n    rewrite box using matching hypothesis
u       unbox or unfold node
t       toggle node labels
-/+     shrink/enlarge element
f       release fixed element
l       toggle labels printing
c       toggle contours printing
=       fit screen
r       redraw picture
e       toggle link edition mode
d       remove node
n       create node (give name afterward)
t       export term to clipboard
p/g     export diagram as pdf/svg
R       export Rocq script to clipboard
->/<-   undo/redo
SPACE   pause/start animation
ESC     abort current action
Ctrl-O  open file
Ctrl-S  save file
Ctrl-E  save as file
Ctrl-V  load from clipboard
Ctrl-F  toggle fullscreen


## modules

### lib
Misc:        miscellaneous utilities

Set:         finite sets
MSet:        finite multisets
Seq:         finite sequences, index starting at 1, usually duplicate-free
Perm:        finite support permutations
Inj:         finite support injections
ISeq:        increasing sequences
Stack:       lists with insertion capabilities at a designated position

Types:       shared class & module types (no implementation)
Graph_type:  graph class types (no implementation)

Constants:   constants for drawing graphs
Info:        informations about vertices & edges

Lexer:       lexer
Parser:      parser (produces raw terms)

Canvas:      canvas for drawing pictures
Polygon:     utilities about polygons
Geometry:    geometric utilities to draw edges
Arena: 	     canvas + viewport

Graph:       string diagrams (often called graphs in the implementation) and associated functions 

Place:       placing graphs

File:        SD files and functions to manipulate them

Program:     UI-independent main program

GArena:	     GTK arena


### bin
Sd:          GTK main program
Applet:      javascript web applet
Check:	     text mode program to check .sd files

## tests
Sanity:      sanity checks

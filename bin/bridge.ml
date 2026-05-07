open Diagrams
open Graph_type
open Types
open Js_of_ocaml
open Gg

let demo_state =
  "m: M⊗M -> M\nn: N⊗N -> N\nx: N⊗M -> M⊗N\nmn: M⊗N⊗M⊗N -> M⊗N := M·x·N ; m·n\nmA: m·M ; m ≡ M·m ; m\nnA: n·N ; n ≡ N·n ; n\nmx: N·m ; x ≡ x·M ; M·x ; m·N\nnx: n·M ; x ≡ N·x ; x·N ; M·n\n------\nM·x·N⊗M⊗N ; M⊗M·n·M⊗N ; m·x·N ; m·n ≡ M⊗N⊗M·x·N ; M⊗N·m·N⊗N ; M·x·n ; m·n"

let mu2_state =
  "m: M⊗M -> M\n\
   e: 1 -> M\n\
   n: N⊗N -> N\n\
   f: 1 -> N\n\
   x: N⊗M -> M⊗N\n\
   mn<color=orange> := id·x·id ; m·n\n\
   ef<color=orange> := e·f\n\
   mm: m·id ; m = id·m ; m\n\
   em: e·id ; m = id\n\
   me: id·e ; m = id\n\
   nn: n·id ; n = id·n ; n\n\
   fn: f·id ; n = id\n\
   nf: id·f ; n = id\n\
   mx: id·m ; x = x·id ; id·x ; m·id\n\
   ex: id·e ; x = e·id\n\
   nx: n·id ; x = id·x ; x·id ; id·n\n\
   fx: f·id ; x = id·f"

let mu3_state =
  "m: M^2 -> M\n\
   n: N^2-> N\n\
   o: O^2-> O\n\
   x: N⊗M -> M⊗N\n\
   y: O⊗N -> N⊗O\n\
   z: O⊗M -> M⊗O\n\
   mno<color=turquoise> := id·id·z·id·id ; id·x·y·id ; m·n·o\n\
   mm: m·id ; m = id·m ; m\n\
   nn: n·id ; n = id·n ; n\n\
   oo: o·id ; o = id·o ; o\n\
   mx: id·m ; x = x·id ; id·x ; m·id\n\
   nx: n·id ; x = id·x ; x·id ; id·n\n\
   ny: id·n ; y = y·id ; id·y ; n·id\n\
   oy: o·id ; y = id·y ; y·id ; id·o\n\
   mz: id·m ; z = z·id ; id·z ; m·id\n\
   oz: o·id ; z = id·z ; z·id ; id·o\n\
   xyz: y·id ; id·z ; x·id = id·x ; z·id ; id·y"

let left_unit_state = mu2_state ^ "\n---\nef·M·N ; mn = M·N"
let right_unit_state = mu2_state ^ "\n---\nM·N·ef ; mn = M·N"
let three_monads_state = mu3_state ^ "\n---\nmno·id·id·id ; mno = id·id·id·mno ; mno"

type puzzle = {
  id: string;
  level: string;
  title: string;
  subtitle: string;
  source: string;
  visible_rules: string list option;
}

let puzzles = [
  {
    id = "composite-monad-left-unit";
    level = "Level 1";
    title = "Level 1: Left Unit";
    subtitle = "Shrink the left unit fork until only the clean composite string remains.";
    source = left_unit_state;
    visible_rules = Some ["em"; "fn"; "fx"];
  };
  {
    id = "composite-monad-right-unit";
    level = "Level 2";
    title = "Level 2: Right Unit";
    subtitle = "Shrink the right unit fork. Same proof idea, mirrored.";
    source = right_unit_state;
    visible_rules = Some ["me"; "nf"; "ex"];
  };
  {
    id = "composite-monad-associativity";
    level = "Level 3";
    title = "Level 3: Double Fork";
    subtitle = "Lasso-select a region on either side, then tap a visual rule.";
    source = demo_state;
    visible_rules = None;
  };
  {
    id = "three-monad-composition";
    level = "Level 4";
    title = "Level 4: Three Monads";
    subtitle = "Compose three monads by moving the crossings into the same shape.";
    source = three_monads_state;
    visible_rules = None;
  };
]

let default_puzzle_id = "composite-monad-left-unit"

let puzzle_by_id id =
  match List.find_opt (fun p -> p.id = id) puzzles with
  | Some p -> p
  | None -> List.find (fun p -> p.id = default_puzzle_id) puzzles

type bridge_state = {
  puzzle: puzzle;
  mutable env: Graph_type.env;
  mutable lhs: Graph_type.graph;
  mutable rhs: Graph_type.graph;
  mutable proof: string list;
  mutable messages: string list;
  mutable undo: (Graph_type.env * Graph_type.graph * Graph_type.graph * string list) list;
  mutable redo: (Graph_type.env * Graph_type.graph * Graph_type.graph * string list) list;
  mutable sid_counter: int;
}

let parse_state s =
  let l = Lexing.from_string s in
  let x = Parser.rawterm Lexer.token l in
  match Graph.state x with
  | e, Eqn ((lhs, rhs), _) -> e, lhs, rhs
  | _, Trm _ -> failwith "expected equation state"

let nodes_of_graph g =
  MSet.fold (fun n acc -> n :: acc) [] g#nodes

let rec unfold_defined_nodes env g =
  let changed = ref false in
  List.iter
    (fun n ->
      match n#kind with
      | Box h ->
         unfold_defined_nodes env h;
         g#unbox n;
         changed := true
      | Var f ->
         match List.assoc_opt f env with
         | Some (_, T2 (_, Some h)) ->
            let h = Graph.copy env h in
            unfold_defined_nodes env h;
            g#subst n h;
            changed := true
         | _ -> ())
    (nodes_of_graph g);
  if !changed then unfold_defined_nodes env g

let unfold_env env =
  List.iter
    (function
      | _, (_, T2 (_, Some g)) -> unfold_defined_nodes env g
      | _, (_, TE (l, r)) ->
         unfold_defined_nodes env l;
         unfold_defined_nodes env r
      | _ -> ())
    env

let parse_puzzle_state s =
  let env, lhs, rhs = parse_state s in
  unfold_env env;
  unfold_defined_nodes env lhs;
  unfold_defined_nodes env rhs;
  env, lhs, rhs

let state_ref =
  let puzzle = puzzle_by_id default_puzzle_id in
  let env, lhs, rhs = parse_puzzle_state puzzle.source in
  ref { puzzle; env; lhs; rhs; proof = []; messages = ["Demo loaded"]; undo = []; redo = []; sid_counter = 0 }

let js_str s = Js.string s
let obj fields = Js.Unsafe.obj (Array.of_list fields)
let arr l = Js.array (Array.of_list l)

let css_of_color c =
  Printf.sprintf "rgba(%d,%d,%d,%.3f)"
    (int_of_float (255. *. Color.r c))
    (int_of_float (255. *. Color.g c))
    (int_of_float (255. *. Color.b c))
    (Color.a c)

let typ_name t = Format.asprintf "%a" Typ.pp1 t

let p2_obj p =
  obj ["x", Js.Unsafe.inject (P2.x p); "y", Js.Unsafe.inject (P2.y p)]

let visual_obj (n: node) =
  let fields = ref [] in
  (match n#get "shape" with
   | Some shape -> fields := ("shape", Js.Unsafe.inject (js_str shape)) :: !fields
   | None -> ());
  (match n#get "radius" with
   | Some radius -> fields := ("radius", Js.Unsafe.inject (float_of_string radius)) :: !fields
   | None -> ());
  (match n#get "size" with
   | Some size -> fields := ("size", Js.Unsafe.inject (p2_obj (Misc.p2_of_string size))) :: !fields
   | None -> ());
  obj (List.rev !fields)

let ensure_sid st (n: node) =
  match n#get "sid" with
  | Some sid -> sid
  | None ->
     st.sid_counter <- st.sid_counter + 1;
     let sid = Printf.sprintf "n%d" st.sid_counter in
     n#set "sid" sid;
     sid

let fake_iport_obj st =
  function
  | Source k -> obj ["kind", Js.Unsafe.inject (js_str "source"); "index", Js.Unsafe.inject k]
  | InnerTarget (n, p) ->
     let sid = ensure_sid st n in
     obj [
       "kind", Js.Unsafe.inject (js_str "nodeTarget");
       "nodeId", Js.Unsafe.inject (js_str sid);
       "port", Js.Unsafe.inject p
     ]

let iter_nodes (g: graph) f = MSet.iter (fun n -> f n) g#nodes

let find_node_by_sid (g: graph) sid =
  MSet.find (fun n -> n#get "sid" = Some sid) g#nodes

let snapshot_node st (n: node) =
  let sid = ensure_sid st n in
  let kind, label =
    match n#kind with
    | Var f -> "var", f
    | Box _ -> "box", "box"
  in
  let p = n#pos in
  let b = n#box in
  let tl = Box2.tl_pt b in
  let br = Box2.br_pt b in
  let color = css_of_color n#color in
  obj [
    "id", Js.Unsafe.inject (js_str sid);
    "kind", Js.Unsafe.inject (js_str kind);
    "label", Js.Unsafe.inject (js_str label);
    "x", Js.Unsafe.inject (P2.x p);
    "y", Js.Unsafe.inject (P2.y p);
    "x0", Js.Unsafe.inject (P2.x tl);
    "y0", Js.Unsafe.inject (P2.y tl);
    "x1", Js.Unsafe.inject (P2.x br);
    "y1", Js.Unsafe.inject (P2.y br);
    "nsources", Js.Unsafe.inject n#nsources;
    "ntargets", Js.Unsafe.inject n#ntargets;
    "sourceTypes", Js.Unsafe.inject (arr (List.map (fun t -> js_str (typ_name t)) n#sources));
    "targetTypes", Js.Unsafe.inject (arr (List.map (fun t -> js_str (typ_name t)) n#targets));
    "visual", Js.Unsafe.inject (visual_obj n);
    "ceiling", Js.Unsafe.inject (fake_iport_obj st n#ceiling);
    "color", Js.Unsafe.inject (js_str color);
    "selectable", Js.Unsafe.inject (Js.bool (kind = "var"))
  ]

let edge_id i o =
  let sid_i =
    match i with
    | Source k -> Printf.sprintf "src:%d" k
    | InnerTarget (n, p) ->
       let sid = match n#get "sid" with Some s -> s | None -> "?" in
       Printf.sprintf "%s:t%d" sid p
  in
  let sid_o =
    match o with
    | Target k -> Printf.sprintf "tgt:%d" k
    | InnerSource (n, p) ->
       let sid = match n#get "sid" with Some s -> s | None -> "?" in
       Printf.sprintf "%s:s%d" sid p
  in
  sid_i ^ "->" ^ sid_o

let snapshot_edge st (g: graph) (i,o) =
  let port_ref_i =
    match i with
    | Source k -> obj ["kind", Js.Unsafe.inject (js_str "source"); "index", Js.Unsafe.inject k]
    | InnerTarget (n, p) ->
       let sid = ensure_sid st n in
       obj ["kind", Js.Unsafe.inject (js_str "nodeTarget"); "nodeId", Js.Unsafe.inject (js_str sid); "port", Js.Unsafe.inject p]
  in
  let port_ref_o =
    match o with
    | Target k -> obj ["kind", Js.Unsafe.inject (js_str "target"); "index", Js.Unsafe.inject k]
    | InnerSource (n, p) ->
       let sid = ensure_sid st n in
       obj ["kind", Js.Unsafe.inject (js_str "nodeSource"); "nodeId", Js.Unsafe.inject (js_str sid); "port", Js.Unsafe.inject p]
  in
  let edge_color = css_of_color (Graph.icolor g i) in
  obj [
    "id", Js.Unsafe.inject (js_str (edge_id i o));
    "from", Js.Unsafe.inject port_ref_i;
    "to", Js.Unsafe.inject port_ref_o;
    "color", Js.Unsafe.inject (js_str edge_color)
  ]

let snapshot_graph st id (g: graph) =
  iter_nodes g (fun n -> ignore (ensure_sid st n));
  let nodes = ref [] in
  iter_nodes g (fun n -> nodes := snapshot_node st n :: !nodes);
  let edges = ref [] in
  MSet.iter (fun e -> edges := snapshot_edge st g e :: !edges) g#edges;
  obj [
    "id", Js.Unsafe.inject (js_str id);
    "nodes", Js.Unsafe.inject (arr (List.rev !nodes));
    "edges", Js.Unsafe.inject (arr (List.rev !edges));
    "sources", Js.Unsafe.inject g#nsources;
    "targets", Js.Unsafe.inject g#ntargets
  ]

let hyps st =
  let all = Env.hyps st.env in
  match st.puzzle.visible_rules with
  | None -> all
  | Some names -> List.filter (fun (name, _) -> List.mem name names) all

let rule_names st = List.map fst (hyps st)

let graph_by_id st = function
  | "rhs" -> st.rhs
  | _ -> st.lhs

let set_graph_by_id st id g =
  match id with
  | "rhs" -> st.rhs <- g
  | _ -> st.lhs <- g

let polygon_of_points = function
  | [] -> failwith "empty polygon"
  | p0::ps -> List.fold_left Polygon.extend (Polygon.start p0) ps

let selected_nodes st graph_id selected_ids =
  let target = graph_by_id st graph_id in
  List.filter_map (fun sid -> find_node_by_sid target sid) selected_ids

let mset_size s = MSet.fold (fun _ n -> n + 1) 0 s

type extracted = {
  subgraph: graph;
  inputs: (Graph_type.iport * Graph_type.oport) list;
  outputs: (Graph_type.iport * Graph_type.oport) list;
  box: box;
}

type rule_match = {
  rw: string;
  repl: graph;
  input_perm: int list;
  output_perm: int list;
}

type extraction_variant = {
  input_perm: int list;
  inputs: (Graph_type.iport * Graph_type.oport) list;
  output_perm: int list;
  outputs: (Graph_type.iport * Graph_type.oport) list;
}

let sid_list_of_nodes nodes =
  nodes
  |> List.filter_map (fun n -> n#get "sid")
  |> List.sort_uniq String.compare

let sid_list_of_mset nodes =
  MSet.fold (fun n acc -> match n#get "sid" with Some s -> s::acc | None -> acc) [] nodes
  |> List.sort_uniq String.compare

let same_node_set subset captured =
  sid_list_of_nodes subset = sid_list_of_mset captured

let node_set nodes = List.fold_left (fun acc n -> MSet.add n acc) MSet.empty nodes

let nodes_box nodes =
  List.fold_left (fun bx n -> Box2.union bx n#box) Box2.empty nodes

let cmp_point p q =
  let c = compare (P2.x p) (P2.x q) in
  if c <> 0 then c else compare (P2.y p) (P2.y q)

let boundary_edges_by_nodes (g: graph) nodes =
  let nodes_in = node_set nodes in
  let i_inside = function
    | InnerTarget (n, _) -> MSet.mem n nodes_in
    | Source _ -> false
  in
  let o_inside = function
    | InnerSource (n, _) -> MSet.mem n nodes_in
    | Target _ -> false
  in
  let inputs = ref [] in
  let outputs = ref [] in
  let internals = ref MSet.empty in
  MSet.iter (fun (i, o as e) ->
      match i_inside i, o_inside o with
      | false, true -> inputs := e :: !inputs
      | true, false -> outputs := e :: !outputs
      | true, true -> internals := MSet.add e !internals
      | false, false -> ())
    g#edges;
  let inputs =
    List.sort
      (fun (_, o1) (_, o2) -> cmp_point (g#opos o1) (g#opos o2))
      !inputs
  in
  let outputs =
    List.sort
      (fun (i1, _) (i2, _) -> cmp_point (g#ipos i1) (g#ipos i2))
      !outputs
  in
  nodes_in, inputs, outputs, !internals

let extract_with_boundary (g: graph) nodes nodes_in inputs outputs internals =
  let find_index e l =
    let rec go k = function
      | [] -> None
      | x :: _ when x = e -> Some k
      | _ :: xs -> go (k + 1) xs
    in
    go 1 l
  in
  let edges =
    MSet.fold (fun (i, o as e) acc ->
        match find_index e inputs, find_index e outputs with
        | Some s, _ -> MSet.add (Source s, o) acc
        | _, Some t -> MSet.add (i, Target t) acc
        | _ -> MSet.add (i, o) acc)
      MSet.empty internals
  in
  let edges =
    List.fold_left
      (fun acc (_, o as e) ->
        match find_index e inputs with
        | Some s -> MSet.add (Source s, o) acc
        | None -> acc)
      edges inputs
  in
  let edges =
    List.fold_left
      (fun acc (i, _ as e) ->
        match find_index e outputs with
        | Some t -> MSet.add (i, Target t) acc
        | None -> acc)
      edges outputs
  in
  let sources = List.map (fun (i, _) -> g#ityp i) inputs in
  let targets = List.map (fun (i, _) -> g#ityp i) outputs in
  let h = Graph.empty sources targets in
  h#update nodes_in edges;
  { subgraph = h; inputs; outputs; box = nodes_box nodes }

let extract_by_nodes (g: graph) nodes =
  let nodes_in, inputs, outputs, internals = boundary_edges_by_nodes g nodes in
  extract_with_boundary g nodes nodes_in inputs outputs internals

let reorder_by_perm l perm = List.map (List.nth l) perm

let extract_by_nodes_permutation (g: graph) nodes input_perm output_perm =
  let nodes_in, inputs, outputs, internals = boundary_edges_by_nodes g nodes in
  let inputs = reorder_by_perm inputs input_perm in
  let outputs = reorder_by_perm outputs output_perm in
  extract_with_boundary g nodes nodes_in inputs outputs internals

let rec insert_everywhere x = function
  | [] -> [[x]]
  | y :: ys as l -> (x :: l) :: List.map (fun zs -> y :: zs) (insert_everywhere x ys)

let rec permutations = function
  | [] -> [[]]
  | x :: xs -> List.concat_map (insert_everywhere x) (permutations xs)

let permutations_small l =
  if List.length l > 5 then [l] else permutations l

let extraction_candidates_by_nodes (g: graph) nodes =
  let nodes_in, inputs, outputs, internals = boundary_edges_by_nodes g nodes in
  let indexed_inputs = List.mapi (fun i e -> i, e) inputs in
  let indexed_outputs = List.mapi (fun i e -> i, e) outputs in
  let variants =
    permutations_small indexed_inputs
    |> List.concat_map (fun input_order ->
           permutations_small indexed_outputs
           |> List.map (fun output_order ->
                  let input_perm, inputs = List.split input_order in
                  let output_perm, outputs = List.split output_order in
                  { input_perm; inputs; output_perm; outputs }))
  in
  nodes_in, internals, variants

let layout_replacement_into_box repl dst =
    let src = repl#box in
  if not (Box2.is_empty src || Box2.is_empty dst) then (
    let src_tl = Box2.tl_pt src in
    let dst_tl = Box2.tl_pt dst in
    let src_w = max 1e-6 (Box2.w src) in
    let src_h = max 1e-6 (Box2.h src) in
    let map p =
      let u = (P2.x p -. P2.x src_tl) /. src_w in
      let v = (P2.y src_tl -. P2.y p) /. src_h in
      P2.v
        (P2.x dst_tl +. u *. Box2.w dst)
        (P2.y dst_tl -. v *. Box2.h dst)
    in
    MSet.iter (fun n -> n#move (map n#pos)) repl#nodes
  )

let splice_by_nodes st graph_id selected_ids input_perm output_perm repl =
  let target = graph_by_id st graph_id in
  let nodes = selected_nodes st graph_id selected_ids in
  let ex = extract_by_nodes_permutation target nodes input_perm output_perm in
  let repl = Graph.copy st.env repl in
  layout_replacement_into_box repl ex.box;
  let node_is_selected n = List.exists ((==) n) nodes in
  let remap_i = function
    | Source i -> fst (List.nth ex.inputs (i - 1))
    | p -> p
  in
  let remap_o = function
    | Target i -> snd (List.nth ex.outputs (i - 1))
    | p -> p
  in
  let kept_edges =
    MSet.filter
      (function
        | InnerTarget (n, _), InnerSource (m, _) -> not (node_is_selected n || node_is_selected m)
        | InnerTarget (n, _), _ -> not (node_is_selected n)
        | _, InnerSource (n, _) -> not (node_is_selected n)
        | _ -> true)
      target#edges
  in
  let repl_edges =
    MSet.map (fun (i, o) -> remap_i i, remap_o o) repl#edges
  in
  let kept_nodes = MSet.filter (fun n -> not (node_is_selected n)) target#nodes in
  target#update (MSet.union kept_nodes repl#nodes) (MSet.union kept_edges repl_edges);
  set_graph_by_id st graph_id target

let find_rule_match st graph_id name selected_ids polygon_opt =
  ignore polygon_opt;
  let target = graph_by_id st graph_id in
  let probe = Graph.copy st.env target in
  let nodes = selected_nodes { st with lhs = (if graph_id = "lhs" then probe else st.lhs); rhs = (if graph_id = "rhs" then probe else st.rhs) } graph_id selected_ids in
  if nodes = [] then Error "No selected nodes"
  else
    match List.assoc_opt name (hyps st) with
    | None -> Error "unknown rule"
    | Some (l,r) ->
       let attempts = ref 0 in
       let set_miss = ref 0 in
       let iso_miss = ref 0 in
       let cut_fail = ref 0 in
       let exn_fail = ref 0 in
       let sig_note = ref "" in
       let selected_sids = String.concat "," (sid_list_of_nodes nodes) in
       let gsig (g: graph) =
         Printf.sprintf "n=%d e=%d s=%d t=%d"
           (mset_size g#nodes) (mset_size g#edges) (List.length g#sources) (List.length g#targets)
       in
       let gpp (g: graph) =
         Format.asprintf "%a" (Graph.pp Full) g
       in
       let lsig = gsig l in
       let rsig = gsig r in
       let default_ex = extract_by_nodes target nodes in
       let failure () =
         let h = default_ex.subgraph in
         Error
           (Printf.sprintf
              "rule not applicable [graph=%s sel=%d ids=[%s] supplied_polygon=%b pat=%d/%d attempts=%d set_miss=%d iso_miss=%d cut_fail=%d exn=%d %s patterns=(%s|%s)]"
              graph_id
              (List.length nodes)
              selected_sids
              false
              (mset_size l#nodes)
              (mset_size r#nodes)
              !attempts
              !set_miss
              !iso_miss
              !cut_fail
              !exn_fail
              (if !sig_note = "" then
                 Printf.sprintf "captured=%s captured_pp=%S lhs_pp=%S rhs_pp=%S"
                   (gsig h) (gpp h) (gpp l) (gpp r)
               else !sig_note)
              lsig
              rsig)
       in
       let nodes_in, internals, variants = extraction_candidates_by_nodes probe nodes in
       let rec try_variants = function
         | [] -> failure ()
         | variant :: rest ->
            incr attempts;
            let ex = extract_with_boundary probe nodes nodes_in variant.inputs variant.outputs internals in
            let h = ex.subgraph in
            if same_node_set nodes h#nodes && Graph.iso h l then
              Ok { rw = name; repl = r; input_perm = variant.input_perm; output_perm = variant.output_perm }
            else if same_node_set nodes h#nodes && Graph.iso h r then
              Ok { rw = "-" ^ name; repl = l; input_perm = variant.input_perm; output_perm = variant.output_perm }
            else if same_node_set nodes h#nodes then (
              iso_miss := !iso_miss + 1;
              if !sig_note = "" then
                sig_note := Printf.sprintf "captured=%s captured_pp=%S lhs_pp=%S rhs_pp=%S"
                              (gsig h) (gpp h) (gpp l) (gpp r);
              try_variants rest
            ) else (
              set_miss := !set_miss + 1;
              try_variants rest
            )
       in
       try_variants variants

let safe_find_rule_match st graph_id name selected_ids polygon_opt =
  try find_rule_match st graph_id name selected_ids polygon_opt with
  | e -> Error (Printf.sprintf "rule check failed: %s" (Printexc.to_string e))

let evaluate_selection st graph_id selected_ids polygon_opt =
  List.map (fun name ->
      match safe_find_rule_match st graph_id name selected_ids polygon_opt with
      | Ok _ ->
         obj [
           "name", Js.Unsafe.inject (js_str name);
           "enabled", Js.Unsafe.inject Js._true
         ]
      | Error msg ->
         obj [
           "name", Js.Unsafe.inject (js_str name);
           "enabled", Js.Unsafe.inject Js._false;
           "reason", Js.Unsafe.inject (js_str msg)
         ]) (rule_names st)

let selection_obj graph_id selected_ids =
  obj [
    "graphId", Js.Unsafe.inject (js_str graph_id);
    "selectedNodeIds", Js.Unsafe.inject (arr (List.map js_str selected_ids));
    "polygon", Js.Unsafe.inject (arr []);
    "cuts", Js.Unsafe.inject (arr []);
    "cycleOrder", Js.Unsafe.inject (arr [])
  ]

let rec combinations k xs =
  if k = 0 then [[]]
  else
    match xs with
    | [] -> []
    | x :: xs ->
       List.map (fun ys -> x :: ys) (combinations (k - 1) xs) @ combinations k xs

let selectable_sids st graph_id =
  let g = graph_by_id st graph_id in
  nodes_of_graph g
  |> List.filter (fun n -> match n#kind with Var _ -> true | Box _ -> false)
  |> List.filter_map (fun n -> Some (ensure_sid st n))

let find_tutorial_step st =
  let try_selection graph_id selected_ids =
    rule_names st
    |> List.find_map (fun name ->
           match safe_find_rule_match st graph_id name selected_ids None with
           | Ok _ -> Some (graph_id, selected_ids, name)
           | Error _ -> None)
  in
  ["lhs"; "rhs"]
  |> List.find_map (fun graph_id ->
         let ids = selectable_sids st graph_id in
         [1; 2; 3]
         |> List.find_map (fun size ->
                combinations size ids
                |> List.find_map (try_selection graph_id)))

let checkpoint st =
  st.undo <- (st.env, Graph.copy st.env st.lhs, Graph.copy st.env st.rhs, st.proof) :: st.undo;
  st.redo <- []

let restore st (env,lhs,rhs,proof) =
  st.env <- env;
  st.lhs <- lhs;
  st.rhs <- rhs;
  st.proof <- proof

let rec apply_rule st graph_id name selected_ids polygon_opt =
  match safe_find_rule_match st graph_id name selected_ids polygon_opt with
  | Error msg ->
     obj [
       "ok", Js.Unsafe.inject Js._false;
       "error", Js.Unsafe.inject (js_str msg)
     ]
  | Ok m ->
     checkpoint st;
     begin try
        splice_by_nodes st graph_id selected_ids m.input_perm m.output_perm m.repl;
        let step = Printf.sprintf "rewrite %s (* %s *)." m.rw graph_id in
        st.proof <- st.proof @ [step];
        let done_eq = Graph.iso st.lhs st.rhs in
        if done_eq then st.messages <- ["You just made a proof. Every move was checked."]
        else st.messages <- [Printf.sprintf "Applied %s on %s." name graph_id];
        obj [
          "ok", Js.Unsafe.inject Js._true;
          "proofDelta", Js.Unsafe.inject (arr [js_str step]);
          "scene", Js.Unsafe.inject (snapshot_scene st)
        ]
     with
     | Failure s ->
        obj ["ok", Js.Unsafe.inject Js._false; "error", Js.Unsafe.inject (js_str s)]
     | e ->
        obj ["ok", Js.Unsafe.inject Js._false; "error", Js.Unsafe.inject (js_str (Printexc.to_string e))]
     end

and snapshot_scene st =
  let hyp_rules =
    rule_names st
    |> List.filter_map (fun name ->
           match List.assoc_opt name (hyps st) with
           | None -> None
           | Some (l,r) ->
              Some (obj [
                  "name", Js.Unsafe.inject (js_str name);
                  "lhs", Js.Unsafe.inject (snapshot_graph st (Printf.sprintf "rule:%s:lhs" name) l);
                  "rhs", Js.Unsafe.inject (snapshot_graph st (Printf.sprintf "rule:%s:rhs" name) r)
                ]))
  in
  obj [
    "puzzleId", Js.Unsafe.inject (js_str st.puzzle.id);
    "level", Js.Unsafe.inject (js_str st.puzzle.level);
    "title", Js.Unsafe.inject (js_str st.puzzle.title);
    "subtitle", Js.Unsafe.inject (js_str st.puzzle.subtitle);
    "graphs", Js.Unsafe.inject (arr [snapshot_graph st "lhs" st.lhs; snapshot_graph st "rhs" st.rhs]);
    "rules", Js.Unsafe.inject (arr hyp_rules);
    "messages", Js.Unsafe.inject (arr (List.map js_str st.messages));
    "proofLines", Js.Unsafe.inject (arr (List.map js_str st.proof))
  ]

let tutorial_demo name =
  let requested = Js.to_string name in
  let puzzle = puzzle_by_id requested in
  let env, lhs, rhs = parse_puzzle_state puzzle.source in
  let st = { puzzle; env; lhs; rhs; proof = []; messages = [Printf.sprintf "%s tutorial" puzzle.level]; undo = []; redo = []; sid_counter = 0 } in
  let initial = snapshot_scene st in
  match find_tutorial_step st with
  | None ->
     obj [
       "ok", Js.Unsafe.inject Js._false;
       "error", Js.Unsafe.inject (js_str "No tutorial rewrite found")
     ]
  | Some (graph_id, selected_ids, rule_name) ->
     let result = apply_rule st graph_id rule_name selected_ids None in
     obj [
       "ok", Js.Unsafe.inject Js._true;
       "initialScene", Js.Unsafe.inject initial;
       "selection", Js.Unsafe.inject (selection_obj graph_id selected_ids);
       "ruleName", Js.Unsafe.inject (js_str rule_name);
       "result", Js.Unsafe.inject result
     ]

let snapshot_puzzle p =
  obj [
    "id", Js.Unsafe.inject (js_str p.id);
    "level", Js.Unsafe.inject (js_str p.level);
    "title", Js.Unsafe.inject (js_str p.title);
    "subtitle", Js.Unsafe.inject (js_str p.subtitle)
  ]

let list_demos () = arr (List.map snapshot_puzzle puzzles)

let init_demo name =
  let requested = Js.to_string name in
  let puzzle = puzzle_by_id requested in
  let env, lhs, rhs = parse_puzzle_state puzzle.source in
  let messages =
    if requested <> "" && requested <> puzzle.id then
      [Printf.sprintf "Unknown puzzle %S; loaded %s instead." requested puzzle.level]
    else
      [Printf.sprintf "%s loaded" puzzle.level]
  in
  state_ref := { puzzle; env; lhs; rhs; proof = []; messages; undo = []; redo = []; sid_counter = 0 };
  snapshot_scene !state_ref

let get_scene () = snapshot_scene !state_ref

let polygon_from_js selection =
  match Js.Optdef.to_option (Js.Unsafe.get selection "polygon") with
  | None -> None
  | Some raw ->
     let points =
       Js.to_array raw
       |> Array.to_list
       |> List.filter_map (fun p ->
              match
                Js.Optdef.to_option (Js.Unsafe.get p "x"),
                Js.Optdef.to_option (Js.Unsafe.get p "y")
              with
              | Some x, Some y -> Some (P2.v (Js.float_of_number x) (Js.float_of_number y))
              | _ -> None)
     in
     if List.length points >= 3 then Some (polygon_of_points points) else None

let evaluate_selection_js (selection: Js.Unsafe.any Js.t) =
  let graph_id =
    match Js.Optdef.to_option (Js.Unsafe.get selection "graphId") with
    | Some s -> Js.to_string s
    | None -> "lhs"
  in
  let polygon = polygon_from_js selection in
  let selected = Js.Unsafe.get selection "selectedNodeIds" in
  let selected_ids = Js.to_array selected |> Array.to_list |> List.map Js.to_string in
  arr (evaluate_selection !state_ref graph_id selected_ids polygon)

let apply_rule_js name_js selection =
  let name = Js.to_string name_js in
  let graph_id =
    match Js.Optdef.to_option (Js.Unsafe.get selection "graphId") with
    | Some s -> Js.to_string s
    | None -> "lhs"
  in
  let polygon = polygon_from_js selection in
  let selected = Js.Unsafe.get selection "selectedNodeIds" in
  let selected_ids = Js.to_array selected |> Array.to_list |> List.map Js.to_string in
  apply_rule !state_ref graph_id name selected_ids polygon

let undo () =
  let st = !state_ref in
  match st.undo with
  | [] -> snapshot_scene st
  | x::xs ->
     st.redo <- (st.env, Graph.copy st.env st.lhs, Graph.copy st.env st.rhs, st.proof) :: st.redo;
     st.undo <- xs;
     restore st x;
     snapshot_scene st

let redo () =
  let st = !state_ref in
  match st.redo with
  | [] -> snapshot_scene st
  | x::xs ->
     st.undo <- (st.env, Graph.copy st.env st.lhs, Graph.copy st.env st.rhs, st.proof) :: st.undo;
     st.redo <- xs;
     restore st x;
     snapshot_scene st

let export_proof () = js_str (String.concat "\n" !state_ref.proof)

let get_messages () = arr (List.map js_str !state_ref.messages)

let _ =
  Js.export "StringDiagramsBridge"
    (obj [
         "init_demo", Js.Unsafe.inject (Js.wrap_callback init_demo);
         "list_demos", Js.Unsafe.inject (Js.wrap_callback list_demos);
         "tutorial_demo", Js.Unsafe.inject (Js.wrap_callback tutorial_demo);
         "get_scene", Js.Unsafe.inject (Js.wrap_callback get_scene);
         "evaluate_selection", Js.Unsafe.inject (Js.wrap_callback evaluate_selection_js);
         "apply_rule", Js.Unsafe.inject (Js.wrap_callback apply_rule_js);
         "undo", Js.Unsafe.inject (Js.wrap_callback undo);
         "redo", Js.Unsafe.inject (Js.wrap_callback redo);
         "export_proof", Js.Unsafe.inject (Js.wrap_callback export_proof);
         "get_messages", Js.Unsafe.inject (Js.wrap_callback get_messages)
       ])

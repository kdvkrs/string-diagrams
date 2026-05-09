open Graph_type
open Types
open Gg

type extracted = {
  subgraph: graph;
  inputs: (Graph_type.iport * Graph_type.oport) list;
  outputs: (Graph_type.iport * Graph_type.oport) list;
  internals: (Graph_type.iport * Graph_type.oport) MSet.t;
  box: box;
}

type error =
  | Empty_selection
  | Missing_boundary of string
  | Duplicate_boundary of string

let error_message = function
  | Empty_selection -> "empty selection"
  | Missing_boundary msg -> "selection is not a single rewrite region: " ^ msg
  | Duplicate_boundary msg -> "selection has ambiguous boundary order: " ^ msg

let node_set nodes = List.fold_left (fun acc n -> MSet.add n acc) MSet.empty nodes

let nodes_box nodes =
  List.fold_left (fun bx n -> Box2.union bx n#box) Box2.empty nodes

let i_inside nodes_in = function
  | InnerTarget (n, _) -> MSet.mem n nodes_in
  | Source _ -> false

let o_inside nodes_in = function
  | InnerSource (n, _) -> MSet.mem n nodes_in
  | Target _ -> false

let boundary_edges_by_nodes (g: graph) nodes =
  let nodes_in = node_set nodes in
  let inputs = ref [] in
  let outputs = ref [] in
  let internals = ref MSet.empty in
  MSet.iter
    (fun (i, o as e) ->
      match i_inside nodes_in i, o_inside nodes_in o with
      | false, true -> inputs := e :: !inputs
      | true, false -> outputs := e :: !outputs
      | true, true -> internals := MSet.add e !internals
      | false, false -> ())
    g#edges;
  nodes_in, !inputs, !outputs, !internals

let port_name_i = function
  | Source i -> Printf.sprintf "source:%d" i
  | InnerTarget (n, i) ->
     Printf.sprintf "node-target:%s:%d"
       (match n#get "sid" with Some s -> s | None -> "?")
       i

let port_name_o = function
  | Target i -> Printf.sprintf "target:%d" i
  | InnerSource (n, i) ->
     Printf.sprintf "node-source:%s:%d"
       (match n#get "sid" with Some s -> s | None -> "?")
       i

let edge_name (i, o) = port_name_i i ^ "->" ^ port_name_o o

let sorted_unique_edges kind expected discovered =
  let rec go seen acc = function
    | [] -> Ok (List.rev acc)
    | e :: _ when List.exists (( = ) e) seen ->
       Error (Duplicate_boundary (Printf.sprintf "%s edge %s" kind (edge_name e)))
    | e :: rest -> go (e :: seen) (e :: acc) rest
  in
  match go [] [] discovered with
  | Error _ as e -> e
  | Ok ordered ->
     let missing = List.filter (fun e -> not (List.exists (( = ) e) ordered)) expected in
     let extra = List.filter (fun e -> not (List.exists (( = ) e) expected)) ordered in
     match missing, extra with
     | [], [] -> Ok ordered
     | e :: _, _ -> Error (Missing_boundary (Printf.sprintf "missed %s edge %s" kind (edge_name e)))
     | _, e :: _ -> Error (Missing_boundary (Printf.sprintf "unexpected %s edge %s" kind (edge_name e)))

let canonical_inputs (g: graph) nodes_in expected =
  let discovered = ref [] in
  let visited_iports = ref [] in
  let rec visit_iport p =
    if List.exists (( = ) p) !visited_iports then ()
    else (
      visited_iports := p :: !visited_iports;
      match g#next_opt p with
      | Some (InnerSource (n, _) as o) ->
         let e = (p, o) in
         if MSet.mem n nodes_in then discovered := e :: !discovered
         else
           for j = 1 to n#ntargets do
             visit_iport (InnerTarget (n, j))
           done
      | Some (Target _) | None -> ())
  in
  for i = 1 to g#nsources do
    visit_iport (Source i)
  done;
  MSet.iter
    (fun n ->
      if not (MSet.mem n nodes_in) && n#nsources = 0 then
        for j = 1 to n#ntargets do
          visit_iport (InnerTarget (n, j))
        done)
    g#nodes;
  sorted_unique_edges "input" expected (List.rev !discovered)

let canonical_outputs (g: graph) nodes_in expected =
  let discovered = ref [] in
  let visited_oports = ref [] in
  let rec visit_oport p =
    if List.exists (( = ) p) !visited_oports then ()
    else (
      visited_oports := p :: !visited_oports;
      match g#prev_opt p with
      | Some (InnerTarget (n, _) as i) ->
         let e = (i, p) in
         if MSet.mem n nodes_in then discovered := e :: !discovered
         else
           for j = 1 to n#nsources do
             visit_oport (InnerSource (n, j))
           done
      | Some (Source _) | None -> ())
  in
  for i = 1 to g#ntargets do
    visit_oport (Target i)
  done;
  MSet.iter
    (fun n ->
      if not (MSet.mem n nodes_in) && n#ntargets = 0 then
        for j = 1 to n#nsources do
          visit_oport (InnerSource (n, j))
        done)
    g#nodes;
  sorted_unique_edges "output" expected (List.rev !discovered)

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
    MSet.fold
      (fun (i, o as e) acc ->
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
  { subgraph = h; inputs; outputs; internals; box = nodes_box nodes }

let extract (g: graph) nodes =
  match nodes with
  | [] -> Error Empty_selection
  | _ ->
     let nodes_in, input_edges, output_edges, internals = boundary_edges_by_nodes g nodes in
     match canonical_inputs g nodes_in input_edges, canonical_outputs g nodes_in output_edges with
     | Ok inputs, Ok outputs -> Ok (extract_with_boundary g nodes nodes_in inputs outputs internals)
     | Error e, _ | _, Error e -> Error e

let extract_with_orders (g: graph) nodes inputs outputs =
  let nodes_in, _, _, internals = boundary_edges_by_nodes g nodes in
  extract_with_boundary g nodes nodes_in inputs outputs internals

#!/usr/bin/env python3
"""OR-Tools VRP solver for brick dispatch scheduling.

Uses the Vehicle Routing Problem solver to simultaneously assign orders
to vehicles AND determine optimal delivery routes, using real distance/
duration matrices.

Input JSON is read from stdin:
{
  "vehicles": [{"driverId": "...", "driverName": "...", "vehicleName": "...", "capacity": 28, "currentLoad": 0}],
  "orders": [{"id": "...", "label": "...", "pallets": 9, "priority": "P2", "startMinutes": 480, "endMinutes": 720, "must": false}],
  "durationMatrix": [[0, 35, ...], [30, 0, ...], ...],   // (1+orders) x (1+orders), in minutes
  "distanceMatrix": [[0, 35.2, ...], [30.5, 0, ...], ...], // (1+orders) x (1+orders), in km
  "serviceMinutes": 15,
  "routeStartHour": 8,
  "timeLimitSeconds": 30
}

Index 0 = depot (brick yard), indices 1..N = orders.
Output JSON is written to stdout.
"""

import json
import sys

try:
    from ortools.constraint_solver import pywrapcp, routing_enums_pb2
except Exception as exc:
    print(json.dumps({"success": False, "error": f"OR-Tools import failed: {exc}"}))
    sys.exit(0)

# Drop penalty by priority — higher = more costly to skip
PRIORITY_PENALTY = {
    "P1": 500000,
    "P2": 200000,
    "P3": 80000,
    "P4": 20000,
}
MUST_PENALTY = 10000000


def main() -> None:
    payload = json.load(sys.stdin)
    vehicles = payload.get("vehicles", [])
    orders = payload.get("orders", [])
    duration_matrix = payload.get("durationMatrix", [])
    distance_matrix = payload.get("distanceMatrix", [])
    service_minutes = int(payload.get("serviceMinutes", 15))
    route_start_hour = int(payload.get("routeStartHour", 8))
    time_limit = float(payload.get("timeLimitSeconds", 30))

    # Filter vehicles with remaining capacity and orders with pallets
    vehicles = [v for v in vehicles if int(v.get("capacity", 28)) > int(v.get("currentLoad", 0))]
    orders = [o for o in orders if int(o.get("pallets") or 0) > 0]

    if not vehicles:
        print(json.dumps({"success": True, "routes": [], "unplanned": orders, "message": "No available FLAT capacity"}))
        return
    if not orders:
        print(json.dumps({"success": True, "routes": [], "unplanned": []}))
        return
    if not duration_matrix or len(duration_matrix) < 2:
        print(json.dumps({"success": False, "error": "Duration matrix is missing or too small"}))
        return

    num_orders = len(orders)
    num_nodes = 1 + num_orders  # depot (0) + orders (1..N)
    num_vehicles = len(vehicles)

    # Validate matrix dimensions
    if len(duration_matrix) < num_nodes or any(len(row) < num_nodes for row in duration_matrix[:num_nodes]):
        print(json.dumps({"success": False, "error": f"Duration matrix size mismatch: expected {num_nodes}x{num_nodes}"}))
        return

    # ---- Build routing model ----
    manager = pywrapcp.RoutingIndexManager(num_nodes, num_vehicles, 0)
    routing = pywrapcp.RoutingModel(manager)

    # Transit callback: service time at from_node + travel to to_node
    # CumVar(to_node) = CumVar(from_node) + service(from_node) + travel(from, to)
    # This means CumVar represents arrival time at each node.
    def transit_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        if from_node == to_node:
            return 0
        travel = int(duration_matrix[from_node][to_node])
        # Add service time at from_node (time spent there before departing)
        if from_node > 0:
            return service_minutes + travel
        return travel

    transit_callback_index = routing.RegisterTransitCallback(transit_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # ---- Capacity constraint (pallets) ----
    def demand_callback(from_index):
        from_node = manager.IndexToNode(from_index)
        if from_node == 0:
            return 0
        return int(orders[from_node - 1].get("pallets", 0))

    demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
    remaining = [int(v.get("capacity", 28)) - int(v.get("currentLoad", 0)) for v in vehicles]
    routing.AddDimensionWithVehicleCapacity(
        demand_callback_index,
        0,  # no slack
        remaining,
        True,  # start cumul at zero
        "Capacity",
    )

    # ---- Time dimension ----
    routing.AddDimension(
        transit_callback_index,
        30,  # max wait time before time window opens
        24 * 60,  # max route duration
        False,  # don't force start cumul to zero
        "Time",
    )
    time_dimension = routing.GetDimensionOrDie("Time")

    route_start = route_start_hour * 60  # e.g. 480 for 8:00 AM

    # Depot time windows for all vehicles
    for v_id in range(num_vehicles):
        time_dimension.CumulVar(routing.Start(v_id)).SetRange(route_start, route_start + 60)
        time_dimension.CumulVar(routing.End(v_id)).SetRange(route_start, 22 * 60)

    # Order time windows (soft: allow up to 90 min late with minimization)
    for oi, order in enumerate(orders):
        node = oi + 1
        index = manager.NodeToIndex(node)
        start_min = int(order.get("startMinutes") or route_start)
        end_min = int(order.get("endMinutes") or 17 * 60)
        if start_min < route_start:
            start_min = route_start
        # Hard upper bound with slack for soft time windows
        hard_end = end_min + 90
        time_dimension.CumulVar(index).SetRange(start_min, hard_end)

    # Minimize arrival times at each order (reduces lateness naturally)
    for oi in range(num_orders):
        node = oi + 1
        index = manager.NodeToIndex(node)
        for v_id in range(num_vehicles):
            routing.AddVariableMinimizedByFinalizer(
                time_dimension.CumulVar(index)
            )

    # ---- Drop penalties (disjunctions for optional orders) ----
    for oi, order in enumerate(orders):
        node = oi + 1
        if order.get("must"):
            penalty = MUST_PENALTY
        else:
            priority = order.get("priority") or "P3"
            penalty = PRIORITY_PENALTY.get(priority, 80000)
        routing.AddDisjunction([manager.NodeToIndex(node)], penalty)

    # ---- Solve ----
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_parameters.time_limit.seconds = int(time_limit)
    search_parameters.num_search_workers = 8

    solution = routing.SolveWithParameters(search_parameters)

    if solution is None:
        print(json.dumps({"success": False, "error": "No feasible solution found"}))
        return

    # ---- Extract results ----
    routes = []
    served_nodes = set()

    for v_id in range(num_vehicles):
        vehicle = vehicles[v_id]
        index = routing.Start(v_id)
        stops = []
        total_distance_km = 0.0
        total_late_minutes = 0
        current_load = int(vehicle.get("currentLoad", 0))
        prev_node = None

        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)

            # Accumulate distance for this leg
            if prev_node is not None and distance_matrix:
                if prev_node < num_nodes and node < num_nodes:
                    total_distance_km += float(distance_matrix[prev_node][node])

            if node > 0:  # not depot
                order = orders[node - 1]
                served_nodes.add(node)

                # Read arrival time from time dimension
                arrival = solution.Value(time_dimension.CumulVar(index))
                end_min = int(order.get("endMinutes") or 17 * 60)
                late = max(0, arrival - end_min)
                total_late_minutes += late

                pallets = int(order.get("pallets", 0))
                current_load += pallets

                stops.append({
                    "orderId": order["id"],
                    "label": order.get("label") or order["id"],
                    "pallets": pallets,
                    "priority": order.get("priority") or "P3",
                    "etaMinutes": arrival,
                    "lateMinutes": late,
                })

            prev_node = node
            index = solution.Value(routing.NextVar(index))

        # Return-to-depot distance
        end_node = manager.IndexToNode(index)  # should be 0 (depot)
        if prev_node is not None and distance_matrix:
            if prev_node < num_nodes and end_node < num_nodes:
                total_distance_km += float(distance_matrix[prev_node][end_node])

        # Total route time from time dimension
        start_time = solution.Value(time_dimension.CumulVar(routing.Start(v_id)))
        end_time = solution.Value(time_dimension.CumulVar(routing.End(v_id)))
        total_minutes = end_time - start_time

        capacity = int(vehicle.get("capacity", 28))
        routes.append({
            "driverId": vehicle["driverId"],
            "driverName": vehicle.get("driverName") or "",
            "vehicleName": vehicle.get("vehicleName") or "",
            "load": current_load,
            "capacity": capacity,
            "stops": stops,
            "totalMinutes": total_minutes,
            "totalDistanceKm": round(total_distance_km, 1),
            "lateMinutes": total_late_minutes,
        })

    # Unplanned orders (dropped by solver)
    unplanned = []
    for oi, order in enumerate(orders):
        node = oi + 1
        if node not in served_nodes:
            unplanned.append({
                "id": order["id"],
                "label": order.get("label") or order["id"],
                "pallets": int(order.get("pallets", 0)),
                "reason": "Could not fit in any vehicle route",
            })

    print(json.dumps({
        "success": True,
        "status": "OPTIMAL",
        "routes": routes,
        "unplanned": unplanned,
    }))


if __name__ == "__main__":
    main()

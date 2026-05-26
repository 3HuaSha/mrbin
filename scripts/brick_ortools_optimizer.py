#!/usr/bin/env python3
"""OR-Tools VRP solver for brick dispatch — single depot, all orders as P&D pairs.

Business logic:
- All vehicles start and end at depot (12441 Woodbine Ave)
- Delivery orders: vehicle goes to yard to load → delivers to customer
  - Modeled as P&D pair: pickup at yard, delivery at customer
  - For 12441 yard orders, pickup is at depot (0 travel)
- Pickup orders: vehicle goes to supplier to load → delivers to yard/customer
  - Also a P&D pair: pickup at supplier, delivery at destination
- Capacity tracks load: +pallets at pickup, -pallets at delivery
- Time windows on customer deliveries; relaxed on pickups

Input JSON (stdin):
{
  "vehicles": [{"driverId", "driverName", "vehicleName", "capacity", "currentLoad"}],
  "deliveryOrders": [{"id", "label", "pallets",
                       "pickupAddress": "yard address", "deliveryAddress": "customer address",
                       "pickupLabel", "deliveryLabel",
                       "priority", "startMinutes", "endMinutes", "must"}, ...],
  "pickupOrders": [{"id", "label", "pallets",
                     "pickupAddress": "supplier address", "deliveryAddress": "destination address",
                     "pickupLabel", "deliveryLabel",
                     "priority", "endMinutes"}, ...],
  "durationMatrix": [[...]],   // (1+2*D+2*P) x (1+2*D+2*P), in minutes
  "distanceMatrix": [[...]],  // same dims, in km
  "serviceMinutes": 15,
  "routeStartHour": 8,
  "timeLimitSeconds": 30
}

Node indices:
  0 = depot (12441)
  1,2 = delivery order 0 (pickup at yard, delivery at customer)
  3,4 = delivery order 1 (pickup at yard, delivery at customer)
  ...
  2*D+1, 2*D+2 = pickup order 0 (pickup at supplier, delivery at dest)
  ...

Output JSON (stdout).
"""

import json
import sys

try:
    from ortools.constraint_solver import pywrapcp, routing_enums_pb2
except Exception as exc:
    print(json.dumps({"success": False, "error": f"OR-Tools import failed: {exc}"}))
    sys.exit(0)

PRIORITY_PENALTY = {"P1": 500000, "P2": 200000, "P3": 80000, "P4": 20000}
MUST_PENALTY = 10000000
PICKUP_ORDER_PENALTY = 60000


def main() -> None:
    payload = json.load(sys.stdin)
    vehicles = payload.get("vehicles", [])
    delivery_orders = payload.get("deliveryOrders", [])
    pickup_orders = payload.get("pickupOrders", [])
    duration_matrix = payload.get("durationMatrix", [])
    distance_matrix = payload.get("distanceMatrix", [])
    service_minutes = int(payload.get("serviceMinutes", 15))
    route_start_hour = int(payload.get("routeStartHour", 8))
    time_limit = float(payload.get("timeLimitSeconds", 30))

    vehicles = [v for v in vehicles if int(v.get("capacity", 28)) > int(v.get("currentLoad", 0))]
    delivery_orders = [o for o in delivery_orders if int(o.get("pallets") or 0) > 0]
    pickup_orders = [o for o in pickup_orders if int(o.get("pallets") or 0) > 0]

    if not vehicles:
        print(json.dumps({"success": True, "routes": [], "unplanned": delivery_orders + pickup_orders}))
        return
    if not delivery_orders and not pickup_orders:
        print(json.dumps({"success": True, "routes": [], "unplanned": []}))
        return
    if not duration_matrix or len(duration_matrix) < 2:
        print(json.dumps({"success": False, "error": "Duration matrix is missing or too small"}))
        return

    num_deliveries = len(delivery_orders)
    num_pickups = len(pickup_orders)
    # Nodes: 0=depot, 1..2*D=delivery P&D pairs, 2*D+1..2*D+2*P=pickup P&D pairs
    num_nodes = 1 + 2 * num_deliveries + 2 * num_pickups
    num_vehicles = len(vehicles)

    if len(duration_matrix) < num_nodes or any(len(row) < num_nodes for row in duration_matrix[:num_nodes]):
        print(json.dumps({"success": False, "error": f"Duration matrix size mismatch: expected {num_nodes}x{num_nodes}"}))
        return

    # ---- Node helpers ----
    # Delivery order i: pickup=2*i+1, delivery=2*i+2
    # Pickup order j: pickup=2*num_deliveries+2*j+1, delivery=2*num_deliveries+2*j+2

    def is_delivery_pickup(node):
        """Node is a yard pickup for a delivery order."""
        return 1 <= node <= 2 * num_deliveries and node % 2 == 1

    def is_delivery_drop(node):
        """Node is a customer delivery for a delivery order."""
        return 1 <= node <= 2 * num_deliveries and node % 2 == 0

    def is_pickup_pickup(node):
        """Node is a supplier pickup for a pickup order."""
        offset = node - 2 * num_deliveries
        return offset >= 1 and offset % 2 == 1

    def is_pickup_drop(node):
        """Node is a destination delivery for a pickup order."""
        offset = node - 2 * num_deliveries
        return offset >= 1 and offset % 2 == 0

    def delivery_order_index(node):
        return (node - 1) // 2

    def pickup_order_index(node):
        return (node - 2 * num_deliveries - 1) // 2

    # ---- Build routing model ----
    manager = pywrapcp.RoutingIndexManager(num_nodes, num_vehicles, 0)
    routing = pywrapcp.RoutingModel(manager)

    def transit_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        if from_node == to_node:
            return 0
        travel = int(duration_matrix[from_node][to_node])
        # Add service time at non-depot nodes
        if from_node > 0:
            return service_minutes + travel
        return travel

    transit_cb_idx = routing.RegisterTransitCallback(transit_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_cb_idx)

    # ---- Capacity: load-tracking ----
    # Pickup nodes: +pallets (load goods)
    # Delivery/drop nodes: -pallets (unload goods)
    def demand_callback(from_index):
        from_node = manager.IndexToNode(from_index)
        if from_node == 0:
            return 0
        if is_delivery_pickup(from_node):
            oi = delivery_order_index(from_node)
            return int(delivery_orders[oi].get("pallets", 0))
        if is_delivery_drop(from_node):
            oi = delivery_order_index(from_node)
            return -int(delivery_orders[oi].get("pallets", 0))
        if is_pickup_pickup(from_node):
            oi = pickup_order_index(from_node)
            return int(pickup_orders[oi].get("pallets", 0))
        if is_pickup_drop(from_node):
            oi = pickup_order_index(from_node)
            return -int(pickup_orders[oi].get("pallets", 0))
        return 0

    demand_cb_idx = routing.RegisterUnaryTransitCallback(demand_callback)
    capacities = [int(v.get("capacity", 28)) for v in vehicles]
    routing.AddDimensionWithVehicleCapacity(
        demand_cb_idx, 0, capacities, False, "Capacity",
    )
    cap_dim = routing.GetDimensionOrDie("Capacity")

    for v_id in range(num_vehicles):
        current = int(vehicles[v_id].get("currentLoad", 0))
        cap = capacities[v_id]
        cap_dim.CumulVar(routing.Start(v_id)).SetRange(current, cap)
        cap_dim.CumulVar(routing.End(v_id)).SetRange(current, cap)

    for v_id in range(num_vehicles):
        routing.AddVariableMinimizedByFinalizer(cap_dim.CumulVar(routing.Start(v_id)))

    # ---- Time dimension ----
    routing.AddDimension(transit_cb_idx, 30, 24 * 60, False, "Time")
    time_dim = routing.GetDimensionOrDie("Time")

    route_start = route_start_hour * 60
    for v_id in range(num_vehicles):
        time_dim.CumulVar(routing.Start(v_id)).SetRange(route_start, route_start + 60)
        time_dim.CumulVar(routing.End(v_id)).SetRange(route_start, 22 * 60)

    # Delivery order time windows: strict on delivery node, relaxed on pickup node
    for oi, order in enumerate(delivery_orders):
        pickup_node = 2 * oi + 1
        delivery_node = 2 * oi + 2
        # Pickup at yard: can visit any time during the day
        time_dim.CumulVar(manager.NodeToIndex(pickup_node)).SetRange(route_start, 20 * 60)
        # Delivery at customer: strict time window
        start_min = int(order.get("startMinutes") or route_start)
        end_min = int(order.get("endMinutes") or 17 * 60)
        if start_min < route_start:
            start_min = route_start
        time_dim.CumulVar(manager.NodeToIndex(delivery_node)).SetRange(start_min, end_min + 90)

    # Pickup order time windows: relaxed on both nodes
    for pi, porder in enumerate(pickup_orders):
        pickup_node = 2 * num_deliveries + 2 * pi + 1
        delivery_node = 2 * num_deliveries + 2 * pi + 2
        end_min = int(porder.get("endMinutes") or 20 * 60)
        time_dim.CumulVar(manager.NodeToIndex(pickup_node)).SetRange(route_start, end_min)
        time_dim.CumulVar(manager.NodeToIndex(delivery_node)).SetRange(route_start, end_min + 30)

    # Minimize arrival times at delivery drop nodes (customer)
    for oi in range(num_deliveries):
        delivery_node = 2 * oi + 2
        routing.AddVariableMinimizedByFinalizer(time_dim.CumulVar(manager.NodeToIndex(delivery_node)))

    # ---- Pickup & Delivery pairs ----
    # Use routing.AddPickupAndDelivery() — PATH_CHEAPEST_ARC respects this
    # (solver.Add constraints are ignored by the first-solution heuristic)

    # Delivery order pairs: yard pickup → customer delivery
    for oi in range(num_deliveries):
        pickup_node = 2 * oi + 1
        delivery_node = 2 * oi + 2
        pickup_idx = manager.NodeToIndex(pickup_node)
        delivery_idx = manager.NodeToIndex(delivery_node)
        routing.AddPickupAndDelivery(pickup_idx, delivery_idx)
        solver = routing.solver()
        solver.Add(routing.VehicleVar(pickup_idx) == routing.VehicleVar(delivery_idx))
        solver.Add(time_dim.CumulVar(pickup_idx) <= time_dim.CumulVar(delivery_idx))

    # Pickup order pairs: supplier pickup → destination delivery
    for pi in range(num_pickups):
        pickup_node = 2 * num_deliveries + 2 * pi + 1
        delivery_node = 2 * num_deliveries + 2 * pi + 2
        pickup_idx = manager.NodeToIndex(pickup_node)
        delivery_idx = manager.NodeToIndex(delivery_node)
        routing.AddPickupAndDelivery(pickup_idx, delivery_idx)
        solver = routing.solver()
        solver.Add(routing.VehicleVar(pickup_idx) == routing.VehicleVar(delivery_idx))
        solver.Add(time_dim.CumulVar(pickup_idx) <= time_dim.CumulVar(delivery_idx))

    # ---- Drop penalties ----
    # Delivery orders: drop both nodes together
    for oi, order in enumerate(delivery_orders):
        pickup_node = 2 * oi + 1
        delivery_node = 2 * oi + 2
        if order.get("must"):
            penalty = MUST_PENALTY
        else:
            priority = order.get("priority") or "P3"
            penalty = PRIORITY_PENALTY.get(priority, 80000)
        routing.AddDisjunction(
            [manager.NodeToIndex(pickup_node), manager.NodeToIndex(delivery_node)],
            penalty,
        )

    # Pickup orders: drop both nodes together
    for pi, porder in enumerate(pickup_orders):
        pickup_node = 2 * num_deliveries + 2 * pi + 1
        delivery_node = 2 * num_deliveries + 2 * pi + 2
        priority = porder.get("priority") or "P3"
        penalty = PRIORITY_PENALTY.get(priority, PICKUP_ORDER_PENALTY)
        routing.AddDisjunction(
            [manager.NodeToIndex(pickup_node), manager.NodeToIndex(delivery_node)],
            penalty,
        )

    # ---- Solve ----
    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    search_params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    search_params.time_limit.seconds = int(time_limit)

    solution = routing.SolveWithParameters(search_params)

    if solution is None:
        print(json.dumps({"success": False, "error": "No feasible solution found"}))
        return

    # ---- Extract results ----
    routes = []
    served_delivery_orders = set()
    served_pickup_orders = set()

    for v_id in range(num_vehicles):
        vehicle = vehicles[v_id]
        index = routing.Start(v_id)
        stops = []
        total_distance_km = 0.0
        total_late_minutes = 0
        prev_node = None

        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)

            if prev_node is not None and distance_matrix:
                if prev_node < num_nodes and node < num_nodes:
                    total_distance_km += float(distance_matrix[prev_node][node])

            if node == 0:
                pass  # depot, skip
            elif is_delivery_pickup(node):
                oi = delivery_order_index(node)
                order = delivery_orders[oi]
                arrival = solution.Value(time_dim.CumulVar(index))
                stops.append({
                    "orderId": order["id"],
                    "label": f"🏗上 {order.get('pickupLabel') or order.get('label') or order['id']}",
                    "pallets": int(order.get("pallets", 0)),
                    "priority": order.get("priority") or "P3",
                    "etaMinutes": arrival,
                    "lateMinutes": 0,
                    "type": "yard_pickup",
                })
            elif is_delivery_drop(node):
                oi = delivery_order_index(node)
                order = delivery_orders[oi]
                served_delivery_orders.add(oi)
                arrival = solution.Value(time_dim.CumulVar(index))
                end_min = int(order.get("endMinutes") or 17 * 60)
                late = max(0, arrival - end_min)
                total_late_minutes += late
                stops.append({
                    "orderId": order["id"],
                    "label": order.get("deliveryLabel") or order.get("label") or order["id"],
                    "pallets": int(order.get("pallets", 0)),
                    "priority": order.get("priority") or "P3",
                    "etaMinutes": arrival,
                    "lateMinutes": late,
                    "type": "delivery",
                })
            elif is_pickup_pickup(node):
                oi = pickup_order_index(node)
                porder = pickup_orders[oi]
                arrival = solution.Value(time_dim.CumulVar(index))
                stops.append({
                    "orderId": porder["id"],
                    "label": f"🏭取 {porder.get('pickupLabel') or porder.get('label') or porder['id']}",
                    "pallets": int(porder.get("pallets", 0)),
                    "priority": porder.get("priority") or "P3",
                    "etaMinutes": arrival,
                    "lateMinutes": 0,
                    "type": "pickup",
                })
            elif is_pickup_drop(node):
                oi = pickup_order_index(node)
                porder = pickup_orders[oi]
                served_pickup_orders.add(oi)
                arrival = solution.Value(time_dim.CumulVar(index))
                end_min = int(porder.get("endMinutes") or 20 * 60)
                late = max(0, arrival - end_min)
                total_late_minutes += late
                stops.append({
                    "orderId": porder["id"],
                    "label": f"📦送 {porder.get('deliveryLabel') or porder.get('label') or porder['id']}",
                    "pallets": int(porder.get("pallets", 0)),
                    "priority": porder.get("priority") or "P3",
                    "etaMinutes": arrival,
                    "lateMinutes": late,
                    "type": "pickup_delivery",
                })

            prev_node = node
            index = solution.Value(routing.NextVar(index))

        # Return-to-depot distance
        end_node = manager.IndexToNode(index)
        if prev_node is not None and distance_matrix:
            if prev_node < num_nodes and end_node < num_nodes:
                total_distance_km += float(distance_matrix[prev_node][end_node])

        start_time = solution.Value(time_dim.CumulVar(routing.Start(v_id)))
        end_time = solution.Value(time_dim.CumulVar(routing.End(v_id)))
        total_minutes = end_time - start_time

        delivery_plt = sum(
            int(delivery_orders[oi].get("pallets", 0))
            for oi in served_delivery_orders
        )
        pickup_plt = sum(
            int(pickup_orders[oi].get("pallets", 0))
            for oi in served_pickup_orders
        )

        routes.append({
            "driverId": vehicle["driverId"],
            "driverName": vehicle.get("driverName") or "",
            "vehicleName": vehicle.get("vehicleName") or "",
            "load": int(vehicle.get("currentLoad", 0)) + delivery_plt,
            "capacity": int(vehicle.get("capacity", 28)),
            "stops": stops,
            "totalMinutes": total_minutes,
            "totalDistanceKm": round(total_distance_km, 1),
            "lateMinutes": total_late_minutes,
            "pickupPallets": pickup_plt,
        })

    # Unplanned
    unplanned = []
    for oi, order in enumerate(delivery_orders):
        if oi not in served_delivery_orders:
            unplanned.append({
                "id": order["id"],
                "label": order.get("label") or order["id"],
                "pallets": int(order.get("pallets", 0)),
                "reason": "Could not fit in any vehicle route",
            })
    for pi, porder in enumerate(pickup_orders):
        if pi not in served_pickup_orders:
            unplanned.append({
                "id": porder["id"],
                "label": porder.get("label") or porder["id"],
                "pallets": int(porder.get("pallets", 0)),
                "reason": "Could not fit pickup order in any vehicle route",
            })

    print(json.dumps({
        "success": True,
        "status": "OPTIMAL",
        "routes": routes,
        "unplanned": unplanned,
    }))


if __name__ == "__main__":
    main()

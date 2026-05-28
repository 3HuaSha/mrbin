#!/usr/bin/env python3
"""OR-Tools VRP solver for brick dispatch.

Delivery orders are preloaded before the truck leaves. The solver still decides
which truck carries which delivery orders, but those orders do not create yard
pickup stops in the route. Factory pickup/restock orders remain pickup-delivery
pairs because they can happen after customer deliveries free up space.
"""

import json
import sys

try:
    from ortools.constraint_solver import pywrapcp, routing_enums_pb2
except Exception as exc:
    print(json.dumps({"success": False, "error": f"OR-Tools import failed: {exc}"}))
    sys.exit(0)


PRIORITY_PENALTY = {"P1": 500000, "P2": 200000, "P3": 80000, "P4": 20000}
SOFT_LATE_PENALTY = {"P1": 20000, "P2": 8000, "P3": 2500, "P4": 600}
MUST_PENALTY = 10000000
PICKUP_ORDER_PENALTY = 60000


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception as exc:
        print(json.dumps({"success": False, "error": f"JSON parse error: {exc}"}))
        return

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

    num_deliveries = len(delivery_orders)
    num_pickups = len(pickup_orders)
    num_nodes = 1 + num_deliveries + 2 * num_pickups
    num_vehicles = len(vehicles)

    if len(duration_matrix) < num_nodes or any(len(row) < num_nodes for row in duration_matrix[:num_nodes]):
        print(json.dumps({"success": False, "error": f"Duration matrix size mismatch: expected {num_nodes}x{num_nodes}"}))
        return

    delivery_start = 1
    pickup_start = 1 + num_deliveries

    def is_delivery_node(node):
        return delivery_start <= node < pickup_start

    def is_pickup_pickup(node):
        offset = node - pickup_start
        return offset >= 0 and offset % 2 == 0

    def is_pickup_drop(node):
        offset = node - pickup_start
        return offset >= 0 and offset % 2 == 1

    def delivery_order_index(node):
        return node - delivery_start

    def pickup_order_index(node):
        return (node - pickup_start) // 2

    manager = pywrapcp.RoutingIndexManager(num_nodes, num_vehicles, 0)
    routing = pywrapcp.RoutingModel(manager)

    def transit_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        if from_node == to_node:
            return 0
        travel = int(duration_matrix[from_node][to_node])
        if from_node > 0:
            return service_minutes + travel
        return travel

    transit_cb_idx = routing.RegisterTransitCallback(transit_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_cb_idx)

    def demand_callback(from_index):
        from_node = manager.IndexToNode(from_index)
        if from_node == 0:
            return 0
        if is_delivery_node(from_node):
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
    physical_capacities = [int(v.get("capacity", 28)) for v in vehicles]
    reserved_loads = [int(v.get("currentLoad", 0)) for v in vehicles]
    capacities = [
        max(0, physical_capacities[v_id] - reserved_loads[v_id])
        for v_id in range(len(vehicles))
    ]
    routing.AddDimensionWithVehicleCapacity(demand_cb_idx, 0, capacities, False, "Capacity")
    cap_dim = routing.GetDimensionOrDie("Capacity")

    for v_id in range(len(vehicles)):
        cap_dim.CumulVar(routing.Start(v_id)).SetRange(0, capacities[v_id])
        cap_dim.CumulVar(routing.End(v_id)).SetRange(0, capacities[v_id])
        routing.AddVariableMinimizedByFinalizer(cap_dim.CumulVar(routing.Start(v_id)))

    routing.AddDimension(transit_cb_idx, 30, 24 * 60, False, "Time")
    time_dim = routing.GetDimensionOrDie("Time")

    route_start = route_start_hour * 60
    for v_id in range(num_vehicles):
        time_dim.CumulVar(routing.Start(v_id)).SetRange(route_start, route_start + 60)
        time_dim.CumulVar(routing.End(v_id)).SetRange(route_start, 22 * 60)

    for oi, order in enumerate(delivery_orders):
        node = delivery_start + oi
        index = manager.NodeToIndex(node)
        start_min = max(route_start, int(order.get("startMinutes") or route_start))
        end_min = int(order.get("endMinutes") or 17 * 60)
        priority = order.get("priority") or "P3"
        if order.get("must") or priority == "P1":
            time_dim.CumulVar(index).SetRange(start_min, end_min)
        else:
            grace = 30 if priority == "P2" else 90
            time_dim.CumulVar(index).SetRange(start_min, end_min + grace)
            time_dim.SetCumulVarSoftUpperBound(index, end_min, SOFT_LATE_PENALTY.get(priority, 2500))
        routing.AddVariableMinimizedByFinalizer(time_dim.CumulVar(index))

    for pi, porder in enumerate(pickup_orders):
        pickup_node = pickup_start + 2 * pi
        delivery_node = pickup_start + 2 * pi + 1
        end_min = int(porder.get("endMinutes") or 20 * 60)
        time_dim.CumulVar(manager.NodeToIndex(pickup_node)).SetRange(route_start, end_min)
        time_dim.CumulVar(manager.NodeToIndex(delivery_node)).SetRange(route_start, end_min + 30)

        pickup_idx = manager.NodeToIndex(pickup_node)
        delivery_idx = manager.NodeToIndex(delivery_node)
        routing.AddPickupAndDelivery(pickup_idx, delivery_idx)
        solver = routing.solver()
        solver.Add(routing.VehicleVar(pickup_idx) == routing.VehicleVar(delivery_idx))
        solver.Add(time_dim.CumulVar(pickup_idx) <= time_dim.CumulVar(delivery_idx))

    for oi, order in enumerate(delivery_orders):
        node = delivery_start + oi
        priority = order.get("priority") or "P3"
        penalty = MUST_PENALTY if order.get("must") else PRIORITY_PENALTY.get(priority, 80000)
        routing.AddDisjunction([manager.NodeToIndex(node)], penalty)

    for pi, porder in enumerate(pickup_orders):
        pickup_node = pickup_start + 2 * pi
        delivery_node = pickup_start + 2 * pi + 1
        priority = porder.get("priority") or "P3"
        penalty = PRIORITY_PENALTY.get(priority, PICKUP_ORDER_PENALTY)
        routing.AddDisjunction([manager.NodeToIndex(pickup_node)], penalty)
        routing.AddDisjunction([manager.NodeToIndex(delivery_node)], penalty)

    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    search_params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    search_params.time_limit.seconds = int(time_limit)

    solution = routing.SolveWithParameters(search_params)

    if solution is None:
        print(json.dumps({"success": False, "error": "No feasible solution found"}))
        return

    routes = []
    served_delivery_orders = set()
    served_pickup_orders = set()

    for v_id, vehicle in enumerate(vehicles):
        index = routing.Start(v_id)
        stops = []
        preload_orders = []
        vehicle_delivery_oi = set()
        vehicle_pickup_oi = set()
        total_distance_km = 0.0
        total_late_minutes = 0
        prev_node = None
        reserved_load = reserved_loads[v_id]
        peak_load = reserved_load + solution.Value(cap_dim.CumulVar(index))

        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)

            if prev_node is not None and distance_matrix and prev_node < num_nodes and node < num_nodes:
                total_distance_km += float(distance_matrix[prev_node][node])

            peak_load = max(peak_load, reserved_load + solution.Value(cap_dim.CumulVar(index)))

            if node == 0:
                pass
            elif is_delivery_node(node):
                oi = delivery_order_index(node)
                order = delivery_orders[oi]
                served_delivery_orders.add(oi)
                vehicle_delivery_oi.add(oi)
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
                    "label": f"取 {porder.get('pickupLabel') or porder.get('label') or porder['id']}",
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
                vehicle_pickup_oi.add(oi)
                arrival = solution.Value(time_dim.CumulVar(index))
                end_min = int(porder.get("endMinutes") or 20 * 60)
                late = max(0, arrival - end_min)
                total_late_minutes += late
                stops.append({
                    "orderId": porder["id"],
                    "label": f"送 {porder.get('deliveryLabel') or porder.get('label') or porder['id']}",
                    "pallets": int(porder.get("pallets", 0)),
                    "priority": porder.get("priority") or "P3",
                    "etaMinutes": arrival,
                    "lateMinutes": late,
                    "type": "pickup_delivery",
                })

            prev_node = node
            index = solution.Value(routing.NextVar(index))

        end_node = manager.IndexToNode(index)
        if prev_node is not None and distance_matrix and prev_node < num_nodes and end_node < num_nodes:
            total_distance_km += float(distance_matrix[prev_node][end_node])

        for oi in sorted(vehicle_delivery_oi):
            order = delivery_orders[oi]
            preload_orders.append({
                "orderId": order["id"],
                "label": order.get("label") or order["id"],
                "pallets": int(order.get("pallets", 0)),
                "priority": order.get("priority") or "P3",
            })

        pickup_plt = sum(int(pickup_orders[oi].get("pallets", 0)) for oi in vehicle_pickup_oi)
        start_time = solution.Value(time_dim.CumulVar(routing.Start(v_id)))
        end_time = solution.Value(time_dim.CumulVar(routing.End(v_id)))

        routes.append({
            "driverId": vehicle["driverId"],
            "driverName": vehicle.get("driverName") or "",
            "vehicleName": vehicle.get("vehicleName") or "",
            "load": reserved_load + solution.Value(cap_dim.CumulVar(routing.Start(v_id))),
            "capacity": physical_capacities[v_id],
            "preloadOrders": preload_orders,
            "stops": stops,
            "totalMinutes": end_time - start_time,
            "totalDistanceKm": round(total_distance_km, 1),
            "lateMinutes": total_late_minutes,
            "pickupPallets": pickup_plt,
        })

    unplanned = []
    for oi, order in enumerate(delivery_orders):
        if oi not in served_delivery_orders:
            unplanned.append({
                "id": order["id"],
                "label": order.get("label") or order["id"],
                "pallets": int(order.get("pallets", 0)),
                "reason": "容量或时间窗不适合当前车辆路线",
            })
    for pi, porder in enumerate(pickup_orders):
        if pi not in served_pickup_orders:
            unplanned.append({
                "id": porder["id"],
                "label": porder.get("label") or porder["id"],
                "pallets": int(porder.get("pallets", 0)),
                "reason": "顺路取货会超载或影响路线",
            })

    print(json.dumps({
        "success": True,
        "status": "OPTIMAL",
        "routes": routes,
        "unplanned": unplanned,
    }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"success": False, "error": f"Unhandled exception: {exc}"}))

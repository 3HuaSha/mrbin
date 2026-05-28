#!/usr/bin/env python3
"""OR-Tools pickup-delivery solver for brick dispatch."""

import json
import sys

try:
    from ortools.constraint_solver import pywrapcp, routing_enums_pb2
except Exception as exc:
    print(json.dumps({"success": False, "error": f"OR-Tools import failed: {exc}"}))
    sys.exit(0)


PRIORITY_PENALTY = {"P1": 10000000, "P2": 500000, "P3": 160000, "P4": 50000}
SOFT_LATE_PENALTY = {"P1": 50000, "P2": 10000, "P3": 3000, "P4": 800}


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception as exc:
        print(json.dumps({"success": False, "error": f"JSON parse error: {exc}"}))
        return

    vehicles = payload.get("vehicles", [])
    delivery_orders = [o for o in payload.get("deliveryOrders", []) if int(o.get("pallets") or 0) > 0]
    restock_orders = [o for o in payload.get("restockOrders", []) if int(o.get("pallets") or 0) > 0]
    duration_matrix = payload.get("durationMatrix", [])
    distance_matrix = payload.get("distanceMatrix", [])
    service_minutes_by_node = payload.get("serviceMinutesByNode", [])
    route_start = int(payload.get("routeStartMinutes", 6 * 60))
    route_end = int(payload.get("routeEndMinutes", 23 * 60))
    time_limit = int(float(payload.get("timeLimitSeconds", 30)))

    vehicles = [v for v in vehicles if int(v.get("capacity", 28)) > int(v.get("currentLoad", 0))]

    if not vehicles:
        print(json.dumps({"success": True, "routes": [], "unplanned": delivery_orders + restock_orders}, ensure_ascii=False))
        return
    if not delivery_orders and not restock_orders:
        print(json.dumps({"success": True, "routes": [], "unplanned": []}, ensure_ascii=False))
        return

    nodes = [{"kind": "depot"}]
    delivery_meta = []
    restock_meta = []

    for order_index, order in enumerate(delivery_orders):
        pickup_nodes = []
        for pickup in order.get("pickups", []):
            node = len(nodes)
            nodes.append({
                "kind": "order_pickup",
                "orderIndex": order_index,
                "pallets": int(pickup.get("pallets") or 0),
                "label": pickup.get("label") or order.get("label") or order["id"],
            })
            pickup_nodes.append(node)
        delivery_node = len(nodes)
        nodes.append({
            "kind": "delivery",
            "orderIndex": order_index,
            "pallets": int(order.get("pallets") or 0),
            "label": order.get("deliveryLabel") or order.get("label") or order["id"],
        })
        delivery_meta.append({"pickupNodes": pickup_nodes, "deliveryNode": delivery_node})

    for restock_index, order in enumerate(restock_orders):
        pickup_node = len(nodes)
        nodes.append({
            "kind": "restock_pickup",
            "restockIndex": restock_index,
            "pallets": int(order.get("pallets") or 0),
            "label": order.get("pickupLabel") or order.get("label") or order["id"],
        })
        drop_node = len(nodes)
        nodes.append({
            "kind": "restock_dropoff",
            "restockIndex": restock_index,
            "pallets": int(order.get("pallets") or 0),
            "label": order.get("deliveryLabel") or order.get("label") or order["id"],
        })
        restock_meta.append({"pickupNode": pickup_node, "dropNode": drop_node})

    num_nodes = len(nodes)
    num_vehicles = len(vehicles)

    if len(duration_matrix) < num_nodes or any(len(row) < num_nodes for row in duration_matrix[:num_nodes]):
        print(json.dumps({"success": False, "error": f"Duration matrix size mismatch: expected {num_nodes}x{num_nodes}"}))
        return

    manager = pywrapcp.RoutingIndexManager(num_nodes, num_vehicles, 0)
    routing = pywrapcp.RoutingModel(manager)

    def transit_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        travel = 0 if from_node == to_node else int(duration_matrix[from_node][to_node])
        service = 0
        if from_node > 0 and from_node < len(service_minutes_by_node):
            service = int(service_minutes_by_node[from_node] or 0)
        return service + travel

    transit_cb_idx = routing.RegisterTransitCallback(transit_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_cb_idx)

    def demand_callback(from_index):
        node = manager.IndexToNode(from_index)
        info = nodes[node]
        pallets = int(info.get("pallets") or 0)
        if info["kind"] in ("order_pickup", "restock_pickup"):
            return pallets
        if info["kind"] in ("delivery", "restock_dropoff"):
            return -pallets
        return 0

    demand_cb_idx = routing.RegisterUnaryTransitCallback(demand_callback)
    physical_capacities = [int(v.get("capacity", 28)) for v in vehicles]
    reserved_loads = [int(v.get("currentLoad", 0)) for v in vehicles]
    capacities = [max(0, physical_capacities[i] - reserved_loads[i]) for i in range(num_vehicles)]
    routing.AddDimensionWithVehicleCapacity(demand_cb_idx, 0, capacities, True, "Capacity")
    cap_dim = routing.GetDimensionOrDie("Capacity")

    routing.AddDimension(transit_cb_idx, 60, 24 * 60, False, "Time")
    time_dim = routing.GetDimensionOrDie("Time")
    for vehicle_id in range(num_vehicles):
        time_dim.CumulVar(routing.Start(vehicle_id)).SetRange(route_start, route_end)
        time_dim.CumulVar(routing.End(vehicle_id)).SetRange(route_start, 24 * 60)

    solver = routing.solver()

    for order_index, meta in enumerate(delivery_meta):
        order = delivery_orders[order_index]
        delivery_idx = manager.NodeToIndex(meta["deliveryNode"])
        priority = order.get("priority") or "P3"
        start_min = max(route_start, int(order.get("startMinutes") or route_start))
        end_min = int(order.get("endMinutes") or route_end)

        if order.get("must") or priority == "P1":
            time_dim.CumulVar(delivery_idx).SetRange(start_min, end_min)
        else:
            time_dim.CumulVar(delivery_idx).SetRange(start_min, min(route_end, end_min + 120))
            time_dim.SetCumulVarSoftUpperBound(delivery_idx, end_min, SOFT_LATE_PENALTY.get(priority, 3000))

        penalty = PRIORITY_PENALTY.get(priority, PRIORITY_PENALTY["P3"])
        if order.get("must") or priority == "P1":
            penalty = PRIORITY_PENALTY["P1"]

        routing.AddDisjunction([delivery_idx], penalty)

        for pickup_node in meta["pickupNodes"]:
            pickup_idx = manager.NodeToIndex(pickup_node)
            routing.AddPickupAndDelivery(pickup_idx, delivery_idx)
            solver.Add(routing.VehicleVar(pickup_idx) == routing.VehicleVar(delivery_idx))
            solver.Add(time_dim.CumulVar(pickup_idx) <= time_dim.CumulVar(delivery_idx))
            solver.Add(routing.ActiveVar(pickup_idx) == routing.ActiveVar(delivery_idx))
            routing.AddDisjunction([pickup_idx], penalty)

    for restock_index, meta in enumerate(restock_meta):
        order = restock_orders[restock_index]
        pickup_idx = manager.NodeToIndex(meta["pickupNode"])
        drop_idx = manager.NodeToIndex(meta["dropNode"])
        routing.AddPickupAndDelivery(pickup_idx, drop_idx)
        solver.Add(routing.VehicleVar(pickup_idx) == routing.VehicleVar(drop_idx))
        solver.Add(time_dim.CumulVar(pickup_idx) <= time_dim.CumulVar(drop_idx))
        solver.Add(routing.ActiveVar(pickup_idx) == routing.ActiveVar(drop_idx))

        end_min = int(order.get("endMinutes") or route_end)
        time_dim.CumulVar(pickup_idx).SetRange(route_start, route_end)
        time_dim.CumulVar(drop_idx).SetRange(route_start, min(24 * 60, end_min + 120))
        priority = order.get("priority") or "P4"
        penalty = PRIORITY_PENALTY.get(priority, PRIORITY_PENALTY["P4"])
        routing.AddDisjunction([pickup_idx], penalty)
        routing.AddDisjunction([drop_idx], penalty)

    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    search_params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    search_params.time_limit.seconds = time_limit

    solution = routing.SolveWithParameters(search_params)
    if solution is None:
        print(json.dumps({"success": False, "error": "No feasible solution found"}))
        return

    routes = []
    served_delivery_orders = set()
    served_restock_orders = set()

    for vehicle_id, vehicle in enumerate(vehicles):
        index = routing.Start(vehicle_id)
        stops = []
        load_orders_by_id = {}
        total_distance_km = 0.0
        total_late_minutes = 0
        restock_pallets = 0
        prev_node = None
        peak_load = reserved_loads[vehicle_id]

        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)

            if prev_node is not None and distance_matrix and prev_node < num_nodes and node < num_nodes:
                total_distance_km += float(distance_matrix[prev_node][node])

            peak_load = max(peak_load, reserved_loads[vehicle_id] + solution.Value(cap_dim.CumulVar(index)))
            info = nodes[node]
            arrival = solution.Value(time_dim.CumulVar(index))

            if node == 0:
                pass
            elif info["kind"] == "order_pickup":
                order = delivery_orders[int(info["orderIndex"])]
                stops.append({
                    "orderId": order["id"],
                    "label": info["label"],
                    "pallets": int(info["pallets"]),
                    "priority": order.get("priority") or "P3",
                    "etaMinutes": arrival,
                    "lateMinutes": 0,
                    "type": "order_pickup",
                })
            elif info["kind"] == "delivery":
                order_index = int(info["orderIndex"])
                order = delivery_orders[order_index]
                served_delivery_orders.add(order_index)
                order_id = order["id"]
                load_orders_by_id[order_id] = {
                    "orderId": order_id,
                    "label": order.get("label") or order_id,
                    "pallets": int(order.get("pallets", 0)),
                    "priority": order.get("priority") or "P3",
                }
                end_min = int(order.get("endMinutes") or route_end)
                late = max(0, arrival - end_min)
                total_late_minutes += late
                stops.append({
                    "orderId": order_id,
                    "label": order.get("deliveryLabel") or order.get("label") or order_id,
                    "pallets": int(order.get("pallets", 0)),
                    "priority": order.get("priority") or "P3",
                    "etaMinutes": arrival,
                    "lateMinutes": late,
                    "type": "delivery",
                })
            elif info["kind"] == "restock_pickup":
                order = restock_orders[int(info["restockIndex"])]
                restock_pallets += int(order.get("pallets", 0))
                stops.append({
                    "orderId": order["id"],
                    "label": info["label"],
                    "pallets": int(info["pallets"]),
                    "priority": order.get("priority") or "P4",
                    "etaMinutes": arrival,
                    "lateMinutes": 0,
                    "type": "restock_pickup",
                })
            elif info["kind"] == "restock_dropoff":
                restock_index = int(info["restockIndex"])
                order = restock_orders[restock_index]
                served_restock_orders.add(restock_index)
                stops.append({
                    "orderId": order["id"],
                    "label": info["label"],
                    "pallets": int(info["pallets"]),
                    "priority": order.get("priority") or "P4",
                    "etaMinutes": arrival,
                    "lateMinutes": 0,
                    "type": "restock_dropoff",
                })

            prev_node = node
            index = solution.Value(routing.NextVar(index))

        end_node = manager.IndexToNode(index)
        if prev_node is not None and distance_matrix and prev_node < num_nodes and end_node < num_nodes:
            total_distance_km += float(distance_matrix[prev_node][end_node])

        start_time = solution.Value(time_dim.CumulVar(routing.Start(vehicle_id)))
        end_time = solution.Value(time_dim.CumulVar(routing.End(vehicle_id)))

        routes.append({
            "driverId": vehicle["driverId"],
            "driverName": vehicle.get("driverName") or "",
            "vehicleName": vehicle.get("vehicleName") or "",
            "load": peak_load,
            "capacity": physical_capacities[vehicle_id],
            "loadOrders": list(load_orders_by_id.values()),
            "stops": stops,
            "totalMinutes": end_time - start_time,
            "totalDistanceKm": round(total_distance_km, 1),
            "lateMinutes": total_late_minutes,
            "restockPallets": restock_pallets,
        })

    unplanned = []
    for order_index, order in enumerate(delivery_orders):
        if order_index not in served_delivery_orders:
            unplanned.append({
                "id": order["id"],
                "label": order.get("label") or order["id"],
                "pallets": int(order.get("pallets", 0)),
                "reason": "容量、取货顺序或时间窗不适合当前车辆路线",
            })
    for restock_index, order in enumerate(restock_orders):
        if restock_index not in served_restock_orders:
            unplanned.append({
                "id": order["id"],
                "label": order.get("label") or order["id"],
                "pallets": int(order.get("pallets", 0)),
                "reason": "顺路补货会超载或影响路线",
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

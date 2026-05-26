#!/usr/bin/env python3
"""OR-Tools helper for brick dispatch load assignment.

Input JSON is read from stdin:
{
  "vehicles": [{"driverId": "...", "driverName": "...", "vehicleName": "...", "capacity": 28, "currentLoad": 0}],
  "orders": [{"id": "...", "label": "...", "pallets": 9, "priority": "P2", "canSplit": true}]
}

Output JSON is written to stdout.
"""

import json
import sys

try:
    from ortools.sat.python import cp_model
except Exception as exc:  # pragma: no cover - returned to caller
    print(json.dumps({"success": False, "error": f"OR-Tools import failed: {exc}"}))
    sys.exit(0)


PRIORITY_WEIGHT = {
    "P1": 10000,
    "P2": 4000,
    "P3": 1200,
    "P4": 300,
}


def main() -> None:
    payload = json.load(sys.stdin)
    vehicles = payload.get("vehicles", [])
    orders = payload.get("orders", [])

    vehicles = [v for v in vehicles if int(v.get("capacity", 28)) > int(v.get("currentLoad", 0))]
    orders = [o for o in orders if int(o.get("pallets") or 0) > 0]

    if not vehicles:
        print(json.dumps({"success": True, "assignments": [], "unplanned": orders, "message": "No available FLAT capacity"}))
        return

    model = cp_model.CpModel()
    vehicle_remaining = [
        int(v.get("capacity", 28)) - int(v.get("currentLoad", 0))
        for v in vehicles
    ]

    alloc = {}
    served = {}
    used_vehicle = {}

    for oi, order in enumerate(orders):
        pallets = int(order["pallets"])
        can_split = bool(order.get("canSplit", True))
        served[oi] = model.NewBoolVar(f"served_{oi}")

        for vi, remaining in enumerate(vehicle_remaining):
            alloc[(oi, vi)] = model.NewIntVar(0, min(pallets, remaining), f"alloc_{oi}_{vi}")
            used_vehicle[(oi, vi)] = model.NewBoolVar(f"used_{oi}_{vi}")
            model.Add(alloc[(oi, vi)] > 0).OnlyEnforceIf(used_vehicle[(oi, vi)])
            model.Add(alloc[(oi, vi)] == 0).OnlyEnforceIf(used_vehicle[(oi, vi)].Not())

        model.Add(sum(alloc[(oi, vi)] for vi in range(len(vehicles))) == pallets).OnlyEnforceIf(served[oi])
        model.Add(sum(alloc[(oi, vi)] for vi in range(len(vehicles))) == 0).OnlyEnforceIf(served[oi].Not())

        if not can_split:
            model.Add(sum(used_vehicle[(oi, vi)] for vi in range(len(vehicles))) <= 1)

    for vi, remaining in enumerate(vehicle_remaining):
        model.Add(sum(alloc[(oi, vi)] for oi in range(len(orders))) <= remaining)

    objective_terms = []
    for oi, order in enumerate(orders):
        priority = order.get("priority") or "P3"
        weight = PRIORITY_WEIGHT.get(priority, PRIORITY_WEIGHT["P3"])
        pallets = int(order["pallets"])
        objective_terms.append(served[oi] * (weight + pallets * 10))
        objective_terms.append(sum(used_vehicle[(oi, vi)] for vi in range(len(vehicles))) * -25)

    model.Maximize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(payload.get("timeLimitSeconds", 5))
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        print(json.dumps({"success": False, "error": "No feasible solution"}))
        return

    assignments = []
    unplanned = []
    for oi, order in enumerate(orders):
        if solver.Value(served[oi]) == 0:
            unplanned.append({**order, "reason": "FLAT vehicles do not have enough remaining capacity"})
            continue
        for vi, vehicle in enumerate(vehicles):
            amount = solver.Value(alloc[(oi, vi)])
            if amount > 0:
                assignments.append({
                    "orderId": order["id"],
                    "orderLabel": order.get("label") or order["id"],
                    "driverId": vehicle["driverId"],
                    "driverName": vehicle.get("driverName") or "",
                    "vehicleName": vehicle.get("vehicleName") or "",
                    "pallets": amount,
                    "orderPallets": int(order["pallets"]),
                    "priority": order.get("priority") or "P3",
                    "split": amount != int(order["pallets"]),
                })

    loads = []
    for vi, vehicle in enumerate(vehicles):
        added = sum(solver.Value(alloc[(oi, vi)]) for oi in range(len(orders)))
        loads.append({
            "driverId": vehicle["driverId"],
            "driverName": vehicle.get("driverName") or "",
            "vehicleName": vehicle.get("vehicleName") or "",
            "currentLoad": int(vehicle.get("currentLoad", 0)),
            "addedLoad": added,
            "finalLoad": int(vehicle.get("currentLoad", 0)) + added,
            "capacity": int(vehicle.get("capacity", 28)),
        })

    print(json.dumps({
        "success": True,
        "status": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
        "assignments": assignments,
        "loads": loads,
        "unplanned": unplanned,
    }))


if __name__ == "__main__":
    main()

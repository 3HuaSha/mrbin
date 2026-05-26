#!/usr/bin/env python3
"""OR-Tools helper for brick dispatch load assignment.

Input JSON is read from stdin:
{
  "vehicles": [{"driverId": "...", "driverName": "...", "vehicleName": "...", "capacity": 28, "currentLoad": 0}],
  "orders": [{"id": "...", "label": "...", "pallets": 9, "priority": "P2", "canSplit": true, "endMinutes": 720}],
  "pairPenalties": [{"orderA": "...", "orderB": "...", "penaltyMinutes": 30}]
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
    pair_penalties = payload.get("pairPenalties", [])

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
        origin_minutes = int(order.get("originMinutes") or 0)
        end_minutes = int(order.get("endMinutes") or 17 * 60)
        earliest_late = max(0, (8 * 60) + origin_minutes - end_minutes)
        time_weight = max(1, 5 - min({"P1": 1, "P2": 2, "P3": 3, "P4": 4}.get(priority, 3), 4))
        objective_terms.append(served[oi] * (weight + pallets * 10))
        if earliest_late:
            objective_terms.append(served[oi] * -(earliest_late * time_weight * 40))
        else:
            urgency_bonus = max(0, (17 * 60) - end_minutes)
            objective_terms.append(served[oi] * (urgency_bonus * time_weight))
        objective_terms.append(sum(used_vehicle[(oi, vi)] for vi in range(len(vehicles))) * -25)

    order_index_by_id = {order["id"]: oi for oi, order in enumerate(orders)}
    for pi, penalty in enumerate(pair_penalties):
        oi = order_index_by_id.get(penalty.get("orderA"))
        oj = order_index_by_id.get(penalty.get("orderB"))
        penalty_minutes = int(penalty.get("penaltyMinutes") or 0)
        if oi is None or oj is None or oi == oj or penalty_minutes <= 0:
            continue
        priority_a = orders[oi].get("priority") or "P3"
        priority_b = orders[oj].get("priority") or "P3"
        pair_weight = max(
            1,
            5 - min(
                {"P1": 1, "P2": 2, "P3": 3, "P4": 4}.get(priority_a, 3),
                {"P1": 1, "P2": 2, "P3": 3, "P4": 4}.get(priority_b, 3),
                4,
            ),
        )
        for vi in range(len(vehicles)):
            both = model.NewBoolVar(f"pair_{pi}_{vi}")
            model.AddBoolAnd([used_vehicle[(oi, vi)], used_vehicle[(oj, vi)]]).OnlyEnforceIf(both)
            model.AddBoolOr([used_vehicle[(oi, vi)].Not(), used_vehicle[(oj, vi)].Not()]).OnlyEnforceIf(both.Not())
            objective_terms.append(both * -(penalty_minutes * pair_weight * 60))

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

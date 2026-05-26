import { createServerFn } from "@tanstack/react-start";
import { spawn } from "node:child_process";
import { join } from "node:path";

export type BrickOptimizerVehicle = {
  driverId: string;
  driverName: string;
  vehicleName: string;
  capacity: number;
  currentLoad: number;
};

export type BrickOptimizerOrder = {
  id: string;
  label: string;
  pallets: number;
  pickupAddress: string;   // yard address where goods are loaded
  deliveryAddress: string; // customer address where goods are delivered
  pickupLabel?: string;    // e.g. "2967场地"
  deliveryLabel?: string;  // e.g. customer name
  priority: string;
  startMinutes?: number;
  endMinutes?: number;
  must?: boolean;
};

export type BrickPickupOrder = {
  id: string;
  label: string;
  pallets: number;
  pickupAddress: string;   // supplier address (e.g. UNILOCK Pickering)
  deliveryAddress: string; // yard or customer address (e.g. 3445, 12441)
  pickupLabel?: string;    // display label for pickup stop
  deliveryLabel?: string;  // display label for delivery stop
  priority?: string;
  endMinutes?: number;     // latest arrival (e.g. 20*60=1200 for 8pm close)
};

export type BrickOptimizerInput = {
  vehicles: BrickOptimizerVehicle[];
  deliveryOrders: BrickOptimizerOrder[];
  pickupOrders?: BrickPickupOrder[];
  durationMatrix: number[][];   // (1+2*D+2*P) x (1+2*D+2*P), in minutes, index 0 = depot
  distanceMatrix: number[][];   // same dims, in km
  serviceMinutes?: number;
  routeStartHour?: number;
  timeLimitSeconds?: number;
};

export type BrickOptimizerStop = {
  orderId: string;
  label: string;
  pallets: number;
  priority: string;
  etaMinutes: number;
  lateMinutes: number;
  type: "yard_pickup" | "delivery" | "pickup" | "pickup_delivery";
};

export type BrickOptimizerRoute = {
  driverId: string;
  driverName: string;
  vehicleName: string;
  load: number;
  capacity: number;
  stops: BrickOptimizerStop[];
  totalMinutes: number;
  totalDistanceKm: number;
  lateMinutes: number;
  pickupPallets: number;
};

type OptimizerResult = {
  success: boolean;
  error?: string;
  status?: string;
  message?: string;
  routes?: BrickOptimizerRoute[];
  unplanned?: Array<{ id: string; label: string; pallets: number; reason?: string }>;
};

export const optimizeBrickSchedule = createServerFn({ method: "POST" })
  .inputValidator((data: BrickOptimizerInput) => data)
  .handler(async ({ data }) => {
    return runOptimizer(data);
  });

async function runOptimizer(input: BrickOptimizerInput): Promise<OptimizerResult> {
  const scriptPath = join(process.cwd(), "scripts", "brick_ortools_optimizer.py");
  const python = process.env.PYTHON_BIN || "python3";

  return new Promise((resolve) => {
    const child = spawn(python, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({ success: false, error: error.message });
    });

    child.on("close", () => {
      try {
        const parsed = JSON.parse(stdout) as OptimizerResult;
        resolve(parsed);
      } catch {
        resolve({
          success: false,
          error: stderr || stdout || "OR-Tools optimizer returned no JSON",
        });
      }
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

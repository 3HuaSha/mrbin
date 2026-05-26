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
  priority: string;
  startMinutes?: number;
  endMinutes?: number;
  must?: boolean;
};

export type BrickOptimizerInput = {
  vehicles: BrickOptimizerVehicle[];
  orders: BrickOptimizerOrder[];
  durationMatrix: number[][];   // (1+orders) x (1+orders), in minutes, index 0 = depot
  distanceMatrix: number[][];   // (1+orders) x (1+orders), in km
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

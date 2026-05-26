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
  canSplit: boolean;
  startMinutes?: number;
  endMinutes?: number;
  must?: boolean;
  originMinutes?: number;
};

export type BrickOptimizerInput = {
  vehicles: BrickOptimizerVehicle[];
  orders: BrickOptimizerOrder[];
  pairPenalties?: Array<{
    orderA: string;
    orderB: string;
    penaltyMinutes: number;
  }>;
  timeLimitSeconds?: number;
};

type OptimizerResult = {
  success: boolean;
  error?: string;
  status?: string;
  message?: string;
  assignments?: Array<{
    orderId: string;
    orderLabel: string;
    driverId: string;
    driverName: string;
    vehicleName: string;
    pallets: number;
    orderPallets: number;
    priority: string;
    split: boolean;
  }>;
  loads?: Array<{
    driverId: string;
    driverName: string;
    vehicleName: string;
    currentLoad: number;
    addedLoad: number;
    finalLoad: number;
    capacity: number;
  }>;
  unplanned?: Array<BrickOptimizerOrder & { reason?: string }>;
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

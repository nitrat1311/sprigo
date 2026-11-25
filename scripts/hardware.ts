// The machine a measurement ran on, stored in every bench and eval report so `pnpm guide` never joins runs from two
// machines (measurements are hardware-specific; see CONTRIBUTING.md).
import { cpus, totalmem } from "node:os";

export const hardwareName = () => `${cpus()[0]?.model.trim() || "unknown CPU"}, ${Math.round(totalmem() / 1024 ** 3)} GB`;

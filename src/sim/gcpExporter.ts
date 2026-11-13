import type { PatchSheet } from './types.ts';

/**
 * Generates exportable Python/Numba + GCP Cloud Run Jobs starter files
 * matching Section 7 of the specification so the user can push to GitHub / GCP.
 */
export function buildGcpWorkerBundle(activePatch: PatchSheet): Record<string, string> {
  return {
    'Dockerfile': `FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir numpy numba google-cloud-bigquery google-cloud-storage google-genai pyyaml
COPY . .
ENTRYPOINT ["python", "-m", "src.runner.worker"]
`,
    'deploy_cloud_run_job.sh': `#!/usr/bin/env bash
set -euo pipefail
PROJECT_ID="\${GCP_PROJECT_ID:-amazonia-sim}"
REGION="\${GCP_REGION:-europe-west1}"
IMAGE="gcr.io/\${PROJECT_ID}/amazonia-sim-worker:latest"

gcloud builds submit --tag "\${IMAGE}"
gcloud run jobs deploy amazonia-sim-campaign \\
  --image "\${IMAGE}" \\
  --region "\${REGION}" \\
  --tasks 20 \\
  --cpu 4 \\
  --memory 8Gi \\
  --set-env-vars PATCH_PATH="patches/active_patch.json",MONTE_CARLO_RUNS="500"
`,
    'patches/active_patch.json': JSON.stringify(activePatch, null, 2),
    'src/core/state.py': `import numpy as np
from numba import njit

# Flat-Array Contiguous GameState (~256 octets) pour clonage zero-overhead
GAMESTATE_DTYPE = np.dtype([
    ("meta", np.int16, (12,)),
    ("forets", np.int8, (6, 6, 4)),
    ("machines", np.int8, (6, 2, 4)),
    ("lisieres_furtivite", np.int8, (6, 6, 2)),
    ("tuiles_lisiere", np.int8, (6, 2, 3)),
    ("piste_tactiques", np.int8, (6, 4)),
    ("piste_gardiens", np.int8, (6, 4)),
    ("paquet_machines", np.int8, (32,)),
    ("tirages_secrets", np.int8, (6, 4)),
    ("rng_state", np.uint64, (2,)),
])

@njit(nogil=True)
def xoroshiro128plus_next(rng_state):
    s0 = rng_state[0]
    s1 = rng_state[1]
    result = (s0 + s1) & np.uint64(0xFFFFFFFFFFFFFFFF)
    s1 ^= s0
    rng_state[0] = ((s0 << np.uint64(24)) | (s0 >> np.uint64(40))) ^ s1 ^ (s1 << np.uint64(16))
    rng_state[1] = (s1 << np.uint64(37)) | (s1 >> np.uint64(27))
    return result
`,
    'src/runner/worker.py': `import json
import os
from itertools import product

def expand_sweeps(obj):
    if isinstance(obj, dict) and "$Sweep" in obj:
        return obj["$Sweep"]
    if isinstance(obj, dict):
        keys = list(obj.keys())
        val_lists = [expand_sweeps(obj[k]) for k in keys]
        return [dict(zip(keys, combo)) for combo in product(*val_lists)]
    if isinstance(obj, list):
        return [obj]
    return [obj]

def main():
    task_idx = int(os.environ.get("CLOUD_RUN_TASK_INDEX", "0"))
    task_count = int(os.environ.get("CLOUD_RUN_TASK_COUNT", "1"))
    patch_path = os.environ.get("PATCH_PATH", "patches/active_patch.json")
    with open(patch_path, "r", encoding="utf-8") as f:
        patch = json.load(f)
    print(f"[Worker {task_idx}/{task_count}] Patch chargé: {patch.get('nom')} ({len(patch.get('slots', {}))} slots)")

if __name__ == "__main__":
    main()
`,
  };
}

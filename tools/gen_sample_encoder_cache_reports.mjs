// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Generates sample llm-d-benchmark Benchmark Report v0.2.1 documents for the
// Encoder Cache-Aware Routing (multimodal) well-lit-path POC.
//
// These are SYNTHETIC, deterministic illustrative reports — not real runs.
// They exist so the Prism view can render the end-to-end flow (report ->
// parseReportV02 -> charts) before real multimodal benchmarks exist.
//
// They are emitted in the v0.2 report shape consumed by
// src/utils/benchmarkReportV02Parser.js, plus three PROPOSED v0.2.1 additions
// that the multimodal guide needs:
//   - scenario.routing.standardized.mode            (baseline|approximate|precise)
//   - scenario.load.standardized.media              (image-reuse / pool config)
//   - results.observability.encoder_cache_hit_rate  (scraped vLLM/EPP metric)
//
// Run: node tools/gen_sample_encoder_cache_reports.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'data', 'encoder-cache-routing');
const OUT_FILE = join(OUT_DIR, 'sample_reports_v0_2_1.json');

const MODES = ['baseline', 'approximate', 'precise'];
const REUSE_SETTINGS = [
  { key: 'low',    pool_size: 1000, sampling: 'uniform', zipf_s: 0.0, reuse_rate: 0.05 },
  { key: 'medium', pool_size: 100,  sampling: 'zipf',    zipf_s: 1.0, reuse_rate: 0.40 },
  { key: 'high',   pool_size: 10,   sampling: 'zipf',    zipf_s: 1.2, reuse_rate: 0.85 },
];
const QPS_LIST = [2, 5, 8, 10];

// Share of TTFT attributable to the vision-encoder pass for these
// image-heavy requests. A cache hit lets the replica skip it.
const ENCODE_FRACTION = 0.5;
const IMAGE_TOKENS = 1024; // tokens contributed by one cached image
const TEXT_TOKENS = 64;    // the prompt around the image
const OSL = 256;

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// Baseline TTFT (seconds) grows with load and saturates past ~8 QPS.
function baselineTtft50(qps) {
  let t = 0.30 + 0.035 * qps;
  if (qps > 7) t += 0.18 * Math.pow(qps - 7, 1.6);
  return t;
}

// Fraction of requests that hit a warm encoder cache, by routing mode.
// Baseline never routes for cache affinity; approximate captures most of the
// reuse; precise captures nearly all of it.
function hitRate(mode, reuse) {
  if (mode === 'baseline') return 0;
  if (mode === 'approximate') return reuse * 0.6;
  return reuse * 0.95; // precise
}

function buildDoc(mode, reuse, qps) {
  const hr = hitRate(mode, reuse.reuse_rate);
  const base50 = baselineTtft50(qps);
  // A hit skips the encode; routing also relieves saturation (less wasted compute).
  const ttft50 = base50 * (1 - hr * ENCODE_FRACTION);
  const tailMult = mode === 'baseline' && qps > 7 ? 3.2 : 2.2;
  const ttft99 = ttft50 * tailMult;

  // ITL roughly flat; precise can slightly hot-spot at high load + high reuse.
  let itl50 = 0.020 + 0.0005 * qps;
  if (mode === 'precise' && qps >= 8 && reuse >= 0.8) itl50 += 0.002;
  const itl99 = itl50 * 1.8;

  // Saturation loss in sustained throughput, relieved by cache hits.
  const sat = qps > 7 ? (qps - 7) * 0.08 : 0;
  const effLoss = sat * (1 - hr * 0.7);
  const outputTokenRate = qps * OSL * (1 - effLoss);
  const inputTokenRate = qps * (IMAGE_TOKENS + TEXT_TOKENS) * (1 - effLoss);

  return {
    version: '0.2',
    run: {
      uid: `ecr-${mode}-${reuse.key}-${qps}qps`,
      eid: 'encoder-cache-routing-poc',
      description: `${mode} | reuse=${reuse.reuse_rate} | ${qps} QPS`,
      time: { start: '2026-06-02T00:00:00Z' },
    },
    scenario: {
      stack: [
        {
          standardized: {
            role: 'aggregate',
            kind: 'inference_engine',
            model: { name: 'Qwen/Qwen2.5-VL-32B-Instruct' },
            accelerator: {
              model: 'nvidia-h100-80gb',
              count: 8,
              parallelism: { tp: 8 },
            },
          },
        },
      ],
      load: {
        standardized: {
          tool: 'inference-perf',
          rate_qps: qps,
          stage: 1,
          input_seq_len: { value: IMAGE_TOKENS + TEXT_TOKENS },
          output_seq_len: { value: OSL },
          concurrency: null,
          // --- PROPOSED v0.2.1 multimodal extension ---
          media: {
            modality: 'image',
            pool_size: reuse.pool_size,
            sampling: reuse.sampling,
            zipf_s: reuse.zipf_s,
            reuse_rate: reuse.reuse_rate,
            image_tokens_per_request: IMAGE_TOKENS,
          },
        },
      },
      // --- PROPOSED v0.2.1 routing extension ---
      routing: { standardized: { mode } },
    },
    results: {
      request_performance: {
        aggregate: {
          throughput: {
            output_token_rate: { mean: round(outputTokenRate) },
            input_token_rate: { mean: round(inputTokenRate) },
            request_rate: { mean: round(qps * (1 - effLoss)) },
          },
          latency: {
            time_to_first_token: { mean: round(ttft50 * 1.05, 4), p50: round(ttft50, 4), p99: round(ttft99, 4) },
            time_per_output_token: { mean: round(itl50, 4), p50: round(itl50, 4), p99: round(itl99, 4) },
            inter_token_latency: { mean: round(itl50, 4), p50: round(itl50, 4), p99: round(itl99, 4) },
            request_latency: { mean: round(ttft50 + itl50 * OSL, 4), p50: round(ttft50 + itl50 * OSL, 4), p99: round(ttft99 + itl99 * OSL, 4) },
          },
          requests: { total: Math.round(qps * 120), failures: 0 },
        },
      },
      observability: {
        vllm_prefix_cache_hit_rate: { aggregated: { mean: 0.10, p50: 0.10, p99: 0.12 } },
        // --- PROPOSED v0.2.1 multimodal observability metric ---
        encoder_cache_hit_rate: { aggregated: { mean: round(hr, 4), p50: round(hr, 4), p99: round(Math.min(hr * 1.1, 1), 4) } },
        epp_pool_avg_kv_cache_utilization: { aggregated: { mean: round(0.4 + sat, 4) } },
      },
    },
  };
}

const docs = [];
for (const mode of MODES) {
  for (const reuse of REUSE_SETTINGS) {
    for (const qps of QPS_LIST) {
      docs.push(buildDoc(mode, reuse, qps));
    }
  }
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(docs, null, 2) + '\n');
console.log(`Wrote ${docs.length} sample v0.2.1 reports to ${OUT_FILE}`);
